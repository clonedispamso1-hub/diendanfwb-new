-- =====================================================================
-- v5 — BULK ACCOUNT CREATOR (Super Admin)
--
-- Triết lý mới: KHÔNG còn "hệ thống clone" riêng. Mỗi tài khoản được tạo
-- bằng ĐÚNG luồng đăng ký của website:
--   • INSERT auth.users (email = <username>@fwb.local, bcrypt password,
--     raw_user_meta_data giống hệt payload của supabase.auth.signUp)
--   • Trigger on_auth_user_created / handle_new_user tự tạo public.profiles
--   • Sau đó chỉ "buff" thêm các cột tuỳ chọn nếu cột đó tồn tại.
--
-- → Tài khoản đăng nhập / đăng bài / bình luận / like / follow / nhắn tin
--   y hệt user thường. Cột account_source='internal' chỉ là NHÃN để Admin
--   Panel lọc danh sách, không thay đổi hành vi.
--
-- Không dùng session_replication_role, không tắt trigger. Idempotent.
-- Chạy 1 lần trong Supabase SQL Editor.
-- =====================================================================

-- 0) helper kiểm tra cột (nếu file cũ chưa tạo) ------------------------
CREATE OR REPLACE FUNCTION public._has_column(p_table text, p_column text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
  );
$$;

