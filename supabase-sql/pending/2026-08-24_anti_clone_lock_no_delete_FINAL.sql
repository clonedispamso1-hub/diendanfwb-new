-- =====================================================================
-- ANTI CLONE — FIX CUỐI: KHÓA, KHÔNG XÓA TÀI KHOẢN
-- CHẠY THỦ CÔNG trên Supabase #1 (DB đang dùng). Idempotent, additive.
-- KHÔNG đổi URL / API key, KHÔNG tạo project mới, KHÔNG xoá dữ liệu.
--
-- Sửa lỗi: bản 20260824090000 xoá public.profiles + auth.users ở CẢ 3 MỨC
-- → tài khoản biến mất khỏi tab "Đã khóa" và không thể mở khóa lại.
--
-- Hành vi đúng sau khi chạy file này:
--   Mức 1: khóa + ép đăng xuất + ẩn bài viết.
--   Mức 2: (1) + blacklist SĐT.
--   Mức 3: (2) + block fingerprint / cookie / IP thật (security block).
--   KHÔNG mức nào xoá profiles, auth.users, device_accounts,
--   comment hay message. Chỉ tác động đúng 1 tài khoản được chọn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Cột cần thiết cho luồng khóa / mở khóa (an toàn nếu đã có)
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned  boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_level  int     NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at  timestamptz;

-- ---------------------------------------------------------------------
-- 1) RPC chính — KHÓA, KHÔNG XÓA
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
  v_x         text;
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

  -- Ép đăng xuất ngay (client lắng nghe realtime).
  BEGIN
    INSERT INTO public.forced_logouts (user_id, reason) VALUES (p_user, v_reason);
  EXCEPTION WHEN others THEN NULL; END;

  -- Ẩn bài viết (KHÔNG xoá). Comment / message giữ nguyên.
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
    INSERT INTO public.phone_blacklist (phone, reason, level, blocked_user_id, created_by)
    SELECT v_norm, v_reason, p_level, p_user, v_admin_id
     WHERE NOT EXISTS (SELECT 1 FROM public.phone_blacklist b
                        WHERE public.ac_normalize_phone(b.phone) = v_norm);
    UPDATE public.phone_blacklist
       SET reason = v_reason, level = GREATEST(COALESCE(level,0), p_level),
           blocked_user_id = p_user, created_by = v_admin_id, expires_at = NULL
     WHERE public.ac_normalize_phone(phone) = v_norm;
    v_phone_bl := true;
  END IF;

  ------------------------------------------------------------------ MỨC 3
  IF p_level >= 3 THEN
    IF public.is_valid_public_ip(p_ip) THEN v_ips := array_append(v_ips, btrim(p_ip)); END IF;
    IF NULLIF(btrim(COALESCE(p_fingerprint,'')),'') IS NOT NULL THEN
      v_fps := array_append(v_fps, btrim(p_fingerprint));
    END IF;
    IF NULLIF(btrim(COALESCE(p_cookie,'')),'') IS NOT NULL THEN
      v_cks := array_append(v_cks, btrim(p_cookie));
    END IF;

    BEGIN
      SELECT v_ips || COALESCE(array_agg(DISTINCT btrim(d.ip))
                        FILTER (WHERE public.is_valid_public_ip(d.ip)), '{}'::text[]),
             v_fps || COALESCE(array_agg(DISTINCT btrim(d.fingerprint))
                        FILTER (WHERE NULLIF(btrim(COALESCE(d.fingerprint,'')),'') IS NOT NULL), '{}'::text[]),
             v_cks || COALESCE(array_agg(DISTINCT btrim(d.cookie_id))
                        FILTER (WHERE NULLIF(btrim(COALESCE(d.cookie_id,'')),'') IS NOT NULL), '{}'::text[])
        INTO v_ips, v_fps, v_cks
        FROM public.device_accounts d
       WHERE d.user_id = p_user;
    EXCEPTION WHEN others THEN NULL; END;

    -- IP: bỏ qua IP đang được tài khoản khác (không bị khóa) sử dụng.
    FOREACH v_x IN ARRAY v_ips LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.device_accounts d2
          JOIN public.profiles p2 ON p2.id = d2.user_id
         WHERE d2.ip = v_x AND d2.user_id <> p_user
           AND COALESCE(p2.is_banned,false) = false
      );
      INSERT INTO public.blocked_ips (ip, reason, level, blocked_user_id, created_by)
      SELECT v_x, v_reason, 3, p_user, v_admin_id
       WHERE NOT EXISTS (SELECT 1 FROM public.blocked_ips WHERE ip = v_x);
      UPDATE public.blocked_ips
         SET reason = v_reason, level = 3, blocked_user_id = p_user,
             created_by = v_admin_id, expires_at = NULL
       WHERE ip = v_x;
      v_ip_block := true;
    END LOOP;

    FOREACH v_x IN ARRAY v_fps LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.device_accounts d2
          JOIN public.profiles p2 ON p2.id = d2.user_id
         WHERE d2.fingerprint = v_x AND d2.user_id <> p_user
           AND COALESCE(p2.is_banned,false) = false
      );
      INSERT INTO public.blocked_devices (fingerprint, reason, level, blocked_user_id, created_by)
      SELECT v_x, v_reason, 3, p_user, v_admin_id
       WHERE NOT EXISTS (SELECT 1 FROM public.blocked_devices WHERE fingerprint = v_x);
      UPDATE public.blocked_devices
         SET reason = v_reason, level = 3, blocked_user_id = p_user,
             created_by = v_admin_id, expires_at = NULL
       WHERE fingerprint = v_x;
      v_dev_block := true;
    END LOOP;

    FOREACH v_x IN ARRAY v_cks LOOP
      INSERT INTO public.blocked_cookies (cookie_id, reason, level, blocked_user_id, created_by)
      SELECT v_x, v_reason, 3, p_user, v_admin_id
       WHERE NOT EXISTS (SELECT 1 FROM public.blocked_cookies WHERE cookie_id = v_x);
      UPDATE public.blocked_cookies
         SET reason = v_reason, level = 3, blocked_user_id = p_user,
             created_by = v_admin_id, expires_at = NULL
       WHERE cookie_id = v_x;
      v_dev_block := true;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'level', p_level,
    'deleted', false,          -- KHÔNG BAO GIỜ xoá tài khoản nữa
    'phone_blacklisted', v_phone_bl,
    'ip_blocked', v_ip_block,
    'device_blocked', v_dev_block
  );
