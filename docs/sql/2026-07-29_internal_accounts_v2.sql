-- =====================================================================
-- Internal Accounts v2 — polish & complete.
--   • FIX: "column reference username is ambiguous" trong admin_create_internal_account
--   • Stats (followers / following / posts / messages / created_at / gender / province)
--   • Nhắn tin, đăng bài, bình luận hàng loạt DƯỚI DANH NGHĨA tài khoản nội bộ
--   • Xóa toàn bộ
-- Tất cả đều SECURITY DEFINER + gate _is_super_admin(). Chạy trong SQL Editor.
-- Idempotent.
-- =====================================================================

-- 0) Helper: cột có tồn tại không (dùng cho update động, an toàn với schema cũ)
CREATE OR REPLACE FUNCTION public._has_column(_table text, _col text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=_table AND column_name=_col
  );
$$;
REVOKE ALL ON FUNCTION public._has_column(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._has_column(text,text) TO authenticated;

-- 1) CREATE — fix ambiguity (mọi tham chiếu cột đều được qualify) -------
DROP FUNCTION IF EXISTS public.admin_create_internal_account(text,text,text,text,text,text,text);
CREATE OR REPLACE FUNCTION public.admin_create_internal_account(
  p_username     text,
  p_password     text,
  p_full_name    text DEFAULT NULL,
  p_avatar_url   text DEFAULT NULL,
  p_bio          text DEFAULT NULL,
  p_province     text DEFAULT NULL,
  p_gender       text DEFAULT NULL
) RETURNS TABLE (out_id uuid, out_username text)
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
    created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    v_uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    v_email, crypt(p_password, gen_salt('bf')), now(),
    jsonb_build_object('provider','email','providers', jsonb_build_array('email')),
    jsonb_build_object('username', v_uname),
    now(), now(), '', '', '', ''
  );

  INSERT INTO public.profiles (id, username, full_name, avatar, avatar_url, bio, province, gender, account_source, created_at)
  VALUES (
    v_uid, v_uname,
    coalesce(nullif(trim(p_full_name), ''), v_uname),
    nullif(trim(p_avatar_url), ''), nullif(trim(p_avatar_url), ''),
    nullif(trim(p_bio), ''), nullif(trim(p_province), ''),
    CASE WHEN p_gender IN ('male','female') THEN p_gender ELSE NULL END,
    'internal', now()
  )
  ON CONFLICT (id) DO UPDATE
    SET username = EXCLUDED.username, full_name = EXCLUDED.full_name,
        avatar = EXCLUDED.avatar, avatar_url = EXCLUDED.avatar_url,
        bio = EXCLUDED.bio, province = EXCLUDED.province,
        gender = EXCLUDED.gender, account_source = 'internal';

  out_id := v_uid; out_username := v_uname;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_internal_account(text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_internal_account(text,text,text,text,text,text,text) TO authenticated;

-- 2) LIST + stats ------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_internal_accounts(text,int,int);
CREATE OR REPLACE FUNCTION public.admin_list_internal_accounts(
  p_search text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0
) RETURNS TABLE (
  id uuid, username text, full_name text, avatar text, bio text,
  province text, gender text, is_banned boolean, created_at timestamptz,
  followers bigint, following bigint, posts bigint, messages bigint, unread bigint,
  total bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_term text := nullif(trim(coalesce(p_search,'')), '');
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.username, p.full_name, p.avatar, p.bio, p.province, p.gender,
           p.is_banned, p.created_at,
           coalesce(p.followers_count, 0)::bigint AS followers_col
      FROM public.profiles p
     WHERE p.account_source = 'internal'
       AND (v_term IS NULL
            OR p.username ILIKE '%'||v_term||'%'
            OR p.full_name ILIKE '%'||v_term||'%'
            OR p.province ILIKE '%'||v_term||'%')
  ), c AS (SELECT count(*)::bigint AS n FROM base)
  SELECT b.id, b.username, b.full_name, b.avatar, b.bio, b.province, b.gender,
         b.is_banned, b.created_at,
         greatest(b.followers_col,
                  (SELECT count(*) FROM public.follows f WHERE f.following_id = b.id))::bigint,
         (SELECT count(*) FROM public.follows f2 WHERE f2.follower_id = b.id)::bigint,
         (SELECT count(*) FROM public.posts po WHERE po.user_id = b.id)::bigint,
         (SELECT count(*) FROM public.messages m
           WHERE m.sender_id = b.id OR m.receiver_id = b.id)::bigint,
         (SELECT count(*) FROM public.messages m2
           WHERE m2.receiver_id = b.id AND coalesce(m2.is_read,false) = false)::bigint,
         (SELECT n FROM c)
    FROM base b
   ORDER BY b.created_at DESC
   LIMIT greatest(p_limit,1) OFFSET greatest(p_offset,0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_internal_accounts(text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_internal_accounts(text,int,int) TO authenticated;

-- 3) SET STATS (followers / following / posts / created_at / gender / province)
CREATE OR REPLACE FUNCTION public.admin_set_internal_account_stats(
  p_id         uuid,
  p_followers  bigint      DEFAULT NULL,
  p_following  bigint      DEFAULT NULL,
  p_posts      bigint      DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL,
  p_gender     text        DEFAULT NULL,
  p_province   text        DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = p_id AND pr.account_source='internal') THEN
    RAISE EXCEPTION 'Không tìm thấy tài khoản' USING ERRCODE = 'P0002';
  END IF;

  IF p_followers IS NOT NULL AND public._has_column('profiles','followers_count') THEN
    EXECUTE 'UPDATE public.profiles SET followers_count = $1 WHERE id = $2'
      USING greatest(p_followers,0), p_id;
  END IF;
  IF p_following IS NOT NULL AND public._has_column('profiles','following_count') THEN
    EXECUTE 'UPDATE public.profiles SET following_count = $1 WHERE id = $2'
      USING greatest(p_following,0), p_id;
  END IF;
  IF p_posts IS NOT NULL AND public._has_column('profiles','posts_count') THEN
    EXECUTE 'UPDATE public.profiles SET posts_count = $1 WHERE id = $2'
      USING greatest(p_posts,0), p_id;
  END IF;
  IF p_created_at IS NOT NULL THEN
    UPDATE public.profiles SET created_at = p_created_at WHERE id = p_id;
  END IF;
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

-- 4) MESSAGING ---------------------------------------------------------
-- 4a) Danh sách hội thoại của 1 tài khoản nội bộ
CREATE OR REPLACE FUNCTION public.admin_internal_threads(p_account uuid)
RETURNS TABLE (
  peer_id uuid, peer_username text, peer_name text, peer_avatar text,
  last_content text, last_at timestamptz, unread bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH conv AS (
    SELECT CASE WHEN m.sender_id = p_account THEN m.receiver_id ELSE m.sender_id END AS pid,
           m.content, m.created_at, m.receiver_id, m.is_read
      FROM public.messages m
     WHERE m.sender_id = p_account OR m.receiver_id = p_account
  ), agg AS (
    SELECT c.pid,
           max(c.created_at) AS last_at,
           count(*) FILTER (WHERE c.receiver_id = p_account AND coalesce(c.is_read,false)=false) AS unread
      FROM conv c GROUP BY c.pid
  )
  SELECT a.pid, pr.username, pr.full_name, pr.avatar,
         (SELECT c2.content FROM conv c2 WHERE c2.pid = a.pid ORDER BY c2.created_at DESC LIMIT 1),
         a.last_at, a.unread
    FROM agg a
    LEFT JOIN public.profiles pr ON pr.id = a.pid
   ORDER BY a.last_at DESC
   LIMIT 200;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_threads(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_threads(uuid) TO authenticated;

-- 4b) Tin nhắn của 1 hội thoại (đọc + tự đánh dấu đã đọc)
CREATE OR REPLACE FUNCTION public.admin_internal_thread_messages(
  p_account uuid, p_peer uuid, p_limit int DEFAULT 100
) RETURNS TABLE (
  id uuid, sender_id uuid, receiver_id uuid, content text, created_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.messages m SET is_read = true
   WHERE m.receiver_id = p_account AND m.sender_id = p_peer
     AND coalesce(m.is_read,false) = false;

  RETURN QUERY
  SELECT m.id, m.sender_id, m.receiver_id, m.content, m.created_at
    FROM public.messages m
   WHERE (m.sender_id = p_account AND m.receiver_id = p_peer)
      OR (m.sender_id = p_peer AND m.receiver_id = p_account)
   ORDER BY m.created_at ASC
   LIMIT greatest(p_limit,1);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_thread_messages(uuid,uuid,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_thread_messages(uuid,uuid,int) TO authenticated;

-- 4c) Gửi tin nhắn dưới danh nghĩa tài khoản nội bộ
CREATE OR REPLACE FUNCTION public.admin_internal_send_message(
  p_account uuid, p_peer uuid, p_content text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=p_account AND pr.account_source='internal') THEN
    RAISE EXCEPTION 'Tài khoản không hợp lệ' USING ERRCODE='P0002';
  END IF;
  IF nullif(trim(coalesce(p_content,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Nội dung trống' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.messages (sender_id, receiver_id, content)
  VALUES (p_account, p_peer, trim(p_content))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_send_message(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_send_message(uuid,uuid,text) TO authenticated;

-- 4d) Tổng số tin chưa đọc của toàn bộ tài khoản nội bộ (badge)
CREATE OR REPLACE FUNCTION public.admin_internal_unread_total()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n bigint;
BEGIN
  IF NOT public._is_super_admin() THEN RETURN 0; END IF;
  SELECT count(*) INTO n
    FROM public.messages m
    JOIN public.profiles pr ON pr.id = m.receiver_id AND pr.account_source='internal'
   WHERE coalesce(m.is_read,false) = false;
  RETURN coalesce(n,0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_unread_total() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_unread_total() TO authenticated;

-- 5) POST as internal account -----------------------------------------
CREATE OR REPLACE FUNCTION public.admin_internal_create_post(
  p_account    uuid,
  p_content    text,
  p_image_urls text[] DEFAULT NULL,
  p_category   text   DEFAULT 'general',
  p_visibility text   DEFAULT 'home'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_imgs text[] := coalesce(p_image_urls, '{}');
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id=p_account AND pr.account_source='internal') THEN
    RAISE EXCEPTION 'Tài khoản không hợp lệ' USING ERRCODE='P0002';
  END IF;
  IF nullif(trim(coalesce(p_content,'')),'') IS NULL AND array_length(v_imgs,1) IS NULL THEN
    RAISE EXCEPTION 'Bài viết trống' USING ERRCODE='22023';
  END IF;

  INSERT INTO public.posts (user_id, content, image_url, image_urls, visibility, status, has_images, category)
  VALUES (
    p_account, trim(coalesce(p_content,'')),
    v_imgs[1],
    CASE WHEN array_length(v_imgs,1) IS NULL THEN NULL ELSE v_imgs END,
    coalesce(p_visibility,'home'), 'published',
    array_length(v_imgs,1) IS NOT NULL,
    coalesce(p_category,'general')
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_internal_create_post(uuid,text,text[],text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_internal_create_post(uuid,text,text[],text,text) TO authenticated;

-- 6) BATCH COMMENTS — 1 tài khoản = 1 dòng bình luận -------------------
CREATE OR REPLACE FUNCTION public.admin_internal_bulk_comment(
  p_post_id  uuid,
  p_accounts uuid[],
  p_contents text[]
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i int; n int := coalesce(array_length(p_accounts,1),0); ok int := 0;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
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

-- 7) DELETE ALL --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_all_internal_accounts(p_confirm text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[]; n int;
BEGIN
  IF NOT public._is_super_admin() THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;
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
