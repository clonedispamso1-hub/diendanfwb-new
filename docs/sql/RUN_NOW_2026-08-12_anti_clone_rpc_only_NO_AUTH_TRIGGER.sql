-- =====================================================================
-- ANTI CLONE LOCK — RPC-ONLY (KHÔNG DÙNG TRIGGER TRÊN auth.users)
-- File: RUN_NOW_2026-08-12_anti_clone_rpc_only_NO_AUTH_TRIGGER.sql
-- Ngày: 2026-08-12
--
-- LÝ DO
--   Supabase Cloud không cho phép CREATE TRIGGER / ALTER TABLE trên
--   auth.users (ERROR 42501: must be owner of table users).
--   File này thay thế hoàn toàn file
--   RUN_NOW_2026-08-12_auth_registration_gate_FULL.sql.
--
-- KIẾN TRÚC MỚI (chỉ dùng những gì Supabase Cloud cho phép)
--   1) Frontend gọi RPC public.registration_gate() TRƯỚC supabase.auth.signUp().
--      Nếu blocked = true → KHÔNG gọi signUp().
--   2) Sau khi đăng nhập, frontend gọi RPC public.security_gate().
--   3) AccessGate tiếp tục gọi security_gate() định kỳ / khi focus tab.
--   4) Toàn bộ dữ liệu khóa nằm trong blocked_devices / blocked_ips /
--      blocked_cookies / device_accounts và được quyết định trong RPC.
--   KHÔNG ALTER auth.users. KHÔNG CREATE TRIGGER trên auth.users.
--   KHÔNG ENABLE TRIGGER trên auth.users.
--
-- PHỤ THUỘC
--   KHÔNG. Chạy độc lập. Các bảng sau phải tồn tại (đã có trong DB):
--     public.profiles, public.blocked_ips, public.blocked_devices,
--     public.blocked_cookies, public.device_accounts
--
-- AN TOÀN
--   Không đổi URL / API key, không xoá hay sửa dữ liệu hiện có.
--   Idempotent: chạy lại nhiều lần đều được.
--
-- CÁCH CHẠY
--   Supabase SQL Editor: dán TOÀN BỘ file, bấm Run (một lần, không cắt).
--   psql: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
--           -f docs/sql/RUN_NOW_2026-08-12_anti_clone_rpc_only_NO_AUTH_TRIGGER.sql
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) Tiền kiểm tra: bảng bắt buộc phải tồn tại
-- ---------------------------------------------------------------------
DO $do$
DECLARE
  v_missing text;
BEGIN
  SELECT string_agg(t.name, ', ' ORDER BY t.name)
    INTO v_missing
  FROM (VALUES
    ('profiles'),
    ('blocked_ips'),
    ('blocked_devices'),
    ('blocked_cookies'),
    ('device_accounts')
  ) AS t(name)
  WHERE to_regclass('public.' || t.name) IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Thiếu bảng bắt buộc trong schema public: %', v_missing
      USING ERRCODE = 'P0001';
  END IF;
END
$do$;

