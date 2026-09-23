-- =====================================================================
-- RUN ON SUPABASE #3 (chat/logs — uaqsetfdciyzxpuhulux)
-- Tạo RPC public.admin_reset_chat_data() — nút "Reset dữ liệu" (Admin).
--
-- #3 chưa verify được JWT của #1 → auth.uid() luôn NULL ở đây. Quyền Admin
-- được kiểm tra ở server app (/api/public/admin-reset-chat, đối chiếu
-- bangchu / profiles.is_admin trên #1). RPC này CHỈ cấp cho service_role,
-- anon/authenticated KHÔNG gọi được.
--
-- File này CHỈ tạo function + GRANT. Không xoá dữ liệu khi chạy.
-- Idempotent.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_chat_data()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted integer := 0;
  n       integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF to_regclass('public.message_reactions') IS NOT NULL THEN
    DELETE FROM public.message_reactions WHERE true;
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    DELETE FROM public.messages WHERE true;
    GET DIAGNOSTICS n = ROW_COUNT; deleted := deleted + n;
  END IF;

  IF to_regclass('public.notifications') IS NOT NULL THEN
    DELETE FROM public.notifications WHERE true;
    GET DIAGNOSTICS n = ROW_COUNT; deleted := deleted + n;
  END IF;

  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_chat_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_chat_data() TO service_role;

NOTIFY pgrst, 'reload schema';
