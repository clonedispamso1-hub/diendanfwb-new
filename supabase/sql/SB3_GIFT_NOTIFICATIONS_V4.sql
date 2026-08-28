-- =====================================================================
-- 🔔 SB3_GIFT_NOTIFICATIONS_V4 — NOTIFICATION QUÀ/GEM (Supabase #3)
-- Chạy nguyên khối trong SQL Editor của SB3. An toàn khi chạy lại nhiều lần.
--
-- Nguyên tắc:
--   • Notification là bước BẤT ĐỒNG BỘ của gift_send_v4 ở SB1.
--   • Chỉ backend (service_role / Edge Function) được ghi notification quà.
--     Frontend bị chặn bằng RLS restrictive policy.
--   • event_id UNIQUE → retry bao nhiêu lần cũng chỉ hiện MỘT thông báo.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Cột & khoá chống trùng
-- ---------------------------------------------------------------------
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS source text;   -- 'sb1_outbox'

CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_uidx
  ON public.notifications (event_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notifications_idem_uidx
  ON public.notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2) Chặn frontend tự tạo notification quà/gem
--    (restrictive → cộng dồn với mọi policy INSERT hiện có)
-- ---------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_no_client_gift_insert ON public.notifications;
CREATE POLICY notif_no_client_gift_insert ON public.notifications
  AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (
    COALESCE(type, '') NOT LIKE 'gift%'
    AND COALESCE(type, '') NOT LIKE 'gem%'
    AND COALESCE(kind, '') NOT LIKE 'gift%'
    AND COALESCE(data->>'kind', '') NOT LIKE 'gift%'
    AND COALESCE(data->>'kind', '') NOT LIKE 'gem%'
    AND event_id IS NULL
  );

-- Không cho client sửa/xoá cột chống trùng của notification quà.
DROP POLICY IF EXISTS notif_no_client_gift_update ON public.notifications;
CREATE POLICY notif_no_client_gift_update ON public.notifications
  AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (event_id IS NOT DISTINCT FROM event_id);

-- ---------------------------------------------------------------------
-- 3) RPC idempotent — chỉ service_role gọi được
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.notify_gift_v4(uuid, text, uuid, uuid, text, text, jsonb);
CREATE OR REPLACE FUNCTION public.notify_gift_v4(
  p_event_id        uuid,
  p_idempotency_key text,
  p_user_id         uuid,       -- người nhận quà
  p_actor_id        uuid,       -- người tặng
  p_title           text,
  p_message         text,
  p_data            jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id  uuid;
  v_dup uuid;
BEGIN
  IF p_event_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;

  SELECT id INTO v_dup FROM public.notifications WHERE event_id = p_event_id;
  IF v_dup IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'notification_id', v_dup);
  END IF;

  INSERT INTO public.notifications(
    user_id, type, kind, title, message, data, is_read,
    event_id, idempotency_key, source, last_actor_id
  )
  VALUES (
    p_user_id,
    COALESCE(p_data->>'notif_type', 'gift_v4'),
    'gift_v4',
    p_title,
    p_message,
    COALESCE(p_data, '{}'::jsonb) || jsonb_build_object('event_id', p_event_id),
    false,
    p_event_id,
    NULLIF(btrim(COALESCE(p_idempotency_key, '')), ''),
    'sb1_outbox',
    p_actor_id
  )
  ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.notifications WHERE event_id = p_event_id;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'notification_id', v_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'notification_id', v_id);
END $$;

REVOKE ALL ON FUNCTION public.notify_gift_v4(uuid, text, uuid, uuid, text, text, jsonb)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_gift_v4(uuid, text, uuid, uuid, text, text, jsonb)
  TO service_role;

COMMIT;