-- 1) Kiểm tra username tồn tại (validate tức thời trên UI) -------------
DROP FUNCTION IF EXISTS public.admin_check_usernames(text[]);
CREATE OR REPLACE FUNCTION public.admin_check_usernames(p_usernames text[])
RETURNS TABLE (username text, taken boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.u AS username,
         (EXISTS (SELECT 1 FROM public.profiles pr WHERE lower(pr.username) = lower(u.u))
          OR EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = lower(u.u) || '@fwb.local')
         ) AS taken
    FROM unnest(coalesce(p_usernames, ARRAY[]::text[])) AS u(u);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_check_usernames(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_check_usernames(text[]) TO authenticated;

-- 2) Tạo 1 tài khoản theo luồng đăng ký thật ---------------------------
-- p_row: {username, password, full_name, avatar_url, gender, province,
--         age, bio, followers, following, posts, profile_gif, created_at}
DROP FUNCTION IF EXISTS public.admin_signup_account(jsonb);
CREATE OR REPLACE FUNCTION public.admin_signup_account(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  v_gif      text := nullif(trim(coalesce(p_row->>'profile_gif','')),'');
  v_age      int  := nullif(p_row->>'age','')::int;
  v_created  timestamptz := nullif(p_row->>'created_at','')::timestamptz;
  v_meta     jsonb;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Chỉ Super Admin được tạo tài khoản' USING ERRCODE = '42501';
  END IF;

  IF v_uname !~ '^[A-Za-z0-9_.-]{3,32}$' THEN
    RAISE EXCEPTION 'Username không hợp lệ (3–32 ký tự, chữ/số/._-)' USING ERRCODE = '22023';
  END IF;
  IF length(v_pass) < 6 THEN
    RAISE EXCEPTION 'Password tối thiểu 6 ký tự' USING ERRCODE = '22023';
  END IF;
  IF v_gender IS NOT NULL AND v_gender NOT IN ('male','female') THEN
    v_gender := NULL;
  END IF;

  v_email := lower(v_uname) || '@fwb.local';

  IF EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = v_email)
     OR EXISTS (SELECT 1 FROM public.profiles pr WHERE lower(pr.username) = lower(v_uname)) THEN
    RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE = '23505';
  END IF;

  -- Metadata giống hệt supabase.auth.signUp({ options: { data } }) của app.
  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'username',   v_uname,
    'full_name',  coalesce(v_name, v_uname),
    'name',       coalesce(v_name, v_uname),
    'avatar_url', v_avatar,
    'province',   v_province,
    'gender',     v_gender
  ));

  PERFORM set_config('app.bypass_device_limit', '1', true);

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, crypt(v_pass, gen_salt('bf')), now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    v_meta,
    coalesce(v_created, now()), now(), '', '', '', ''
  );

  -- Trigger handle_new_user đã tạo profile. Nếu vì lý do nào đó chưa có
  -- (trigger bị tắt trên DB này) thì tạo tối thiểu, y như user thường.
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid) THEN
    INSERT INTO public.profiles (id, username, full_name)
    VALUES (v_uid, v_uname, coalesce(v_name, v_uname));
  END IF;

  -- Cập nhật các trường cơ bản (chỉ khi cột tồn tại) -------------------
  UPDATE public.profiles pr
     SET username  = v_uname,
         full_name = coalesce(v_name, pr.full_name, v_uname)
   WHERE pr.id = v_uid;

  IF v_avatar IS NOT NULL AND public._has_column('profiles','avatar') THEN
    EXECUTE 'UPDATE public.profiles SET avatar = $1 WHERE id = $2' USING v_avatar, v_uid;
  END IF;
  IF v_avatar IS NOT NULL AND public._has_column('profiles','avatar_url') THEN
    EXECUTE 'UPDATE public.profiles SET avatar_url = $1 WHERE id = $2' USING v_avatar, v_uid;
  END IF;
  IF v_gender IS NOT NULL AND public._has_column('profiles','gender') THEN
    EXECUTE 'UPDATE public.profiles SET gender = $1 WHERE id = $2' USING v_gender, v_uid;
  END IF;
  IF v_province IS NOT NULL AND public._has_column('profiles','province') THEN
    EXECUTE 'UPDATE public.profiles SET province = $1 WHERE id = $2' USING v_province, v_uid;
  END IF;
  IF v_bio IS NOT NULL AND public._has_column('profiles','bio') THEN
    EXECUTE 'UPDATE public.profiles SET bio = $1 WHERE id = $2' USING v_bio, v_uid;
  END IF;
  IF v_age IS NOT NULL AND public._has_column('profiles','age') THEN
    EXECUTE 'UPDATE public.profiles SET age = $1 WHERE id = $2' USING v_age, v_uid;
  END IF;
  IF v_age IS NOT NULL AND public._has_column('profiles','birth_date') THEN
    EXECUTE 'UPDATE public.profiles SET birth_date = $1 WHERE id = $2'
      USING (current_date - (v_age * 365 + floor(random()*300)::int)), v_uid;
  END IF;

  -- Nhãn nguồn để Admin Panel lọc (không đổi hành vi tài khoản) --------
  IF public._has_column('profiles','account_source') THEN
    EXECUTE 'UPDATE public.profiles SET account_source = ''internal'' WHERE id = $1' USING v_uid;
  END IF;

  -- Buff tuỳ chọn ------------------------------------------------------
  PERFORM public.admin_apply_profile_buff(v_uid, p_row);

  RETURN jsonb_build_object('id', v_uid, 'username', v_uname, 'ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_signup_account(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_signup_account(jsonb) TO authenticated;

-- 3) Buff hồ sơ (followers / following / posts / gif / ngày tạo) -------
CREATE OR REPLACE FUNCTION public.admin_apply_profile_buff(p_id uuid, p_row jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_followers bigint      := nullif(p_row->>'followers','')::bigint;
  v_following bigint      := nullif(p_row->>'following','')::bigint;
  v_posts     bigint      := nullif(p_row->>'posts','')::bigint;
  v_gif       text        := nullif(trim(coalesce(p_row->>'profile_gif','')),'');
  v_created   timestamptz := nullif(p_row->>'created_at','')::timestamptz;
  c text;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_followers IS NOT NULL AND public._has_column('profiles','followers_count') THEN
    EXECUTE 'UPDATE public.profiles SET followers_count = $1 WHERE id = $2'
      USING greatest(v_followers,0), p_id;
  END IF;
  IF v_following IS NOT NULL AND public._has_column('profiles','following_count') THEN
    EXECUTE 'UPDATE public.profiles SET following_count = $1 WHERE id = $2'
      USING greatest(v_following,0), p_id;
  END IF;
  IF v_posts IS NOT NULL AND public._has_column('profiles','posts_count') THEN
    EXECUTE 'UPDATE public.profiles SET posts_count = $1 WHERE id = $2'
      USING greatest(v_posts,0), p_id;
  END IF;
  IF v_created IS NOT NULL THEN
    EXECUTE 'UPDATE public.profiles SET created_at = $1 WHERE id = $2' USING v_created, p_id;
  END IF;

  IF v_gif IS NOT NULL THEN
    FOREACH c IN ARRAY ARRAY['profile_gif','gif_url','cover_gif','profile_gif_url'] LOOP
      IF public._has_column('profiles', c) THEN
        EXECUTE format('UPDATE public.profiles SET %I = $1 WHERE id = $2', c) USING v_gif, p_id;
      END IF;
    END LOOP;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_apply_profile_buff(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_profile_buff(uuid, jsonb) TO authenticated;

-- 4) Tạo hàng loạt — trả kết quả từng dòng, 1 dòng lỗi không huỷ cả lô --
DROP FUNCTION IF EXISTS public.admin_bulk_signup(jsonb);
CREATE OR REPLACE FUNCTION public.admin_bulk_signup(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row  jsonb;
  v_out  jsonb := '[]'::jsonb;
  v_res  jsonb;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows phải là JSON array' USING ERRCODE = '22023';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    BEGIN
      v_res := public.admin_signup_account(v_row);
    EXCEPTION WHEN OTHERS THEN
      v_res := jsonb_build_object(
        'username', v_row->>'username', 'ok', false, 'error', SQLERRM);
    END;
    v_out := v_out || jsonb_build_array(v_res);
  END LOOP;

  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_bulk_signup(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_signup(jsonb) TO authenticated;
