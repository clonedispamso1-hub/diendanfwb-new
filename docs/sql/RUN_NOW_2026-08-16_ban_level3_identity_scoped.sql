-- =====================================================================
-- BAN LEVEL 3 — THIẾT KẾ LẠI THEO DANH TÍNH (KHÔNG IP, KHÔNG BLOCK OAN)
-- Chạy trong SQL Editor của Supabase project đang dùng (zbuwddjcqdlyijcunwgd).
-- Không đổi URL / API Key / bảng dữ liệu. Chỉ sửa logic khóa.
--
-- Nguyên tắc:
--  1) KHÔNG bao giờ chặn theo IP / mạng.
--  2) Chỉ chặn TÀI KHOẢN thuộc cùng một người dùng với tài khoản Level 3:
--     - chính tài khoản đó (ban_level >= 3), hoặc
--     - tài khoản từng đăng nhập trên CÙNG danh tính thiết bị
--       (cookie_id — duy nhất theo trình duyệt, hoặc fingerprint "riêng tư").
--  3) Fingerprint dùng chung (nhiều người khác nhau trùng vân tay do thiết bị
--     phổ thông) bị coi là không đáng tin → không dùng để chặn.
--  4) Khách chưa đăng nhập KHÔNG bị chặn — quyết định chặn xảy ra khi đăng
--     nhập mới hoặc khi khôi phục phiên (lúc đó đã biết là tài khoản nào).
--  5) admin = true luôn được bỏ qua ở mọi nhánh.
--  6) Fail-open: thiếu dữ liệu / lỗi → cho phép.
--  7) Hạ ban_level < 3 → tự động gỡ khóa thiết bị/cookie tương ứng.
-- =====================================================================

-- Vân tay dùng chung: gắn với >= 3 tài khoản KHÔNG bị ban khác nhau.
CREATE OR REPLACE FUNCTION public.fingerprint_is_shared(p_fingerprint text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT count(DISTINCT d.user_id) >= 3
    FROM public.device_accounts d
    JOIN public.profiles p ON p.id = d.user_id
    WHERE p_fingerprint IS NOT NULL
      AND d.fingerprint = p_fingerprint
      AND COALESCE(p.ban_level, 0) < 3
  ), false);
$$;
GRANT EXECUTE ON FUNCTION public.fingerprint_is_shared(text) TO anon, authenticated;

-- Tài khoản p_uid có thuộc cùng danh tính với một tài khoản Level 3 không?
CREATE OR REPLACE FUNCTION public.account_linked_to_level3(
  p_uid uuid, p_fingerprint text DEFAULT NULL, p_cookie text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    SELECT 1 FROM me JOIN banned b
      ON (me.cookie_id IS NOT NULL AND b.cookie_id IS NOT NULL AND me.cookie_id = b.cookie_id)
      OR (me.fingerprint IS NOT NULL AND b.fingerprint IS NOT NULL
          AND me.fingerprint = b.fingerprint
          AND NOT public.fingerprint_is_shared(me.fingerprint))
  );
$$;
GRANT EXECUTE ON FUNCTION public.account_linked_to_level3(uuid, text, text) TO anon, authenticated;

-- Tương thích ngược cho call site cũ (không IP, có lọc vân tay dùng chung).
CREATE OR REPLACE FUNCTION public.device_linked_to_level3(
  p_fingerprint text, p_ip text, p_cookie text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
$$;
GRANT EXECUTE ON FUNCTION public.device_linked_to_level3(text, text, text) TO anon, authenticated;

-- Cổng chính.
CREATE OR REPLACE FUNCTION public.security_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_cookie text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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

  SELECT COALESCE(is_admin, false) INTO v_admin FROM public.profiles WHERE id = v_uid;
  IF COALESCE(v_admin, false) THEN
    RETURN jsonb_build_object('blocked', false, 'admin', true);
  END IF;

  -- (a) Chính tài khoản này bị khóa mức 3.
  SELECT p.banned_until, p.ban_reason, COALESCE(p.ban_level, 0)
    INTO v_until, v_reason, v_level
    FROM public.profiles p
    WHERE p.id = v_uid
      AND COALESCE(p.ban_level, 0) >= 3
      AND (p.banned_until IS NULL OR p.banned_until > now());
  IF FOUND THEN
    RETURN jsonb_build_object('blocked', true, 'scope', 'member', 'level', v_level,
      'until', v_until, 'reason', v_reason,
      'message', 'Tài khoản của bạn đã bị khóa.');
  END IF;

  -- (b) Tài khoản phụ của cùng người dùng đó.
  IF public.account_linked_to_level3(v_uid, p_fingerprint, p_cookie) THEN
    RETURN jsonb_build_object('blocked', true, 'scope', 'member', 'level', 3,
      'reason', 'linked_level3',
      'message', 'Tài khoản này thuộc về người dùng đã bị khóa.');
  END IF;

  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.security_gate(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.registration_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_cookie text DEFAULT NULL,
  p_phone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.security_gate(p_fingerprint, NULL, p_cookie);
  IF COALESCE((v->>'blocked')::boolean, false) THEN RETURN v; END IF;
  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.registration_gate(text, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_device_access(
  p_fingerprint text DEFAULT NULL,
  p_ip text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.check_device_access(text, text) TO anon, authenticated;

-- Trigger: không khóa thiết bị/IP nữa; hạ mức < 3 thì dọn khóa cũ.
CREATE OR REPLACE FUNCTION public.tg_ban_level3_lock_devices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.ban_level, 0) < 3 THEN
    BEGIN
      DELETE FROM public.blocked_devices b
       WHERE b.reason = 'ban_level_3'
         AND b.fingerprint IN (
           SELECT d.fingerprint FROM public.device_accounts d WHERE d.user_id = NEW.id
         )
         AND NOT EXISTS (
           SELECT 1 FROM public.device_accounts d2
             JOIN public.profiles p2 ON p2.id = d2.user_id
            WHERE d2.fingerprint = b.fingerprint
              AND d2.user_id <> NEW.id
              AND COALESCE(p2.is_admin, false) = false
              AND COALESCE(p2.ban_level, 0) >= 3
         );
    EXCEPTION WHEN others THEN NULL;
    END;
    BEGIN
      DELETE FROM public.blocked_cookies b
       WHERE b.reason = 'ban_level_3'
         AND b.cookie_id IN (
           SELECT d.cookie_id FROM public.device_accounts d WHERE d.user_id = NEW.id
         );
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
  RETURN NEW;
END $$;

-- Dọn dữ liệu khóa oan còn tồn đọng.
DELETE FROM public.blocked_ips WHERE true;

DELETE FROM public.blocked_devices b
 WHERE NOT EXISTS (
   SELECT 1 FROM public.device_accounts d
     JOIN public.profiles p ON p.id = d.user_id
    WHERE d.fingerprint = b.fingerprint
      AND COALESCE(p.is_admin, false) = false
      AND COALESCE(p.ban_level, 0) >= 3
 );

DELETE FROM public.blocked_cookies b
 WHERE NOT EXISTS (
   SELECT 1 FROM public.device_accounts d
     JOIN public.profiles p ON p.id = d.user_id
    WHERE d.cookie_id = b.cookie_id
      AND COALESCE(p.is_admin, false) = false
      AND COALESCE(p.ban_level, 0) >= 3
 );
