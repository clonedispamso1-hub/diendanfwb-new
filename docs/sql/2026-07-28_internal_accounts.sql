-- =====================================================================
-- Internal Accounts (a.k.a. "Tài khoản thứ hai") — Admin-managed accounts.
--
-- Design goals:
--   • Real auth.users rows → login/post/comment/like/follow/chat như user.
--   • Cùng cấu trúc profile với user thường; KHÔNG có field/flag/badge lộ ra
--     client cho biết đây là internal account.
--   • Chỉ Bang Chủ / Super Admin gọi được các RPC bên dưới.
--   • Không tạo bảng mới → tận dụng auth.users + public.profiles hiện có.
--   • Server-only marker: profiles.account_source ('user' | 'internal').
--     Frontend không bao giờ SELECT cột này (queries đều liệt kê cột cụ thể).
--
-- Idempotent. Chạy trong Supabase SQL Editor.
-- =====================================================================

-- 1) Marker (server-only) ---------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_source text NOT NULL DEFAULT 'user';

COMMENT ON COLUMN public.profiles.account_source IS
  'Server-only. ''user'' cho tài khoản người dùng thường; ''internal'' cho tài khoản do Admin tạo. KHÔNG expose ra client.';

CREATE INDEX IF NOT EXISTS profiles_account_source_idx
  ON public.profiles(account_source)
  WHERE account_source <> 'user';

-- 2) Helper: kiểm tra caller có phải Super Admin không --------------
CREATE OR REPLACE FUNCTION public._is_super_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
    SELECT (is_admin = true OR role IN ('admin','super_admin','admin_1'))
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

  RETURN COALESCE(ok, false);
END;
$$;
REVOKE ALL ON FUNCTION public._is_super_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._is_super_admin(uuid) TO authenticated;

-- 3) CREATE ------------------------------------------------------------
-- Tạo 1 auth.users + profiles hoàn chỉnh. Password lưu bằng bcrypt (crypt()).
-- Login qua supabase.auth.signInWithPassword theo email '<username>@fwb.local'
-- giống flow user thường trong app.
CREATE OR REPLACE FUNCTION public.admin_create_internal_account(
  p_username     text,
  p_password     text,
  p_full_name    text DEFAULT NULL,
  p_avatar_url   text DEFAULT NULL,
  p_bio          text DEFAULT NULL,
  p_province     text DEFAULT NULL,
  p_gender       text DEFAULT NULL
) RETURNS TABLE (id uuid, username text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := gen_random_uuid();
  v_email text;
  v_uname text := trim(coalesce(p_username, ''));
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

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = v_email) THEN
    RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_uname)) THEN
    RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE = '23505';
  END IF;

  -- Bypass triggers giới hạn thiết bị/IP (giống admin_bulk_create_virtual_clones).
  PERFORM set_config('app.bypass_device_limit', '1', true);

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_uid,
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated',
    v_email,
    crypt(p_password, gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    jsonb_build_object('username', v_uname),
    now(), now(), '', '', '', ''
  );

  INSERT INTO public.profiles (id, username, full_name, avatar, avatar_url, bio, province, gender, account_source, created_at)
  VALUES (
    v_uid, v_uname,
    coalesce(nullif(trim(p_full_name), ''), v_uname),
    p_avatar_url, p_avatar_url,
    nullif(trim(p_bio), ''),
    nullif(trim(p_province), ''),
    CASE WHEN p_gender IN ('male','female') THEN p_gender ELSE NULL END,
    'internal',
    now()
  )
  ON CONFLICT (id) DO UPDATE
    SET username = EXCLUDED.username,
        full_name = EXCLUDED.full_name,
        avatar = EXCLUDED.avatar,
        avatar_url = EXCLUDED.avatar_url,
        bio = EXCLUDED.bio,
        province = EXCLUDED.province,
        gender = EXCLUDED.gender,
        account_source = 'internal';

  RETURN QUERY SELECT v_uid, v_uname;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_internal_account(text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_internal_account(text,text,text,text,text,text,text) TO authenticated;

-- 4) LIST --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_internal_accounts(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0
) RETURNS TABLE (
  id uuid, username text, full_name text, avatar text, bio text,
  province text, gender text, is_banned boolean, created_at timestamptz,
  total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_term text := nullif(trim(coalesce(p_search,'')), '');
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.username, p.full_name, p.avatar, p.bio, p.province, p.gender,
           p.is_banned, p.created_at
      FROM public.profiles p
     WHERE p.account_source = 'internal'
       AND (v_term IS NULL
            OR p.username ILIKE '%'||v_term||'%'
            OR p.full_name ILIKE '%'||v_term||'%'
            OR p.province ILIKE '%'||v_term||'%')
  ), c AS (SELECT count(*)::bigint AS n FROM base)
  SELECT b.*, (SELECT n FROM c) AS total
    FROM base b
   ORDER BY b.created_at DESC
   LIMIT greatest(p_limit,1) OFFSET greatest(p_offset,0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_internal_accounts(text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_internal_accounts(text,int,int) TO authenticated;

-- 5) UPDATE (username/password/avatar/bio/province) --------------------
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uname text := nullif(trim(coalesce(p_username,'')), '');
  v_email text;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_id AND account_source = 'internal') THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản' USING ERRCODE = 'P0002';
  END IF;

  IF v_uname IS NOT NULL THEN
    IF v_uname !~ '^[A-Za-z0-9_.-]{3,32}$' THEN
      RAISE EXCEPTION 'Username không hợp lệ' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id <> p_id AND lower(username)=lower(v_uname)) THEN
      RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE = '23505';
    END IF;
    v_email := lower(v_uname) || '@fwb.local';
    UPDATE auth.users SET email = v_email, updated_at = now() WHERE id = p_id;
    UPDATE public.profiles SET username = v_uname WHERE id = p_id;
  END IF;

  IF p_password IS NOT NULL AND length(p_password) >= 6 THEN
    UPDATE auth.users
       SET encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now()
     WHERE id = p_id;
  END IF;

  UPDATE public.profiles
     SET avatar     = COALESCE(p_avatar_url, avatar),
         avatar_url = COALESCE(p_avatar_url, avatar_url),
         bio        = COALESCE(nullif(trim(p_bio),''), bio),
         province   = COALESCE(nullif(trim(p_province),''), province),
         full_name  = COALESCE(nullif(trim(p_full_name),''), full_name),
         gender     = COALESCE(CASE WHEN p_gender IN ('male','female') THEN p_gender END, gender)
   WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_internal_account(uuid,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_internal_account(uuid,text,text,text,text,text,text,text) TO authenticated;

-- 6) LOCK / UNLOCK -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_lock_internal_account(p_id uuid, p_locked boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles
     SET is_banned = p_locked,
         banned_until = CASE WHEN p_locked THEN NULL ELSE NULL END
   WHERE id = p_id AND account_source = 'internal';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_lock_internal_account(uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_lock_internal_account(uuid,boolean) TO authenticated;

-- 7) DELETE ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_internal_account(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_id AND account_source = 'internal') THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản' USING ERRCODE = 'P0002';
  END IF;
  DELETE FROM auth.users WHERE id = p_id;
  DELETE FROM public.profiles WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_internal_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_internal_account(uuid) TO authenticated;
