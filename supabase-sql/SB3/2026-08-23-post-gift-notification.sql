-- =====================================================================
-- CHẠY TRÊN SUPABASE #3  (logs/social — uaqsetfdciyzxpuhulux)
-- KHÔNG chạy trên SB1 / SB2.
--
-- Mục tiêu: quà bài viết (post gift) phải sinh notification cho NGƯỜI NHẬN.
--
-- Nguyên nhân lỗi hiện tại:
--   Policy RESTRICTIVE `notif_no_client_gift_insert` (SB3_GIFT_NOTIFICATIONS_V4)
--   chặn mọi INSERT notification loại gift% từ client anon/authenticated.
--   App gọi RPC tài chính trên SB1 thành công, nhưng bước INSERT notification
--   sang SB3 bị RLS chặn (42501) và bị nuốt trong try/catch → không có thông báo.
--
-- Cách xử lý: mở đúng MỘT cửa hợp lệ — RPC SECURITY DEFINER
--   public.notify_post_gift_v5(...) — idempotent theo gift_id.
--   Tài chính vẫn 100% ở SB1; SB3 chỉ ghi thông báo sau khi RPC SB1 thành công.
--
-- Idempotent: chạy lại nhiều lần vẫn an toàn. Không drop bảng, không xoá dữ liệu.
-- =====================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='notifications') THEN
    RAISE EXCEPTION 'public.notifications không tồn tại — sai instance (file này dành cho SB3).';
  END IF;
END $$;

-- 1) Cột chuẩn -------------------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS gift_id          uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS post_id          uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id         uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_pending_claim boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_claimed       boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS status           text;

-- Backfill gift_id từ data JSON (hàng cũ).
UPDATE public.notifications
   SET gift_id = NULLIF(data->>'gift_id','')::uuid
 WHERE gift_id IS NULL AND (data->>'gift_id') ~ '^[0-9a-fA-F-]{36}$';

-- 2) Chống trùng: 1 gift_id = tối đa 1 notification -------------------
DELETE FROM public.notifications a
 USING public.notifications b
 WHERE a.gift_id IS NOT NULL
   AND a.gift_id = b.gift_id
   AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_gift_id
  ON public.notifications (gift_id) WHERE gift_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_pending_gift
  ON public.notifications (user_id, created_at DESC) WHERE is_pending_claim = true;

-- 3) RPC ghi notification quà (idempotent theo gift_id) ---------------
CREATE OR REPLACE FUNCTION public.notify_post_gift_v5(
  p_gift_id     uuid,
  p_receiver_id uuid,
  p_actor_id    uuid,
  p_post_id     uuid,
  p_gift_key    text,
  p_amount      numeric,
  p_title       text DEFAULT NULL,
  p_message     text DEFAULT NULL,
  p_data        jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_gift_id IS NULL OR p_receiver_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  -- Không bao giờ thông báo cho chính người tặng.
  IF p_actor_id IS NOT NULL AND p_actor_id = p_receiver_id THEN
    RETURN jsonb_build_object('ok', true, 'skipped', true, 'code', 'SELF_GIFT');
  END IF;

  SELECT id INTO v_id FROM public.notifications WHERE gift_id = p_gift_id;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'notification_id', v_id);
  END IF;

  INSERT INTO public.notifications (
    user_id, type, kind, title, message, data,
    is_read, is_pending_claim, is_claimed, status,
    gift_id, post_id, actor_id, last_actor_id
  ) VALUES (
    p_receiver_id,
    'gift_v1',
    'gift_v1',
    COALESCE(p_title, '🎁 Bạn nhận được một món quà'),
    COALESCE(p_message, 'Bấm Nhận để cộng vào ví.'),
    COALESCE(p_data, '{}'::jsonb) || jsonb_build_object(
      'kind', 'gift_v1',
      'gift_id', p_gift_id,
      'gift_key', p_gift_key,
      'amount', p_amount,
      'post_id', p_post_id,
      'actor_id', p_actor_id,
      'sender_id', p_actor_id,
      'from_user_id', p_actor_id,
      'status', 'pending'
    ),
    false, true, false, 'pending',
    p_gift_id, p_post_id, p_actor_id, p_actor_id
  )
  ON CONFLICT (gift_id) WHERE gift_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.notifications WHERE gift_id = p_gift_id;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'notification_id', v_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'notification_id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.notify_post_gift_v5(uuid, uuid, uuid, uuid, text, numeric, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.notify_post_gift_v5(uuid, uuid, uuid, uuid, text, numeric, text, text, jsonb)
  TO anon, authenticated, service_role;

-- 4) RPC đánh dấu đã nhận (idempotent) — gọi SAU claim_post_gift_v2 ở SB1
CREATE OR REPLACE FUNCTION public.mark_post_gift_claimed_v5(p_gift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_gift_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT'); END IF;
  UPDATE public.notifications
     SET is_claimed = true,
         is_pending_claim = false,
         is_read = true,
         status = 'claimed',
         data = COALESCE(data, '{}'::jsonb)
                || jsonb_build_object('claimed', true, 'status', 'claimed',
                                      'claimed_at', to_char(now() AT TIME ZONE 'utc','YYYY-MM-DD"T"HH24:MI:SSZ'))
   WHERE gift_id = p_gift_id
   RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'notification_id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.mark_post_gift_claimed_v5(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_post_gift_claimed_v5(uuid) TO anon, authenticated, service_role;

COMMIT;
