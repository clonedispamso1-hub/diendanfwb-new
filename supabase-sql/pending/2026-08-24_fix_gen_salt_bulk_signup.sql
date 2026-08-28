-- =====================================================================
-- SUPABASE #1 — FIX: "function gen_salt(unknown) does not exist"
-- khi tạo tài khoản hàng loạt (admin_bulk_signup → admin_signup_account).
--
-- Nguyên nhân: hàm được khai báo `SET search_path = public`, trong khi
-- extension pgcrypto (crypt / gen_salt) nằm ở schema `extensions` của
-- Supabase → không nhìn thấy gen_salt.
--
-- Cách sửa (KHÔNG đổi cách lưu mật khẩu, vẫn bcrypt như cũ, KHÔNG tạo
-- gen_salt giả): đảm bảo pgcrypto tồn tại và thêm schema chứa nó vào
-- search_path của 2 hàm hiện có.
--
-- Idempotent, an toàn chạy lại. Không đổi URL/API key, không đổi UI.
-- Chạy trong Supabase SQL Editor của Supabase #1.
-- =====================================================================

DO $$
DECLARE
  v_schema text;
BEGIN
  -- 1) pgcrypto phải tồn tại (mặc định Supabase cài ở schema "extensions")
  SELECT n.nspname INTO v_schema
    FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'pgcrypto';

  IF v_schema IS NULL THEN
    IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions';
      v_schema := 'extensions';
    ELSE
      EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto';
      v_schema := 'public';
    END IF;
  END IF;

  -- 2) Thêm schema pgcrypto vào search_path của các hàm tạo tài khoản
  IF to_regprocedure('public.admin_signup_account(jsonb)') IS NOT NULL THEN
    EXECUTE format(
      'ALTER FUNCTION public.admin_signup_account(jsonb) SET search_path = public, %I',
      v_schema);
  END IF;

  IF to_regprocedure('public.admin_bulk_signup(jsonb)') IS NOT NULL THEN
    EXECUTE format(
      'ALTER FUNCTION public.admin_bulk_signup(jsonb) SET search_path = public, %I',
      v_schema);
  END IF;

  -- 3) Một số bản cũ dùng tên khác cho luồng tạo nick nội bộ
  IF to_regprocedure('public.admin_create_internal_account(jsonb)') IS NOT NULL THEN
    EXECUTE format(
      'ALTER FUNCTION public.admin_create_internal_account(jsonb) SET search_path = public, %I',
      v_schema);
  END IF;

  RAISE NOTICE 'pgcrypto schema = %', v_schema;
END $$;

-- 4) Kiểm tra nhanh: phải trả về true
-- SELECT to_regprocedure('gen_salt(text)') IS NOT NULL AS gen_salt_ok;

NOTIFY pgrst, 'reload schema';
