-- ============================================================================
-- 🔐 SECURITY HARDENING — REVOKE EXECUTE ON DANGEROUS RPCs (2026-09-22)
--
-- CHỈ THU HỒI QUYỀN. Không DROP, không sửa nội dung hàm, không đụng dữ liệu,
-- không thay đổi cấu trúc bảng, không thêm Service Role Key.
--
-- Chạy từng khối trong SQL Editor của ĐÚNG project tương ứng (SB1 / SB2 / SB3).
-- Sau khi chạy: anon + authenticated KHÔNG còn gọi được các RPC này qua PostgREST.
-- service_role (chỉ dùng phía server, không có trong frontend) vẫn giữ quyền.
-- ============================================================================

-- ─────────────────────────────── SB1 (core/auth) ────────────────────────────
-- https://gxfxqbhxoghdhokwjpex.supabase.co
REVOKE ALL ON FUNCTION public.reset_all_website_data()                  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_purge_all_accounts(text, text)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_purge_member_full(uuid)             FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_member_full(uuid)          TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_purge_all_accounts(text, text)   TO service_role;
-- reset_all_website_data: không cấp lại cho bất kỳ role nào (không còn được dùng).

-- Nếu tồn tại biến thể 3 tham số (bản cũ), thu hồi luôn:
DO $$
BEGIN
  IF to_regprocedure('public.admin_purge_all_accounts(text,text,text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_purge_all_accounts(text,text,text) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.admin_delete_user_data(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_delete_user_data(uuid) FROM PUBLIC, anon, authenticated';
  END IF;
  IF to_regprocedure('public.admin_delete_all_posts(text)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.admin_delete_all_posts(text) FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ─────────────────────────────── SB2 (media/VIP) ────────────────────────────
-- https://pymwwuscoftmdcmmeckp.supabase.co
REVOKE ALL ON FUNCTION public.admin_purge_all_members(text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_purge_member_full(uuid)               FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_member_full(uuid)            TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_purge_all_members(text, text, uuid[]) TO service_role;

-- ─────────────────────────────── SB3 (social/logs) ──────────────────────────
-- https://uaqsetfdciyzxpuhulux.supabase.co
REVOKE ALL ON FUNCTION public.admin_purge_all_members(text, text, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_purge_member_full(uuid)               FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_member_full(uuid)            TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_purge_all_members(text, text, uuid[]) TO service_role;

-- ============================================================================
-- KIỂM TRA SAU KHI CHẠY (chạy trên từng DB) — chỉ ĐỌC:
--   SELECT p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
--          has_function_privilege('service_role',  p.oid, 'EXECUTE') AS service_role
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('reset_all_website_data','admin_purge_all_accounts',
--                       'admin_purge_all_members','admin_purge_member_full');
-- Kỳ vọng: anon = false, authenticated = false.
-- ============================================================================
