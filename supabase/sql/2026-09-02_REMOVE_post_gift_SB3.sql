-- ============================================================================
-- XÓA HỆ THỐNG "TẶNG QUÀ BÀI VIẾT" — Supabase #3 (notifications)
-- CHỈ xóa RPC riêng Post Gift + notification cũ của Post Gift.
-- GIỮ: bảng notifications, Chat, Lì Xì (dragon_reward), chuyển Gem, follow, hệ thống.
-- ============================================================================
BEGIN;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'notify_post_gift_v5','mark_post_gift_claimed_v5',
      'delete_post_gift_notification_v6','expire_pending_post_gift_notifications_v6')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications
    WHERE type IN ('gift_post','gift_v1') OR (data ->> 'action_type') = 'gift_dragon_ball';
  END IF;
END $$;

COMMIT;
