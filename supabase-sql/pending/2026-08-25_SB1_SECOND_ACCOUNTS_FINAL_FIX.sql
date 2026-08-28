-- =====================================================================
-- CHẠY 1 LẦN Ở SUPABASE #1 (SQL Editor) — FILE CUỐI CÙNG
-- Module "Tài khoản thứ hai" — chốt 2 lỗi:
--
--   (1) Đổi TÊN / AVATAR phải cập nhật NGAY ở mọi nơi
--       → ghi đồng thời display_name / full_name / name / nickname
--         + avatar / avatar_url + auth.users.raw_user_meta_data
--       → bump updated_at để realtime + cache client nhận thay đổi
--       → hỗ trợ XÓA avatar (truyền chuỗi rỗng '')
--
--   (2) XÓA 1 / NHIỀU / TẤT CẢ clone phải xử lý TOÀN BỘ FK
--       và GIỮ LỊCH SỬ GIAO DỊCH
--       → mọi bảng tham chiếu profiles/auth.users được quét động từ
--         pg_constraint (không cần biết trước tên bảng)
--       → bảng LỊCH SỬ (transaction/transfer/withdraw/gift/payment/
--         cashflow/ledger/invoice/topup/purchase/order/history/log/receipt):
--         KHÔNG xoá dòng — snapshot tên + username vào cột <col>_snapshot
--         rồi set FK = NULL
--       → bảng còn lại: xoá dòng (nhiều pass để tự xử lý FK lồng nhau)
--
-- Idempotent. Không đổi cách hash mật khẩu, không đổi URL/API key.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------
-- 0) Helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._has_column(p_table text, p_column text)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=p_table AND column_name=p_column
  );
$$;
GRANT EXECUTE ON FUNCTION public._has_column(text,text) TO authenticated;

-- =====================================================================
-- PHẦN 1 — ĐỔI TÊN / AVATAR CẬP NHẬT NGAY MỌI NƠI
-- =====================================================================

