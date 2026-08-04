-- =====================================================================
-- CLEANUP: Internal Account system — 100% public.profiles, no auth.users
--
-- Chạy 1 lần trong Supabase SQL Editor.
--
-- Mục tiêu:
--   1) DROP tất cả overload của các hàm Internal Account cũ (bất kể chữ ký)
--   2) Recreate lại toàn bộ hàm CHỈ dùng public.profiles
--      - Không đụng auth.users
--      - Không dùng crypt() / gen_salt() / encrypted_password
--      - Không dùng Supabase Auth Admin API
--   3) Ở cuối file có câu truy vấn kiểm tra: phải trả về 0 dòng
--
-- LƯU Ý QUAN TRỌNG: nếu bảng public.profiles đang có FOREIGN KEY tới
--   auth.users(id) thì không thể tạo profile mà không có auth.users tương
--   ứng. Block đầu tiên bên dưới sẽ tự động DROP FK đó (nếu có).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Tháo FK profiles.id -> auth.users.id (nếu có) để profiles đứng độc lập
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.constraint_schema = tc.constraint_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name  = 'profiles'
       AND tc.constraint_type = 'FOREIGN KEY'
       AND ccu.table_schema = 'auth'
       AND ccu.table_name  = 'users'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', r.constraint_name);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 1) DROP mọi overload của các hàm Internal Account cũ (idempotent)
--    - CHỈ đụng schema public
--    - CHỈ đụng đúng danh sách tên hàm của chúng ta
--    - CHỈ drop plain functions (prokind='f'); KHÔNG đụng aggregate ('a'),
--      window ('w'), procedure ('p') hay bất kỳ built-in nào của Postgres.
--    - Nếu hàm không tồn tại thì bỏ qua.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prokind = 'f'
       AND p.proname IN (
         'admin_signup_account',
         'admin_bulk_signup',
         'admin_create_internal_account',
         'admin_create_internal_account_v2',
         'admin_create_internal_account_v3',
         'admin_update_internal_account',
         'admin_delete_internal_account',
         'admin_delete_all_internal_accounts',
         'admin_lock_internal_account',
         'admin_list_internal_accounts',
         'admin_check_usernames',
         'admin_apply_profile_buff'
       )
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 2) Helper: kiểm tra cột (dùng lại cho mọi bản buff hồ sơ)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._has_column(p_table text, p_column text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
  );
$$;

