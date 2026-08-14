-- =====================================================================
-- BAN LEVEL 3 - THIET KE LAI THEO DANH TINH (KHONG IP, KHONG BLOCK OAN)
-- Ban FIXED: dung dollar-tag duy nhat cho tung function ($fn1$ ... $fn7$)
-- de tranh loi "unterminated quoted string" khi paste vao SQL Editor.
-- Chay truc tiep trong Supabase SQL Editor (project zbuwddjcqdlyijcunwgd).
-- Khong doi URL / API Key / bang du lieu. Chi sua logic khoa.
--
-- Nguyen tac:
--  1) KHONG bao gio chan theo IP / mang.
--  2) Chi chan TAI KHOAN thuoc cung mot nguoi dung voi tai khoan Level 3.
--  3) Fingerprint dung chung (>= 3 tai khoan khong bi ban) => khong tin cay.
--  4) Khach chua dang nhap KHONG bi chan.
--  5) admin = true luon duoc bo qua.
--  6) Fail-open: thieu du lieu / loi => cho phep.
--  7) Ha ban_level < 3 => tu dong go khoa thiet bi/cookie tuong ung.
-- =====================================================================

BEGIN;

-- 1) Van tay dung chung: gan voi >= 3 tai khoan KHONG bi ban khac nhau.
CREATE OR REPLACE FUNCTION public.fingerprint_is_shared(p_fingerprint text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn1$
  SELECT COALESCE((
    SELECT count(DISTINCT d.user_id) >= 3
    FROM public.device_accounts d
    JOIN public.profiles p ON p.id = d.user_id
    WHERE p_fingerprint IS NOT NULL
      AND d.fingerprint = p_fingerprint
      AND COALESCE(p.ban_level, 0) < 3
  ), false);
$fn1$;

GRANT EXECUTE ON FUNCTION public.fingerprint_is_shared(text) TO anon, authenticated;

-- 2) Tai khoan p_uid co thuoc cung danh tinh voi mot tai khoan Level 3 khong?
CREATE OR REPLACE FUNCTION public.account_linked_to_level3(
  p_uid uuid,
  p_fingerprint text DEFAULT NULL,
  p_cookie text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn2$
  WITH me AS (
    SELECT d.cookie_id, d.fingerprint
    FROM public.device_accounts d
    WHERE d.user_id = p_uid
    UNION
    SELECT p_cookie, p_fingerprint
  ),
  banned AS (
    SELECT d.cookie_id, d.fingerprint
    FROM public.device_accounts d
    JOIN public.profiles p ON p.id = d.user_id
    WHERE COALESCE(p.is_admin, false) = false
      AND COALESCE(p.ban_level, 0) >= 3
      AND d.user_id <> p_uid
  )
  SELECT EXISTS (
    SELECT 1
    FROM me
    JOIN banned b
      ON (me.cookie_id IS NOT NULL AND b.cookie_id IS NOT NULL AND me.cookie_id = b.cookie_id)
      OR (me.fingerprint IS NOT NULL AND b.fingerprint IS NOT NULL
          AND me.fingerprint = b.fingerprint
          AND NOT public.fingerprint_is_shared(me.fingerprint))
  );
$fn2$;

GRANT EXECUTE ON FUNCTION public.account_linked_to_level3(uuid, text, text) TO anon, authenticated;

-- 3) Tuong thich nguoc cho call site cu (khong IP, co loc van tay dung chung).
CREATE OR REPLACE FUNCTION public.device_linked_to_level3(
  p_fingerprint text,
  p_ip text,
  p_cookie text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn3$
  SELECT EXISTS (
    SELECT 1
    FROM public.device_accounts d
    JOIN public.profiles p ON p.id = d.user_id
    WHERE COALESCE(p.is_admin, false) = false
      AND COALESCE(p.ban_level, 0) >= 3
      AND (
        (p_cookie IS NOT NULL AND d.cookie_id IS NOT NULL AND d.cookie_id = p_cookie)
        OR (p_fingerprint IS NOT NULL AND d.fingerprint IS NOT NULL
            AND d.fingerprint = p_fingerprint
            AND NOT public.fingerprint_is_shared(p_fingerprint))
      )
  );
$fn3$;

GRANT EXECUTE ON FUNCTION public.device_linked_to_level3(text, text, text) TO anon, authenticated;

-- 4) Cong chinh.
CREATE OR REPLACE FUNCTION public.security_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_cookie text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn4$
DECLARE
  v_uid uuid := auth.uid();
  v_admin boolean := false;
  v_until timestamptz;
  v_reason text;
  v_level int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('blocked', false);
  END IF;

  SELECT COALESCE(is_admin, false)
    INTO v_admin
    FROM public.profiles
   WHERE id = v_uid;

  IF COALESCE(v_admin, false) THEN
    RETURN jsonb_build_object('blocked', false, 'admin', true);
  END IF;

  -- (a) Chinh tai khoan nay bi khoa muc 3.
  SELECT p.banned_until, p.ban_reason, COALESCE(p.ban_level, 0)
    INTO v_until, v_reason, v_level
    FROM public.profiles p
   WHERE p.id = v_uid
     AND COALESCE(p.ban_level, 0) >= 3
     AND (p.banned_until IS NULL OR p.banned_until > now());

  IF FOUND THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'scope', 'member',
      'level', v_level,
      'until', v_until,
      'reason', v_reason,
      'message', 'Tai khoan cua ban da bi khoa.'
    );
  END IF;

  -- (b) Tai khoan phu cua cung nguoi dung do.
  IF public.account_linked_to_level3(v_uid, p_fingerprint, p_cookie) THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'scope', 'member',
      'level', 3,
      'reason', 'linked_level3',
      'message', 'Tai khoan nay thuoc ve nguoi dung da bi khoa.'
    );
  END IF;

  RETURN jsonb_build_object('blocked', false);
