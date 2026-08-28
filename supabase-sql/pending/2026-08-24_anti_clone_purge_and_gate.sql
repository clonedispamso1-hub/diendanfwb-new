-- =====================================================================
-- ANTI CLONE — PURGE 3 MỨC (BẢN AN TOÀN, KHÔNG KHÓA OAN)
-- CHẠY THỦ CÔNG trên Supabase #1 (core: profiles, device_accounts, blocked_*).
-- Additive + Idempotent. KHÔNG xoá dữ liệu, KHÔNG đổi URL/API key.
--
-- Phụ thuộc: 20260810000000_member_intel_v2.sql + 20260811000000_anti_clone_lock_v3.sql
--   (mi_is_admin, device_accounts, blocked_devices, blocked_ips,
--    blocked_cookies, forced_logouts, member_activity_log)
--
-- Nguyên tắc bắt buộc:
--   * Chỉ dùng dữ liệu THẬT đã ghi nhận trong device_accounts của chính
--     tài khoản bị xử lý. Không suy diễn, không tự tạo fingerprint/IP/cookie.
--   * Không bao giờ khóa / block admin.
--   * Không block IP nội bộ, IP không hợp lệ, hoặc IP đang được tài khoản
--     khác (không bị khóa) sử dụng → tránh khóa oan người dùng chung mạng.
--   * Không xoá comment / message. Chỉ ẩn bài viết.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Blacklist số điện thoại (mức 2+)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blocked_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone      text NOT NULL,
  reason     text,
  level      smallint NOT NULL DEFAULT 2,
  blocked_user_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS blocked_phones_uidx ON public.blocked_phones(phone);
