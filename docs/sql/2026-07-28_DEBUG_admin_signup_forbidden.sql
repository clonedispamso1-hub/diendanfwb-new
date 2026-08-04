-- =====================================================================
-- DEBUG — Vì sao admin_signup_account trả 403 Forbidden dù đã GRANT.
--
-- Chạy TỪNG BƯỚC trong Supabase SQL Editor (dùng ĐÚNG tài khoản
-- Super Admin đang gặp lỗi trên trình duyệt — mở SQL Editor bằng
-- "Run as: authenticated" nếu có, hoặc dùng "Impersonate user").
--
-- Mục tiêu: tìm CHÍNH XÁC điều kiện nào trả false, không đoán mò.
-- =====================================================================

-- ---------------------------------------------------------------------
-- BƯỚC 0 — Xem hàm _is_super_admin hiện tại là bản nào (owner, definer)
-- ---------------------------------------------------------------------
SELECT n.nspname, p.proname, r.rolname AS owner,
       p.prosecdef AS security_definer, p.proconfig,
       pg_get_functiondef(p.oid) AS body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_roles r     ON r.oid = p.proowner
 WHERE n.nspname='public' AND p.proname='_is_super_admin';

-- ---------------------------------------------------------------------
-- BƯỚC 1 — Cài bản DEBUG của _is_super_admin để lộ CHÍNH XÁC nhánh nào
--          trả true/false. Vẫn dùng SECURITY DEFINER + search_path.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._is_super_admin_debug(_uid uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid          uuid := _uid;
  v_from_roles   boolean := null;
  v_from_prof    boolean := null;
  v_from_bangchu boolean := null;
  v_role_rows    jsonb   := '[]'::jsonb;
  v_prof_row     jsonb   := null;
  v_bc_row       jsonb   := null;
  v_err          text    := null;
BEGIN
  -- 1. user_roles
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
       WHERE user_id = v_uid AND role::text IN ('admin','super_admin')
    ) INTO v_from_roles;

    SELECT coalesce(jsonb_agg(to_jsonb(ur)), '[]'::jsonb) INTO v_role_rows
      FROM public.user_roles ur WHERE ur.user_id = v_uid;
  EXCEPTION WHEN OTHERS THEN
    v_from_roles := null; v_err := coalesce(v_err,'') || ' user_roles:'||SQLERRM;
  END;

  -- 2. profiles.is_admin / role
  BEGIN
    SELECT to_jsonb(p) INTO v_prof_row FROM public.profiles p WHERE p.id = v_uid;
    BEGIN
      SELECT (coalesce(is_admin,false) = true
           OR role IN ('admin','super_admin','admin_1'))
        INTO v_from_prof FROM public.profiles WHERE id = v_uid;
    EXCEPTION WHEN undefined_column THEN v_from_prof := null;
    END;
  EXCEPTION WHEN OTHERS THEN
    v_err := coalesce(v_err,'') || ' profiles:'||SQLERRM;
  END;

  -- 3. bangchu
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.bangchu
       WHERE auth_user_id = v_uid
         AND role IN ('admin_1')
         AND status = 'approved'
         AND is_active = true
    ) INTO v_from_bangchu;

    SELECT to_jsonb(b) INTO v_bc_row FROM public.bangchu b
      WHERE b.auth_user_id = v_uid LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_from_bangchu := null; v_err := coalesce(v_err,'') || ' bangchu:'||SQLERRM;
  END;

  RETURN jsonb_build_object(
    'auth_uid_arg',        v_uid,
    'auth_uid_now',        auth.uid(),
    'current_user',        current_user,
    'session_user',        session_user,
    'from_user_roles',     v_from_roles,
    'from_profiles',       v_from_prof,
    'from_bangchu',        v_from_bangchu,
    'user_roles_rows',     v_role_rows,
    'profiles_row',        v_prof_row,
    'bangchu_row',         v_bc_row,
    'result_is_super',     coalesce(v_from_roles,false)
                        OR coalesce(v_from_prof,false)
                        OR coalesce(v_from_bangchu,false),
    'errors',              v_err
  );
END;
$$;
REVOKE ALL ON FUNCTION public._is_super_admin_debug(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_super_admin_debug(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- BƯỚC 2 — Gọi từ TRÌNH DUYỆT (bằng tài khoản đang bị lỗi).
--          Mở DevTools > Console tại trang admin và chạy:
--
--   const { data, error } = await window.__supabase?.rpc?.('_is_super_admin_debug')
--     ?? (await import('/src/integrations/supabase/client.ts')).supabase.rpc('_is_super_admin_debug');
--   console.log(JSON.stringify(data, null, 2), error);
--
-- HOẶC trong SQL Editor, chạy "Impersonate user" là tài khoản đó rồi:
--   SELECT public._is_super_admin_debug();
--
-- Nhìn output:
--   • auth_uid_now = null           → chưa có JWT (client đang gọi bằng anon)
--   • from_user_roles = false + rows=[]  → thiếu bản ghi user_roles
--   • from_profiles = false         → cột role/is_admin không khớp
--   • from_bangchu = false          → status/is_active/role không đủ
--   • result_is_super = false       → CHÍNH nguyên nhân 403
--   • errors chứa gì đó             → RLS/permission trên chính bảng
--
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- BƯỚC 3 — Sau khi biết nhánh nào false, FIX chỉ nhánh đó.
--   Ví dụ (chọn 1 trong 3, KHÔNG chạy tất cả):
--
--   a) Cấp Super Admin qua user_roles (ưu tiên — bản gốc kỳ vọng ở đây):
--      INSERT INTO public.user_roles(user_id, role)
--      VALUES ('<UID>'::uuid, 'super_admin')
--      ON CONFLICT DO NOTHING;
--
--   b) Hoặc set trực tiếp trên profiles:
--      UPDATE public.profiles SET role='super_admin' WHERE id='<UID>'::uuid;
--
--   c) Hoặc phê duyệt bản ghi bangchu:
--      UPDATE public.bangchu
--         SET role='admin_1', status='approved', is_active=true
--       WHERE auth_user_id='<UID>'::uuid;
--
-- Sau đó chạy lại:  SELECT public._is_super_admin_debug();
-- Khi result_is_super=true → admin_signup_account sẽ hết 403.
-- ---------------------------------------------------------------------
