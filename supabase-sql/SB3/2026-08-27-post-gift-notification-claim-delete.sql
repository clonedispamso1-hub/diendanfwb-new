-- =====================================================================
-- 🎁 CHẠY TRÊN SUPABASE #3 (notifications) — KHÔNG chạy trên SB1/SB2.
--
-- Mục tiêu (chỉ luồng quà):
--   • CLAIM xong ⇒ thông báo quà BIẾN MẤT khỏi chuông (xoá hàng), badge -1.
--   • Quà chưa CLAIM quá 3 ngày ⇒ tự hết hạn và bị xoá khỏi danh sách.
-- Idempotent: chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

BEGIN;

-- 1) Xoá thông báo quà sau khi CLAIM (idempotent theo gift_id).
CREATE OR REPLACE FUNCTION public.delete_post_gift_notification_v6(p_gift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted int := 0;
BEGIN
  IF p_gift_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  END IF;
  DELETE FROM public.notifications WHERE gift_id = p_gift_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN
    DELETE FROM public.notifications
     WHERE (data->>'gift_id') = p_gift_id::text
        OR (data->>'post_gift_id') = p_gift_id::text;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;
  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END $$;

REVOKE ALL ON FUNCTION public.delete_post_gift_notification_v6(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_post_gift_notification_v6(uuid)
  TO anon, authenticated, service_role;

-- 2) Hết hạn 3 ngày: xoá mọi thông báo quà chưa nhận quá 72 giờ.
CREATE OR REPLACE FUNCTION public.expire_pending_post_gift_notifications_v6()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_deleted int := 0;
BEGIN
  DELETE FROM public.notifications
   WHERE is_pending_claim = true
     AND COALESCE(is_claimed, false) = false
     AND created_at < now() - interval '3 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END $$;

REVOKE ALL ON FUNCTION public.expire_pending_post_gift_notifications_v6() FROM public;
GRANT EXECUTE ON FUNCTION public.expire_pending_post_gift_notifications_v6()
  TO anon, authenticated, service_role;

COMMIT;
