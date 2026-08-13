-- =====================================================================
-- ANTI CLONE / SPAM V3 — KHÓA THẬT Ở BACKEND
-- Additive + Idempotent. Chạy nhiều lần không lỗi.
-- KHÔNG đổi Supabase URL / API Key / project. KHÔNG xoá dữ liệu.
--
-- Phụ thuộc: 20260810000000_member_intel_v2.sql
--   (device_accounts, blocked_devices, blocked_ips, member_activity_log,
--    member_device_latest, mi_is_admin, admin_member_intel, ...)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Mở rộng bảng chặn: thời hạn + mức khóa + liên kết user
-- ---------------------------------------------------------------------
ALTER TABLE public.blocked_devices
  ADD COLUMN IF NOT EXISTS expires_at      timestamptz,
  ADD COLUMN IF NOT EXISTS level           smallint NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS blocked_user_id uuid;

ALTER TABLE public.blocked_ips
  ADD COLUMN IF NOT EXISTS expires_at      timestamptz,
  ADD COLUMN IF NOT EXISTS level           smallint NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS blocked_user_id uuid;

CREATE INDEX IF NOT EXISTS blocked_devices_exp_idx ON public.blocked_devices(expires_at);
CREATE INDEX IF NOT EXISTS blocked_ips_exp_idx     ON public.blocked_ips(expires_at);

-- Chặn theo cookie_id (nick thứ 2 trên cùng trình duyệt)
CREATE TABLE IF NOT EXISTS public.blocked_cookies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cookie_id  text NOT NULL,
  reason     text,
  level      smallint NOT NULL DEFAULT 2,
  expires_at timestamptz,
  blocked_user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_cookies_uidx ON public.blocked_cookies(cookie_id);
ALTER TABLE public.blocked_cookies ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.blocked_cookies TO authenticated;
GRANT ALL    ON public.blocked_cookies TO service_role;

-- profiles: mức khóa + lý do
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ban_level  smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ban_reason text,
  ADD COLUMN IF NOT EXISTS banned_at  timestamptz;

-- ---------------------------------------------------------------------
-- 1) Hàng đợi ép đăng xuất (force logout realtime)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.forced_logouts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS forced_logouts_user_idx ON public.forced_logouts(user_id, created_at DESC);
ALTER TABLE public.forced_logouts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.forced_logouts TO authenticated;
GRANT ALL    ON public.forced_logouts TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='forced_logouts' AND policyname='forced_logouts_self_read') THEN
    CREATE POLICY forced_logouts_self_read ON public.forced_logouts
      FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.mi_is_admin());
  END IF;
END $$;

-- Bật realtime (bỏ qua nếu đã có)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.forced_logouts;
EXCEPTION WHEN duplicate_object OR undefined_object THEN NULL; END $$;
ALTER TABLE public.forced_logouts REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------
-- 2) Hàm kiểm tra nguyên tử (dùng chung cho mọi luồng)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_device_blocked(p_fingerprint text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocked_devices b
                  WHERE p_fingerprint IS NOT NULL AND b.fingerprint = p_fingerprint
                    AND (b.expires_at IS NULL OR b.expires_at > now()));
$$;

CREATE OR REPLACE FUNCTION public.is_ip_blocked(p_ip text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocked_ips b
                  WHERE p_ip IS NOT NULL AND b.ip = p_ip
                    AND (b.expires_at IS NULL OR b.expires_at > now()));
$$;

CREATE OR REPLACE FUNCTION public.is_cookie_blocked(p_cookie text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocked_cookies b
                  WHERE p_cookie IS NOT NULL AND b.cookie_id = p_cookie
                    AND (b.expires_at IS NULL OR b.expires_at > now()));
$$;

-- Tài khoản (uid) đang bị khóa?
CREATE OR REPLACE FUNCTION public.is_member_blocked(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_user
       AND COALESCE(p.is_admin,false) = false
       AND COALESCE(p.is_banned,false) = true
       AND (p.banned_until IS NULL OR p.banned_until > now())
  );
$$;