-- Đồng bộ tên/avatar sang MỌI cột tên có thật trên profiles + auth metadata.
CREATE OR REPLACE FUNCTION public.admin_sync_account_identity(
  p_id     uuid,
  p_name   text DEFAULT NULL,   -- NULL = không đổi
  p_avatar text DEFAULT NULL    -- NULL = không đổi, '' = xoá avatar
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_name   text := nullif(trim(coalesce(p_name,'')),'');
  v_avatar text := CASE WHEN p_avatar IS NULL THEN NULL ELSE trim(p_avatar) END;
  c text;
BEGIN
  IF p_id IS NULL THEN RETURN; END IF;

  -- 1a) Tất cả cột "tên hiển thị" mà UI có thể đọc.
  IF v_name IS NOT NULL THEN
    FOREACH c IN ARRAY ARRAY['display_name','full_name','name','nickname'] LOOP
      IF public._has_column('profiles', c) THEN
        EXECUTE format('UPDATE public.profiles SET %I=$1 WHERE id=$2', c) USING v_name, p_id;
      END IF;
    END LOOP;
  END IF;

  -- 1b) Avatar: '' = xoá hẳn (NULL), khác rỗng = đặt mới.
  IF v_avatar IS NOT NULL THEN
    FOREACH c IN ARRAY ARRAY['avatar','avatar_url','photo_url','profile_image'] LOOP
      IF public._has_column('profiles', c) THEN
        EXECUTE format('UPDATE public.profiles SET %I=$1 WHERE id=$2', c)
          USING nullif(v_avatar,''), p_id;
      END IF;
    END LOOP;
  END IF;

  -- 1c) Bump updated_at → realtime UPDATE bắn ra, client bỏ cache cũ.
  IF public._has_column('profiles','updated_at') THEN
    EXECUTE 'UPDATE public.profiles SET updated_at=now() WHERE id=$1' USING p_id;
  END IF;

  -- 1d) Metadata phiên đăng nhập của chính clone đó.
  UPDATE auth.users au
     SET raw_user_meta_data = coalesce(au.raw_user_meta_data,'{}'::jsonb)
           || jsonb_strip_nulls(jsonb_build_object(
                'full_name', v_name,
                'name', v_name,
                'display_name', v_name,
                'avatar_url', CASE WHEN v_avatar IS NULL THEN NULL
                                   ELSE coalesce(nullif(v_avatar,''),'') END)),
         updated_at = now()
   WHERE au.id = p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_sync_account_identity(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sync_account_identity(uuid,text,text) TO authenticated;

-- Sửa tài khoản (bản chốt) — dùng lại chữ ký cũ để client không phải đổi RPC.
-- p_avatar_url = ''  → xoá avatar.  p_full_name  → ghi cả display_name.
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
DECLARE
  v_uname text := nullif(trim(coalesce(p_username,'')),'');
  v_email text;
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
     SET bio      = COALESCE(nullif(trim(coalesce(p_bio,'')),''), pr.bio),
         province = COALESCE(nullif(trim(coalesce(p_province,'')),''), pr.province),
         gender   = COALESCE(CASE WHEN p_gender IN ('male','female') THEN p_gender END, pr.gender)
   WHERE pr.id = p_id;

  -- Tên + avatar đi qua 1 cửa duy nhất → đồng bộ mọi cột + auth metadata.
  PERFORM public.admin_sync_account_identity(p_id, p_full_name, p_avatar_url);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_internal_account(uuid,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_internal_account(uuid,text,text,text,text,text,text,text) TO authenticated;

-- =====================================================================
-- PHẦN 2 — XOÁ CLONE: XỬ LÝ TOÀN BỘ FK, GIỮ LỊCH SỬ GIAO DỊCH
-- =====================================================================

-- Bảng nào được coi là "lịch sử" (không bao giờ xoá dòng).
CREATE OR REPLACE FUNCTION public._is_history_table(p_table text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_table ~* '(transaction|transfer|withdraw|deposit|topup|payment|cashflow|cash_flow|ledger|invoice|receipt|purchase|order|gift|history|audit|log)';
$$;

/**
 * Dọn mọi tham chiếu tới danh sách account trước khi xoá:
 *   - bảng lịch sử  → snapshot tên/username vào <col>_snapshot, set FK = NULL
 *   - bảng còn lại  → xoá dòng (chạy nhiều pass cho FK lồng nhau)
 * Quét động toàn bộ FK 1 cột trỏ về public.profiles / auth.users.
 */
CREATE OR REPLACE FUNCTION public.admin_purge_account_refs(p_ids uuid[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  r          record;
  v_pass     int;
  v_left     int;
  v_notnull  boolean;
  v_err      text;
BEGIN
  IF p_ids IS NULL OR array_length(p_ids,1) IS NULL THEN RETURN; END IF;

  -- ---------- 2a) BẢNG LỊCH SỬ: giữ dòng, snapshot rồi NULL hoá FK ----------
  FOR r IN
    SELECT ns.nspname AS sch, cl.relname AS tbl, att.attname AS col
      FROM pg_constraint con
      JOIN pg_class cl       ON cl.oid = con.conrelid
      JOIN pg_namespace ns   ON ns.oid = cl.relnamespace
      JOIN pg_class rcl      ON rcl.oid = con.confrelid
      JOIN pg_namespace rns  ON rns.oid = rcl.relnamespace
      JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
      JOIN pg_attribute att  ON att.attrelid = cl.oid AND att.attnum = k.attnum
     WHERE con.contype = 'f'
       AND array_length(con.conkey,1) = 1
       AND ((rns.nspname='public' AND rcl.relname='profiles')
            OR (rns.nspname='auth' AND rcl.relname='users'))
       AND ns.nspname = 'public'
       AND cl.relname <> 'profiles'
       AND cl.relkind = 'r'
       AND public._is_history_table(cl.relname)
  LOOP
    -- Cột snapshot (idempotent).
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS %I text',
                   r.sch, r.tbl, r.col || '_snapshot');

    EXECUTE format($f$
      UPDATE %I.%I t
         SET %I = coalesce(t.%I,
                    coalesce(p.display_name, p.full_name, p.username, t.%I::text)
                    || ' (@' || coalesce(p.username,'?') || ')')
        FROM public.profiles p
       WHERE t.%I = p.id AND t.%I = ANY($1)
    $f$, r.sch, r.tbl, r.col || '_snapshot', r.col || '_snapshot', r.col, r.col, r.col)
    USING p_ids;

    -- FK phải nullable mới giữ được dòng.
    SELECT a.attnotnull INTO v_notnull
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = r.sch AND c.relname = r.tbl AND a.attname = r.col;

    IF v_notnull THEN
      BEGIN
        EXECUTE format('ALTER TABLE %I.%I ALTER COLUMN %I DROP NOT NULL', r.sch, r.tbl, r.col);
      EXCEPTION WHEN others THEN
        -- Không nới được (khoá chính…) → bỏ qua, pass xoá phía dưới lo nốt.
        CONTINUE;
      END;
    END IF;

    EXECUTE format('UPDATE %I.%I SET %I = NULL WHERE %I = ANY($1)',
                   r.sch, r.tbl, r.col, r.col) USING p_ids;
  END LOOP;

  -- ---------- 2b) BẢNG DỮ LIỆU THƯỜNG: xoá dòng, nhiều pass ----------
  FOR v_pass IN 1..5 LOOP
    v_left := 0;
    FOR r IN
      SELECT ns.nspname AS sch, cl.relname AS tbl, att.attname AS col
        FROM pg_constraint con
        JOIN pg_class cl       ON cl.oid = con.conrelid
        JOIN pg_namespace ns   ON ns.oid = cl.relnamespace
        JOIN pg_class rcl      ON rcl.oid = con.confrelid
        JOIN pg_namespace rns  ON rns.oid = rcl.relnamespace
        JOIN LATERAL unnest(con.conkey) AS k(attnum) ON true
        JOIN pg_attribute att  ON att.attrelid = cl.oid AND att.attnum = k.attnum
       WHERE con.contype = 'f'
         AND array_length(con.conkey,1) = 1
         AND ((rns.nspname='public' AND rcl.relname='profiles')
              OR (rns.nspname='auth' AND rcl.relname='users'))
         AND ns.nspname = 'public'
         AND cl.relname <> 'profiles'
         AND cl.relkind = 'r'
    LOOP
      BEGIN
        EXECUTE format('DELETE FROM %I.%I WHERE %I = ANY($1)', r.sch, r.tbl, r.col)
        USING p_ids;
      EXCEPTION WHEN others THEN
        GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
        v_left := v_left + 1;   -- bảng con chặn → thử lại ở pass sau
      END;
    END LOOP;
    EXIT WHEN v_left = 0;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_purge_account_refs(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_purge_account_refs(uuid[]) TO authenticated;

-- Xoá NHIỀU (cũng là lõi cho xoá 1 và xoá tất cả).
CREATE OR REPLACE FUNCTION public.admin_delete_internal_accounts(p_ids uuid[])
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ids uuid[]; n int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;

  SELECT array_agg(pr.id) INTO v_ids
    FROM public.profiles pr
   WHERE pr.id = ANY(coalesce(p_ids,'{}'))
     AND pr.account_source = 'internal'
     AND coalesce(pr.is_admin,false) = false;

  IF v_ids IS NULL THEN RETURN 0; END IF;
  n := array_length(v_ids,1);

  PERFORM public.admin_purge_account_refs(v_ids);

  DELETE FROM public.profiles pr WHERE pr.id = ANY(v_ids);
  DELETE FROM auth.users au      WHERE au.id = ANY(v_ids);
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_internal_accounts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_internal_accounts(uuid[]) TO authenticated;

-- Xoá 1.
CREATE OR REPLACE FUNCTION public.admin_delete_internal_account(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.admin_delete_internal_accounts(ARRAY[p_id]);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_internal_account(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_internal_account(uuid) TO authenticated;

-- Xoá TẤT CẢ — chạy theo lô 500 để không nổ statement timeout.
CREATE OR REPLACE FUNCTION public.admin_delete_all_internal_accounts(p_confirm text)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_batch uuid[]; n int := 0; k int;
BEGIN
  IF NOT public._is_super_admin() THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
  IF upper(trim(coalesce(p_confirm,''))) <> 'DELETE ALL' THEN
    RAISE EXCEPTION 'Xác nhận không hợp lệ' USING ERRCODE='22023';
  END IF;

  LOOP
    SELECT array_agg(id) INTO v_batch FROM (
      SELECT pr.id FROM public.profiles pr
       WHERE pr.account_source='internal' AND coalesce(pr.is_admin,false)=false
       LIMIT 500
    ) s;
    EXIT WHEN v_batch IS NULL;

    k := public.admin_delete_internal_accounts(v_batch);
    EXIT WHEN k = 0;         -- không tiến triển → dừng, tránh vòng lặp vô hạn
    n := n + k;
  END LOOP;

  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_all_internal_accounts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_all_internal_accounts(text) TO authenticated;

-- =====================================================================
-- XONG. Không cần chạy gì thêm ở Supabase #2 / #3.
-- =====================================================================
