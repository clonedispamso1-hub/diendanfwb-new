-- =====================================================================
-- SUPABASE #4 — From Reply (trả lời tự động cho user thật nhắn từ bài viết)
-- Chạy trên Supabase 4. Idempotent (chạy lại nhiều lần an toàn).
--
-- Dữ liệu gọn: 1 dòng cấu hình + 1 dòng trạng thái / user thật.
--  - Không lưu mẫu trả lời theo từng cuộc trò chuyện.
--  - Mỗi user chỉ có tối đa 1 lượt chờ → chống gửi trùng tự nhiên.
--  - Bộ đếm reply_count chỉ tăng trong from_reply_complete(ok = true).
-- Tất cả hàm chỉ cấp cho service_role (máy chủ website), trình duyệt không gọi được.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.from_reply_config (
  id         smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  replies_1  text[] NOT NULL DEFAULT '{}',
  replies_2  text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.from_reply_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.from_reply_state (
  user_id      uuid PRIMARY KEY,               -- user thật (toàn hệ thống)
  reply_count  smallint NOT NULL DEFAULT 0 CHECK (reply_count BETWEEN 0 AND 2),
  status       text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle','pending','sending')),
  bot_id       uuid,                            -- tài khoản thứ hai sẽ gửi lượt đang chờ
  due_at       timestamptz,
  lease_token  uuid,
  lease_until  timestamptz,
  last_bot_id  uuid,
  last_sent_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS from_reply_state_due_idx
  ON public.from_reply_state (due_at) WHERE status = 'pending';

REVOKE ALL ON public.from_reply_config, public.from_reply_state FROM anon, authenticated;
GRANT ALL ON public.from_reply_config, public.from_reply_state TO service_role;
ALTER TABLE public.from_reply_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.from_reply_state  ENABLE ROW LEVEL SECURITY;
-- Không tạo policy cho anon/authenticated → chỉ service_role đọc/ghi.

-- ---------------------------------------------------------------------
-- Xếp lượt chờ. Trả: 'queued' | 'done' (đã 2/2) | 'busy' (đang chờ) | 'no_template'
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.from_reply_enqueue(p_user uuid, p_bot uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.from_reply_state; c public.from_reply_config;
BEGIN
  IF p_user IS NULL OR p_bot IS NULL OR p_user = p_bot THEN RETURN 'invalid'; END IF;
  INSERT INTO public.from_reply_state (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO s FROM public.from_reply_state WHERE user_id = p_user FOR UPDATE;
  IF s.reply_count >= 2 THEN RETURN 'done'; END IF;
  IF s.status <> 'idle' THEN RETURN 'busy'; END IF;
  SELECT * INTO c FROM public.from_reply_config WHERE id = 1;
  IF coalesce(cardinality(CASE WHEN s.reply_count = 0 THEN c.replies_1 ELSE c.replies_2 END), 0) = 0 THEN
    RETURN 'no_template';
  END IF;
  UPDATE public.from_reply_state
     SET status = 'pending', bot_id = p_bot,
         due_at = now() + CASE WHEN s.reply_count = 0 THEN interval '1 minute' ELSE interval '3 minutes' END,
         lease_token = NULL, lease_until = NULL, updated_at = now()
   WHERE user_id = p_user;
  RETURN 'queued';
END; $$;

-- ---------------------------------------------------------------------
-- Nhận các lượt đến hạn (SKIP LOCKED → nhiều tiến trình không lấy trùng).
-- Lượt 'sending' quá hạn lease bị huỷ (không gửi lại, không tăng đếm) để
-- tuyệt đối không gửi trùng khi không chắc lần trước đã gửi hay chưa.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.from_reply_claim(p_limit int DEFAULT 20)
RETURNS TABLE (user_id uuid, bot_id uuid, stage smallint, lease_token uuid, content text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.from_reply_config;
BEGIN
  UPDATE public.from_reply_state st SET status = 'idle', lease_token = NULL, lease_until = NULL, updated_at = now()
   WHERE st.status = 'sending' AND st.lease_until < now();

  SELECT * INTO c FROM public.from_reply_config WHERE id = 1;

  RETURN QUERY
  WITH due AS (
    SELECT st.user_id FROM public.from_reply_state st
     WHERE st.status = 'pending' AND st.due_at <= now() AND st.reply_count < 2
     ORDER BY st.due_at
     LIMIT GREATEST(coalesce(p_limit, 20), 1)
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.from_reply_state st
       SET status = 'sending', lease_token = gen_random_uuid(),
           lease_until = now() + interval '2 minutes', updated_at = now()
      FROM due WHERE st.user_id = due.user_id
    RETURNING st.user_id, st.bot_id, st.reply_count, st.lease_token
  )
  SELECT upd.user_id, upd.bot_id, (upd.reply_count + 1)::smallint, upd.lease_token,
         (SELECT x FROM unnest(CASE WHEN upd.reply_count = 0 THEN c.replies_1 ELSE c.replies_2 END) x
           WHERE btrim(x) <> '' ORDER BY random() LIMIT 1)
    FROM upd;
END; $$;

-- ---------------------------------------------------------------------
-- Kết thúc lượt. Chỉ tăng bộ đếm khi p_ok = true và lease còn đúng.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.from_reply_complete(p_user uuid, p_lease uuid, p_ok boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  UPDATE public.from_reply_state
     SET reply_count = CASE WHEN p_ok THEN LEAST(reply_count + 1, 2) ELSE reply_count END,
         last_bot_id = CASE WHEN p_ok THEN bot_id ELSE last_bot_id END,
         last_sent_at = CASE WHEN p_ok THEN now() ELSE last_sent_at END,
         status = 'idle', bot_id = NULL, due_at = NULL, lease_token = NULL, lease_until = NULL,
         updated_at = now()
   WHERE user_id = p_user AND status = 'sending' AND lease_token = p_lease;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END; $$;

REVOKE ALL ON FUNCTION public.from_reply_enqueue(uuid, uuid), public.from_reply_claim(int),
  public.from_reply_complete(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.from_reply_enqueue(uuid, uuid), public.from_reply_claim(int),
  public.from_reply_complete(uuid, uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------
-- Hẹn giờ ở backend: pg_cron mỗi phút CHỈ gọi website khi thật sự có lượt đến hạn
-- (không có lượt chờ → không gửi request nào).
-- ⚠️ Thay <FROM_REPLY_CRON_SECRET> bằng đúng giá trị secret đã đặt trên website.
-- ⚠️ URL dùng địa chỉ publish ổn định của website (cần publish mới chạy).
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN
  PERFORM cron.unschedule('from-reply-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'from-reply-tick');
END $$;

SELECT cron.schedule('from-reply-tick', '* * * * *', $cron$
  SELECT net.http_post(
    url := 'https://project--82874fdf-bb81-4c73-ba0f-77eca584f547.lovable.app/api/public/from-reply-cron',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret','<FROM_REPLY_CRON_SECRET>'),
    body := '{}'::jsonb)
  WHERE EXISTS (SELECT 1 FROM public.from_reply_state WHERE status = 'pending' AND due_at <= now());
$cron$);

NOTIFY pgrst, 'reload schema';
