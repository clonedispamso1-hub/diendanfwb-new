-- =====================================================================
-- 🎁 GIFT SYSTEM V1 — CHẠY NGUYÊN KHỐI TRONG SUPABASE SQL EDITOR
-- Dùng lại DB cũ (không đổi URL/API key, không tạo project mới).
--
-- LUỒNG TIỀN (2 PHA, ATOMIC):
--   PHA 1 — Gửi:  trừ xu người gửi NGAY, ghi public.post_gifts (pending),
--                 tạo notification "chờ nhận" cho người nhận.
--   PHA 2 — Nhận: người nhận bấm [Nhận] -> cộng xu 1 LẦN DUY NHẤT
--                 (UPDATE ... WHERE claimed = false → chống double-claim).
--
-- MỞ RỘNG TƯƠNG LAI: chỉ cần INSERT/UPDATE bảng public.gift_items
-- (thêm quà, đổi icon, đổi giá tối thiểu, đổi hiệu ứng, bật/tắt, quà sự kiện)
-- — KHÔNG cần sửa code lõi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) CATALOG QUÀ TẶNG (admin quản lý)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  name        text NOT NULL,
  emoji       text NOT NULL DEFAULT '🎁',
  min_amount  bigint NOT NULL DEFAULT 100 CHECK (min_amount > 0),
  effect      text NOT NULL DEFAULT 'float',      -- float | sparkle | heart
  gradient    text NOT NULL DEFAULT 'from-pink-400 to-rose-500',
  glow        text NOT NULL DEFAULT 'rgba(244,63,94,0.5)',
  sort_order  int  NOT NULL DEFAULT 100,
  is_active   boolean NOT NULL DEFAULT true,
  event_ends_at timestamptz,                      -- quà giới hạn thời gian
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.gift_items TO anon;
GRANT SELECT ON public.gift_items TO authenticated;
GRANT ALL    ON public.gift_items TO service_role;

ALTER TABLE public.gift_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gift_items_read_all" ON public.gift_items;
CREATE POLICY "gift_items_read_all" ON public.gift_items
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "gift_items_admin_write" ON public.gift_items;
CREATE POLICY "gift_items_admin_write" ON public.gift_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

INSERT INTO public.gift_items (key, name, emoji, min_amount, effect, gradient, glow, sort_order)
VALUES
  ('rose',      'Hoa Hồng',  '🌹',   100, 'float',   'from-pink-400 to-rose-500',     'rgba(244,63,94,0.5)',   10),
  ('tulip',     'Tulip',     '🌷',   200, 'float',   'from-fuchsia-400 to-pink-500',  'rgba(232,121,249,0.5)', 20),
  ('bouquet',   'Bó Hoa',    '💐',   500, 'float',   'from-rose-300 to-red-500',      'rgba(239,68,68,0.5)',   30),
  ('giftbox',   'Hộp Quà',   '🎁',  1000, 'sparkle', 'from-amber-300 to-orange-500',  'rgba(249,115,22,0.5)',  40),
  ('chocolate', 'Chocolate', '🍫',  1500, 'float',   'from-amber-700 to-yellow-600',  'rgba(180,83,9,0.5)',    50),
  ('teddy',     'Gấu Bông',  '🧸',  2000, 'float',   'from-orange-300 to-amber-500',  'rgba(245,158,11,0.5)',  60),
  ('heart',     'Trái Tim',  '❤️',  3000, 'heart',   'from-red-400 to-rose-600',      'rgba(239,68,68,0.55)',  70),
  ('ring',      'Nhẫn',      '💍',  4000, 'sparkle', 'from-cyan-300 to-sky-500',      'rgba(56,189,248,0.55)', 80),
  ('diamond',   'Kim Cương', '💎',  5000, 'sparkle', 'from-sky-300 to-indigo-500',    'rgba(99,102,241,0.55)', 90),
  ('crown',     'Vương Miện','👑', 10000, 'sparkle', 'from-yellow-300 to-amber-500',  'rgba(245,158,11,0.6)',  100)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2) MỞ RỘNG public.post_gifts (bảng đã tồn tại trong DB cũ)
-- ---------------------------------------------------------------------
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS gift_key    text;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS receiver_id uuid;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS claimed     boolean NOT NULL DEFAULT false;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS claimed_at  timestamptz;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS notif_id    uuid;

CREATE INDEX IF NOT EXISTS post_gifts_post_idx     ON public.post_gifts(post_id);
CREATE INDEX IF NOT EXISTS post_gifts_sender_idx   ON public.post_gifts(from_user_id);
CREATE INDEX IF NOT EXISTS post_gifts_receiver_idx ON public.post_gifts(receiver_id);
CREATE INDEX IF NOT EXISTS post_gifts_created_idx  ON public.post_gifts(created_at DESC);

