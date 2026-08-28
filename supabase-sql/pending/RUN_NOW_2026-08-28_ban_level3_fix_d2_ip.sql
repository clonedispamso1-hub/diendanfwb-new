-- =====================================================================
-- FIX MỨC 3 — "column d2.ip does not exist"
-- Chạy 1 lần trên Supabase #1 (SQL Editor). Idempotent, additive.
--
-- Nguyên nhân: admin_anti_clone_purge tham chiếu public.device_accounts.ip
-- (alias d2.ip) trong vòng lặp chặn IP. Trên schema hiện tại bảng
-- device_accounts KHÔNG có cột ip → hàm văng lỗi ngay khi bấm Mức 3.
--
-- Bản vá:
--   * Nguồn IP: p_ip (IP request thật) + profiles.last_ip +
--     device_registrations.ip / device_accounts.ip CHỈ khi cột tồn tại
--     (dò động qua information_schema, không còn hard-code).
--   * Mọi truy vấn IP đều bọc EXCEPTION → không có IP vẫn KHÔNG crash.
--   * Mức 3 vẫn: khóa tài khoản + ép đăng xuất + ẩn bài viết +
--     blacklist SĐT + blocked_ips + blocked_devices + blocked_cookies.
--   * KHÔNG xoá dữ liệu tài khoản (vẫn mở khóa được ở tab "Đã khóa").
-- =====================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned  boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_level  int     NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at  timestamptz;

-- Helper: cột có tồn tại không? (dùng để dò schema an toàn)
CREATE OR REPLACE FUNCTION public.ac_has_column(p_table text, p_column text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = p_table AND column_name = p_column
  );
$$;
GRANT EXECUTE ON FUNCTION public.ac_has_column(text, text) TO authenticated;

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
  v_phone_bl  boolean := false;
  v_ip_block  boolean := false;
  v_dev_block boolean := false;
  v_ips       text[] := '{}';
  v_fps       text[] := '{}';
  v_cks       text[] := '{}';
  v_more      text[];
  v_x         text;
  v_shared    boolean;
