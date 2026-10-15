-- =====================================================================
-- Mức 3 = CẤM THIẾT BỊ theo device_id ngẫu nhiên (fwb_device_cookie_v1).
-- Chạy trên Supabase #1 (SQL Editor). Idempotent. Không xoá dữ liệu.
-- - Giữ nguyên khóa tài khoản (profiles.ban_level / is_banned).
-- - Giữ nguyên các dòng blocked_ips đã có (không xoá, security_gate vẫn đọc).
-- - Mức 3 KHÔNG còn bắt buộc IP và KHÔNG dùng fingerprint phần cứng.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_ban_member_level(p_user uuid, p_level int, p_reason text DEFAULT NULL, p_days int DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_until timestamptz; v_ck int := 0;
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_user IS NULL OR p_level NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'invalid_ban_request'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user AND COALESCE(is_admin,false)) THEN
    RAISE EXCEPTION 'cannot_ban_admin';
  END IF;
  v_until := CASE WHEN COALESCE(p_days,0) > 0 THEN now() + (p_days || ' days')::interval END;

  UPDATE public.profiles SET is_banned = true, banned_until = v_until, ban_level = p_level,
    ban_reason = COALESCE(NULLIF(btrim(p_reason),''), ban_reason), banned_at = now()
   WHERE id = p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found'; END IF;

  IF p_level >= 2 THEN
    -- Chỉ device_id ngẫu nhiên riêng của từng máy đã đăng nhập tài khoản này.
    INSERT INTO public.blocked_cookies(cookie_id, reason, level, expires_at, blocked_user_id, created_by)
    SELECT DISTINCT btrim(d.cookie_id), COALESCE(p_reason, 'ban_level_' || p_level), p_level, v_until, p_user, auth.uid()
      FROM public.device_accounts d
     WHERE d.user_id = p_user AND d.cookie_id IS NOT NULL AND btrim(d.cookie_id) <> ''
    ON CONFLICT (cookie_id) DO UPDATE SET expires_at = EXCLUDED.expires_at,
      level = GREATEST(public.blocked_cookies.level, EXCLUDED.level),
      reason = EXCLUDED.reason, blocked_user_id = EXCLUDED.blocked_user_id;
    GET DIAGNOSTICS v_ck = ROW_COUNT;
    IF p_level >= 3 AND v_ck = 0 THEN RAISE EXCEPTION 'level_3_requires_recorded_device_id'; END IF;
  END IF;

  INSERT INTO public.forced_logouts(user_id, reason) VALUES (p_user, COALESCE(p_reason, 'ban_level_' || p_level));
  INSERT INTO public.member_activity_log(user_id, action, detail)
    VALUES (p_user, 'ban', 'Khóa mức ' || p_level || COALESCE(' — ' || p_reason, ''));
  RETURN jsonb_build_object('ok', true, 'level', p_level, 'until', v_until, 'cookies', v_ck);
END $$;
GRANT EXECUTE ON FUNCTION public.admin_ban_member_level(uuid,int,text,int) TO authenticated;

-- Thiết bị bị cấm khi device_id nằm trong blocked_cookies (còn hạn) — bất kể tài khoản nào.
CREATE OR REPLACE FUNCTION public.device_is_blocked(
  p_fingerprint text DEFAULT NULL,
  p_cookie text DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_cookies c
     WHERE p_cookie IS NOT NULL AND btrim(p_cookie) <> '' AND c.cookie_id = btrim(p_cookie)
       AND (c.expires_at IS NULL OR c.expires_at > now())
  );
$fn$;
GRANT EXECUTE ON FUNCTION public.device_is_blocked(text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
