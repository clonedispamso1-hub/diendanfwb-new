-- =====================================================================
-- SECOND ACCOUNTS — FINAL, SINGLE FILE (chạy 1 lần trong SQL Editor)
--
-- Nguyên tắc: "Tài khoản thứ hai" LÀ USER THẬT.
--   • Mỗi tài khoản = 1 dòng auth.users + 1 dòng public.profiles (id trùng nhau)
--   • profiles.account_source = 'internal' CHỈ là nhãn để Admin lọc
--   • Vì là user thật nên mọi FK (comments/notifications/messages/follows →
--     auth.users) đều hợp lệ ⇒ hết lỗi *_user_id_fkey
--
-- File này:
--   0) Xoá sạch MỌI overload hàm cũ (kể cả bản "profiles-only" gây FK lỗi)
--   1) VÁ DỮ LIỆU: tạo auth.users cho các profile internal đang mồ côi
--      (password mặc định: clone123456) + gắn lại FK profiles.id→auth.users
--   2) Tạo lại TOÀN BỘ RPC chuẩn mà frontend đang gọi (tên + chữ ký khớp 100%)
--   3) Bỏ ràng buộc category khi đăng bài (posts.category nullable + default)
--   4) NOTIFY pgrst để làm mới schema cache
-- Idempotent — chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) DROP mọi overload cũ
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prokind = 'f'
       AND p.proname IN (
         'admin_create_internal_account','admin_create_internal_account_v2',
         'admin_create_internal_account_v3','admin_update_internal_account',
         'admin_delete_internal_account','admin_delete_internal_accounts',
         'admin_delete_all_internal_accounts','admin_lock_internal_account',
         'admin_bulk_lock_internal_accounts','admin_list_internal_accounts',
         'admin_set_internal_account_stats','admin_internal_threads',
         'admin_internal_thread_messages','admin_internal_send_message',
         'admin_internal_send_red_packet',
         'admin_internal_unread_total','admin_internal_unread_by_account',
         'admin_internal_mark_read','admin_internal_create_post',
         'admin_internal_bulk_comment','admin_check_usernames',
         'admin_signup_account','admin_bulk_signup','admin_apply_profile_buff'
       )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._has_column(p_table text, p_column text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=p_table AND column_name=p_column
  );
$$;
GRANT EXECUTE ON FUNCTION public._has_column(text,text) TO authenticated;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- 1) VÁ DỮ LIỆU: profile internal mồ côi (không có auth.users) → tạo user thật
--    Đây chính là nguyên nhân gốc của:
--      comments_user_id_fkey / notifications_user_id_fkey / messages_*_fkey
--      và "Theo dõi → yêu cầu đăng nhập"
-- ---------------------------------------------------------------------
DO $$
DECLARE r record; v_email text;
BEGIN
  FOR r IN
    SELECT pr.id, pr.username, pr.full_name, pr.created_at
      FROM public.profiles pr
     WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = pr.id)
  LOOP
    v_email := lower(coalesce(nullif(trim(r.username),''), replace(r.id::text,'-',''))) || '@fwb.local';
    IF EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = v_email) THEN
      v_email := replace(r.id::text,'-','') || '@fwb.local';
    END IF;
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) VALUES (
      r.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      v_email, extensions.crypt('clone123456', extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
      jsonb_strip_nulls(jsonb_build_object('username', r.username, 'full_name', r.full_name)),
      coalesce(r.created_at, now()), now(), '', '', '', ''
    );
  END LOOP;
END $$;

-- Gắn lại FK profiles.id -> auth.users(id) (bị gỡ bởi bản "profiles-only")
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.constraint_schema = tc.constraint_schema
     WHERE tc.table_schema='public' AND tc.table_name='profiles'
       AND tc.constraint_type='FOREIGN KEY'
       AND ccu.table_schema='auth' AND ccu.table_name='users'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_id_fkey
      FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) posts.category — website chỉ đăng lên Trang Chủ, bỏ danh mục
-- ---------------------------------------------------------------------
DO $$
DECLARE v_type text;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.posts'::regclass AND a.attname = 'category' AND a.attnum > 0;
  IF v_type IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.posts ALTER COLUMN category DROP NOT NULL';
    IF v_type = 'post_category' THEN
      IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                  WHERE t.typname='post_category' AND e.enumlabel='general') THEN
        EXECUTE 'ALTER TABLE public.posts ALTER COLUMN category SET DEFAULT ''general''::post_category';
      END IF;
    ELSE
      EXECUTE 'ALTER TABLE public.posts ALTER COLUMN category SET DEFAULT ''general''';
    END IF;
  END IF;