BEGIN
  IF NOT public.mi_is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user IS NULL OR p_level IS NULL OR p_level NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'invalid_purge_request' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user) THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND COALESCE(is_admin,false)) THEN
    RAISE EXCEPTION 'cannot_purge_admin' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.phone INTO v_phone FROM public.profiles p WHERE p.id = p_user;
  v_norm := public.ac_normalize_phone(v_phone);

  ------------------------------------------------------------------ MỨC 1+
  UPDATE public.profiles
     SET is_banned  = true,
         ban_level  = GREATEST(COALESCE(ban_level,0), p_level),
         ban_reason = v_reason,
         banned_at  = now()
   WHERE id = p_user;

  BEGIN
    INSERT INTO public.forced_logouts (user_id, reason) VALUES (p_user, v_reason);
  EXCEPTION WHEN others THEN NULL; END;

  IF to_regclass('public.posts') IS NOT NULL THEN
    BEGIN
      EXECUTE 'UPDATE public.posts SET is_hidden = true WHERE user_id = $1' USING p_user;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  BEGIN
    INSERT INTO public.member_activity_log (user_id, action, detail)
    VALUES (p_user, 'anti_clone_lock', 'Anti clone mức ' || p_level || ' — ' || v_reason);
  EXCEPTION WHEN others THEN NULL; END;

  ------------------------------------------------------------------ MỨC 2+
  IF p_level >= 2 AND v_norm IS NOT NULL THEN
    BEGIN
      INSERT INTO public.phone_blacklist (phone, reason, level, blocked_user_id, created_by)
      SELECT v_norm, v_reason, p_level, p_user, v_admin_id
       WHERE NOT EXISTS (SELECT 1 FROM public.phone_blacklist b
                          WHERE public.ac_normalize_phone(b.phone) = v_norm);
      UPDATE public.phone_blacklist
         SET reason = v_reason, level = GREATEST(COALESCE(level,0), p_level),
             blocked_user_id = p_user, created_by = v_admin_id, expires_at = NULL
       WHERE public.ac_normalize_phone(phone) = v_norm;
      v_phone_bl := true;
    EXCEPTION WHEN others THEN v_phone_bl := false; END;
  END IF;

  ------------------------------------------------------------------ MỨC 3
  IF p_level >= 3 THEN
    -- 1) IP từ request thật (client gửi lên)
    IF public.is_valid_public_ip(p_ip) THEN v_ips := array_append(v_ips, btrim(p_ip)); END IF;

    -- 2) IP gần nhất lưu trên hồ sơ (profiles.last_ip) — nếu cột tồn tại
    IF public.ac_has_column('profiles', 'last_ip') THEN
      BEGIN
        EXECUTE 'SELECT ARRAY(SELECT btrim(p.last_ip::text) FROM public.profiles p
                   WHERE p.id = $1 AND public.is_valid_public_ip(p.last_ip::text))'
          INTO v_more USING p_user;
        v_ips := v_ips || COALESCE(v_more, '{}'::text[]);
      EXCEPTION WHEN others THEN NULL; END;
    END IF;

    -- 3) IP lịch sử — chỉ khi bảng/cột thật sự có (KHÔNG hard-code d2.ip nữa)
    IF to_regclass('public.device_registrations') IS NOT NULL
       AND public.ac_has_column('device_registrations', 'ip') THEN
      BEGIN
        EXECUTE 'SELECT ARRAY(SELECT DISTINCT btrim(d.ip::text) FROM public.device_registrations d
                   WHERE d.user_id = $1 AND public.is_valid_public_ip(d.ip::text))'
          INTO v_more USING p_user;
        v_ips := v_ips || COALESCE(v_more, '{}'::text[]);
      EXCEPTION WHEN others THEN NULL; END;
    END IF;

    IF to_regclass('public.device_accounts') IS NOT NULL
       AND public.ac_has_column('device_accounts', 'ip') THEN
      BEGIN
        EXECUTE 'SELECT ARRAY(SELECT DISTINCT btrim(d.ip::text) FROM public.device_accounts d
                   WHERE d.user_id = $1 AND public.is_valid_public_ip(d.ip::text))'
          INTO v_more USING p_user;
        v_ips := v_ips || COALESCE(v_more, '{}'::text[]);
      EXCEPTION WHEN others THEN NULL; END;
    END IF;

    -- 4) Fingerprint / cookie: từ tham số + device_accounts (nếu có)
    IF NULLIF(btrim(COALESCE(p_fingerprint,'')),'') IS NOT NULL THEN
      v_fps := array_append(v_fps, btrim(p_fingerprint));
    END IF;
    IF NULLIF(btrim(COALESCE(p_cookie,'')),'') IS NOT NULL THEN
      v_cks := array_append(v_cks, btrim(p_cookie));
    END IF;

    IF to_regclass('public.device_accounts') IS NOT NULL THEN
      IF public.ac_has_column('device_accounts', 'fingerprint') THEN
        BEGIN
          EXECUTE 'SELECT ARRAY(SELECT DISTINCT btrim(d.fingerprint) FROM public.device_accounts d
                     WHERE d.user_id = $1 AND NULLIF(btrim(COALESCE(d.fingerprint,'''')),'''') IS NOT NULL)'
            INTO v_more USING p_user;
          v_fps := v_fps || COALESCE(v_more, '{}'::text[]);
        EXCEPTION WHEN others THEN NULL; END;
      END IF;
      IF public.ac_has_column('device_accounts', 'cookie_id') THEN
        BEGIN
          EXECUTE 'SELECT ARRAY(SELECT DISTINCT btrim(d.cookie_id) FROM public.device_accounts d
                     WHERE d.user_id = $1 AND NULLIF(btrim(COALESCE(d.cookie_id,'''')),'''') IS NOT NULL)'
            INTO v_more USING p_user;
          v_cks := v_cks || COALESCE(v_more, '{}'::text[]);
        EXCEPTION WHEN others THEN NULL; END;
      END IF;
    END IF;

    v_ips := ARRAY(SELECT DISTINCT x FROM unnest(v_ips) AS x WHERE x IS NOT NULL AND x <> '');
    v_fps := ARRAY(SELECT DISTINCT x FROM unnest(v_fps) AS x WHERE x IS NOT NULL AND x <> '');
    v_cks := ARRAY(SELECT DISTINCT x FROM unnest(v_cks) AS x WHERE x IS NOT NULL AND x <> '');

    -- IP: bỏ qua IP đang được tài khoản KHÁC (chưa bị khóa) sử dụng.
    FOREACH v_x IN ARRAY v_ips LOOP
      v_shared := false;
      IF public.ac_has_column('profiles', 'last_ip') THEN
        BEGIN
          EXECUTE 'SELECT EXISTS(SELECT 1 FROM public.profiles p
                     WHERE p.id <> $1 AND btrim(p.last_ip::text) = $2
                       AND COALESCE(p.is_banned,false) = false)'
            INTO v_shared USING p_user, v_x;
        EXCEPTION WHEN others THEN v_shared := false; END;
      END IF;
      CONTINUE WHEN v_shared;

      BEGIN
        INSERT INTO public.blocked_ips (ip, reason, level, blocked_user_id, created_by)
        SELECT v_x, v_reason, 3, p_user, v_admin_id
         WHERE NOT EXISTS (SELECT 1 FROM public.blocked_ips WHERE ip = v_x);
        UPDATE public.blocked_ips
           SET reason = v_reason, level = 3, blocked_user_id = p_user,
               created_by = v_admin_id, expires_at = NULL
         WHERE ip = v_x;
        v_ip_block := true;
      EXCEPTION WHEN others THEN NULL; END;
    END LOOP;

    -- Fingerprint thiết bị
    FOREACH v_x IN ARRAY v_fps LOOP
      BEGIN
        INSERT INTO public.blocked_devices (fingerprint, reason, level, blocked_user_id, created_by)
        SELECT v_x, v_reason, 3, p_user, v_admin_id
         WHERE NOT EXISTS (SELECT 1 FROM public.blocked_devices WHERE fingerprint = v_x);
        UPDATE public.blocked_devices
           SET reason = v_reason, level = 3, blocked_user_id = p_user,
               created_by = v_admin_id, expires_at = NULL
         WHERE fingerprint = v_x;
        v_dev_block := true;
      EXCEPTION WHEN others THEN NULL; END;
    END LOOP;

    -- Cookie thiết bị
    FOREACH v_x IN ARRAY v_cks LOOP
      BEGIN
        INSERT INTO public.blocked_cookies (cookie_id, reason, level, blocked_user_id, created_by)
        SELECT v_x, v_reason, 3, p_user, v_admin_id
         WHERE NOT EXISTS (SELECT 1 FROM public.blocked_cookies WHERE cookie_id = v_x);
        UPDATE public.blocked_cookies
           SET reason = v_reason, level = 3, blocked_user_id = p_user,
               created_by = v_admin_id, expires_at = NULL
         WHERE cookie_id = v_x;
        v_dev_block := true;
      EXCEPTION WHEN others THEN NULL; END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'level', p_level,
    'deleted', false,
    'phone_blacklisted', v_phone_bl,
    'ip_blocked', v_ip_block,
    'device_blocked', v_dev_block
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_anti_clone_purge(uuid,int,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_anti_clone_purge(uuid,int,text,text,text,text) TO authenticated;
