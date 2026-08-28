-- =====================================================================
-- SB2_PURGE_MEMBER.sql  ·  Supabase #2 (media / Live Móc / Cộng Đồng VIP)
-- ---------------------------------------------------------------------
-- CHỈ chạy file này trên Supabase #2. Không chạy trên #1 / #3.
--
-- Nguyên tắc an toàn (giống hệt SB1_PURGE_MEMBER.sql):
--   • CHỈ xoá dữ liệu có quan hệ trực tiếp với user: cột có FOREIGN KEY
--     tới public.profiles(id) (nếu #2 có bảng mirror), hoặc owner-column
--     trong whitelist rõ ràng. KHÔNG xoá theo "mọi bảng có cột id uuid".
--   • KHÔNG dùng EXCEPTION WHEN others THEN NULL. Lỗi phải nổi lên.
--   • Sau khi xoá có bước KIỂM TRA: còn sót dòng nào của user → RAISE.
--   • Admin (profiles.is_admin / user_roles admin) không bao giờ bị xoá.
--   • #2 KHÔNG có auth.users → tuyệt đối không chạm schema auth ở đây.
--   • Xoá tất cả: cần đúng cả hai — 'XOAHETDI' và '792006'.
--     Xoá 1 member thì KHÔNG cần hai mã đó.
--
-- Ghi chú xác thực: app đăng nhập ở #1; #2 được gọi bằng publishable key
-- (anon bridge). Vì vậy auth.uid() ở đây có thể NULL. Quy tắc:
--   - auth.uid() có giá trị  → bắt buộc phải là Admin của #2.
--   - auth.uid() NULL (bridge) → cho phép, nhưng KHÔNG BAO GIỜ được xoá
--     một user là Admin (kiểm tra ở bước bảo vệ mục tiêu).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Whitelist owner-column
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
    'clone_id','clone_user_id',
    'uploader_id','host_id','streamer_id'
  ]::text[]
$$;

CREATE OR REPLACE FUNCTION public._purge_has_uuid_id(p_table text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = p_table
       AND c.column_name = 'id' AND c.data_type = 'uuid'
  )
$$;

-- ---------------------------------------------------------------------
-- 1) Danh sách (bảng, cột) trỏ tới user
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._purge_user_targets()
RETURNS TABLE(tbl text, col text) LANGUAGE sql STABLE AS $$
  -- (a) FK tới profiles(id) nếu #2 có bảng profiles mirror
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
     AND ccu.table_schema = 'public'
     AND ccu.table_name = 'profiles'
     AND ccu.column_name = 'id'
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
-- 3) Admin check (mirror của #2 nếu có) + gate cho caller
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._purge_is_admin(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v boolean := false;
BEGIN
  IF p_user_id IS NULL THEN RETURN false; END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE $q$SELECT COALESCE((SELECT p.is_admin FROM public.profiles p WHERE p.id = $1), false)$q$
      INTO v USING p_user_id;
    IF COALESCE(v, false) THEN RETURN true; END IF;
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE $q$
      SELECT EXISTS (
        SELECT 1 FROM public.user_roles r
         WHERE r.user_id = $1 AND r.role::text IN ('admin','super_admin','moderator_admin')
      )$q$ INTO v USING p_user_id;
  END IF;

  RETURN COALESCE(v, false);
END; $$;

-- auth.uid() có giá trị → phải là Admin. NULL (anon bridge từ #1) → cho phép.
CREATE OR REPLACE FUNCTION public._purge_caller_allowed()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  RETURN public._purge_is_admin(auth.uid());
END; $$;

-- ---------------------------------------------------------------------
-- 4) Xoá sạch dữ liệu #2 của 1 member
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
  IF NOT public._purge_caller_allowed() THEN
    RAISE EXCEPTION 'FORBIDDEN: chỉ Admin được xoá tài khoản';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'BAD_INPUT: thiếu user id';
  END IF;
  IF p_user_id = auth.uid() OR public._purge_is_admin(p_user_id) THEN
    RAISE EXCEPTION 'PROTECTED_ACCOUNT: không xoá tài khoản Admin';
  END IF;

  -- 4.1 dữ liệu thuộc user + con của chúng
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

  -- 4.2 profile mirror (nếu #2 có) — sau cùng
  IF to_regclass('public.profiles') IS NOT NULL THEN
    PERFORM public._purge_cascade('profiles', ARRAY[p_user_id], 0);
    EXECUTE 'DELETE FROM public.profiles WHERE id = $1' USING p_user_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    deleted := deleted + n;
  END IF;

  -- 4.3 KIỂM TRA: không được còn sót dòng nào của user
  FOR r IN SELECT tbl, col FROM public._purge_user_targets() LOOP
    EXECUTE format('SELECT CASE WHEN EXISTS (SELECT 1 FROM public.%I WHERE %I = $1) THEN %L END',
                   r.tbl, r.col, r.tbl || '.' || r.col)
      INTO leftover USING p_user_id;
    IF leftover IS NOT NULL THEN
      RAISE EXCEPTION 'PURGE_INCOMPLETE: còn dữ liệu tại %', leftover;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'db', 'SB2', 'user_id', p_user_id, 'rows_deleted', deleted);
END; $$;

-- Alias để call site dùng chung tên với SB1/SB3
CREATE OR REPLACE FUNCTION public.admin_delete_user_data(p_user_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.admin_purge_member_full(p_user_id)
$$;

-- ---------------------------------------------------------------------
-- 5) Xoá tất cả member (XOAHETDI + 792006) — danh sách user do #1 cung cấp
--    Giữ nguyên Admin: mọi id là Admin đều bị bỏ qua.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_purge_all_members(
  _confirm text, _admin_code text, p_user_ids uuid[]
)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid; n integer := 0;
BEGIN
  IF NOT public._purge_caller_allowed() THEN
    RAISE EXCEPTION 'FORBIDDEN: chỉ Admin được xoá tài khoản';
  END IF;
  IF upper(btrim(COALESCE(_confirm, ''))) <> 'XOAHETDI' THEN
    RAISE EXCEPTION 'WRONG_CONFIRM: mật khẩu xác nhận không đúng';
  END IF;
  IF btrim(COALESCE(_admin_code, '')) <> '792006' THEN
    RAISE EXCEPTION 'WRONG_CODE: mã Admin không đúng';
  END IF;

  -- (a) danh sách id gửi từ #1
  IF p_user_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY p_user_ids LOOP
      IF v_uid IS NOT NULL
         AND v_uid IS DISTINCT FROM auth.uid()
         AND NOT public._purge_is_admin(v_uid) THEN
        PERFORM public.admin_purge_member_full(v_uid);
        n := n + 1;
      END IF;
    END LOOP;
  END IF;

  -- (b) profile mirror còn sót trên #2 (không phải Admin)
  IF to_regclass('public.profiles') IS NOT NULL THEN
    FOR v_uid IN EXECUTE
      'SELECT p.id FROM public.profiles p WHERE p.id IS DISTINCT FROM auth.uid()'
    LOOP
      IF NOT public._purge_is_admin(v_uid) THEN
        PERFORM public.admin_purge_member_full(v_uid);
        n := n + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN n;
END; $$;

-- ---------------------------------------------------------------------
-- 6) Quyền: anon bridge + authenticated (RPC tự kiểm tra) + service_role
-- ---------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_purge_member_full(uuid)                    FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user_data(uuid)                     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_purge_all_members(text, text, uuid[])      FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_member_full(uuid)               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_data(uuid)                TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_purge_all_members(text, text, uuid[]) TO anon, authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
-- ============================== HẾT ==================================