END;
$fn4$;

GRANT EXECUTE ON FUNCTION public.security_gate(text, text, text) TO anon, authenticated;

-- 5) Cong dang ky.
CREATE OR REPLACE FUNCTION public.registration_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_cookie text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn5$
DECLARE
  v jsonb;
BEGIN
  v := public.security_gate(p_fingerprint, NULL, p_cookie);
  IF COALESCE((v->>'blocked')::boolean, false) THEN
    RETURN v;
  END IF;
  RETURN jsonb_build_object('blocked', false);
END;
$fn5$;

GRANT EXECUTE ON FUNCTION public.registration_gate(text, text, text, text) TO anon, authenticated;

-- 6) Khong con chan theo thiet bi.
CREATE OR REPLACE FUNCTION public.check_device_access(
  p_fingerprint text DEFAULT NULL,
  p_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn6$
BEGIN
  RETURN jsonb_build_object('blocked', false);
END;
$fn6$;

GRANT EXECUTE ON FUNCTION public.check_device_access(text, text) TO anon, authenticated;

-- 7) Trigger: khong khoa thiet bi/IP nua; ha muc < 3 thi don khoa cu.
CREATE OR REPLACE FUNCTION public.tg_ban_level3_lock_devices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn7$
BEGIN
  IF COALESCE(NEW.ban_level, 0) < 3 THEN
    BEGIN
      DELETE FROM public.blocked_devices b
       WHERE b.reason = 'ban_level_3'
         AND b.fingerprint IN (
           SELECT d.fingerprint FROM public.device_accounts d WHERE d.user_id = NEW.id
         )
         AND NOT EXISTS (
           SELECT 1
             FROM public.device_accounts d2
             JOIN public.profiles p2 ON p2.id = d2.user_id
            WHERE d2.fingerprint = b.fingerprint
              AND d2.user_id <> NEW.id
              AND COALESCE(p2.is_admin, false) = false
              AND COALESCE(p2.ban_level, 0) >= 3
         );
    EXCEPTION WHEN others THEN
      NULL;
    END;

    BEGIN
      DELETE FROM public.blocked_cookies b
       WHERE b.reason = 'ban_level_3'
         AND b.cookie_id IN (
           SELECT d.cookie_id FROM public.device_accounts d WHERE d.user_id = NEW.id
         );
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$fn7$;

-- 8) Don du lieu khoa oan con ton dong.
DELETE FROM public.blocked_ips WHERE true;

DELETE FROM public.blocked_devices b
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.device_accounts d
     JOIN public.profiles p ON p.id = d.user_id
    WHERE d.fingerprint = b.fingerprint
      AND COALESCE(p.is_admin, false) = false
      AND COALESCE(p.ban_level, 0) >= 3
 );

DELETE FROM public.blocked_cookies b
 WHERE NOT EXISTS (
   SELECT 1
     FROM public.device_accounts d
     JOIN public.profiles p ON p.id = d.user_id
    WHERE d.cookie_id = b.cookie_id
      AND COALESCE(p.is_admin, false) = false
      AND COALESCE(p.ban_level, 0) >= 3
 );

COMMIT;
