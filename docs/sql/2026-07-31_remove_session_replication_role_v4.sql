-- =====================================================================
-- v4 — GỠ BỎ HOÀN TOÀN session_replication_role (Supabase không cho phép:
--      chỉ superuser mới set được → migration/RPC luôn fail 42501).
--
--  • Không tắt trigger, không ALTER ROLE, không SET session_replication_role.
--  • Chỉ dùng INSERT/UPDATE/DELETE thông thường + các flag ứng dụng
--    (app.bypass_device_limit / app.allow_gem_change) mà trigger của dự án
--    tự kiểm tra — hoàn toàn tương thích Supabase.
--  • Bao gồm luôn bản fix "column reference username is ambiguous".
--
-- Chạy 1 lần trong Supabase SQL Editor. Idempotent.
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

-- ===== Các RPC nội bộ khác (đã bỏ session_replication_role) =====

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