GRANT SELECT ON public.post_gifts TO anon;
GRANT SELECT ON public.post_gifts TO authenticated;
GRANT ALL    ON public.post_gifts TO service_role;

ALTER TABLE public.post_gifts ENABLE ROW LEVEL SECURITY;

-- Ai cũng đọc được (để hiện "🎁 Được tặng" + danh sách người tặng).
DROP POLICY IF EXISTS "post_gifts_read_all" ON public.post_gifts;
CREATE POLICY "post_gifts_read_all" ON public.post_gifts
  FOR SELECT USING (true);
-- Ghi/sửa CHỈ qua RPC SECURITY DEFINER bên dưới (không có policy INSERT/UPDATE).

-- ---------------------------------------------------------------------
-- 3) KHÔNG CHO XOÁ NOTIFICATION QUÀ CHƯA NHẬN
--    (kể cả khi user bấm "Xoá tất cả thông báo")
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_pending_gift_notification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF COALESCE(OLD.data->>'kind', '') = 'gift_v1'
     AND COALESCE(OLD.data->>'status', 'pending') = 'pending' THEN
    RAISE EXCEPTION 'PENDING_GIFT_NOTIFICATION_LOCKED';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pending_gift_notification ON public.notifications;
CREATE TRIGGER trg_guard_pending_gift_notification
  BEFORE DELETE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.guard_pending_gift_notification();