-- Dùng được trong RLS policy: chặn mọi ghi dữ liệu của người đang bị khóa.
CREATE OR REPLACE FUNCTION public.actor_allowed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND NOT public.is_member_blocked(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.is_device_blocked(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_ip_blocked(text)     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_cookie_blocked(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_member_blocked(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.actor_allowed()         TO authenticated;

-- ---------------------------------------------------------------------
-- 3) CỔNG BẢO VỆ CHÍNH — gọi khi mở web / trước login / trước register
--    Trả về: {blocked, scope: member|device|ip|cookie, level, message, until}
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.security_gate(
  p_fingerprint text DEFAULT NULL,
  p_ip          text DEFAULT NULL,
  p_cookie      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_until timestamptz; v_reason text; v_admin boolean := false;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(is_admin,false) INTO v_admin FROM public.profiles WHERE id = v_uid;
  END IF;
  -- Admin không bao giờ bị chặn (tránh tự khóa mình ra ngoài).
  IF v_admin THEN RETURN jsonb_build_object('blocked', false, 'admin', true); END IF;

  -- 3.1 Khóa theo IP (mức 3)
  IF public.is_ip_blocked(p_ip) THEN
    SELECT b.expires_at, b.reason INTO v_until, v_reason
      FROM public.blocked_ips b WHERE b.ip = p_ip LIMIT 1;
    RETURN jsonb_build_object('blocked', true, 'scope','ip', 'level',3,
      'until', v_until, 'reason', v_reason,
      'message','Địa chỉ IP của bạn đã bị chặn truy cập hệ thống.');
  END IF;

  -- 3.2 Khóa theo Device (mức 2)
  IF public.is_device_blocked(p_fingerprint) THEN
    SELECT b.expires_at, b.reason INTO v_until, v_reason
      FROM public.blocked_devices b WHERE b.fingerprint = p_fingerprint LIMIT 1;
    RETURN jsonb_build_object('blocked', true, 'scope','device', 'level',2,
      'until', v_until, 'reason', v_reason,
      'message','Thiết bị này đã bị khóa. Không thể đăng nhập hoặc tạo tài khoản mới.');
  END IF;

  -- 3.3 Khóa theo Cookie / trình duyệt
  IF public.is_cookie_blocked(p_cookie) THEN
    RETURN jsonb_build_object('blocked', true, 'scope','cookie', 'level',2,
      'message','Trình duyệt này đã bị khóa. Không thể đăng nhập hoặc tạo tài khoản mới.');
  END IF;

  -- 3.4 Khóa theo tài khoản (mức 1)
  IF v_uid IS NOT NULL AND public.is_member_blocked(v_uid) THEN
    SELECT p.banned_until, p.ban_reason INTO v_until, v_reason FROM public.profiles p WHERE p.id = v_uid;
    RETURN jsonb_build_object('blocked', true, 'scope','member', 'level',1,
      'until', v_until, 'reason', v_reason,
      'message','Tài khoản của bạn đã bị khóa.');
  END IF;

  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.security_gate(text,text,text) TO anon, authenticated;

-- Tương thích ngược: check_device_access dùng lại security_gate
CREATE OR REPLACE FUNCTION public.check_device_access(p_fingerprint text, p_ip text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.security_gate(p_fingerprint, p_ip, NULL);
$$;
GRANT EXECUTE ON FUNCTION public.check_device_access(text,text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 4) CỔNG ĐĂNG KÝ — kiểm tra Device + IP + Cookie trước khi tạo nick
--    (kể cả tài khoản thứ hai trên cùng thiết bị)
-- ---------------------------------------------------------------------
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
  IF (v->>'blocked')::boolean THEN RETURN v; END IF;

  -- Thiết bị từng thuộc về tài khoản đã bị khóa → cấm tạo nick mới.
  IF p_fingerprint IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.device_accounts d
        JOIN public.profiles p ON p.id = d.user_id
       WHERE d.fingerprint = p_fingerprint
         AND COALESCE(p.is_admin,false) = false
         AND COALESCE(p.is_banned,false) = true
         AND (p.banned_until IS NULL OR p.banned_until > now())
  ) THEN
    RETURN jsonb_build_object('blocked', true, 'scope','device','level',2,
      'message','Thiết bị này liên kết với tài khoản đã bị khóa nên không thể đăng ký tài khoản mới.');
  END IF;

  RETURN jsonb_build_object('blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.registration_gate(text,text,text,text) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) TRIGGER: chặn tận gốc ở tầng DB
--    Không cho ghi device_accounts từ device/ip/cookie đang bị khóa
--    → tài khoản thứ hai trên thiết bị bị khóa không thể hoạt động.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_block_device_accounts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.user_id AND COALESCE(is_admin,false)) THEN
    RETURN NEW;
  END IF;
  IF public.is_ip_blocked(NEW.ip)               THEN RAISE EXCEPTION 'ip_blocked'; END IF;
  IF public.is_device_blocked(NEW.fingerprint)  THEN RAISE EXCEPTION 'device_blocked'; END IF;
  IF public.is_cookie_blocked(NEW.cookie_id)    THEN RAISE EXCEPTION 'cookie_blocked'; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_block_device_accounts ON public.device_accounts;
CREATE TRIGGER trg_block_device_accounts
  BEFORE INSERT OR UPDATE ON public.device_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_device_accounts();

-- TRIGGER: khóa tài khoản → đẩy sự kiện ép đăng xuất realtime
CREATE OR REPLACE FUNCTION public.tg_forced_logout_on_ban()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.is_banned,false) = true AND COALESCE(OLD.is_banned,false) = false THEN
    INSERT INTO public.forced_logouts(user_id, reason)
      VALUES (NEW.id, COALESCE(NEW.ban_reason, 'account_locked'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_forced_logout_on_ban ON public.profiles;
CREATE TRIGGER trg_forced_logout_on_ban
  AFTER UPDATE OF is_banned ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_forced_logout_on_ban();

-- ---------------------------------------------------------------------
-- 6) KHÓA 3 MỨC (bản V3 — khóa TOÀN BỘ device/ip của user, có thời hạn)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_ban_member_level(
  p_user uuid, p_level int, p_reason text DEFAULT NULL, p_days int DEFAULT 0)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_until timestamptz;
  v_dev int := 0; v_ip int := 0; v_ck int := 0;
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND COALESCE(is_admin,false)) THEN
    RAISE EXCEPTION 'cannot_ban_admin';
  END IF;

  v_until := CASE WHEN COALESCE(p_days,0) > 0 THEN now() + (p_days || ' days')::interval END;

  -- Mức 1+: khóa tài khoản
  UPDATE public.profiles
     SET is_banned    = true,
         banned_until = v_until,
         ban_level    = p_level,
         ban_reason   = COALESCE(NULLIF(btrim(p_reason),''), ban_reason),
         banned_at    = now()
   WHERE id = p_user;

  -- Mức 2+: khóa TẤT CẢ thiết bị + cookie đã dùng bởi tài khoản này
  IF p_level >= 2 THEN
    INSERT INTO public.blocked_devices(fingerprint, reason, level, expires_at, blocked_user_id, created_by)
    SELECT DISTINCT d.fingerprint, COALESCE(p_reason,'ban_level_'||p_level), p_level, v_until, p_user, auth.uid()
      FROM public.device_accounts d
     WHERE d.user_id = p_user AND d.fingerprint IS NOT NULL
    ON CONFLICT (fingerprint) DO UPDATE
      SET expires_at = EXCLUDED.expires_at, level = EXCLUDED.level,
          reason = COALESCE(EXCLUDED.reason, public.blocked_devices.reason);
    GET DIAGNOSTICS v_dev = ROW_COUNT;

    INSERT INTO public.blocked_cookies(cookie_id, reason, level, expires_at, blocked_user_id, created_by)
    SELECT DISTINCT d.cookie_id, COALESCE(p_reason,'ban_level_'||p_level), p_level, v_until, p_user, auth.uid()
      FROM public.device_accounts d
     WHERE d.user_id = p_user AND d.cookie_id IS NOT NULL
    ON CONFLICT (cookie_id) DO UPDATE
      SET expires_at = EXCLUDED.expires_at, level = EXCLUDED.level;
    GET DIAGNOSTICS v_ck = ROW_COUNT;
  END IF;

  -- Mức 3: khóa thêm IP (dùng khi chắc chắn spam/clone — IP có thể dùng chung)
  IF p_level >= 3 THEN
    INSERT INTO public.blocked_ips(ip, reason, level, expires_at, blocked_user_id, created_by)
    SELECT DISTINCT d.ip, COALESCE(p_reason,'ban_level_3'), 3, v_until, p_user, auth.uid()
      FROM public.device_accounts d
     WHERE d.user_id = p_user AND d.ip IS NOT NULL
    ON CONFLICT (ip) DO UPDATE
      SET expires_at = EXCLUDED.expires_at, level = 3;
    GET DIAGNOSTICS v_ip = ROW_COUNT;
  END IF;

  -- Ép đăng xuất ngay (kể cả khi user đã ở trạng thái banned từ trước)
  INSERT INTO public.forced_logouts(user_id, reason)
    VALUES (p_user, COALESCE(p_reason, 'ban_level_'||p_level));

  INSERT INTO public.member_activity_log(user_id, action, detail)
    VALUES (p_user, 'ban', 'Khóa mức ' || p_level || COALESCE(' — '||p_reason,''));

  RETURN jsonb_build_object('ok', true, 'level', p_level, 'until', v_until,
                            'devices', v_dev, 'ips', v_ip, 'cookies', v_ck);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_ban_member_level(uuid,int,text,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unban_member_full(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.profiles
     SET is_banned = false, banned_until = NULL, ban_level = 0
   WHERE id = p_user;

  DELETE FROM public.blocked_devices WHERE blocked_user_id = p_user
     OR fingerprint IN (SELECT DISTINCT fingerprint FROM public.device_accounts
                         WHERE user_id = p_user AND fingerprint IS NOT NULL);
  DELETE FROM public.blocked_cookies WHERE blocked_user_id = p_user
     OR cookie_id IN (SELECT DISTINCT cookie_id FROM public.device_accounts
                       WHERE user_id = p_user AND cookie_id IS NOT NULL);
  DELETE FROM public.blocked_ips WHERE blocked_user_id = p_user
     OR ip IN (SELECT DISTINCT ip FROM public.device_accounts
                WHERE user_id = p_user AND ip IS NOT NULL);

  INSERT INTO public.member_activity_log(user_id, action, detail)
    VALUES (p_user, 'unban', 'Mở khóa toàn bộ (tài khoản + device + ip)');
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_unban_member_full(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 7) Quản lý danh sách chặn cho Admin
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_block_list(p_scope text DEFAULT 'device')
RETURNS TABLE (key text, reason text, level smallint, expires_at timestamptz,
               blocked_user_id uuid, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_scope = 'ip' THEN
    RETURN QUERY SELECT b.ip, b.reason, b.level, b.expires_at, b.blocked_user_id, b.created_at
                   FROM public.blocked_ips b ORDER BY b.created_at DESC;
  ELSIF p_scope = 'cookie' THEN
    RETURN QUERY SELECT b.cookie_id, b.reason, b.level, b.expires_at, b.blocked_user_id, b.created_at
                   FROM public.blocked_cookies b ORDER BY b.created_at DESC;
  ELSE
    RETURN QUERY SELECT b.fingerprint, b.reason, b.level, b.expires_at, b.blocked_user_id, b.created_at
                   FROM public.blocked_devices b ORDER BY b.created_at DESC;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_block_list(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_block_key(
  p_scope text, p_key text, p_reason text DEFAULT NULL, p_days int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_until timestamptz;
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  v_until := CASE WHEN COALESCE(p_days,0) > 0 THEN now() + (p_days || ' days')::interval END;
  IF p_scope = 'ip' THEN
    INSERT INTO public.blocked_ips(ip, reason, level, expires_at, created_by)
      VALUES (p_key, p_reason, 3, v_until, auth.uid())
      ON CONFLICT (ip) DO UPDATE SET expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason;
  ELSIF p_scope = 'cookie' THEN
    INSERT INTO public.blocked_cookies(cookie_id, reason, level, expires_at, created_by)
      VALUES (p_key, p_reason, 2, v_until, auth.uid())
      ON CONFLICT (cookie_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason;
  ELSE
    INSERT INTO public.blocked_devices(fingerprint, reason, level, expires_at, created_by)
      VALUES (p_key, p_reason, 2, v_until, auth.uid())
      ON CONFLICT (fingerprint) DO UPDATE SET expires_at = EXCLUDED.expires_at, reason = EXCLUDED.reason;
  END IF;
  RETURN jsonb_build_object('ok', true, 'scope', p_scope, 'until', v_until);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_block_key(text,text,text,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unblock_key(p_scope text, p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_scope = 'ip'     THEN DELETE FROM public.blocked_ips     WHERE ip = p_key;
  ELSIF p_scope='cookie'THEN DELETE FROM public.blocked_cookies WHERE cookie_id = p_key;
  ELSE                       DELETE FROM public.blocked_devices WHERE fingerprint = p_key;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_unblock_key(text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 8) Ghi nhận tín hiệu thiết bị: chặn trước khi ghi (an toàn 2 lớp)
--    Đổi kiểu trả về void -> jsonb nên phải DROP trước (idempotent).
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_device_signal(text,text,text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.register_device_signal(
  p_fingerprint text,
  p_ip          text DEFAULT NULL,
  p_user_agent  text DEFAULT NULL,
  p_device_type text DEFAULT NULL,
  p_os          text DEFAULT NULL,
  p_browser     text DEFAULT NULL,
  p_country     text DEFAULT NULL,
  p_isp         text DEFAULT NULL,
  p_cookie_id   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); prev record; v_gate jsonb;
BEGIN
  IF uid IS NULL OR p_fingerprint IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'blocked', false, 'error', 'no_session');
  END IF;

  -- Cổng bảo vệ: device/ip/cookie/member bị khóa thì không ghi nhận.
  v_gate := public.security_gate(p_fingerprint, p_ip, p_cookie_id);
  IF (v_gate->>'blocked')::boolean THEN RETURN v_gate; END IF;

  SELECT * INTO prev FROM public.device_accounts
   WHERE user_id = uid ORDER BY COALESCE(last_seen, created_at) DESC LIMIT 1;

  IF prev.id IS NOT NULL AND prev.fingerprint IS DISTINCT FROM p_fingerprint THEN
    INSERT INTO public.member_activity_log(user_id, action, detail, ip, fingerprint)
      VALUES (uid, 'device_change', prev.fingerprint || ' → ' || p_fingerprint, p_ip, p_fingerprint);
  ELSIF prev.id IS NOT NULL AND p_ip IS NOT NULL AND prev.ip IS DISTINCT FROM p_ip THEN
    INSERT INTO public.member_activity_log(user_id, action, detail, ip, fingerprint)
      VALUES (uid, 'ip_change', COALESCE(prev.ip,'—') || ' → ' || p_ip, p_ip, p_fingerprint);
  END IF;

  UPDATE public.device_accounts SET
    ip = COALESCE(p_ip, ip), user_agent = COALESCE(p_user_agent, user_agent),
    device_type = COALESCE(p_device_type, device_type), os = COALESCE(p_os, os),
    browser = COALESCE(p_browser, browser), country = COALESCE(p_country, country),
    isp = COALESCE(p_isp, isp), cookie_id = COALESCE(p_cookie_id, cookie_id),
    last_seen = now()
  WHERE user_id = uid AND fingerprint = p_fingerprint;

  IF NOT FOUND THEN
    INSERT INTO public.device_accounts(
      user_id, fingerprint, ip, user_agent, device_type, os, browser, country, isp, cookie_id, last_seen)
    VALUES (uid, p_fingerprint, p_ip, p_user_agent, p_device_type, p_os, p_browser, p_country, p_isp, p_cookie_id, now());
  END IF;

  RETURN jsonb_build_object('ok', true, 'blocked', false);
END $$;
GRANT EXECUTE ON FUNCTION public.register_device_signal(text,text,text,text,text,text,text,text,text) TO authenticated;

NOTIFY pgrst, 'reload schema';
