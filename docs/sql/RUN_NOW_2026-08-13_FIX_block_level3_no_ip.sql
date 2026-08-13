-- =====================================================================
-- FIX KHẨN CẤP — BLOCK LEVEL 3 (bỏ chặn theo IP, bỏ fail-closed, dọn dữ liệu oan)
-- Chạy trong SQL Editor của Supabase project ĐANG DÙNG (zbuwddjcqdlyijcunwgd).
-- KHÔNG đổi URL / API Key / bảng dữ liệu. Chỉ sửa logic block.
-- =====================================================================

-- 1) Thiết bị gắn Level 3: CHỈ theo fingerprint / cookie. KHÔNG theo IP.
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
        (p_fingerprint IS NOT NULL AND d.fingerprint IS NOT NULL AND d.fingerprint = p_fingerprint)
        OR (p_cookie IS NOT NULL AND d.cookie_id IS NOT NULL AND d.cookie_id = p_cookie)
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.device_linked_to_level3(text, text, text) TO anon, authenticated;

-- 2) security_gate: FAIL-OPEN, không chặn theo IP, chỉ chặn Level 3.
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
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(is_admin,false) INTO v_admin FROM public.profiles WHERE id = v_uid;
  END IF;
  IF v_admin THEN RETURN jsonb_build_object('blocked', false, 'admin', true); END IF;

  -- (a) Thiết bị này đã từng đăng nhập một tài khoản ban_level >= 3.
  IF public.device_linked_to_level3(p_fingerprint, NULL, p_cookie) THEN
    RETURN jsonb_build_object('blocked',true,'scope','device','level',3,
      'reason','device_level3','message','Thiết bị của bạn đã bị khóa.');
  END IF;

  -- (b) Thiết bị / cookie bị khóa thủ công ở mức 3.
  SELECT b.expires_at, b.reason, COALESCE(b.level,3) INTO v_until, v_reason, v_level
    FROM public.blocked_devices b
    WHERE p_fingerprint IS NOT NULL AND b.fingerprint = p_fingerprint
      AND COALESCE(b.level,3) >= 3
      AND (b.expires_at IS NULL OR b.expires_at > now())
    ORDER BY b.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('blocked',true,'scope','device','level',v_level,
      'until',v_until,'reason',v_reason,'message','Thiết bị của bạn đã bị khóa.');
  END IF;

  SELECT b.expires_at, b.reason, 3 INTO v_until, v_reason, v_level
    FROM public.blocked_cookies b
    WHERE p_cookie IS NOT NULL AND b.cookie_id = p_cookie
      AND (b.expires_at IS NULL OR b.expires_at > now())
    ORDER BY b.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('blocked',true,'scope','cookie','level',3,
      'until',v_until,'reason',v_reason,'message','Thiết bị của bạn đã bị khóa.');
  END IF;

  -- (c) Tài khoản hiện tại ban_level >= 3.
  IF v_uid IS NOT NULL THEN
    SELECT p.banned_until, p.ban_reason, COALESCE(p.ban_level,0)
      INTO v_until, v_reason, v_level
      FROM public.profiles p
      WHERE p.id = v_uid AND COALESCE(p.is_admin,false)=false
        AND COALESCE(p.ban_level,0) >= 3
        AND (p.banned_until IS NULL OR p.banned_until > now());
    IF FOUND THEN
      RETURN jsonb_build_object('blocked',true,'scope','member','level',v_level,
        'until',v_until,'reason',v_reason,'message','Tài khoản của bạn đã bị khóa.');
    END IF;
  END IF;

  -- Mặc định: CHO PHÉP (máy mới / IP mới / tài khoản bình thường).
  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.security_gate(text,text,text) TO anon, authenticated;

-- 3) registration_gate: chỉ chặn khi security_gate chặn, hoặc SĐT bị cấm.
--    Không chặn vì thiếu IP/fingerprint, không chặn vì cùng IP, không chặn Level 1-2.
CREATE OR REPLACE FUNCTION public.registration_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_cookie text DEFAULT NULL,
  p_phone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.security_gate(p_fingerprint, p_ip, p_cookie);
  IF COALESCE((v->>'blocked')::boolean, false) THEN RETURN v; END IF;
  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.registration_gate(text,text,text,text) TO anon, authenticated;

-- 4) check_device_access: chỉ theo fingerprint Level 3, fail-open.
CREATE OR REPLACE FUNCTION public.check_device_access(
  p_fingerprint text DEFAULT NULL,
  p_ip text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.device_linked_to_level3(p_fingerprint, NULL, NULL) THEN
    RETURN jsonb_build_object('blocked',true,'scope','device','level',3,
      'message','Thiết bị của bạn đã bị khóa.');
  END IF;
  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.check_device_access(text,text) TO anon, authenticated;

-- 5) Trigger Level 3: chỉ khóa fingerprint + cookie của chính tài khoản đó (KHÔNG khóa IP).
CREATE OR REPLACE FUNCTION public.tg_ban_level3_lock_devices()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.ban_level,0) >= 3 AND COALESCE(NEW.is_admin,false) = false THEN
    INSERT INTO public.blocked_devices (fingerprint, reason, level)
      SELECT DISTINCT d.fingerprint, 'ban_level_3', 3
      FROM public.device_accounts d
      WHERE d.user_id = NEW.id AND d.fingerprint IS NOT NULL
    ON CONFLICT (fingerprint) DO NOTHING;

    BEGIN
      INSERT INTO public.blocked_cookies (cookie_id, reason)
        SELECT DISTINCT d.cookie_id, 'ban_level_3'
        FROM public.device_accounts d
        WHERE d.user_id = NEW.id AND d.cookie_id IS NOT NULL
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN others THEN NULL;
    END;
  END IF;
  RETURN NEW;
END $$;

-- =====================================================================
-- 6) DỌN DỮ LIỆU BLOCK "OAN" do backfill trước đây
-- =====================================================================

-- 6a) Xoá toàn bộ IP bị khóa tự động bởi hệ thống anti-clone (block oan cả Wi-Fi).
DELETE FROM public.blocked_ips
 WHERE reason IS NULL
    OR reason IN ('ban_level_3','ban_level_3_backfill','anti_clone','auto','device_level3');

-- 6b) Xoá fingerprint bị khóa nhưng KHÔNG còn gắn tài khoản Level 3 nào.
DELETE FROM public.blocked_devices b
 WHERE NOT EXISTS (
   SELECT 1 FROM public.device_accounts d
     JOIN public.profiles p ON p.id = d.user_id
    WHERE d.fingerprint = b.fingerprint
      AND COALESCE(p.is_admin,false) = false
      AND COALESCE(p.ban_level,0) >= 3
 );

-- 6c) Xoá cookie bị khóa nhưng không còn gắn tài khoản Level 3.
DELETE FROM public.blocked_cookies b
 WHERE NOT EXISTS (
   SELECT 1 FROM public.device_accounts d
     JOIN public.profiles p ON p.id = d.user_id
    WHERE d.cookie_id = b.cookie_id
      AND COALESCE(p.is_admin,false) = false
      AND COALESCE(p.ban_level,0) >= 3
 );

-- 6d) Kiểm tra lại: các thiết bị còn bị khóa (phải đúng thiết bị của tài khoản Level 3).
-- SELECT * FROM public.blocked_devices;
-- SELECT count(*) FROM public.blocked_ips;
