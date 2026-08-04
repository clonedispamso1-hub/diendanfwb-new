-- =====================================================================
-- FIX DỨT ĐIỂM: column reference "username" is ambiguous
--
-- Nguyên nhân: bản CŨ của public.admin_create_internal_account khai báo
--   RETURNS TABLE (id uuid, username text)
-- → trong plpgsql, "username" vừa là BIẾN OUT vừa là CỘT của
--   public.profiles / auth.users, nên mọi câu lệnh như
--     SELECT 1 FROM public.profiles WHERE lower(username) = ...
--     INSERT ... ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username
--   đều raise 42702 "column reference username is ambiguous".
--   CREATE OR REPLACE KHÔNG thay được hàm khi đổi tên/kiểu OUT param,
--   nên bản cũ vẫn còn tồn tại và PostgREST vẫn gọi trúng nó.
--
-- Cách xử lý ở file này:
--   1) DROP MỌI overload của admin_create_internal_account (vòng lặp pg_proc).
--   2) Tạo hàm mới admin_create_internal_account_v3 — KHÔNG dùng OUT param
--      trùng tên cột, mọi tham chiếu cột đều được qualify (au./pr./p.).
--   3) Tạo lại admin_create_internal_account như wrapper gọi v3 (tương thích
--      ngược cho mọi client cũ).
--   4) Qualify luôn admin_update_internal_account.
--
-- Idempotent. Chạy toàn bộ trong Supabase SQL Editor.
-- =====================================================================

-- 1) Xoá sạch mọi overload cũ ------------------------------------------
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('admin_create_internal_account',
                         'admin_create_internal_account_v3',
                         'admin_create_il')
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.sig);
  END LOOP;
END
$do$;

-- 2) Hàm chuẩn (v3) -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_internal_account_v3(
  p_username   text,
  p_password   text,
  p_full_name  text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_bio        text DEFAULT NULL,
  p_province   text DEFAULT NULL,
  p_gender     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := gen_random_uuid();
  v_email  text;
  v_uname  text := trim(coalesce(p_username, ''));
  v_avatar text := nullif(trim(coalesce(p_avatar_url,'')), '');
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Chỉ Super Admin được tạo tài khoản' USING ERRCODE = '42501';
  END IF;

  IF v_uname !~ '^[A-Za-z0-9_.-]{3,32}$' THEN
    RAISE EXCEPTION 'Username không hợp lệ (3–32 ký tự, chữ/số/._-)' USING ERRCODE = '22023';
  END IF;
  IF coalesce(length(p_password),0) < 6 THEN
    RAISE EXCEPTION 'Password tối thiểu 6 ký tự' USING ERRCODE = '22023';
  END IF;

  v_email := lower(v_uname) || '@fwb.local';

  IF EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = v_email) THEN
    RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles pr WHERE lower(pr.username) = lower(v_uname)) THEN
    RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE = '23505';
  END IF;

  PERFORM set_config('app.bypass_device_limit', '1', true);

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    jsonb_build_object('username', v_uname),
    now(), now(), '', '', '', ''
  );

  INSERT INTO public.profiles AS pr (
    id, username, full_name, avatar, avatar_url, bio, province, gender,
    account_source, created_at
  ) VALUES (
    v_uid, v_uname,
    coalesce(nullif(trim(p_full_name), ''), v_uname),
    v_avatar, v_avatar,
    nullif(trim(p_bio), ''), nullif(trim(p_province), ''),
    CASE WHEN p_gender IN ('male','female') THEN p_gender ELSE NULL END,
    'internal', now()
  )
  ON CONFLICT (id) DO UPDATE
    SET username       = EXCLUDED.username,
        full_name      = EXCLUDED.full_name,
        avatar         = EXCLUDED.avatar,
        avatar_url     = EXCLUDED.avatar_url,
        bio            = EXCLUDED.bio,
        province       = EXCLUDED.province,
        gender         = EXCLUDED.gender,
        account_source = 'internal';

  RETURN jsonb_build_object('id', v_uid, 'username', v_uname);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_internal_account_v3(text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_internal_account_v3(text,text,text,text,text,text,text) TO authenticated;

-- 3) Wrapper tương thích ngược -----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_internal_account(
  p_username   text,
  p_password   text,
  p_full_name  text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_bio        text DEFAULT NULL,
  p_province   text DEFAULT NULL,
  p_gender     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.admin_create_internal_account_v3(
    p_username, p_password, p_full_name, p_avatar_url, p_bio, p_province, p_gender
  );
$$;
REVOKE ALL ON FUNCTION public.admin_create_internal_account(text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_internal_account(text,text,text,text,text,text,text) TO authenticated;

-- 4) UPDATE — qualify mọi tham chiếu cột --------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_internal_account(
  p_id         uuid,
  p_username   text DEFAULT NULL,
  p_password   text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_bio        text DEFAULT NULL,
  p_province   text DEFAULT NULL,
  p_full_name  text DEFAULT NULL,
  p_gender     text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uname text := nullif(trim(coalesce(p_username,'')), '');
  v_email text;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_id AND pr.account_source = 'internal') THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản' USING ERRCODE = 'P0002';
  END IF;

  IF v_uname IS NOT NULL THEN
    IF v_uname !~ '^[A-Za-z0-9_.-]{3,32}$' THEN
      RAISE EXCEPTION 'Username không hợp lệ' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id <> p_id AND lower(pr.username) = lower(v_uname)) THEN
      RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE = '23505';
    END IF;
    v_email := lower(v_uname) || '@fwb.local';
    UPDATE auth.users au SET email = v_email, updated_at = now() WHERE au.id = p_id;
    UPDATE public.profiles pr SET username = v_uname WHERE pr.id = p_id;
  END IF;

  IF p_password IS NOT NULL AND length(p_password) >= 6 THEN
    UPDATE auth.users au
       SET encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
     WHERE au.id = p_id;
  END IF;

  UPDATE public.profiles pr
     SET avatar     = COALESCE(nullif(trim(coalesce(p_avatar_url,'')),''), pr.avatar),
         avatar_url = COALESCE(nullif(trim(coalesce(p_avatar_url,'')),''), pr.avatar_url),
         bio        = COALESCE(nullif(trim(coalesce(p_bio,'')),''), pr.bio),
         province   = COALESCE(nullif(trim(coalesce(p_province,'')),''), pr.province),
         full_name  = COALESCE(nullif(trim(coalesce(p_full_name,'')),''), pr.full_name),
         gender     = COALESCE(CASE WHEN p_gender IN ('male','female') THEN p_gender END, pr.gender)
   WHERE pr.id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_internal_account(uuid,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_internal_account(uuid,text,text,text,text,text,text,text) TO authenticated;

-- 5) Kiểm tra: chỉ còn 2 hàm create, không hàm nào có OUT param "username"
SELECT p.oid::regprocedure AS signature, pg_get_function_result(p.oid) AS returns
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'admin_create_internal_account%';