-- ---------------------------------------------------------------------
-- 1) Helper: IP công cộng hợp lệ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_valid_public_ip(p_ip text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $fn$
  SELECT p_ip IS NOT NULL
     AND btrim(p_ip) <> ''
     AND btrim(p_ip) !~ '^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe80)';
$fn$;

GRANT EXECUTE ON FUNCTION public.is_valid_public_ip(text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2) security_gate — kiểm tra IP / thiết bị / cookie / trạng thái khoá
--    Dùng: khi mở web, sau khi đăng nhập, và AccessGate kiểm tra định kỳ.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.security_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip          text DEFAULT NULL,
  p_cookie      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_until  timestamptz;
  v_reason text;
  v_admin  boolean := false;
  v_level  int;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(is_admin, false)
      INTO v_admin
      FROM public.profiles
     WHERE id = v_uid;
  END IF;

  IF v_admin THEN
    RETURN jsonb_build_object('blocked', false, 'admin', true);
  END IF;

  IF NOT public.is_valid_public_ip(p_ip) THEN
    RETURN jsonb_build_object(
      'blocked', true, 'scope', 'ip', 'level', 3,
      'reason', 'public_ip_unavailable',
      'message', 'Thiết bị hoặc mạng của bạn đã bị khóa.'
    );
  END IF;

  SELECT b.expires_at, b.reason, COALESCE(b.level, 3)
    INTO v_until, v_reason, v_level
    FROM public.blocked_ips b
   WHERE b.ip = btrim(p_ip)
     AND (b.expires_at IS NULL OR b.expires_at > now())
   ORDER BY b.created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'blocked', true, 'scope', 'ip', 'level', v_level,
      'until', v_until, 'reason', v_reason,
      'message', 'Thiết bị hoặc mạng của bạn đã bị khóa.'
    );
  END IF;

  SELECT b.expires_at, b.reason, COALESCE(b.level, 2)
    INTO v_until, v_reason, v_level
    FROM public.blocked_devices b
   WHERE p_fingerprint IS NOT NULL
     AND b.fingerprint = p_fingerprint
     AND (b.expires_at IS NULL OR b.expires_at > now())
   ORDER BY b.created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'blocked', true, 'scope', 'device', 'level', v_level,
      'until', v_until, 'reason', v_reason,
      'message', 'Thiết bị hoặc mạng của bạn đã bị khóa.'
    );
  END IF;

  SELECT b.expires_at, b.reason, COALESCE(b.level, 2)
    INTO v_until, v_reason, v_level
    FROM public.blocked_cookies b
   WHERE p_cookie IS NOT NULL
     AND b.cookie_id = p_cookie
     AND (b.expires_at IS NULL OR b.expires_at > now())
   ORDER BY b.created_at DESC
   LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'blocked', true, 'scope', 'cookie', 'level', v_level,
      'until', v_until, 'reason', v_reason,
      'message', 'Thiết bị hoặc mạng của bạn đã bị khóa.'
    );
  END IF;

  IF v_uid IS NOT NULL THEN
    SELECT p.banned_until, p.ban_reason, COALESCE(p.ban_level, 0)
      INTO v_until, v_reason, v_level
      FROM public.profiles p
     WHERE p.id = v_uid
       AND COALESCE(p.is_admin, false) = false
       AND (COALESCE(p.ban_level, 0) > 0 OR COALESCE(p.is_banned, false) = true)
       AND (p.banned_until IS NULL OR p.banned_until > now());
    IF FOUND THEN
      RETURN jsonb_build_object(
        'blocked', true, 'scope', 'member', 'level', v_level,
        'until', v_until, 'reason', v_reason,
        'message', 'Thiết bị hoặc mạng của bạn đã bị khóa.'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('blocked', false);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.security_gate(text, text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) registration_gate — cổng chặn lúc đăng ký (fail-closed)
--    Frontend PHẢI gọi hàm này trước supabase.auth.signUp().
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registration_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip          text DEFAULT NULL,
  p_cookie      text DEFAULT NULL,
  p_phone       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v jsonb;
BEGIN
  v := public.security_gate(p_fingerprint, p_ip, p_cookie);

  IF COALESCE((v->>'blocked')::boolean, true) THEN
    RETURN v;
  END IF;

  IF p_fingerprint IS NULL
     OR p_cookie IS NULL
     OR NOT public.is_valid_public_ip(p_ip) THEN
    RETURN jsonb_build_object(
      'blocked', true, 'scope', 'device', 'level', 3,
      'reason', 'identity_signal_missing',
      'message', 'Thiết bị hoặc mạng của bạn đã bị khóa.'
    );
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.device_accounts d
      JOIN public.profiles p ON p.id = d.user_id
     WHERE (d.fingerprint = p_fingerprint OR d.cookie_id = p_cookie OR d.ip = btrim(p_ip))
       AND COALESCE(p.is_admin, false) = false
       AND (COALESCE(p.ban_level, 0) > 0 OR COALESCE(p.is_banned, false) = true)
       AND (p.banned_until IS NULL OR p.banned_until > now())
  ) THEN
    RETURN jsonb_build_object(
      'blocked', true, 'scope', 'device', 'level', 3,
      'reason', 'banned_identity_reuse',
      'message', 'Thiết bị hoặc mạng của bạn đã bị khóa.'
    );
  END IF;

  RETURN jsonb_build_object('blocked', false);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.registration_gate(text, text, text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Lớp chặn phía DB (thay cho trigger auth.users):
--    profiles là bảng public → được phép tạo trigger.
--    Nếu thiết bị / IP / cookie đang bị khóa thì profile mới bị chặn,
--    tài khoản auth vừa tạo sẽ không dùng được.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_registration_gate_on_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_claims jsonb := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
  v_fp     text;
  v_ip     text;
  v_cookie text;
  v_gate   jsonb;
BEGIN
  -- Thao tác quản trị tin cậy (service_role) và luồng bypass nội bộ: bỏ qua.
  IF COALESCE(v_claims->>'role', '') = 'service_role'
     OR COALESCE(current_setting('app.bypass_device_limit', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  v_fp     := NULLIF(btrim(COALESCE(v_claims->'user_metadata'->>'anti_clone_fingerprint', '')), '');
  v_ip     := NULLIF(btrim(COALESCE(v_claims->'user_metadata'->>'anti_clone_ip', '')), '');
  v_cookie := NULLIF(btrim(COALESCE(v_claims->'user_metadata'->>'anti_clone_cookie', '')), '');

  -- Không có tín hiệu thiết bị trong JWT (ví dụ profile tạo bởi trigger nội bộ)
  -- thì không chặn ở đây; registration_gate phía trước đã kiểm tra.
  IF v_fp IS NULL AND v_ip IS NULL AND v_cookie IS NULL THEN
    RETURN NEW;
  END IF;

  v_gate := public.security_gate(v_fp, v_ip, v_cookie);

  IF COALESCE((v_gate->>'blocked')::boolean, false) THEN
    RAISE EXCEPTION 'anti_clone_blocked'
      USING ERRCODE = 'P0001',
            DETAIL  = 'Thiết bị hoặc mạng của bạn đã bị khóa.';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_profiles_registration_gate ON public.profiles;

CREATE TRIGGER trg_profiles_registration_gate
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.enforce_registration_gate_on_profile();

-- ---------------------------------------------------------------------
-- 5) Dọn dẹp kiến trúc cũ (nếu trước đây đã tạo được trên auth.users).
--    Bọc trong khối bắt lỗi để không fail khi thiếu quyền owner.
-- ---------------------------------------------------------------------
DO $do$
BEGIN
  BEGIN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_auth_registration_gate ON auth.users';
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'Bỏ qua drop trigger auth.users (không có quyền owner) — đúng như mong đợi trên Supabase Cloud.';
  END;
END
$do$;

DROP FUNCTION IF EXISTS public.enforce_registration_gate_on_auth_user();

COMMIT;

-- ---------------------------------------------------------------------
-- 6) VERIFY (chạy sau khi COMMIT)
-- ---------------------------------------------------------------------

-- 6.1 Không còn trigger nào của hệ thống này trên auth.users (phải trả 0 dòng).
SELECT tgname, tgrelid::regclass AS table_name, tgenabled
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname = 'trg_auth_registration_gate';

-- 6.2 Trigger trên public.profiles phải tồn tại và bật (tgenabled = 'O').
SELECT tgname, tgrelid::regclass AS table_name, tgenabled
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname = 'trg_profiles_registration_gate';

-- 6.3 Ba RPC phải tồn tại.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_valid_public_ip', 'security_gate', 'registration_gate')
ORDER BY p.proname;
