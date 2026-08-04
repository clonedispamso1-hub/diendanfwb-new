-- =====================================================================
-- FIX: "Forbidden" khi Bulk Account Creator gọi admin_bulk_signup
--
-- Nguyên nhân chỉ có thể là 1 trong các sau (tất cả đều được kiểm tra
-- và sửa bên dưới):
--
--   A. auth.uid() = NULL (client gọi bằng anon key, chưa gắn access token)
--      → không sửa được ở DB, phải sửa ở client. Kiểm tra bằng phần
--        DIAGNOSTIC bên dưới (Query #1).
--   B. Người dùng đăng nhập KHÔNG có bản ghi Super Admin theo cả 3
--      nguồn mà _is_super_admin() kiểm tra:
--        1) public.user_roles.role IN ('admin','super_admin')
--        2) public.profiles.is_admin = true  hoặc profiles.role admin
--        3) public.bangchu (approved + active + role='admin_1')
--   C. GRANT EXECUTE cho `authenticated` bị mất trên 1 trong các RPC.
--   D. _is_super_admin() không thể đọc profiles/user_roles/bangchu do
--      RLS (không xảy ra vì hàm là SECURITY DEFINER, nhưng ta re-apply).
--
-- Chạy TOÀN BỘ file này trong Supabase SQL Editor (đăng nhập bằng
-- account owner của project). Idempotent — chạy nhiều lần không sao.
-- =====================================================================

-- ---------------------------------------------------------------------
-- DIAGNOSTIC — chạy trước, xem kết quả trước khi apply
-- ---------------------------------------------------------------------

-- 1) Xem user đang đăng nhập trên client hiện tại có phải Super Admin
--    theo mỗi nguồn không. THAY <UID> = auth.uid() của tài khoản
--    Bang Chủ/Super Admin bạn đang dùng khi bấm "Tạo".
--    (Lấy UID: mở DevTools → localStorage sb-*-auth-token → user.id)
DO $$
DECLARE
  v_uid uuid := NULL;    -- TODO: paste user id vào đây để test
BEGIN
  IF v_uid IS NULL THEN
    RAISE NOTICE 'Skip diagnostic; hãy paste UID vào biến v_uid.';
    RETURN;
  END IF;
  RAISE NOTICE 'user_roles admin? %',
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid
             AND role::text IN ('admin','super_admin'));
  RAISE NOTICE 'profiles.is_admin/role admin? %',
    EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid
             AND (is_admin = true OR role IN ('admin','super_admin','admin_1')));
  RAISE NOTICE 'bangchu admin_1 approved active? %',
    EXISTS (SELECT 1 FROM public.bangchu
             WHERE auth_user_id = v_uid
               AND role = 'admin_1' AND status = 'approved' AND is_active = true);
  RAISE NOTICE '_is_super_admin() = %', public._is_super_admin(v_uid);
END $$;

-- 2) Xem GRANT hiện tại của các RPC bulk
SELECT p.proname, r.rolname AS granted_to, a.privilege_type
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN information_schema.routine_privileges a
    ON a.specific_schema = 'public'
   AND a.routine_name = p.proname
  LEFT JOIN pg_roles r ON r.rolname = a.grantee
 WHERE n.nspname = 'public'
   AND p.proname IN ('_is_super_admin','admin_bulk_signup',
                     'admin_signup_account','admin_check_usernames',
                     'admin_apply_profile_buff')
 ORDER BY p.proname, r.rolname;


-- ---------------------------------------------------------------------
-- FIX #1 — Đảm bảo GRANT EXECUTE cho authenticated trên toàn bộ RPC
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public._is_super_admin(uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_check_usernames(text[])       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_signup_account(jsonb)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_profile_buff(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_bulk_signup(jsonb)            TO authenticated;

-- ---------------------------------------------------------------------
-- FIX #2 — Đảm bảo _is_super_admin là SECURITY DEFINER + search_path
--   (nếu đã đúng thì CREATE OR REPLACE cũng không hại)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._is_super_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE ok boolean := false;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = _uid AND role::text IN ('admin','super_admin')
    ) INTO ok;
  EXCEPTION WHEN undefined_table OR undefined_column THEN ok := false; END;
  IF ok THEN RETURN true; END IF;

  BEGIN
    SELECT (coalesce(is_admin,false) = true
         OR role IN ('admin','super_admin','admin_1'))
      INTO ok FROM public.profiles WHERE id = _uid;
  EXCEPTION WHEN undefined_column THEN ok := false; END;
  IF ok THEN RETURN true; END IF;

  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.bangchu
       WHERE auth_user_id = _uid
         AND role IN ('admin_1')
         AND status = 'approved'
         AND is_active = true
    ) INTO ok;
  EXCEPTION WHEN undefined_table OR undefined_column THEN ok := false; END;

  RETURN coalesce(ok, false);
END;
$$;

-- ---------------------------------------------------------------------
-- FIX #3 — Nếu user hiện tại CHƯA phải Super Admin ở bất kỳ nguồn nào,
--   PHONG cho user đó bằng bảng user_roles (nguồn được ưu tiên nhất).
--
--   ➤ THAY <UID> bên dưới rồi bỏ comment 3 dòng.
-- ---------------------------------------------------------------------
-- INSERT INTO public.user_roles (user_id, role)
-- VALUES ('<UID_CUA_BAN>'::uuid, 'super_admin')
-- ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- SANITY CHECK — sau khi apply
-- ---------------------------------------------------------------------
--   SELECT public._is_super_admin('<UID_CUA_BAN>'::uuid);   -- phải TRUE
--   SELECT public.admin_bulk_signup('[]'::jsonb);           -- phải trả '[]'
-- ---------------------------------------------------------------------
