-- ============================================================
-- DỌN RÁC DATABASE: xóa dữ liệu task/log của Bot & hệ thống
-- cũ hơn 3 ngày (created_at < NOW() - INTERVAL '3 days').
--
-- Gọi qua endpoint: POST /api/public/purge-logs-cron
--   Header: x-cron-secret: <CRON_SECRET>
-- ============================================================

CREATE OR REPLACE FUNCTION public.purge_old_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t          text;
  deleted    integer := 0;
  n          integer;
  targets    text[] := ARRAY[
    'bot_activity_queue',
    'bot_actions_logs',
    'activity_logs',
    'agent_activity_logs',
    'admin_logs',
    'candy_logs',
    'dice_logs',
    'keyword_logs',
    'system_health_logs',
    'member_activity_log',
    'admin_gift_batch_log',
    'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY targets LOOP
    -- Bỏ qua bảng chưa tồn tại hoặc không có cột created_at.
    IF to_regclass('public.' || quote_ident(t)) IS NULL THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'created_at'
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'DELETE FROM public.%I WHERE created_at < NOW() - INTERVAL ''3 days''', t
    );
    GET DIAGNOSTICS n = ROW_COUNT;
    deleted := deleted + n;
  END LOOP;

  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_logs() TO anon, authenticated, service_role;