-- ---------------------------------------------------------------------
-- 3) Bảng lưu password cho Internal Account (KHÔNG dùng auth.users)
--    - Chỉ Super Admin đọc/ghi qua RPC. RLS deny mặc định.
--    - Password lưu dạng plain vì các tài khoản này KHÔNG login qua
--      Supabase Auth; toàn bộ hành động chạy qua RPC SECURITY DEFINER
--      dưới quyền Super Admin. Đây là quyết định kiến trúc do đề bài
--      yêu cầu "profiles only, không auth".
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.internal_account_credentials (
  profile_id  uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  password    text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.internal_account_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.internal_account_credentials FROM PUBLIC, anon, authenticated;
GRANT  ALL ON public.internal_account_credentials TO service_role;

-- ---------------------------------------------------------------------
-- 4) Đánh dấu account_source = 'internal' (nếu cột đã có) — không thêm cột mới
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 5) admin_check_usernames — chỉ soi public.profiles
-- ---------------------------------------------------------------------
CREATE FUNCTION public.admin_check_usernames(p_usernames text[])
RETURNS TABLE (username text, taken boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.u AS username,
         EXISTS (SELECT 1 FROM public.profiles pr
                  WHERE lower(pr.username) = lower(u.u)) AS taken
    FROM unnest(coalesce(p_usernames, ARRAY[]::text[])) AS u(u);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_check_usernames(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_check_usernames(text[]) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) Buff hồ sơ (followers/following/posts/gif/created_at) — profiles only
-- ---------------------------------------------------------------------
CREATE FUNCTION public.admin_apply_profile_buff(p_id uuid, p_row jsonb)
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

-- ---------------------------------------------------------------------
-- 7) CORE: admin_signup_account — tạo 1 profile "internal" (KHÔNG auth)
-- ---------------------------------------------------------------------
CREATE FUNCTION public.admin_signup_account(p_row jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := gen_random_uuid();
  v_uname    text := trim(coalesce(p_row->>'username',''));
  v_pass     text := coalesce(p_row->>'password','');
  v_avatar   text := nullif(trim(coalesce(p_row->>'avatar_url','')),'');
  v_name     text := nullif(trim(coalesce(p_row->>'full_name','')),'');
  v_gender   text := nullif(trim(coalesce(p_row->>'gender','')),'');
  v_province text := nullif(trim(coalesce(p_row->>'province','')),'');
  v_bio      text := nullif(trim(coalesce(p_row->>'bio','')),'');
  v_age      int  := nullif(p_row->>'age','')::int;
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
  IF EXISTS (SELECT 1 FROM public.profiles pr WHERE lower(pr.username) = lower(v_uname)) THEN
    RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.profiles (id, username, full_name)
  VALUES (v_uid, v_uname, coalesce(v_name, v_uname));

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
  IF public._has_column('profiles','account_source') THEN
    EXECUTE 'UPDATE public.profiles SET account_source = ''internal'' WHERE id = $1' USING v_uid;
  END IF;
  IF public._has_column('profiles','is_internal') THEN
    EXECUTE 'UPDATE public.profiles SET is_internal = true WHERE id = $1' USING v_uid;
  END IF;

  INSERT INTO public.internal_account_credentials(profile_id, password)
  VALUES (v_uid, v_pass);

  PERFORM public.admin_apply_profile_buff(v_uid, p_row);

  RETURN jsonb_build_object('id', v_uid, 'username', v_uname, 'ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_signup_account(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_signup_account(jsonb) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) admin_bulk_signup — vòng lặp, 1 dòng lỗi không huỷ cả lô
-- ---------------------------------------------------------------------
CREATE FUNCTION public.admin_bulk_signup(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row jsonb;
  v_out jsonb := '[]'::jsonb;
  v_res jsonb;
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

-- ---------------------------------------------------------------------
-- 9) admin_create_internal_account / _v3 — alias tương thích ngược
--    Frontend cũ gọi các tên này với p_username/p_password/... rời rạc.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.admin_create_internal_account_v3(
  p_username   text,
  p_password   text,
  p_full_name  text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_bio        text DEFAULT NULL,
  p_province   text DEFAULT NULL,
  p_gender     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.admin_signup_account(jsonb_build_object(
    'username',   p_username,
    'password',   p_password,
    'full_name',  p_full_name,
    'avatar_url', p_avatar_url,
    'bio',        p_bio,
    'province',   p_province,
    'gender',     p_gender
  ));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_internal_account_v3(text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_internal_account_v3(text,text,text,text,text,text,text) TO authenticated;

CREATE FUNCTION public.admin_create_internal_account(
  p_username   text,
  p_password   text,
  p_full_name  text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_bio        text DEFAULT NULL,
  p_province   text DEFAULT NULL,
  p_gender     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.admin_create_internal_account_v3(
    p_username, p_password, p_full_name, p_avatar_url, p_bio, p_province, p_gender);
$$;
REVOKE ALL ON FUNCTION public.admin_create_internal_account(text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_internal_account(text,text,text,text,text,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 10) update / lock / delete / list — 100% profiles
-- ---------------------------------------------------------------------
CREATE FUNCTION public.admin_update_internal_account(
  p_id        uuid,
  p_username  text  DEFAULT NULL,
  p_password  text  DEFAULT NULL,
  p_full_name text  DEFAULT NULL,
  p_avatar    text  DEFAULT NULL,
  p_bio       text  DEFAULT NULL,
  p_province  text  DEFAULT NULL,
  p_gender    text  DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_username IS NOT NULL THEN
    IF p_username !~ '^[A-Za-z0-9_.-]{3,32}$' THEN
      RAISE EXCEPTION 'Username không hợp lệ' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles pr
                WHERE lower(pr.username) = lower(p_username) AND pr.id <> p_id) THEN
      RAISE EXCEPTION 'Username đã tồn tại' USING ERRCODE = '23505';
    END IF;
    UPDATE public.profiles SET username = p_username WHERE id = p_id;
  END IF;

  IF p_full_name IS NOT NULL THEN
    UPDATE public.profiles SET full_name = p_full_name WHERE id = p_id;
  END IF;
  IF p_avatar IS NOT NULL AND public._has_column('profiles','avatar') THEN
    EXECUTE 'UPDATE public.profiles SET avatar = $1 WHERE id = $2' USING p_avatar, p_id;
  END IF;
  IF p_avatar IS NOT NULL AND public._has_column('profiles','avatar_url') THEN
    EXECUTE 'UPDATE public.profiles SET avatar_url = $1 WHERE id = $2' USING p_avatar, p_id;
  END IF;
  IF p_bio IS NOT NULL AND public._has_column('profiles','bio') THEN
    EXECUTE 'UPDATE public.profiles SET bio = $1 WHERE id = $2' USING p_bio, p_id;
  END IF;
  IF p_province IS NOT NULL AND public._has_column('profiles','province') THEN
    EXECUTE 'UPDATE public.profiles SET province = $1 WHERE id = $2' USING p_province, p_id;
  END IF;
  IF p_gender IS NOT NULL AND public._has_column('profiles','gender') THEN
    EXECUTE 'UPDATE public.profiles SET gender = $1 WHERE id = $2' USING p_gender, p_id;
  END IF;

  IF p_password IS NOT NULL AND length(p_password) >= 6 THEN
    INSERT INTO public.internal_account_credentials(profile_id, password, updated_at)
    VALUES (p_id, p_password, now())
    ON CONFLICT (profile_id) DO UPDATE
      SET password = EXCLUDED.password, updated_at = now();
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_internal_account(uuid,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_internal_account(uuid,text,text,text,text,text,text,text) TO authenticated;

CREATE FUNCTION public.admin_lock_internal_account(p_id uuid, p_locked boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF public._has_column('profiles','is_banned') THEN
    EXECUTE 'UPDATE public.profiles SET is_banned = $1 WHERE id = $2' USING p_locked, p_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_lock_internal_account(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_lock_internal_account(uuid, boolean) TO authenticated;

CREATE FUNCTION public.admin_delete_internal_account(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.profiles WHERE id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_internal_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_internal_account(uuid) TO authenticated;

CREATE FUNCTION public.admin_delete_all_internal_accounts(p_confirm text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_confirm <> 'DELETE ALL INTERNAL' THEN
    RAISE EXCEPTION 'Thiếu xác nhận' USING ERRCODE = '22023';
  END IF;
  IF public._has_column('profiles','account_source') THEN
    EXECUTE 'DELETE FROM public.profiles WHERE account_source = ''internal''';
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_all_internal_accounts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_all_internal_accounts(text) TO authenticated;

-- Danh sách — nếu có cột account_source thì lọc, không thì trả tất cả profiles.
CREATE FUNCTION public.admin_list_internal_accounts(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 20,
  p_offset int  DEFAULT 0
)
RETURNS TABLE (
  id uuid, username text, full_name text, avatar text, bio text,
  province text, gender text, is_banned boolean, created_at timestamptz,
  followers bigint, following bigint, posts bigint, messages bigint,
  unread bigint, total bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_where text := 'TRUE';
  v_sql   text;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF public._has_column('profiles','account_source') THEN
    v_where := v_where || ' AND pr.account_source = ''internal''';
  END IF;
  IF p_search IS NOT NULL AND length(trim(p_search)) > 0 THEN
    v_where := v_where || format(
      ' AND (pr.username ILIKE %L OR coalesce(pr.full_name,'''') ILIKE %L%s)',
      '%'||p_search||'%', '%'||p_search||'%',
      CASE WHEN public._has_column('profiles','province')
           THEN format(' OR coalesce(pr.province,'''') ILIKE %L', '%'||p_search||'%')
           ELSE '' END);
  END IF;

  v_sql := format($sql$
    WITH base AS (
      SELECT pr.id, pr.username, pr.full_name,
             %s AS avatar,
             %s AS bio,
             %s AS province,
             %s AS gender,
             %s AS is_banned,
             pr.created_at
        FROM public.profiles pr
       WHERE %s
    ), total AS (SELECT count(*) AS c FROM base)
    SELECT b.id, b.username, b.full_name, b.avatar, b.bio, b.province, b.gender,
           b.is_banned, b.created_at,
           0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint,
           (SELECT c FROM total) AS total
      FROM base b
     ORDER BY b.created_at DESC NULLS LAST
     LIMIT %s OFFSET %s
  $sql$,
    CASE WHEN public._has_column('profiles','avatar')       THEN 'pr.avatar'       ELSE 'NULL::text' END,
    CASE WHEN public._has_column('profiles','bio')          THEN 'pr.bio'          ELSE 'NULL::text' END,
    CASE WHEN public._has_column('profiles','province')     THEN 'pr.province'     ELSE 'NULL::text' END,
    CASE WHEN public._has_column('profiles','gender')       THEN 'pr.gender'       ELSE 'NULL::text' END,
    CASE WHEN public._has_column('profiles','is_banned')    THEN 'pr.is_banned'    ELSE 'FALSE'      END,
    v_where, p_limit, p_offset);

  RETURN QUERY EXECUTE v_sql;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_internal_accounts(text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_internal_accounts(text,int,int) TO authenticated;

COMMIT;

-- =====================================================================
-- 11) AUDIT — bắt buộc trả về 0 dòng
-- =====================================================================
SELECT n.nspname AS schema, p.proname AS function
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.prokind = 'f'
   AND ( pg_get_functiondef(p.oid) ILIKE '%gen_salt(%'
      OR pg_get_functiondef(p.oid) ILIKE '%crypt(%'
      OR pg_get_functiondef(p.oid) ILIKE '%auth.users%'
      OR pg_get_functiondef(p.oid) ILIKE '%encrypted_password%' );
