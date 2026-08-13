-- Block Level 3 (Permanent Device Ban) — chặn triệt để ở tầng database.
-- Chạy file này trong SQL Editor của Supabase project ĐANG DÙNG (zbuwddjcqdlyijcunwgd).

ALTER TABLE public.blocked_devices ADD COLUMN IF NOT EXISTS level int NOT NULL DEFAULT 3;
ALTER TABLE public.blocked_devices ADD COLUMN IF NOT EXISTS expires_at timestamptz;

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
        (p_fingerprint IS NOT NULL AND d.fingerprint = p_fingerprint)
        OR (p_cookie IS NOT NULL AND d.cookie_id = p_cookie)
        OR (p_ip IS NOT NULL AND d.ip = btrim(p_ip))
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.device_linked_to_level3(text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.security_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip text DEFAULT NULL,
  p_cookie text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_until timestamptz; v_reason text; v_admin boolean := false; v_level int;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(is_admin,false) INTO v_admin FROM public.profiles WHERE id = v_uid;
  END IF;
  IF v_admin THEN RETURN jsonb_build_object('blocked', false, 'admin', true); END IF;

  IF NOT public.is_valid_public_ip(p_ip) THEN
    RETURN jsonb_build_object('blocked', true, 'scope','ip', 'level',3,
      'reason','public_ip_unavailable', 'message','Thiết bị hoặc mạng của bạn đã bị khóa.');
  END IF;

  -- Level 3: thiết bị/cookie/IP từng gắn với tài khoản bị cấm vĩnh viễn -> chặn kể cả khi CHƯA đăng nhập.
  IF public.device_linked_to_level3(p_fingerprint, p_ip, p_cookie) THEN
    RETURN jsonb_build_object('blocked',true,'scope','device','level',3,
      'reason','device_level3','message','Thiết bị hoặc mạng của bạn đã bị khóa.');
  END IF;

  SELECT b.expires_at, b.reason, COALESCE(b.level,3) INTO v_until, v_reason, v_level
    FROM public.blocked_ips b WHERE b.ip = btrim(p_ip)
      AND (b.expires_at IS NULL OR b.expires_at > now()) ORDER BY b.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('blocked',true,'scope','ip','level',v_level,'until',v_until,'reason',v_reason,'message','Thiết bị hoặc mạng của bạn đã bị khóa.'); END IF;

  SELECT b.expires_at, b.reason, COALESCE(b.level,2) INTO v_until, v_reason, v_level
    FROM public.blocked_devices b WHERE p_fingerprint IS NOT NULL AND b.fingerprint = p_fingerprint
      AND (b.expires_at IS NULL OR b.expires_at > now()) ORDER BY b.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('blocked',true,'scope','device','level',v_level,'until',v_until,'reason',v_reason,'message','Thiết bị hoặc mạng của bạn đã bị khóa.'); END IF;

  SELECT b.expires_at, b.reason, COALESCE(b.level,2) INTO v_until, v_reason, v_level
    FROM public.blocked_cookies b WHERE p_cookie IS NOT NULL AND b.cookie_id = p_cookie
      AND (b.expires_at IS NULL OR b.expires_at > now()) ORDER BY b.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('blocked',true,'scope','cookie','level',v_level,'until',v_until,'reason',v_reason,'message','Thiết bị hoặc mạng của bạn đã bị khóa.'); END IF;

  IF v_uid IS NOT NULL THEN
    SELECT p.banned_until, p.ban_reason, COALESCE(p.ban_level,0)
      INTO v_until, v_reason, v_level FROM public.profiles p
      WHERE p.id = v_uid AND COALESCE(p.is_admin,false)=false
        AND (COALESCE(p.ban_level,0)>0 OR COALESCE(p.is_banned,false)=true)
        AND (p.banned_until IS NULL OR p.banned_until > now());
    IF FOUND THEN RETURN jsonb_build_object('blocked',true,'scope','member','level',v_level,'until',v_until,'reason',v_reason,'message','Thiết bị hoặc mạng của bạn đã bị khóa.'); END IF;
  END IF;

  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.security_gate(text,text,text) TO anon, authenticated;

-- Khi đặt ban_level = 3 -> tự khóa vĩnh viễn mọi thiết bị/cookie đã biết của tài khoản đó.
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

DROP TRIGGER IF EXISTS trg_ban_level3_lock_devices ON public.profiles;
CREATE TRIGGER trg_ban_level3_lock_devices
AFTER INSERT OR UPDATE OF ban_level, is_banned ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_ban_level3_lock_devices();

-- Backfill cho các tài khoản đã bị Level 3 từ trước.
INSERT INTO public.blocked_devices (fingerprint, reason, level)
  SELECT DISTINCT d.fingerprint, 'ban_level_3_backfill', 3
  FROM public.device_accounts d
  JOIN public.profiles p ON p.id = d.user_id
  WHERE d.fingerprint IS NOT NULL
    AND COALESCE(p.is_admin,false) = false
    AND COALESCE(p.ban_level,0) >= 3
ON CONFLICT (fingerprint) DO NOTHING;