ALTER TABLE public.blocked_phones ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.blocked_phones TO authenticated;
GRANT ALL    ON public.blocked_phones TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='blocked_phones' AND policyname='blocked_phones_admin_read') THEN
    CREATE POLICY blocked_phones_admin_read ON public.blocked_phones
      FOR SELECT TO authenticated USING (public.mi_is_admin());
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1) Helper: IP có hợp lệ để block không?
--    Loại: NULL/rỗng, chuỗi không phải IP, localhost, IP nội bộ / CGNAT.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ac_is_blockable_ip(p_ip text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v inet;
BEGIN
  IF p_ip IS NULL OR btrim(p_ip) = '' THEN RETURN false; END IF;
  BEGIN
    v := btrim(p_ip)::inet;
  EXCEPTION WHEN others THEN
    RETURN false;                                   -- không phải IP thật
  END;
  IF family(v) = 4 THEN
    RETURN NOT (v <<= '10.0.0.0/8'::inet
             OR v <<= '172.16.0.0/12'::inet
             OR v <<= '192.168.0.0/16'::inet
             OR v <<= '127.0.0.0/8'::inet
             OR v <<= '169.254.0.0/16'::inet
             OR v <<= '0.0.0.0/8'::inet
             OR v <<= '100.64.0.0/10'::inet);       -- CGNAT: dùng chung, không block
  END IF;
  RETURN NOT (v <<= '::1/128'::inet OR v <<= 'fc00::/7'::inet OR v <<= 'fe80::/10'::inet);
END $$;
GRANT EXECUTE ON FUNCTION public.ac_is_blockable_ip(text) TO authenticated;

-- IP đang được tài khoản KHÁC (không bị khóa) sử dụng? → tuyệt đối không block.
CREATE OR REPLACE FUNCTION public.ac_ip_is_shared(p_ip text, p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.device_accounts d
      JOIN public.profiles p ON p.id = d.user_id
     WHERE d.ip = p_ip
       AND d.user_id <> p_user
       AND COALESCE(p.is_banned, false) = false
  );
$$;
GRANT EXECUTE ON FUNCTION public.ac_ip_is_shared(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) RPC chính — admin_anti_clone_purge
--    level 1: khóa tài khoản + ép đăng xuất + ẩn toàn bộ bài viết
--    level 2: (1) + blacklist SĐT
--    level 3: (2) + block thiết bị/cookie/IP THẬT, không dùng chung
--    Comment / message KHÔNG bị xoá ở bất kỳ mức nào.
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
  v_phone   text;
  v_admin   boolean;
  v_reason  text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_phone_b boolean := false;
  v_ip_b    boolean := false;
  v_dev_b   boolean := false;
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user IS NULL THEN RAISE EXCEPTION 'user_required'; END IF;
  IF p_level IS NULL OR p_level < 1 OR p_level > 3 THEN RAISE EXCEPTION 'bad_level'; END IF;

  SELECT COALESCE(is_admin,false), NULLIF(btrim(COALESCE(phone,'')),'')
    INTO v_admin, v_phone
    FROM public.profiles WHERE id = p_user;

  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;
  -- KHÔNG BAO GIỜ khóa admin.
  IF v_admin THEN RAISE EXCEPTION 'cannot_ban_admin'; END IF;

  ---------------------------------------------------------------- MỨC 1+
  UPDATE public.profiles
     SET is_banned    = true,
         ban_level    = GREATEST(COALESCE(ban_level,0), p_level),
         ban_reason   = COALESCE(v_reason, ban_reason),
         banned_at    = now(),
         banned_until = NULL
   WHERE id = p_user;

  -- Ép đăng xuất ngay lập tức (client nghe realtime profiles + forced_logouts).
  INSERT INTO public.forced_logouts(user_id, reason)
    VALUES (p_user, COALESCE(v_reason, 'anti_clone_level_' || p_level));

  -- Ẩn toàn bộ bài viết nếu bảng posts nằm cùng database (KHÔNG xoá dữ liệu).
  IF to_regclass('public.posts') IS NOT NULL THEN
    EXECUTE 'UPDATE public.posts SET is_hidden = true WHERE user_id = $1' USING p_user;
  END IF;

  ---------------------------------------------------------------- MỨC 2+
  IF p_level >= 2 AND v_phone IS NOT NULL THEN
    INSERT INTO public.blocked_phones(phone, reason, level, blocked_user_id, created_by)
      VALUES (v_phone, COALESCE(v_reason, 'anti_clone_level_' || p_level), p_level, p_user, auth.uid())
      ON CONFLICT (phone) DO UPDATE SET level = EXCLUDED.level, reason = EXCLUDED.reason;
    v_phone_b := true;
  END IF;

  ---------------------------------------------------------------- MỨC 3
  IF p_level >= 3 THEN
    -- Fingerprint: chỉ giá trị ĐÃ ghi nhận thuộc chính user, không dùng chung.
    WITH src AS (
      SELECT DISTINCT d.fingerprint AS fp
        FROM public.device_accounts d
       WHERE d.user_id = p_user
         AND NULLIF(btrim(COALESCE(d.fingerprint,'')),'') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.device_accounts d2
             JOIN public.profiles p2 ON p2.id = d2.user_id
            WHERE d2.fingerprint = d.fingerprint
              AND d2.user_id <> p_user
              AND COALESCE(p2.is_banned,false) = false
         )
    ), ins AS (
      INSERT INTO public.blocked_devices(fingerprint, reason, level, blocked_user_id, created_by)
      SELECT fp, COALESCE(v_reason,'anti_clone_level_3'), 3, p_user, auth.uid() FROM src
      ON CONFLICT (fingerprint) DO UPDATE SET level = 3, blocked_user_id = EXCLUDED.blocked_user_id
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM ins) INTO v_dev_b;

    -- Cookie: cùng nguyên tắc (chỉ dữ liệu thật của user).
    INSERT INTO public.blocked_cookies(cookie_id, reason, level, blocked_user_id, created_by)
    SELECT DISTINCT d.cookie_id, COALESCE(v_reason,'anti_clone_level_3'), 3, p_user, auth.uid()
      FROM public.device_accounts d
     WHERE d.user_id = p_user
       AND NULLIF(btrim(COALESCE(d.cookie_id,'')),'') IS NOT NULL
    ON CONFLICT (cookie_id) DO UPDATE SET level = 3;

    -- IP: chỉ IP thật, hợp lệ, public và KHÔNG dùng chung với người khác.
    WITH src AS (
      SELECT DISTINCT d.ip AS ip
        FROM public.device_accounts d
       WHERE d.user_id = p_user
         AND public.ac_is_blockable_ip(d.ip)
         AND NOT public.ac_ip_is_shared(d.ip, p_user)
    ), ins AS (
      INSERT INTO public.blocked_ips(ip, reason, level, blocked_user_id, created_by)
      SELECT ip, COALESCE(v_reason,'anti_clone_level_3'), 3, p_user, auth.uid() FROM src
      ON CONFLICT (ip) DO UPDATE SET level = 3, blocked_user_id = EXCLUDED.blocked_user_id
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM ins) INTO v_ip_b;

    -- Tham số client (p_fingerprint / p_ip) CHỈ dùng khi trùng khớp dữ liệu thật.
    IF NULLIF(btrim(COALESCE(p_fingerprint,'')),'') IS NOT NULL
       AND EXISTS (SELECT 1 FROM public.device_accounts d
                    WHERE d.user_id = p_user AND d.fingerprint = p_fingerprint) THEN
      INSERT INTO public.blocked_devices(fingerprint, reason, level, blocked_user_id, created_by)
        VALUES (p_fingerprint, COALESCE(v_reason,'anti_clone_level_3'), 3, p_user, auth.uid())
        ON CONFLICT (fingerprint) DO UPDATE SET level = 3;
      v_dev_b := true;
    END IF;

    IF public.ac_is_blockable_ip(p_ip)
       AND NOT public.ac_ip_is_shared(p_ip, p_user)
       AND EXISTS (SELECT 1 FROM public.device_accounts d
                    WHERE d.user_id = p_user AND d.ip = p_ip) THEN
      INSERT INTO public.blocked_ips(ip, reason, level, blocked_user_id, created_by)
        VALUES (p_ip, COALESCE(v_reason,'anti_clone_level_3'), 3, p_user, auth.uid())
        ON CONFLICT (ip) DO UPDATE SET level = 3;
      v_ip_b := true;
    END IF;
  END IF;

  IF to_regclass('public.member_activity_log') IS NOT NULL THEN
    INSERT INTO public.member_activity_log(user_id, action, detail)
      VALUES (p_user, 'anti_clone_purge',
              'Anti Clone mức ' || p_level || COALESCE(' — ' || v_reason, ''));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'level', p_level,
    'deleted', false,                 -- KHÔNG xoá tài khoản: giữ comment/message
    'phone_blacklisted', v_phone_b,
    'ip_blocked', v_ip_b,
    'device_blocked', v_dev_b
  );
