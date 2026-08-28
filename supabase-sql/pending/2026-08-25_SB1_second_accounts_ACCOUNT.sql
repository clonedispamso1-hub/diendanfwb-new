-- =====================================================================
-- CHẠY Ở SUPABASE #1 (ACCOUNT) — "Tài khoản thứ hai" phần TÀI KHOẢN
--
-- Phạm vi #1 (theo kiến trúc đã chốt):
--   • username / đăng nhập / mật khẩu (auth.users + profiles)
--   • Xu (gem_balance)
--   • Followers / Following (bộ đếm trên profiles)
--   • Trạng thái tài khoản (khoá / mở khoá)
--   • Xoá tài khoản
--   • Các dữ liệu thuộc chính account (avatar url, tên, giới tính, khu vực…)
--
-- TUYỆT ĐỐI KHÔNG đụng tới posts / comments / messages / notifications —
-- các bảng đó nằm ở Supabase #3 (xem file 2026-08-25_SB3_second_accounts_ACTIVITY.sql).
--
-- Idempotent, chạy 1 lần trong SQL Editor của Supabase #1.
-- Không đổi cách hash mật khẩu (bcrypt pgcrypto), không đổi URL/API key.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Extension + helper
-- ---------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public._has_column(p_table text, p_column text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=p_table AND column_name=p_column
  );
