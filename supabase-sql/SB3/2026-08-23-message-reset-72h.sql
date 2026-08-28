-- =====================================================================
-- RUN ON SUPABASE #3 (chat/logs — uaqsetfdciyzxpuhulux)
--
-- MESSAGE RESET 72h — migration MỚI, RIÊNG BIỆT cho reset toàn cục.
-- ⚠️ CHƯA chạy trên SB3 — cần chạy 1 lần trong SQL Editor của project #3.
--
-- Phạm vi: CHỈ tạo RPC public.purge_expired_chat_data() (xoá tin nhắn /
-- thông báo / reaction quá 72 giờ) + cấp quyền EXECUTE + dọn 1 lần đầu.
-- KHÔNG chứa và KHÔNG lặp lại bất kỳ phần nào của deleted_by_users
-- (phần đó đã chạy xong — xem 2026-08-23-chat-delete-for-user.sql).
--
-- Tự động hoá: endpoint HTTP có sẵn của app gọi RPC này —
--   POST https://<domain>/api/public/purge-chat-cron
--   Header: x-cron-secret: <CRON_SECRET>
-- Cấu hình Scheduled Job (Supabase Dashboard → Cron, hoặc scheduler ngoài)
-- gọi endpoint trên mỗi giờ:  5 * * * *
-- Idempotent: chạy lại nhiều lần đều an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) RPC dọn dữ liệu chat quá 72 giờ (SECURITY DEFINER, phòng thủ:
--    chỉ đụng bảng nào thực sự tồn tại trên instance này)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_chat_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff  timestamptz := now() - interval '72 hours';
  deleted integer := 0;
  n       integer;
BEGIN
  IF to_regclass('public.message_reactions') IS NOT NULL
     AND to_regclass('public.messages') IS NOT NULL THEN
    DELETE FROM public.message_reactions r
     WHERE r.message_id IN (
       SELECT id FROM public.messages WHERE created_at < cutoff
     );
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    DELETE FROM public.messages WHERE created_at < cutoff;
    GET DIAGNOSTICS n = ROW_COUNT; deleted := deleted + n;
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications WHERE created_at < cutoff;
    GET DIAGNOSTICS n = ROW_COUNT; deleted := deleted + n;
  END IF;

  RETURN deleted;
END;
$$;

-- anon: để Scheduled Job / endpoint /api/public/purge-chat-cron gọi được.
GRANT EXECUTE ON FUNCTION public.purge_expired_chat_data() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) Dọn ngay 1 lần các dữ liệu chat đã quá 72 giờ
-- ---------------------------------------------------------------------
SELECT public.purge_expired_chat_data();

NOTIFY pgrst, 'reload schema';
