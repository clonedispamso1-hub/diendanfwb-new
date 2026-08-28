-- =====================================================================
-- 🔔 CHẠY TRÊN SUPABASE #3 (notifications) — KHÔNG chạy trên SB1/SB2.
--
-- Vấn đề: chỉ có delete/expire RPC được chạy ⇒ KHÔNG có hàm tạo thông báo.
-- File này tạo/khôi phục `public.notify_post_gift_v5` (SECURITY DEFINER,
-- idempotent theo gift_id) và cấp EXECUTE cho anon/authenticated.
--
-- Idempotent: chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

BEGIN;

-- 0) Cột chuẩn (nếu thiếu) -------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS gift_id          uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS post_id          uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id         uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_pending_claim boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_claimed       boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS status           text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_gift_id
  ON public.notifications (gift_id) WHERE gift_id IS NOT NULL;

-- 1) Dọn mọi overload cũ để tránh "function is not unique" ------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
      FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname = 'notify_post_gift_v5'
  LOOP
    EXECUTE format('DROP FUNCTION %s', r.sig);
  END LOOP;
END $$;

-- 2) Hàm tạo thông báo quà (idempotent theo gift_id) ------------------
CREATE FUNCTION public.notify_post_gift_v5(
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

-- 3) Quyền gọi -------------------------------------------------------
REVOKE ALL ON FUNCTION public.notify_post_gift_v5(uuid, uuid, uuid, uuid, text, numeric, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.notify_post_gift_v5(uuid, uuid, uuid, uuid, text, numeric, text, text, jsonb)
  TO anon, authenticated, service_role;

COMMIT;

-- 4) Kiểm tra nhanh (chạy riêng nếu muốn):
-- SELECT proname, oid::regprocedure FROM pg_proc
--  WHERE pronamespace='public'::regnamespace AND proname='notify_post_gift_v5';