$$;
GRANT EXECUTE ON FUNCTION public._has_column(text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 1) Cột dữ liệu thuộc chính account
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_source   text,
  ADD COLUMN IF NOT EXISTS gem_balance      bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followers_count  bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS following_count  bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posts_count      bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS profile_gif      text,
  ADD COLUMN IF NOT EXISTS call_video_url   text,   -- clone_call_media (URL media ở #2)
  ADD COLUMN IF NOT EXISTS call_voice_url   text,   -- clone_call_media (URL media ở #2)
  ADD COLUMN IF NOT EXISTS is_seed_account  boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_account_source_idx
  ON public.profiles (account_source) WHERE account_source = 'internal';
CREATE INDEX IF NOT EXISTS profiles_is_seed_account_idx
  ON public.profiles (is_seed_account) WHERE is_seed_account = TRUE;

-- ---------------------------------------------------------------------
-- 2) Buff hồ sơ: Xu + Followers/Following/Posts (bộ đếm) + ngày tạo + GIF
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_apply_profile_buff(p_id uuid, p_row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_followers bigint      := nullif(p_row->>'followers','')::bigint;
  v_following bigint      := nullif(p_row->>'following','')::bigint;
  v_posts     bigint      := nullif(p_row->>'posts','')::bigint;
  v_gem       bigint      := coalesce(nullif(p_row->>'gem','')::bigint, nullif(p_row->>'xu','')::bigint);
  v_gif       text        := nullif(trim(coalesce(p_row->>'profile_gif','')),'');
  v_created   timestamptz := nullif(p_row->>'created_at','')::timestamptz;
  c text;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_followers IS NOT NULL AND public._has_column('profiles','followers_count') THEN
    EXECUTE 'UPDATE public.profiles SET followers_count=$1 WHERE id=$2' USING greatest(v_followers,0), p_id;
  END IF;
  IF v_following IS NOT NULL AND public._has_column('profiles','following_count') THEN
    EXECUTE 'UPDATE public.profiles SET following_count=$1 WHERE id=$2' USING greatest(v_following,0), p_id;
  END IF;
  IF v_posts IS NOT NULL AND public._has_column('profiles','posts_count') THEN
    EXECUTE 'UPDATE public.profiles SET posts_count=$1 WHERE id=$2' USING greatest(v_posts,0), p_id;
  END IF;
  IF v_gem IS NOT NULL AND public._has_column('profiles','gem_balance') THEN
    EXECUTE 'UPDATE public.profiles SET gem_balance=$1 WHERE id=$2' USING greatest(v_gem,0), p_id;
  END IF;
  IF v_created IS NOT NULL THEN
    EXECUTE 'UPDATE public.profiles SET created_at=$1 WHERE id=$2' USING v_created, p_id;
  END IF;
  IF v_gif IS NOT NULL THEN
    FOREACH c IN ARRAY ARRAY['profile_gif','gif_url','cover_gif','profile_gif_url'] LOOP
      IF public._has_column('profiles', c) THEN
        EXECUTE format('UPDATE public.profiles SET %I=$1 WHERE id=$2', c) USING v_gif, p_id;
      END IF;
    END LOOP;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_apply_profile_buff(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_profile_buff(uuid,jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Tạo tài khoản (đơn + hàng loạt) — fix lỗi gen_salt(unknown)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_check_usernames(p_usernames text[])
RETURNS TABLE (username text, taken boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT u.u,
         (EXISTS (SELECT 1 FROM public.profiles pr WHERE lower(pr.username)=lower(u.u))
          OR EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email)=lower(u.u)||'@fwb.local'))
    FROM unnest(coalesce(p_usernames, ARRAY[]::text[])) AS u(u);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_check_usernames(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_check_usernames(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_signup_account(p_row jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  v_uid      uuid := gen_random_uuid();
  v_uname    text := trim(coalesce(p_row->>'username',''));
  v_pass     text := coalesce(p_row->>'password','');
  v_email    text;
  v_avatar   text := nullif(trim(coalesce(p_row->>'avatar_url','')),'');
  v_name     text := nullif(trim(coalesce(p_row->>'full_name','')),'');
  v_gender   text := nullif(trim(coalesce(p_row->>'gender','')),'');
  v_province text := nullif(trim(coalesce(p_row->>'province','')),'');
  v_bio      text := nullif(trim(coalesce(p_row->>'bio','')),'');
  v_age      int  := nullif(p_row->>'age','')::int;
  v_created  timestamptz := nullif(p_row->>'created_at','')::timestamptz;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Chỉ Super Admin được tạo tài khoản' USING ERRCODE='42501';
  END IF;
  IF v_uname !~ '^[A-Za-z0-9_.-]{3,32}$' THEN
    RAISE EXCEPTION 'Username không hợp lệ (3–32 ký tự, chữ/số/._-)' USING ERRCODE='22023';
  END IF;
  IF length(v_pass) < 6 THEN
    RAISE EXCEPTION 'Password tối thiểu 6 ký tự' USING ERRCODE='22023';
  END IF;
  IF v_gender IS NOT NULL AND v_gender NOT IN ('male','female') THEN v_gender := NULL; END IF;

  v_email := lower(v_uname) || '@fwb.local';
  IF EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email)=v_email)
     OR EXISTS (SELECT 1 FROM public.profiles pr WHERE lower(pr.username)=lower(v_uname)) THEN
    RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE='23505';
  END IF;

  PERFORM set_config('app.bypass_device_limit','1', true);

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, extensions.crypt(v_pass, extensions.gen_salt('bf')), now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    jsonb_strip_nulls(jsonb_build_object(
      'username', v_uname, 'full_name', coalesce(v_name, v_uname),
      'name', coalesce(v_name, v_uname), 'avatar_url', v_avatar,
      'province', v_province, 'gender', v_gender)),
    coalesce(v_created, now()), now(), '', '', '', ''
  );

  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=v_uid) THEN
    INSERT INTO public.profiles (id, username, full_name)
    VALUES (v_uid, v_uname, coalesce(v_name, v_uname));
  END IF;

  UPDATE public.profiles pr
     SET username = v_uname, full_name = coalesce(v_name, pr.full_name, v_uname)
   WHERE pr.id = v_uid;

  IF v_avatar IS NOT NULL AND public._has_column('profiles','avatar') THEN
    EXECUTE 'UPDATE public.profiles SET avatar=$1 WHERE id=$2' USING v_avatar, v_uid; END IF;
  IF v_avatar IS NOT NULL AND public._has_column('profiles','avatar_url') THEN
    EXECUTE 'UPDATE public.profiles SET avatar_url=$1 WHERE id=$2' USING v_avatar, v_uid; END IF;
  IF v_gender IS NOT NULL AND public._has_column('profiles','gender') THEN
    EXECUTE 'UPDATE public.profiles SET gender=$1 WHERE id=$2' USING v_gender, v_uid; END IF;
  IF v_province IS NOT NULL AND public._has_column('profiles','province') THEN
    EXECUTE 'UPDATE public.profiles SET province=$1 WHERE id=$2' USING v_province, v_uid; END IF;
  IF v_bio IS NOT NULL AND public._has_column('profiles','bio') THEN
    EXECUTE 'UPDATE public.profiles SET bio=$1 WHERE id=$2' USING v_bio, v_uid; END IF;
  IF v_age IS NOT NULL AND public._has_column('profiles','age') THEN
    EXECUTE 'UPDATE public.profiles SET age=$1 WHERE id=$2' USING v_age, v_uid; END IF;

  EXECUTE 'UPDATE public.profiles SET account_source=''internal'' WHERE id=$1' USING v_uid;

  PERFORM public.admin_apply_profile_buff(v_uid, p_row);
  RETURN jsonb_build_object('id', v_uid, 'username', v_uname, 'ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_signup_account(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_signup_account(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_bulk_signup(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE r jsonb; out_arr jsonb := '[]'::jsonb; res jsonb;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) LOOP
    BEGIN
      res := public.admin_signup_account(r);
    EXCEPTION WHEN OTHERS THEN
      res := jsonb_build_object('username', r->>'username', 'ok', false, 'error', SQLERRM);
    END;
    out_arr := out_arr || jsonb_build_array(res);
  END LOOP;
  RETURN out_arr;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_bulk_signup(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_signup(jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) Danh sách tài khoản thứ hai — CHỈ dữ liệu account ở #1
--    (posts/messages/unread do Supabase #3 trả về và được gộp ở client)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_internal_accounts(text,int,int,text);
CREATE OR REPLACE FUNCTION public.admin_list_internal_accounts(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0,
  p_gender text DEFAULT NULL
) RETURNS TABLE (
  id uuid, username text, full_name text, avatar text, bio text,
  province text, gender text, is_banned boolean, created_at timestamptz,
  followers bigint, following bigint, posts bigint,
  gem_balance bigint, total bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_term   text := nullif(trim(coalesce(p_search,'')), '');
  v_gender text := nullif(trim(coalesce(p_gender,'')), '');
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF v_gender NOT IN ('male','female') THEN v_gender := NULL; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.username, p.full_name,
           coalesce(p.avatar, p.avatar_url) AS avatar,
           p.bio, p.province, p.gender, p.is_banned, p.created_at,
           coalesce(p.followers_count,0)::bigint AS followers_col,
           coalesce(p.following_count,0)::bigint AS following_col,
           coalesce(p.posts_count,0)::bigint     AS posts_col,
           coalesce(p.gem_balance,0)::bigint     AS gem_col
      FROM public.profiles p
     WHERE p.account_source = 'internal'
       AND coalesce(p.is_admin,false) = false      -- admin không bao giờ xuất hiện
       AND (v_gender IS NULL OR p.gender = v_gender)
       AND (v_term IS NULL
            OR p.username ILIKE '%'||v_term||'%'
            OR p.full_name ILIKE '%'||v_term||'%'
            OR p.province  ILIKE '%'||v_term||'%'
            OR p.id::text  ILIKE '%'||v_term||'%')
  ), c AS (SELECT count(*)::bigint AS n FROM base)
  SELECT b.id, b.username, b.full_name, b.avatar, b.bio, b.province, b.gender,
         b.is_banned, b.created_at,
         b.followers_col, b.following_col, b.posts_col, b.gem_col,
         (SELECT n FROM c)
    FROM base b
   ORDER BY b.created_at DESC
   LIMIT greatest(p_limit,1) OFFSET greatest(p_offset,0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_internal_accounts(text,int,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_internal_accounts(text,int,int,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) Sửa tài khoản: mật khẩu, avatar (URL media #2), tên, giới tính, khu vực, bio
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_internal_account(
  p_id         uuid,
  p_username   text DEFAULT NULL,
  p_password   text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_bio        text DEFAULT NULL,
  p_province   text DEFAULT NULL,
  p_full_name  text DEFAULT NULL,
  p_gender     text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE v_uname text := nullif(trim(coalesce(p_username,'')),''); v_email text;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=p_id AND pr.account_source='internal') THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản' USING ERRCODE='P0002';
  END IF;

  IF v_uname IS NOT NULL THEN
    IF v_uname !~ '^[A-Za-z0-9_.-]{3,32}$' THEN
      RAISE EXCEPTION 'Username không hợp lệ' USING ERRCODE='22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id<>p_id AND lower(pr.username)=lower(v_uname)) THEN
      RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE='23505';
    END IF;
    v_email := lower(v_uname) || '@fwb.local';
    UPDATE auth.users au SET email=v_email, updated_at=now() WHERE au.id=p_id;
    UPDATE public.profiles pr SET username=v_uname WHERE pr.id=p_id;
  END IF;

  IF p_password IS NOT NULL AND length(p_password) >= 6 THEN
    UPDATE auth.users au
       SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           updated_at = now()
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

-- ---------------------------------------------------------------------
-- 6) Buff chỉ số account: Followers / Following / Posts / ngày tạo / giới tính / khu vực
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_set_internal_account_stats(uuid,bigint,bigint,bigint,timestamptz,text);
CREATE OR REPLACE FUNCTION public.admin_set_internal_account_stats(
  p_id uuid, p_followers bigint DEFAULT NULL, p_following bigint DEFAULT NULL,
  p_posts bigint DEFAULT NULL, p_created_at timestamptz DEFAULT NULL,
  p_gender text DEFAULT NULL, p_province text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  PERFORM public.admin_apply_profile_buff(p_id, jsonb_strip_nulls(jsonb_build_object(
    'followers', p_followers, 'following', p_following, 'posts', p_posts,
    'created_at', p_created_at)));
  IF p_gender IN ('male','female') THEN
    UPDATE public.profiles SET gender = p_gender WHERE id = p_id;
  END IF;
  IF nullif(trim(coalesce(p_province,'')),'') IS NOT NULL THEN
    UPDATE public.profiles SET province = trim(p_province) WHERE id = p_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_internal_account_stats(uuid,bigint,bigint,bigint,timestamptz,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_internal_account_stats(uuid,bigint,bigint,bigint,timestamptz,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) Buff Xu (gem_balance)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_internal_account_gem(p_id uuid, p_gem bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=p_id AND pr.account_source='internal') THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản' USING ERRCODE='P0002';
  END IF;
  UPDATE public.profiles SET gem_balance = greatest(coalesce(p_gem,0),0) WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_internal_account_gem(uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_internal_account_gem(uuid,bigint) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) Trạng thái tài khoản: khoá / mở khoá / xoá
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_lock_internal_account(p_id uuid, p_locked boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.profiles SET is_banned = p_locked
   WHERE id = p_id AND account_source = 'internal';
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_lock_internal_account(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_bulk_lock_internal_accounts(p_ids uuid[], p_locked boolean)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.profiles SET is_banned = p_locked
   WHERE id = ANY(coalesce(p_ids,'{}')) AND account_source = 'internal';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_bulk_lock_internal_accounts(uuid[],boolean) TO authenticated;

-- Xoá tài khoản: chỉ xoá auth.users + profiles ở #1.
-- Dữ liệu activity (bài viết / bình luận / tin nhắn / thông báo) nằm ở #3 và
-- được dọn bằng RPC tương ứng trong file SB3 (admin_internal_purge_activity).
CREATE OR REPLACE FUNCTION public.admin_delete_internal_accounts(p_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[]; n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT array_agg(pr.id) INTO v_ids FROM public.profiles pr
   WHERE pr.id = ANY(coalesce(p_ids,'{}')) AND pr.account_source='internal'
     AND coalesce(pr.is_admin,false) = false;
  IF v_ids IS NULL THEN RETURN 0; END IF;
  n := array_length(v_ids,1);
  DELETE FROM auth.users au WHERE au.id = ANY(v_ids);
  DELETE FROM public.profiles pr WHERE pr.id = ANY(v_ids);
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_internal_accounts(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_internal_account(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_delete_internal_accounts(ARRAY[p_id]);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_internal_account(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_all_internal_accounts(p_confirm text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[]; n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF upper(trim(coalesce(p_confirm,''))) <> 'DELETE ALL' THEN
    RAISE EXCEPTION 'Xác nhận không hợp lệ' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(pr.id) INTO v_ids FROM public.profiles pr
   WHERE pr.account_source='internal' AND coalesce(pr.is_admin,false)=false;
  IF v_ids IS NULL THEN RETURN 0; END IF;
  n := array_length(v_ids,1);
  DELETE FROM auth.users au WHERE au.id = ANY(v_ids);
  DELETE FROM public.profiles pr WHERE pr.id = ANY(v_ids);
  RETURN n;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_all_internal_accounts(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
-- ======================= HẾT (SUPABASE #1) ===========================
