-- =====================================================================
-- ANTI CLONE / SPAM — PURGE MỨC 1 / 2 / 3 + SECURITY GATE
-- File: docs/sql/20260824090000_anti_clone_purge_and_gate.sql
--
-- Bổ sung RPC còn thiếu mà UI đang gọi:
--   public.admin_anti_clone_purge(p_user, p_level, p_reason, p_ip,
--                                 p_fingerprint, p_cookie) -> jsonb
--
-- CÁCH CHẠY: copy toàn bộ file này, dán vào SQL Editor của Supabase #1
-- (DB đang dùng) rồi Run. KHÔNG đổi URL / API key, không tạo project mới.
-- An toàn khi chạy lại nhiều lần (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Bảng hỗ trợ — chỉ tạo khi chưa tồn tại, không đụng bảng có sẵn.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.phone_blacklist (
  phone           text PRIMARY KEY,
  reason          text,
  level           int  NOT NULL DEFAULT 2,
  blocked_user_id uuid,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

CREATE TABLE IF NOT EXISTS public.blocked_ips (
  ip              text PRIMARY KEY,
  reason          text,
  level           int  NOT NULL DEFAULT 3,
  blocked_user_id uuid,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

CREATE TABLE IF NOT EXISTS public.blocked_devices (
  fingerprint     text PRIMARY KEY,
  reason          text,
  level           int  NOT NULL DEFAULT 3,
  blocked_user_id uuid,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

CREATE TABLE IF NOT EXISTS public.blocked_cookies (
  cookie_id       text PRIMARY KEY,
  reason          text,
  level           int  NOT NULL DEFAULT 3,
  blocked_user_id uuid,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz
);

-- Bảng có thể đã tồn tại từ trước với ít cột hơn → bổ sung cột còn thiếu.
DO $$
DECLARE t text; c text;
BEGIN
  FOREACH t IN ARRAY ARRAY['phone_blacklist','blocked_ips','blocked_devices','blocked_cookies'] LOOP
    FOREACH c IN ARRAY ARRAY[
      'reason text', 'level int', 'blocked_user_id uuid', 'created_by uuid',
      'created_at timestamptz DEFAULT now()', 'expires_at timestamptz'
    ] LOOP
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %s', t, c);
    END LOOP;
  END LOOP;
END $$;

-- Bảng chặn là dữ liệu quản trị: bật RLS, client thường không đọc trực tiếp.
-- Mọi truy cập đi qua các hàm SECURITY DEFINER bên dưới.
ALTER TABLE public.phone_blacklist  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_ips      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_devices  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_cookies  ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.phone_blacklist, public.blocked_ips,
                public.blocked_devices, public.blocked_cookies TO authenticated;
GRANT ALL    ON public.phone_blacklist, public.blocked_ips,
                public.blocked_devices, public.blocked_cookies TO service_role;

-- ---------------------------------------------------------------------
-- 1) Helper
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mi_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = auth.uid() AND COALESCE(p.is_admin,false));
$$;
GRANT EXECUTE ON FUNCTION public.mi_is_admin() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='phone_blacklist' AND policyname='admin_read_phone_blacklist') THEN
    CREATE POLICY admin_read_phone_blacklist ON public.phone_blacklist
      FOR SELECT TO authenticated USING (public.mi_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='blocked_ips' AND policyname='admin_read_blocked_ips') THEN
    CREATE POLICY admin_read_blocked_ips ON public.blocked_ips
      FOR SELECT TO authenticated USING (public.mi_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='blocked_devices' AND policyname='admin_read_blocked_devices') THEN
    CREATE POLICY admin_read_blocked_devices ON public.blocked_devices
      FOR SELECT TO authenticated USING (public.mi_is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='blocked_cookies' AND policyname='admin_read_blocked_cookies') THEN
    CREATE POLICY admin_read_blocked_cookies ON public.blocked_cookies
      FOR SELECT TO authenticated USING (public.mi_is_admin());
  END IF;
END $$;

-- Chuẩn hoá SĐT: chỉ giữ chữ số, đổi mã 84 thành 0.
CREATE OR REPLACE FUNCTION public.ac_normalize_phone(p_phone text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT CASE
    WHEN p_phone IS NULL OR btrim(p_phone) = '' THEN NULL
    ELSE regexp_replace(
           regexp_replace(regexp_replace(p_phone, '\D', '', 'g'), '^84', '0'),
           '^0+', '0')
  END;
$$;
GRANT EXECUTE ON FUNCTION public.ac_normalize_phone(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_valid_public_ip(p_ip text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT p_ip IS NOT NULL
     AND btrim(p_ip) <> ''
     AND btrim(p_ip) !~ '^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|0\.|::1$|fc|fd|fe80)';
$$;
GRANT EXECUTE ON FUNCTION public.is_valid_public_ip(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_phone_blacklisted(p_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.phone_blacklist b
     WHERE public.ac_normalize_phone(b.phone) = public.ac_normalize_phone(p_phone)
       AND (b.expires_at IS NULL OR b.expires_at > now())
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_phone_blacklisted(text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) RPC chính — XỬ LÝ MỨC 1 / 2 / 3
--    Mức 1: xoá tài khoản, giải phóng SĐT (không blacklist).
--    Mức 2: xoá tài khoản + blacklist SĐT.
--    Mức 3: xoá tài khoản + blacklist SĐT + block IP + fingerprint/cookie.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_anti_clone_purge(
  p_user        uuid,
  p_level       int,
  p_reason      text DEFAULT NULL,
  p_ip          text DEFAULT NULL,
  p_fingerprint text DEFAULT NULL,
  p_cookie      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_id  uuid := auth.uid();
  v_reason    text := COALESCE(NULLIF(btrim(p_reason), ''), 'anti_clone_level_' || p_level);
  v_phone     text;
  v_norm      text;
  v_deleted   boolean := false;
  v_phone_bl  boolean := false;
  v_ip_block  boolean := false;
  v_dev_block boolean := false;
  v_ips       text[] := '{}';
  v_fps       text[] := '{}';
  v_cks       text[] := '{}';
  v_x         text;
BEGIN
  IF NOT public.mi_is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user IS NULL OR p_level IS NULL OR p_level NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'invalid_purge_request' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND COALESCE(is_admin,false)) THEN
    RAISE EXCEPTION 'cannot_purge_admin' USING ERRCODE = 'P0001';
  END IF;

  -- 2.1 Thu thập dữ liệu nhận dạng TRƯỚC khi xoá.
  SELECT p.phone INTO v_phone FROM public.profiles p WHERE p.id = p_user;
  IF v_phone IS NULL THEN
    BEGIN
      SELECT u.phone INTO v_phone FROM auth.users u WHERE u.id = p_user;
    EXCEPTION WHEN others THEN v_phone := NULL;
    END;
  END IF;
  v_norm := public.ac_normalize_phone(v_phone);

  IF public.is_valid_public_ip(p_ip) THEN
    v_ips := array_append(v_ips, btrim(p_ip));
  END IF;
  IF p_fingerprint IS NOT NULL AND btrim(p_fingerprint) <> '' THEN
    v_fps := array_append(v_fps, btrim(p_fingerprint));
  END IF;
  IF p_cookie IS NOT NULL AND btrim(p_cookie) <> '' THEN
    v_cks := array_append(v_cks, btrim(p_cookie));
  END IF;

  -- Gộp thêm mọi tín hiệu thiết bị đã ghi nhận của tài khoản này.
  BEGIN
    SELECT v_ips || COALESCE(array_agg(DISTINCT btrim(d.ip))
                      FILTER (WHERE public.is_valid_public_ip(d.ip)), '{}'::text[]),
           v_fps || COALESCE(array_agg(DISTINCT btrim(d.fingerprint))
                      FILTER (WHERE d.fingerprint IS NOT NULL AND btrim(d.fingerprint) <> ''), '{}'::text[]),
           v_cks || COALESCE(array_agg(DISTINCT btrim(d.cookie_id))
                      FILTER (WHERE d.cookie_id IS NOT NULL AND btrim(d.cookie_id) <> ''), '{}'::text[])
      INTO v_ips, v_fps, v_cks
      FROM public.device_accounts d
     WHERE d.user_id = p_user;
  EXCEPTION WHEN others THEN NULL; -- bảng device_accounts có thể không tồn tại
  END;

  -- 2.2 Mức >= 2: blacklist SĐT.
  IF p_level >= 2 AND v_norm IS NOT NULL THEN
    INSERT INTO public.phone_blacklist (phone, reason, level, blocked_user_id, created_by)
    SELECT v_norm, v_reason, p_level, p_user, v_admin_id
     WHERE NOT EXISTS (SELECT 1 FROM public.phone_blacklist b
                        WHERE public.ac_normalize_phone(b.phone) = v_norm);
    UPDATE public.phone_blacklist
       SET reason = v_reason, level = GREATEST(COALESCE(level,0), p_level),
           blocked_user_id = p_user, created_by = v_admin_id, expires_at = NULL
     WHERE public.ac_normalize_phone(phone) = v_norm;
    v_phone_bl := true;
  END IF;

  -- 2.3 Mức 3: block IP + fingerprint + cookie.
  IF p_level >= 3 THEN
    FOREACH v_x IN ARRAY v_ips LOOP
      INSERT INTO public.blocked_ips (ip, reason, level, blocked_user_id, created_by)
      SELECT v_x, v_reason, 3, p_user, v_admin_id
       WHERE NOT EXISTS (SELECT 1 FROM public.blocked_ips WHERE ip = v_x);
      UPDATE public.blocked_ips
         SET reason = v_reason, level = 3, blocked_user_id = p_user,
             created_by = v_admin_id, expires_at = NULL
       WHERE ip = v_x;
      v_ip_block := true;
    END LOOP;

    FOREACH v_x IN ARRAY v_fps LOOP
      INSERT INTO public.blocked_devices (fingerprint, reason, level, blocked_user_id, created_by)
      SELECT v_x, v_reason, 3, p_user, v_admin_id
       WHERE NOT EXISTS (SELECT 1 FROM public.blocked_devices WHERE fingerprint = v_x);
      UPDATE public.blocked_devices
         SET reason = v_reason, level = 3, blocked_user_id = p_user,
             created_by = v_admin_id, expires_at = NULL
       WHERE fingerprint = v_x;
      v_dev_block := true;
    END LOOP;

    FOREACH v_x IN ARRAY v_cks LOOP
      INSERT INTO public.blocked_cookies (cookie_id, reason, level, blocked_user_id, created_by)
      SELECT v_x, v_reason, 3, p_user, v_admin_id
       WHERE NOT EXISTS (SELECT 1 FROM public.blocked_cookies WHERE cookie_id = v_x);
      UPDATE public.blocked_cookies
         SET reason = v_reason, level = 3, blocked_user_id = p_user,
             created_by = v_admin_id, expires_at = NULL
       WHERE cookie_id = v_x;
      v_dev_block := true;
    END LOOP;
  END IF;

  -- 2.4 Nhật ký + buộc đăng xuất (nếu bảng tồn tại), làm TRƯỚC khi xoá.
  BEGIN
    INSERT INTO public.forced_logouts (user_id, reason) VALUES (p_user, v_reason);
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    INSERT INTO public.member_activity_log (user_id, action, detail)
    VALUES (p_user, 'anti_clone_purge', 'Anti clone mức ' || p_level || ' — ' || v_reason);
  EXCEPTION WHEN others THEN NULL; END;

  -- 2.5 Đánh dấu khoá trước (giữ dấu vết nếu không xoá được vì FK lạ).
  BEGIN
    UPDATE public.profiles
       SET is_banned = true,
           ban_level = GREATEST(COALESCE(ban_level,0), p_level),
           ban_reason = v_reason,
           banned_at = now()
     WHERE id = p_user;
  EXCEPTION WHEN others THEN NULL; END;

  -- 2.6 Xoá tài khoản (cả 3 mức đều xoá, đúng mô tả trên UI).
  BEGIN DELETE FROM public.device_accounts WHERE user_id = p_user;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.profiles WHERE id = p_user;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    DELETE FROM auth.users WHERE id = p_user;
    v_deleted := true;
  EXCEPTION WHEN others THEN
    v_deleted := NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user);
  END;

  -- 2.7 Mức 1: SĐT phải được giải phóng hoàn toàn để đăng ký lại.
  IF p_level = 1 AND v_norm IS NOT NULL THEN
    BEGIN
      DELETE FROM public.phone_blacklist WHERE public.ac_normalize_phone(phone) = v_norm;
    EXCEPTION WHEN others THEN NULL; END;
    v_phone_bl := false;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'level', p_level,
    'deleted', v_deleted,
    'phone_blacklisted', v_phone_bl,
    'ip_blocked', v_ip_block,
    'device_blocked', v_dev_block
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_anti_clone_purge(uuid,int,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_anti_clone_purge(uuid,int,text,text,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) SECURITY GATE — chặn thiết bị / IP / cookie mức 3, fail-open.
--    Giữ đúng tinh thần bản 20260813170000 (không chặn oan, không
--    fail-closed) và bổ sung: IP + cookie bị block ở mức 3 sau khi
--    tài khoản đã bị xoá (profile không còn để suy ra ban_level).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.device_linked_to_level3(
  p_fingerprint text, p_ip text, p_cookie text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.device_accounts d
      JOIN public.profiles p ON p.id = d.user_id
     WHERE COALESCE(p.is_admin,false) = false
       AND COALESCE(p.ban_level,0) >= 3
       AND (
         (p_fingerprint IS NOT NULL AND d.fingerprint = p_fingerprint)
         OR (p_cookie IS NOT NULL AND d.cookie_id = p_cookie)
       )
  );
$$;
GRANT EXECUTE ON FUNCTION public.device_linked_to_level3(text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.security_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip          text DEFAULT NULL,
  p_cookie      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_admin  boolean := false;
  v_until  timestamptz;
  v_reason text;
  v_level  int;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(is_admin,false) INTO v_admin FROM public.profiles WHERE id = v_uid;
  END IF;
  IF v_admin THEN RETURN jsonb_build_object('blocked', false, 'admin', true); END IF;

  -- (a) fingerprint bị khoá ở mức 3
  SELECT b.expires_at, b.reason INTO v_until, v_reason
    FROM public.blocked_devices b
   WHERE p_fingerprint IS NOT NULL AND b.fingerprint = btrim(p_fingerprint)
     AND COALESCE(b.level,3) >= 3
     AND (b.expires_at IS NULL OR b.expires_at > now())
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('blocked',true,'scope','device','level',3,'until',v_until,
      'reason',v_reason,'message','Thiết bị của bạn đã bị khóa.');
  END IF;

  -- (b) cookie bị khoá ở mức 3
  SELECT b.expires_at, b.reason INTO v_until, v_reason
    FROM public.blocked_cookies b
   WHERE p_cookie IS NOT NULL AND b.cookie_id = btrim(p_cookie)
     AND COALESCE(b.level,3) >= 3
     AND (b.expires_at IS NULL OR b.expires_at > now())
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('blocked',true,'scope','cookie','level',3,'until',v_until,
      'reason',v_reason,'message','Thiết bị của bạn đã bị khóa.');
  END IF;

  -- (c) IP public bị khoá ở mức 3
  IF public.is_valid_public_ip(p_ip) THEN
    SELECT b.expires_at, b.reason INTO v_until, v_reason
      FROM public.blocked_ips b
     WHERE b.ip = btrim(p_ip) AND COALESCE(b.level,3) >= 3
       AND (b.expires_at IS NULL OR b.expires_at > now())
     LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('blocked',true,'scope','ip','level',3,'until',v_until,
        'reason',v_reason,'message','Thiết bị hoặc mạng của bạn đã bị khóa.');
    END IF;
  END IF;

  -- (d) thiết bị từng đăng nhập tài khoản ban_level >= 3 còn tồn tại
  IF public.device_linked_to_level3(NULLIF(btrim(p_fingerprint),''), NULL,
                                    NULLIF(btrim(p_cookie),'')) THEN
    RETURN jsonb_build_object('blocked',true,'scope','device','level',3,
      'reason','device_level3','message','Thiết bị của bạn đã bị khóa.');
  END IF;

  -- (e) tài khoản đang đăng nhập bị khoá mức 3
  IF v_uid IS NOT NULL THEN
    SELECT p.banned_until, p.ban_reason, COALESCE(p.ban_level,0)
      INTO v_until, v_reason, v_level
      FROM public.profiles p
     WHERE p.id = v_uid AND COALESCE(p.is_admin,false) = false
       AND COALESCE(p.ban_level,0) >= 3
       AND (p.banned_until IS NULL OR p.banned_until > now());
    IF FOUND THEN
      RETURN jsonb_build_object('blocked',true,'scope','member','level',v_level,'until',v_until,
        'reason',v_reason,'message','Tài khoản của bạn đã bị khóa.');
    END IF;
  END IF;

  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.security_gate(text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_device_access(
  p_fingerprint text DEFAULT NULL,
  p_ip          text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.security_gate(p_fingerprint, p_ip, NULL);
$$;
GRANT EXECUTE ON FUNCTION public.check_device_access(text,text) TO anon, authenticated;

-- Đăng ký: chặn khi gate chặn HOẶC SĐT nằm trong blacklist (mức 2 / 3).
CREATE OR REPLACE FUNCTION public.registration_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip          text DEFAULT NULL,
  p_cookie      text DEFAULT NULL,
  p_phone       text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.security_gate(p_fingerprint, p_ip, p_cookie);
  IF COALESCE((v->>'blocked')::boolean, false) THEN RETURN v; END IF;

  IF p_phone IS NOT NULL AND public.is_phone_blacklisted(p_phone) THEN
    RETURN jsonb_build_object('blocked',true,'scope','phone','level',2,
      'reason','phone_blacklisted',
      'message','Số điện thoại này không thể đăng ký tài khoản mới.');
  END IF;

  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.registration_gate(text,text,text,text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- KIỂM TRA SAU KHI CHẠY
-- =====================================================================
-- SELECT p.proname, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--  WHERE n.nspname = 'public'
--    AND p.proname IN ('admin_anti_clone_purge','security_gate','registration_gate',
--                      'check_device_access','is_phone_blacklisted');
-- SELECT public.security_gate('fp-test', '8.8.8.8', 'ck-test');   -- {"blocked": false}
-- SELECT public.registration_gate('fp-test','8.8.8.8','ck-test','0900000000');
