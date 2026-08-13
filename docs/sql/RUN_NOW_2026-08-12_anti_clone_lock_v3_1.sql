-- ANTI CLONE LOCK V3.1 — fail-closed pre-auth hotfix for the existing project.
-- Apply to the existing database only. Does not change URL, keys, or profile data.

CREATE OR REPLACE FUNCTION public.is_valid_public_ip(p_ip text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT p_ip IS NOT NULL
     AND btrim(p_ip) <> ''
     AND btrim(p_ip) !~ '^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd|fe80)';
$$;
GRANT EXECUTE ON FUNCTION public.is_valid_public_ip(text) TO anon, authenticated, service_role;

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

CREATE OR REPLACE FUNCTION public.registration_gate(
  p_fingerprint text DEFAULT NULL, p_ip text DEFAULT NULL,
  p_cookie text DEFAULT NULL, p_phone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  v := public.security_gate(p_fingerprint, p_ip, p_cookie);
  IF COALESCE((v->>'blocked')::boolean, true) THEN RETURN v; END IF;
  IF p_fingerprint IS NULL OR p_cookie IS NULL OR NOT public.is_valid_public_ip(p_ip) THEN
    RETURN jsonb_build_object('blocked',true,'scope','device','level',3,'reason','identity_signal_missing','message','Thiết bị hoặc mạng của bạn đã bị khóa.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.device_accounts d JOIN public.profiles p ON p.id=d.user_id
    WHERE (d.fingerprint=p_fingerprint OR d.cookie_id=p_cookie OR d.ip=btrim(p_ip))
      AND COALESCE(p.is_admin,false)=false
      AND (COALESCE(p.ban_level,0)>0 OR COALESCE(p.is_banned,false)=true)
      AND (p.banned_until IS NULL OR p.banned_until>now())
  ) THEN RETURN jsonb_build_object('blocked',true,'scope','device','level',3,'message','Thiết bị hoặc mạng của bạn đã bị khóa.'); END IF;
  RETURN jsonb_build_object('blocked',false);
END $$;
GRANT EXECUTE ON FUNCTION public.registration_gate(text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_block_device_accounts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_gate jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=NEW.user_id AND COALESCE(is_admin,false)) THEN RETURN NEW; END IF;
  v_gate := public.security_gate(NEW.fingerprint, NEW.ip, NEW.cookie_id);
  IF COALESCE((v_gate->>'blocked')::boolean, true) THEN RAISE EXCEPTION 'anti_clone_blocked' USING ERRCODE='P0001'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_device_accounts ON public.device_accounts;
CREATE TRIGGER trg_block_device_accounts BEFORE INSERT OR UPDATE ON public.device_accounts
FOR EACH ROW EXECUTE FUNCTION public.tg_block_device_accounts();
ALTER TABLE public.device_accounts ENABLE TRIGGER trg_block_device_accounts;

CREATE OR REPLACE FUNCTION public.admin_ban_member_level(p_user uuid, p_level int, p_reason text DEFAULT NULL, p_days int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_until timestamptz; v_dev int:=0; v_ip int:=0; v_ck int:=0;
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user IS NULL OR p_level NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'invalid_ban_request'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id=p_user AND COALESCE(is_admin,false)) THEN RAISE EXCEPTION 'cannot_ban_admin'; END IF;
  v_until := CASE WHEN COALESCE(p_days,0)>0 THEN now()+(p_days||' days')::interval END;
  UPDATE public.profiles SET is_banned=true,banned_until=v_until,ban_level=p_level,
    ban_reason=COALESCE(NULLIF(btrim(p_reason),''),ban_reason),banned_at=now() WHERE id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

  IF p_level>=2 THEN
    INSERT INTO public.blocked_devices(fingerprint,reason,level,expires_at,blocked_user_id,created_by)
    SELECT DISTINCT d.fingerprint,COALESCE(p_reason,'ban_level_'||p_level),p_level,v_until,p_user,auth.uid()
    FROM public.device_accounts d WHERE d.user_id=p_user AND d.fingerprint IS NOT NULL AND btrim(d.fingerprint)<>''
    ON CONFLICT (fingerprint) DO UPDATE SET expires_at=EXCLUDED.expires_at,level=GREATEST(public.blocked_devices.level,EXCLUDED.level),reason=EXCLUDED.reason,blocked_user_id=EXCLUDED.blocked_user_id;
    GET DIAGNOSTICS v_dev=ROW_COUNT;
    INSERT INTO public.blocked_cookies(cookie_id,reason,level,expires_at,blocked_user_id,created_by)
    SELECT DISTINCT d.cookie_id,COALESCE(p_reason,'ban_level_'||p_level),p_level,v_until,p_user,auth.uid()
    FROM public.device_accounts d WHERE d.user_id=p_user AND d.cookie_id IS NOT NULL AND btrim(d.cookie_id)<>''
    ON CONFLICT (cookie_id) DO UPDATE SET expires_at=EXCLUDED.expires_at,level=GREATEST(public.blocked_cookies.level,EXCLUDED.level),reason=EXCLUDED.reason,blocked_user_id=EXCLUDED.blocked_user_id;
    GET DIAGNOSTICS v_ck=ROW_COUNT;
  END IF;
  IF p_level>=3 THEN
    INSERT INTO public.blocked_ips(ip,reason,level,expires_at,blocked_user_id,created_by)
    SELECT DISTINCT btrim(d.ip),COALESCE(p_reason,'ban_level_3'),3,v_until,p_user,auth.uid()
    FROM public.device_accounts d WHERE d.user_id=p_user AND public.is_valid_public_ip(d.ip)
    ON CONFLICT (ip) DO UPDATE SET expires_at=EXCLUDED.expires_at,level=3,reason=EXCLUDED.reason,blocked_user_id=EXCLUDED.blocked_user_id;
    GET DIAGNOSTICS v_ip=ROW_COUNT;
    IF v_ip=0 THEN RAISE EXCEPTION 'level_3_requires_recorded_public_ip'; END IF;
  END IF;
  INSERT INTO public.forced_logouts(user_id,reason) VALUES(p_user,COALESCE(p_reason,'ban_level_'||p_level));
  INSERT INTO public.member_activity_log(user_id,action,detail) VALUES(p_user,'ban','Khóa mức '||p_level||COALESCE(' — '||p_reason,''));
  RETURN jsonb_build_object('ok',true,'level',p_level,'until',v_until,'devices',v_dev,'ips',v_ip,'cookies',v_ck);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_ban_member_level(uuid,int,text,int) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Verification after applying:
SELECT tgname, tgenabled FROM pg_trigger WHERE tgrelid='public.device_accounts'::regclass AND tgname='trg_block_device_accounts';
SELECT p.proname, pg_get_function_identity_arguments(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('security_gate','registration_gate','admin_ban_member_level','tg_block_device_accounts');
-- After an actual level-3 lock, replace UUID and expect at least one valid IP row:
-- SELECT ip, level, expires_at, blocked_user_id FROM public.blocked_ips WHERE blocked_user_id='<USER_UUID>'::uuid;
