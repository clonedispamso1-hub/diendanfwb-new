-- =====================================================================
-- SB1_PURGE_MEMBER.sql  ·  Supabase #1 (core: auth, profiles, ví, admin)
-- ---------------------------------------------------------------------
-- CHỈ chạy file này trên Supabase #1. Không chạy trên #2 / #3.
--
-- Nguyên tắc:
--   • CHỈ xoá dữ liệu có quan hệ trực tiếp với user: cột có FOREIGN KEY
--     tới public.profiles(id) / auth.users(id), hoặc owner-column trong
--     danh sách whitelist rõ ràng. KHÔNG xoá theo "mọi bảng có cột id uuid".
--   • KHÔNG dùng EXCEPTION WHEN others THEN NULL. Lỗi phải nổi lên.
--   • Sau khi xoá có bước KIỂM TRA: còn sót dòng nào của user → RAISE.
--   • Admin (profiles.is_admin, hoặc user_roles admin/super_admin nếu có)
--     không bao giờ bị xoá.
--   • Xoá tất cả: cần đúng cả hai — 'XOAHETDI' và '792006'.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Whitelist owner-column (chỉ những cột thật sự là "chủ sở hữu")
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._purge_owner_columns()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'user_id','profile_id','member_id','owner_id','author_id',
    'sender_id','receiver_id','recipient_id',
    'from_user_id','to_user_id',
    'follower_id','following_id','followed_id',
    'actor_id','target_user_id',
    'blocker_id','blocked_id',
    'reporter_id','reported_user_id',
    'giver_id','donor_id','liker_id','viewer_id',
    'clone_id','clone_user_id'
  ]::text[]
$$;

-- Bảng có khoá chính id kiểu uuid? (để dò FK con)
CREATE OR REPLACE FUNCTION public._purge_has_uuid_id(p_table text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = p_table
       AND c.column_name = 'id' AND c.data_type = 'uuid'
  )
$$;

-- ---------------------------------------------------------------------
-- 1) Danh sách (bảng, cột) trỏ tới user — FK thật + owner-column whitelist
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._purge_user_targets()
RETURNS TABLE(tbl text, col text) LANGUAGE sql STABLE AS $$
  -- (a) FK tới profiles(id) / auth.users(id)
  SELECT DISTINCT kcu.table_name::text, kcu.column_name::text
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema
     AND kcu.constraint_name   = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema = tc.constraint_schema
     AND ccu.constraint_name   = tc.constraint_name
   WHERE tc.constraint_type = 'FOREIGN KEY'
     AND tc.table_schema = 'public'
     AND kcu.table_name <> 'profiles'
     AND (
          (ccu.table_schema = 'public' AND ccu.table_name = 'profiles'  AND ccu.column_name = 'id')
       OR (ccu.table_schema = 'auth'   AND ccu.table_name = 'users'     AND ccu.column_name = 'id')
     )
  UNION
  -- (b) owner-column whitelist (uuid) trên base table
  SELECT c.table_name::text, c.column_name::text
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
   WHERE c.table_schema = 'public'
     AND t.table_type = 'BASE TABLE'
     AND c.data_type = 'uuid'
     AND c.table_name <> 'profiles'
     AND c.column_name = ANY(public._purge_owner_columns())
$$;

-- ---------------------------------------------------------------------
-- 2) Dọn con theo FK (đệ quy) để không còn mồ côi
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._purge_cascade(p_table text, p_ids uuid[], p_depth int DEFAULT 0)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r          record;
  child_ids  uuid[];
BEGIN
  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN RETURN; END IF;
  IF p_depth > 6 THEN
    RAISE EXCEPTION 'PURGE_DEPTH_EXCEEDED: quan hệ FK quá sâu tại %', p_table;
  END IF;

  FOR r IN
    SELECT DISTINCT kcu.table_name::text AS tbl, kcu.column_name::text AS col
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema = tc.constraint_schema
       AND kcu.constraint_name   = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_schema = tc.constraint_schema
       AND ccu.constraint_name   = tc.constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND ccu.table_schema = 'public'
       AND ccu.table_name = p_table
       AND ccu.column_name = 'id'
       AND kcu.table_name <> p_table
  LOOP
    IF public._purge_has_uuid_id(r.tbl) THEN
      EXECUTE format(
        'SELECT COALESCE(array_agg(id), ''{}''::uuid[]) FROM public.%I WHERE %I = ANY($1)',
        r.tbl, r.col) INTO child_ids USING p_ids;
      PERFORM public._purge_cascade(r.tbl, child_ids, p_depth + 1);
    END IF;
    EXECUTE format('DELETE FROM public.%I WHERE %I = ANY($1)', r.tbl, r.col) USING p_ids;
  END LOOP;
END; $$;