END $$;

-- =====================================================================
-- 2) RPC CHUẨN — tên & chữ ký khớp 100% với frontend
-- =====================================================================

-- 2.1 Kiểm tra username trùng ------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_check_usernames(p_usernames text[])
RETURNS TABLE (username text, taken boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT u.u AS username,
         (EXISTS (SELECT 1 FROM public.profiles pr WHERE lower(pr.username) = lower(u.u))
          OR EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = lower(u.u) || '@fwb.local'))
    FROM unnest(p_usernames) AS u(u);
$$;
REVOKE ALL ON FUNCTION public.admin_check_usernames(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_check_usernames(text[]) TO authenticated;

-- 2.2 Buff hồ sơ --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_apply_profile_buff(p_id uuid, p_row jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_followers bigint := nullif(p_row->>'followers','')::bigint;
  v_following bigint := nullif(p_row->>'following','')::bigint;
  v_posts     bigint := nullif(p_row->>'posts','')::bigint;
  v_gif       text   := nullif(trim(coalesce(p_row->>'profile_gif','')),'');
  v_created   timestamptz := nullif(p_row->>'created_at','')::timestamptz;
BEGIN
  IF v_followers IS NOT NULL AND public._has_column('profiles','followers_count') THEN
    EXECUTE 'UPDATE public.profiles SET followers_count=$1 WHERE id=$2' USING greatest(v_followers,0), p_id;
  END IF;
  IF v_following IS NOT NULL AND public._has_column('profiles','following_count') THEN
    EXECUTE 'UPDATE public.profiles SET following_count=$1 WHERE id=$2' USING greatest(v_following,0), p_id;
  END IF;
  IF v_posts IS NOT NULL AND public._has_column('profiles','posts_count') THEN
    EXECUTE 'UPDATE public.profiles SET posts_count=$1 WHERE id=$2' USING greatest(v_posts,0), p_id;
  END IF;
  IF v_gif IS NOT NULL AND public._has_column('profiles','title_gif_url') THEN
    EXECUTE 'UPDATE public.profiles SET title_gif_url=$1 WHERE id=$2' USING v_gif, p_id;
  END IF;
  IF v_created IS NOT NULL THEN
    UPDATE public.profiles SET created_at = v_created WHERE id = p_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_apply_profile_buff(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_apply_profile_buff(uuid,jsonb) TO authenticated;

-- 2.3 Tạo 1 tài khoản THẬT ---------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_signup_account(p_row jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF EXISTS (SELECT 1 FROM auth.users au WHERE lower(au.email) = v_email)
     OR EXISTS (SELECT 1 FROM public.profiles pr WHERE lower(pr.username) = lower(v_uname)) THEN
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

  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = v_uid) THEN
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
  IF public._has_column('profiles','account_source') THEN
    EXECUTE 'UPDATE public.profiles SET account_source=''internal'' WHERE id=$1' USING v_uid; END IF;

  PERFORM public.admin_apply_profile_buff(v_uid, p_row);
  RETURN jsonb_build_object('id', v_uid, 'username', v_uname, 'ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_signup_account(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_signup_account(jsonb) TO authenticated;

-- 2.4 Tạo hàng loạt -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_bulk_signup(p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r jsonb; out_arr jsonb := '[]'::jsonb; res jsonb;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
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

-- 2.5 Danh sách (có lọc giới tính) --------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_internal_accounts(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0,
  p_gender text DEFAULT NULL
) RETURNS TABLE (
  id uuid, username text, full_name text, avatar text, bio text,
  province text, gender text, is_banned boolean, created_at timestamptz,
  followers bigint, following bigint, posts bigint, messages bigint, unread bigint,
  total bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_term text := nullif(trim(coalesce(p_search,'')), '');
  v_gender text := nullif(trim(coalesce(p_gender,'')), '');
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
  IF v_gender NOT IN ('male','female') THEN v_gender := NULL; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.username, p.full_name, p.avatar, p.bio, p.province, p.gender,
           p.is_banned, p.created_at, coalesce(p.followers_count,0)::bigint AS followers_col
      FROM public.profiles p
     WHERE p.account_source = 'internal'
       AND (v_gender IS NULL OR p.gender = v_gender)
       AND (v_term IS NULL
            OR p.username ILIKE '%'||v_term||'%'
            OR p.full_name ILIKE '%'||v_term||'%'
            OR p.province ILIKE '%'||v_term||'%'
            OR p.id::text ILIKE '%'||v_term||'%')
  ), c AS (SELECT count(*)::bigint AS n FROM base)
  SELECT b.id, b.username, b.full_name, b.avatar, b.bio, b.province, b.gender,
         b.is_banned, b.created_at,
         greatest(b.followers_col,(SELECT count(*) FROM public.follows f WHERE f.following_id=b.id))::bigint,
         (SELECT count(*) FROM public.follows f2 WHERE f2.follower_id=b.id)::bigint,
         (SELECT count(*) FROM public.posts po WHERE po.user_id=b.id)::bigint,
         (SELECT count(*) FROM public.messages m WHERE m.sender_id=b.id OR m.receiver_id=b.id)::bigint,
         (SELECT count(*) FROM public.messages m2 WHERE m2.receiver_id=b.id AND coalesce(m2.is_read,false)=false)::bigint,
         (SELECT n FROM c)
    FROM base b
   ORDER BY b.created_at DESC
   LIMIT greatest(p_limit,1) OFFSET greatest(p_offset,0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_internal_accounts(text,int,int,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_internal_accounts(text,int,int,text) TO authenticated;

-- 2.6 Sửa tài khoản (đúng RPC mà form Sửa gọi) --------------------------
CREATE OR REPLACE FUNCTION public.admin_update_internal_account(
  p_id         uuid,
  p_username   text DEFAULT NULL,
  p_password   text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_bio        text DEFAULT NULL,
  p_province   text DEFAULT NULL,
  p_full_name  text DEFAULT NULL,
  p_gender     text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uname text := nullif(trim(coalesce(p_username,'')),''); v_email text;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';
  END IF;
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
       SET encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at=now()
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

-- 2.7 Set stats ---------------------------------------------------------
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

-- 2.8 Khóa / mở khóa (đơn + hàng loạt) ----------------------------------
CREATE OR REPLACE FUNCTION public.admin_lock_internal_account(p_id uuid, p_locked boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.profiles SET is_banned = p_locked
   WHERE id = p_id AND account_source = 'internal';
END;
$$;
REVOKE ALL ON FUNCTION public.admin_lock_internal_account(uuid,boolean) FROM PUBLIC;
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
REVOKE ALL ON FUNCTION public.admin_bulk_lock_internal_accounts(uuid[],boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_lock_internal_accounts(uuid[],boolean) TO authenticated;

-- 2.9 Xóa: 1 / nhiều / tất cả (chỉ account_source='internal') -----------
CREATE OR REPLACE FUNCTION public.admin_delete_internal_accounts(p_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[]; n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  SELECT array_agg(pr.id) INTO v_ids
    FROM public.profiles pr
   WHERE pr.id = ANY(coalesce(p_ids,'{}')) AND pr.account_source = 'internal';
  IF v_ids IS NULL THEN RETURN 0; END IF;
  n := array_length(v_ids,1);
  DELETE FROM auth.users au WHERE au.id = ANY(v_ids);
  DELETE FROM public.profiles pr WHERE pr.id = ANY(v_ids);
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_internal_accounts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_internal_accounts(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_internal_account(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.admin_delete_internal_accounts(ARRAY[p_id]);
  SELECT NULL::void;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_internal_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_internal_account(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_delete_all_internal_accounts(p_confirm text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[]; n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF upper(trim(coalesce(p_confirm,''))) <> 'DELETE ALL' THEN
    RAISE EXCEPTION 'Xác nhận không hợp lệ' USING ERRCODE='22023';
  END IF;
  SELECT array_agg(pr.id) INTO v_ids FROM public.profiles pr WHERE pr.account_source='internal';
  IF v_ids IS NULL THEN RETURN 0; END IF;
  n := array_length(v_ids,1);
  DELETE FROM auth.users au WHERE au.id = ANY(v_ids);
  DELETE FROM public.profiles pr WHERE pr.id = ANY(v_ids);
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_all_internal_accounts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_all_internal_accounts(text) TO authenticated;

-- 2.10 TIN NHẮN ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_internal_threads(p_account uuid)
RETURNS TABLE (
  peer_id uuid, peer_username text, peer_name text, peer_avatar text,
  last_content text, last_at timestamptz, unread bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  WITH conv AS (
    SELECT CASE WHEN m.sender_id = p_account THEN m.receiver_id ELSE m.sender_id END AS pid,
           m.content, m.created_at, m.receiver_id, m.is_read
      FROM public.messages m
     WHERE m.sender_id = p_account OR m.receiver_id = p_account
  ), agg AS (
    SELECT c.pid, max(c.created_at) AS last_at,
           count(*) FILTER (WHERE c.receiver_id = p_account AND coalesce(c.is_read,false)=false) AS unread
      FROM conv c GROUP BY c.pid
  )
  SELECT a.pid, pr.username, pr.full_name, pr.avatar,
         (SELECT c2.content FROM conv c2 WHERE c2.pid=a.pid ORDER BY c2.created_at DESC LIMIT 1),
         a.last_at, a.unread
    FROM agg a LEFT JOIN public.profiles pr ON pr.id = a.pid
   ORDER BY a.last_at DESC NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_threads(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_threads(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_internal_thread_messages(
  p_account uuid, p_peer uuid, p_limit int DEFAULT 200
) RETURNS TABLE (id uuid, sender_id uuid, receiver_id uuid, content text, image_url text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.messages m SET is_read = true
   WHERE m.receiver_id = p_account AND m.sender_id = p_peer AND coalesce(m.is_read,false)=false;
  RETURN QUERY
  SELECT m.id, m.sender_id, m.receiver_id, m.content, m.image_url, m.created_at
    FROM public.messages m
   WHERE (m.sender_id=p_account AND m.receiver_id=p_peer)
      OR (m.sender_id=p_peer AND m.receiver_id=p_account)
   ORDER BY m.created_at ASC
   LIMIT greatest(p_limit,1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_thread_messages(uuid,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_thread_messages(uuid,uuid,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_internal_send_message(
  p_account uuid, p_peer uuid, p_content text, p_image_url text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_img text := nullif(trim(coalesce(p_image_url,'')),'');
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=p_account AND pr.account_source='internal') THEN
    RAISE EXCEPTION 'Tài khoản không hợp lệ' USING ERRCODE='P0002';
  END IF;
  IF nullif(trim(coalesce(p_content,'')),'') IS NULL AND v_img IS NULL THEN
    RAISE EXCEPTION 'Nội dung trống' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.messages (sender_id, receiver_id, content, image_url, is_read)
  VALUES (p_account, p_peer, trim(coalesce(p_content,'')), v_img, false)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_send_message(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_send_message(uuid,uuid,text,text) TO authenticated;

-- Gửi LÌ XÌ với tư cách tài khoản thứ hai — dùng đúng bảng/marker của
-- send_chat_red_packet nên chat website render y hệt bao lì xì thường.
CREATE OR REPLACE FUNCTION public.admin_internal_send_red_packet(
  p_account uuid, p_peer uuid, p_amount bigint, p_wish text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bal bigint; v_pid uuid; v_mid uuid; v_wish text;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF p_peer IS NULL OR p_peer = p_account THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Người nhận không hợp lệ');
  END IF;
  IF p_amount IS NULL OR p_amount < 1000 THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Số Xu tối thiểu là 1.000');
  END IF;
  v_wish := left(nullif(btrim(coalesce(p_wish,'')),''), 100);

  PERFORM set_config('app.allow_gem_change','1', true);
  PERFORM set_config('app.allow_candy_change','1', true);

  SELECT coalesce(gem_balance,0) INTO v_bal FROM public.profiles WHERE id = p_account FOR UPDATE;
  IF v_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'message', 'Số dư tài khoản không đủ');
  END IF;
  UPDATE public.profiles SET gem_balance = v_bal - p_amount WHERE id = p_account;

  INSERT INTO public.chat_red_packets(sender_id, receiver_id, amount, wish, status)
  VALUES (p_account, p_peer, p_amount, v_wish, 'waiting') RETURNING id INTO v_pid;

  INSERT INTO public.messages(sender_id, receiver_id, content, is_read, created_at)
  VALUES (p_account, p_peer, '[[HONGBAO:' || v_pid::text || ']]', false, now())
  RETURNING id INTO v_mid;

  UPDATE public.chat_red_packets SET message_id = v_mid WHERE id = v_pid;
  RETURN jsonb_build_object('ok', true, 'packet_id', v_pid, 'message_id', v_mid, 'amount', p_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_send_red_packet(uuid,uuid,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_send_red_packet(uuid,uuid,bigint,text) TO authenticated;



CREATE OR REPLACE FUNCTION public.admin_internal_mark_read(p_account uuid, p_peer uuid DEFAULT NULL)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.messages m SET is_read = true
   WHERE m.receiver_id = p_account AND coalesce(m.is_read,false)=false
     AND (p_peer IS NULL OR m.sender_id = p_peer);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_mark_read(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_mark_read(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_internal_unread_total()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  IF NOT public._is_super_admin() THEN RETURN 0; END IF;
  SELECT count(*) INTO n FROM public.messages m
    JOIN public.profiles pr ON pr.id = m.receiver_id AND pr.account_source='internal'
   WHERE coalesce(m.is_read,false) = false;
  RETURN coalesce(n,0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_unread_total() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_unread_total() TO authenticated;

-- Badge đỏ theo từng tài khoản (danh sách bên trái Messenger Tool)
CREATE OR REPLACE FUNCTION public.admin_internal_unread_by_account()
RETURNS TABLE (account_id uuid, unread bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT pr.id, count(m.id)::bigint
    FROM public.profiles pr
    LEFT JOIN public.messages m
      ON m.receiver_id = pr.id AND coalesce(m.is_read,false) = false
   WHERE pr.account_source = 'internal'
   GROUP BY pr.id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_unread_by_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_unread_by_account() TO authenticated;

-- 2.11 ĐĂNG BÀI (không còn category) ------------------------------------
CREATE OR REPLACE FUNCTION public.admin_internal_create_post(
  p_account uuid, p_content text, p_image_urls text[] DEFAULT NULL,
  p_visibility text DEFAULT 'home'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_imgs text[] := coalesce(p_image_urls,'{}');
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=p_account AND pr.account_source='internal') THEN
    RAISE EXCEPTION 'Tài khoản không hợp lệ' USING ERRCODE='P0002';
  END IF;
  IF nullif(trim(coalesce(p_content,'')),'') IS NULL AND array_length(v_imgs,1) IS NULL THEN
    RAISE EXCEPTION 'Bài viết trống' USING ERRCODE='22023';
  END IF;

  -- Chèn động theo đúng các cột mà bảng posts đang có (không đụng category).
  DECLARE
    v_cols text := 'user_id, content';
    v_vals text := '$1, $2';
    v_has_one  boolean := public._has_column('posts','image_url');
    v_has_many boolean := public._has_column('posts','image_urls');
  BEGIN
    IF v_has_one THEN
      v_cols := v_cols || ', image_url';
      v_vals := v_vals || ', ' || coalesce(quote_literal(v_imgs[1]), 'NULL');
    END IF;
    IF v_has_many THEN
      v_cols := v_cols || ', image_urls';
      v_vals := v_vals || ', ' ||
        CASE WHEN array_length(v_imgs,1) IS NULL THEN 'NULL'
             ELSE quote_literal(v_imgs::text) || '::text[]' END;
    END IF;
    IF public._has_column('posts','has_images') THEN
      v_cols := v_cols || ', has_images'; v_vals := v_vals || ', ' || (array_length(v_imgs,1) IS NOT NULL)::text;
    END IF;
    IF public._has_column('posts','visibility') THEN
      v_cols := v_cols || ', visibility'; v_vals := v_vals || ', ' || quote_literal(coalesce(p_visibility,'home'));
    END IF;
    IF public._has_column('posts','status') THEN
      v_cols := v_cols || ', status'; v_vals := v_vals || ', ' || quote_literal('published');
    END IF;

    EXECUTE 'INSERT INTO public.posts (' || v_cols || ') VALUES (' || v_vals || ') RETURNING id'
      INTO v_id USING p_account, trim(coalesce(p_content,''));
  END;


  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_create_post(uuid,text,text[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_create_post(uuid,text,text[],text) TO authenticated;

-- 2.12 BÌNH LUẬN HÀNG LOẠT ----------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_internal_bulk_comment(
  p_post_id uuid, p_accounts uuid[], p_contents text[]
) RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i int; n int := coalesce(array_length(p_accounts,1),0); ok int := 0;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF n = 0 OR n <> coalesce(array_length(p_contents,1),0) THEN
    RAISE EXCEPTION 'Số dòng bình luận phải bằng số tài khoản đã chọn' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.posts po WHERE po.id = p_post_id) THEN
    RAISE EXCEPTION 'Không tìm thấy bài viết' USING ERRCODE='P0002';
  END IF;
  FOR i IN 1..n LOOP
    IF nullif(trim(coalesce(p_contents[i],'')),'') IS NOT NULL THEN
      INSERT INTO public.comments (post_id, user_id, content)
      VALUES (p_post_id, p_accounts[i], trim(p_contents[i]));
      ok := ok + 1;
    END IF;
  END LOOP;
  RETURN ok;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_bulk_comment(uuid,uuid[],text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_bulk_comment(uuid,uuid[],text[]) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) Làm mới schema cache của PostgREST
-- ---------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- Kiểm tra nhanh: không còn profile mồ côi
SELECT count(*) AS orphan_profiles
  FROM public.profiles pr
 WHERE NOT EXISTS (SELECT 1 FROM auth.users au WHERE au.id = pr.id);