END $$;

REVOKE ALL ON FUNCTION public.admin_anti_clone_purge(uuid,int,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_anti_clone_purge(uuid,int,text,text,text,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) Mở khóa — đối xứng hoàn toàn với purge
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_anti_clone_restore(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_norm text;
BEGIN
  IF NOT public.mi_is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user IS NULL THEN RAISE EXCEPTION 'user_required' USING ERRCODE = 'P0001'; END IF;

  SELECT public.ac_normalize_phone(phone) INTO v_norm FROM public.profiles WHERE id = p_user;

  UPDATE public.profiles
     SET is_banned = false, ban_level = 0, ban_reason = NULL, banned_at = NULL
   WHERE id = p_user;

  IF to_regclass('public.posts') IS NOT NULL THEN
    BEGIN
      EXECUTE 'UPDATE public.posts SET is_hidden = false WHERE user_id = $1' USING p_user;
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  -- Chỉ gỡ các bản ghi chặn thuộc chính tài khoản này.
  BEGIN
    DELETE FROM public.phone_blacklist
     WHERE blocked_user_id = p_user
        OR (v_norm IS NOT NULL AND public.ac_normalize_phone(phone) = v_norm);
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.blocked_devices WHERE blocked_user_id = p_user;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.blocked_cookies WHERE blocked_user_id = p_user;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.blocked_ips     WHERE blocked_user_id = p_user;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.forced_logouts  WHERE user_id = p_user;
  EXCEPTION WHEN others THEN NULL; END;

  BEGIN
    INSERT INTO public.member_activity_log (user_id, action, detail)
    VALUES (p_user, 'anti_clone_unlock', 'Mở khóa Anti Clone');
  EXCEPTION WHEN others THEN NULL; END;

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.admin_anti_clone_restore(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_anti_clone_restore(uuid) TO authenticated;