-- ---------------------------------------------------------------------
-- 3) Kiểm tra quyền Admin theo cơ chế hiện tại của app
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._purge_is_admin(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean := false;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  SELECT COALESCE(p.is_admin, false) INTO v FROM public.profiles p WHERE p.id = p_user_id;
  IF COALESCE(v, false) THEN RETURN true; END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles r
         WHERE r.user_id = $1 AND r.role::text IN ('admin','super_admin','moderator_admin')
      )$q$ INTO v USING p_user_id;
  END IF;

  RETURN COALESCE(v, false);
END; $$;

-- ---------------------------------------------------------------------
-- 4) Xoá sạch 1 member
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_purge_member_full(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r         record;
  own_ids   uuid[];
  n         integer;
  deleted   integer := 0;
  leftover  text;
BEGIN
  IF NOT public._purge_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: chỉ Admin được xoá tài khoản';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'BAD_INPUT: thiếu user id';
  END IF;
  IF p_user_id = auth.uid() OR public._purge_is_admin(p_user_id) THEN
    RAISE EXCEPTION 'PROTECTED_ACCOUNT: không xoá tài khoản Admin';
  END IF;

  -- 4.1 xoá dữ liệu thuộc user + con của chúng
  FOR r IN SELECT tbl, col FROM public._purge_user_targets() ORDER BY tbl, col LOOP
    IF public._purge_has_uuid_id(r.tbl) THEN
      EXECUTE format(
        'SELECT COALESCE(array_agg(id), ''{}''::uuid[]) FROM public.%I WHERE %I = $1',
        r.tbl, r.col) INTO own_ids USING p_user_id;
      PERFORM public._purge_cascade(r.tbl, own_ids, 0);
    END IF;
    EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.tbl, r.col) USING p_user_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    deleted := deleted + n;
  END LOOP;

  -- 4.2 profile (sau cùng) + con của profile
  PERFORM public._purge_cascade('profiles', ARRAY[p_user_id], 0);
  DELETE FROM public.profiles WHERE id = p_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  deleted := deleted + n;

  -- 4.3 auth (chỉ tồn tại trên SB1)
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.sessions   WHERE user_id = p_user_id;
  DELETE FROM auth.users      WHERE id = p_user_id;

  -- 4.4 KIỂM TRA: không được còn sót dòng nào của user
  FOR r IN SELECT tbl, col FROM public._purge_user_targets() LOOP
    EXECUTE format('SELECT CASE WHEN EXISTS (SELECT 1 FROM public.%I WHERE %I = $1) THEN %L END',
                   r.tbl, r.col, r.tbl || '.' || r.col)
      INTO leftover USING p_user_id;
    IF leftover IS NOT NULL THEN
      RAISE EXCEPTION 'PURGE_INCOMPLETE: còn dữ liệu tại %', leftover;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'PURGE_INCOMPLETE: profile chưa xoá được';
  END IF;

  RETURN jsonb_build_object('ok', true, 'user_id', p_user_id, 'rows_deleted', deleted);
END; $$;

-- Alias UI đang gọi
CREATE OR REPLACE FUNCTION public.admin_delete_user_data(p_user_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.admin_purge_member_full(p_user_id)
$$;

-- ---------------------------------------------------------------------
-- 5) Xoá tất cả member (XOAHETDI + 792006), giữ nguyên Admin
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_purge_all_accounts(text, text, text);

CREATE OR REPLACE FUNCTION public.admin_purge_all_accounts(_confirm text, _admin_code text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; n integer := 0;
BEGIN
  IF NOT public._purge_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN: chỉ Admin được xoá tài khoản';
  END IF;
  IF upper(btrim(COALESCE(_confirm, ''))) <> 'XOAHETDI' THEN
    RAISE EXCEPTION 'WRONG_CONFIRM: mật khẩu xác nhận không đúng';
  END IF;
  IF btrim(COALESCE(_admin_code, '')) <> '792006' THEN
    RAISE EXCEPTION 'WRONG_CODE: mã Admin không đúng';
  END IF;

  FOR v_uid IN
    SELECT p.id FROM public.profiles p
     WHERE p.id <> auth.uid() AND NOT public._purge_is_admin(p.id)
  LOOP
    PERFORM public.admin_purge_member_full(v_uid);
    n := n + 1;
  END LOOP;

  -- auth user không còn profile
  FOR v_uid IN
    SELECT u.id FROM auth.users u
     WHERE u.id <> auth.uid() AND NOT public._purge_is_admin(u.id)
  LOOP
    PERFORM public.admin_purge_member_full(v_uid);
    n := n + 1;
  END LOOP;

  RETURN n;
END; $$;

-- ---------------------------------------------------------------------
-- 6) Quyền: chỉ authenticated (RPC tự kiểm tra Admin) + service_role
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_purge_member_full(uuid)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_data(uuid)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_purge_all_accounts(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_member_full(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_data(uuid)         TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_purge_all_accounts(text, text) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
-- ============================== HẾT ==================================