-- ---------------------------------------------------------------------
-- 4) PHA 1 — GỬI QUÀ (atomic)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.send_post_gift(uuid, text, bigint);
CREATE OR REPLACE FUNCTION public.send_post_gift(
  p_post_id  uuid,
  p_gift_key text,
  p_amount   bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from    uuid := auth.uid();
  v_to      uuid;
  v_item    public.gift_items;
  v_bal     bigint;
  v_new_bal bigint;
  v_gift_id uuid;
  v_notif   uuid;
  v_total   bigint;
  v_name    text;
BEGIN
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Bạn cần đăng nhập.');
  END IF;

  SELECT * INTO v_item FROM public.gift_items WHERE key = p_gift_key;
  IF v_item.id IS NULL OR v_item.is_active = false
     OR (v_item.event_ends_at IS NOT NULL AND v_item.event_ends_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GIFT_UNAVAILABLE', 'message', 'Quà này hiện không khả dụng.');
  END IF;

  IF p_amount IS NULL OR p_amount < v_item.min_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_LOW',
      'message', 'Tối thiểu ' || v_item.min_amount::text || ' xu cho ' || v_item.name || '.');
  END IF;

  SELECT user_id INTO v_to FROM public.posts WHERE id = p_post_id;
  IF v_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Bài viết không tồn tại.');
  END IF;
  IF v_to = v_from THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF', 'message', 'Không thể tự tặng quà cho mình.');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  -- Lock ví người gửi -> chống race / nhân đôi tiền khi mạng lag.
  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles WHERE id = v_from FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', 'Không tìm thấy ví của bạn.');
  END IF;
  IF v_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Bạn không đủ xu.');
  END IF;

  UPDATE public.profiles SET gem_balance = v_bal - p_amount
   WHERE id = v_from RETURNING gem_balance INTO v_new_bal;

  INSERT INTO public.post_gifts(post_id, from_user_id, receiver_id, amount, gift_key, claimed)
  VALUES (p_post_id, v_from, v_to, p_amount, v_item.key, false)
  RETURNING id INTO v_gift_id;

  SELECT COALESCE(full_name, username, 'Người dùng') INTO v_name
    FROM public.profiles WHERE id = v_from;

  INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at)
  VALUES (
    v_to,
    'gift_v1',
    v_item.emoji || ' ' || COALESCE(v_name, 'Ai đó') || ' đã tặng bạn một ' || v_item.name || '.',
    'Giá trị ' || to_char(p_amount, 'FM999,999,999,999') || ' xu. Bấm Nhận để cộng vào ví.',
    jsonb_build_object(
      'kind', 'gift_v1',
      'gift_id', v_gift_id,
      'gift_key', v_item.key,
      'gift_name', v_item.name,
      'emoji', v_item.emoji,
      'effect', v_item.effect,
      'amount', p_amount,
      'status', 'pending',
      'post_id', p_post_id,
      'sender_id', v_from,
      'from_user_id', v_from
    ),
    false, now()
  ) RETURNING id INTO v_notif;

  UPDATE public.post_gifts SET notif_id = v_notif WHERE id = v_gift_id;

  BEGIN
    INSERT INTO public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    VALUES (v_from, v_to, p_amount, 'Tặng quà ' || v_item.name, 'gift_v1', p_post_id, 'pending', now());
  EXCEPTION WHEN undefined_table OR undefined_column OR check_violation THEN
    NULL;
  END;

  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM public.post_gifts WHERE post_id = p_post_id;

  RETURN jsonb_build_object(
    'ok', true, 'gift_id', v_gift_id, 'notif_id', v_notif,
    'amount', p_amount, 'gift_key', v_item.key, 'emoji', v_item.emoji,
    'effect', v_item.effect, 'new_balance', v_new_bal, 'total_gifted', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_post_gift(uuid, text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.send_post_gift(uuid, text, bigint) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) PHA 2 — NHẬN QUÀ (atomic, 1 lần duy nhất)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_post_gift(uuid);
CREATE OR REPLACE FUNCTION public.claim_post_gift(p_gift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      uuid := auth.uid();
  v_amount  bigint;
  v_new_bal bigint;
  v_notif   uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Bạn cần đăng nhập.');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  -- Atomic: chỉ đúng 1 transaction thắng được dòng chưa claimed.
  UPDATE public.post_gifts
     SET claimed = true, claimed_at = now()
   WHERE id = p_gift_id
     AND receiver_id = v_me
     AND claimed = false
  RETURNING amount, notif_id INTO v_amount, v_notif;

  IF v_amount IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED',
      'message', 'Quà này đã được nhận trước đó.');
  END IF;

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_amount
   WHERE id = v_me
  RETURNING gem_balance INTO v_new_bal;

  UPDATE public.notifications
     SET data = COALESCE(data, '{}'::jsonb)
                || jsonb_build_object('status', 'claimed', 'claimed', true, 'claimed_at', now()),
         is_read = true
   WHERE (id = v_notif OR data->>'gift_id' = p_gift_id::text)
     AND user_id = v_me;

  BEGIN
    UPDATE public.gem_transactions SET status = 'completed'
     WHERE to_id = v_me AND action_type = 'gift_v1' AND status = 'pending'
       AND amount = v_amount
       AND id = (SELECT id FROM public.gem_transactions
                  WHERE to_id = v_me AND action_type = 'gift_v1' AND status = 'pending'
                    AND amount = v_amount ORDER BY created_at LIMIT 1);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'new_balance', v_new_bal);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_post_gift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_post_gift(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) ĐỌC DỮ LIỆU: danh sách người tặng / bảng xếp hạng
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.post_gift_senders(uuid);
CREATE OR REPLACE FUNCTION public.post_gift_senders(p_post_id uuid)
RETURNS TABLE (
  gift_id uuid, user_id uuid, full_name text, avatar text, public_id text,
  gift_key text, gift_name text, emoji text, amount bigint,
  created_at timestamptz, total_sent bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.from_user_id, p.full_name, p.avatar, p.public_id,
         g.gift_key, gi.name, COALESCE(gi.emoji, '🎁'), g.amount::bigint, g.created_at,
         COALESCE(t.total, 0)::bigint
    FROM public.post_gifts g
    LEFT JOIN public.profiles p  ON p.id = g.from_user_id
    LEFT JOIN public.gift_items gi ON gi.key = g.gift_key
    LEFT JOIN (SELECT from_user_id, SUM(amount) AS total FROM public.post_gifts GROUP BY from_user_id) t
           ON t.from_user_id = g.from_user_id
   WHERE g.post_id = p_post_id
   ORDER BY g.created_at DESC
   LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION public.post_gift_senders(uuid) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.top_gift_senders(int);
CREATE OR REPLACE FUNCTION public.top_gift_senders(p_limit int DEFAULT 20)
RETURNS TABLE (
  user_id uuid, full_name text, avatar text, province text,
  vip_level int, is_admin boolean, created_at timestamptz,
  total_sent bigint, gift_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.from_user_id, p.full_name, p.avatar,
         COALESCE(p.province, p.location), p.vip_level, p.is_admin, p.created_at,
         SUM(g.amount)::bigint, COUNT(*)::bigint
    FROM public.post_gifts g
    LEFT JOIN public.profiles p ON p.id = g.from_user_id
   GROUP BY g.from_user_id, p.full_name, p.avatar, p.province, p.location, p.vip_level, p.is_admin, p.created_at
   ORDER BY SUM(g.amount) DESC
   LIMIT GREATEST(1, COALESCE(p_limit, 20));
$$;
GRANT EXECUTE ON FUNCTION public.top_gift_senders(int) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.top_gift_receivers(int);
CREATE OR REPLACE FUNCTION public.top_gift_receivers(p_limit int DEFAULT 20)
RETURNS TABLE (
  user_id uuid, full_name text, avatar text, total_received bigint, gift_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.receiver_id, p.full_name, p.avatar, SUM(g.amount)::bigint, COUNT(*)::bigint
    FROM public.post_gifts g
    LEFT JOIN public.profiles p ON p.id = g.receiver_id
   WHERE g.receiver_id IS NOT NULL
   GROUP BY g.receiver_id, p.full_name, p.avatar
   ORDER BY SUM(g.amount) DESC
   LIMIT GREATEST(1, COALESCE(p_limit, 20));
$$;
GRANT EXECUTE ON FUNCTION public.top_gift_receivers(int) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 7) ADMIN — lịch sử, thống kê, xoá lịch sử
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_gift_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true);
$$;
GRANT EXECUTE ON FUNCTION public.is_gift_admin() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_gift_history(int, int, text);
CREATE OR REPLACE FUNCTION public.admin_gift_history(
  p_limit int DEFAULT 100, p_offset int DEFAULT 0, p_status text DEFAULT 'all'
)
RETURNS TABLE (
  gift_id uuid, post_id uuid, created_at timestamptz, amount bigint,
  gift_key text, gift_name text, emoji text, claimed boolean, claimed_at timestamptz,
  sender_id uuid, sender_name text, sender_avatar text,
  receiver_id uuid, receiver_name text, receiver_avatar text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_gift_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  RETURN QUERY
    SELECT g.id, g.post_id, g.created_at, g.amount::bigint, g.gift_key,
           COALESCE(gi.name, 'Quà'), COALESCE(gi.emoji, '🎁'), g.claimed, g.claimed_at,
           g.from_user_id, s.full_name, s.avatar,
           g.receiver_id, r.full_name, r.avatar
      FROM public.post_gifts g
      LEFT JOIN public.gift_items gi ON gi.key = g.gift_key
      LEFT JOIN public.profiles s ON s.id = g.from_user_id
      LEFT JOIN public.profiles r ON r.id = g.receiver_id
     WHERE g.gift_key IS NOT NULL
       AND (p_status = 'all'
            OR (p_status = 'claimed' AND g.claimed = true)
            OR (p_status = 'pending' AND g.claimed = false))
     ORDER BY g.created_at DESC
     LIMIT GREATEST(1, COALESCE(p_limit, 100)) OFFSET GREATEST(0, COALESCE(p_offset, 0));
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_gift_history(int, int, text) TO authenticated;

DROP FUNCTION IF EXISTS public.admin_gift_stats();
CREATE OR REPLACE FUNCTION public.admin_gift_stats()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_gift_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT jsonb_build_object(
    'total_amount',   COALESCE(SUM(amount), 0),
    'total_gifts',    COUNT(*),
    'today_amount',   COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('day', now())), 0),
    'today_gifts',    COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())),
    'pending_gifts',  COUNT(*) FILTER (WHERE claimed = false),
    'pending_amount', COALESCE(SUM(amount) FILTER (WHERE claimed = false), 0),
    'top_senders',   (SELECT jsonb_agg(x) FROM (
                        SELECT g.from_user_id AS user_id, p.full_name, p.avatar, SUM(g.amount)::bigint AS total
                          FROM public.post_gifts g LEFT JOIN public.profiles p ON p.id = g.from_user_id
                         WHERE g.gift_key IS NOT NULL
                         GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 10) x),
    'top_receivers', (SELECT jsonb_agg(x) FROM (
                        SELECT g.receiver_id AS user_id, p.full_name, p.avatar, SUM(g.amount)::bigint AS total
                          FROM public.post_gifts g LEFT JOIN public.profiles p ON p.id = g.receiver_id
                         WHERE g.gift_key IS NOT NULL AND g.receiver_id IS NOT NULL
                         GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 10) x)
  ) INTO v FROM public.post_gifts WHERE gift_key IS NOT NULL;
  RETURN v;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_gift_stats() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_gift_purge(text, date);
CREATE OR REPLACE FUNCTION public.admin_gift_purge(p_mode text, p_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0;
BEGIN
  IF NOT public.is_gift_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF p_mode = 'all' THEN
    -- Chỉ xoá lịch sử ĐÃ NHẬN để không làm mất quà đang chờ của người dùng.
    WITH d AS (DELETE FROM public.post_gifts WHERE gift_key IS NOT NULL AND claimed = true RETURNING 1)
    SELECT COUNT(*) INTO v_count FROM d;
  ELSIF p_mode = 'day' AND p_date IS NOT NULL THEN
    WITH d AS (
      DELETE FROM public.post_gifts
       WHERE gift_key IS NOT NULL AND claimed = true
         AND created_at >= p_date::timestamptz
         AND created_at <  (p_date + 1)::timestamptz
      RETURNING 1)
    SELECT COUNT(*) INTO v_count FROM d;
  ELSE
    RETURN jsonb_build_object('ok', false, 'message', 'Chế độ xoá không hợp lệ.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'deleted', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_gift_purge(text, date) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) REALTIME
-- ---------------------------------------------------------------------
ALTER TABLE public.post_gifts REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_gifts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