END $$;
GRANT EXECUTE ON FUNCTION public.admin_anti_clone_purge(uuid,int,text,text,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Gỡ khóa hoàn toàn (đối xứng với purge) — hiện lại bài viết
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_anti_clone_restore(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text;
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT NULLIF(btrim(COALESCE(phone,'')),'') INTO v_phone FROM public.profiles WHERE id = p_user;

  UPDATE public.profiles
     SET is_banned = false, ban_level = 0, banned_until = NULL, ban_reason = NULL
   WHERE id = p_user;

  IF to_regclass('public.posts') IS NOT NULL THEN
    EXECUTE 'UPDATE public.posts SET is_hidden = false WHERE user_id = $1' USING p_user;
  END IF;

  DELETE FROM public.blocked_phones  WHERE blocked_user_id = p_user OR (v_phone IS NOT NULL AND phone = v_phone);
  DELETE FROM public.blocked_devices WHERE blocked_user_id = p_user;
  DELETE FROM public.blocked_cookies WHERE blocked_user_id = p_user;
  DELETE FROM public.blocked_ips     WHERE blocked_user_id = p_user;

  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_anti_clone_restore(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) Cổng đăng ký: chặn SĐT trong blacklist (dữ liệu chắc chắn, không suy diễn)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_phone_blacklisted(p_phone text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.blocked_phones b
                  WHERE p_phone IS NOT NULL AND b.phone = btrim(p_phone));
$$;
GRANT EXECUTE ON FUNCTION public.is_phone_blacklisted(text) TO anon, authenticated;
