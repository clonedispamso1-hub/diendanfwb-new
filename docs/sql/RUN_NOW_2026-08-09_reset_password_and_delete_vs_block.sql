-- =====================================================================
-- RUN NOW · 2026-08-09
-- 1) admin_reset_password  — reset thật sự (gỡ mọi blocker đăng nhập)
-- 2) admin_delete_user_data — XOÁ VĨNH VIỄN: chỉ xoá dữ liệu, KHÔNG
--    blacklist → SĐT cũ đăng ký lại được.
-- 3) admin_block_user_ip   — BLOCK IP: chuyển trạng thái block +
--    blacklist IP/Device/SĐT. Bắt buộc mã xác nhận 792006.
-- Idempotent — chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) RESET MẬT KHẨU
-- Lý do reset về 123456 mà vẫn không đăng nhập được: auth.users còn
-- banned_until, email/phone chưa confirm, hoặc còn token đổi email dở
-- dang; profiles vẫn is_banned. Hàm này dọn sạch toàn bộ.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reset_password(
  p_user_id      uuid,
  p_new_password text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, auth AS $$
DECLARE
  v_rows int := 0;
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_new_password IS NULL OR length(p_new_password) < 5 THEN
    RAISE EXCEPTION 'password_too_short';
  END IF;

  UPDATE auth.users u
     SET encrypted_password      = extensions.crypt(p_new_password, extensions.gen_salt('bf')),
         -- gỡ mọi blocker đăng nhập
         banned_until            = NULL,
         email_confirmed_at      = COALESCE(u.email_confirmed_at, now()),
         phone_confirmed_at      = CASE WHEN u.phone IS NOT NULL
                                        THEN COALESCE(u.phone_confirmed_at, now())
                                        ELSE u.phone_confirmed_at END,
         confirmed_at            = COALESCE(u.confirmed_at, now()),
         confirmation_token      = '',
         recovery_token          = '',
         email_change            = '',
         email_change_token_new  = '',
         email_change_token_current = '',
         phone_change            = '',
         phone_change_token      = '',
         reauthentication_token  = '',
         updated_at              = now()
   WHERE u.id = p_user_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN RAISE EXCEPTION 'user_not_found'; END IF;

  -- Đồng bộ profiles: mở khoá để gate phía app không chặn.
  UPDATE public.profiles
     SET is_banned = false,
         banned_until = NULL,
         permanent_banned = false
   WHERE id = p_user_id;

  -- Buộc đăng xuất mọi phiên cũ để mật khẩu mới có hiệu lực ngay.
  BEGIN DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM auth.sessions WHERE user_id = p_user_id;
  EXCEPTION WHEN others THEN NULL; END;

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid, text) TO authenticated;


-- ---------------------------------------------------------------------
-- 2) XOÁ VĨNH VIỄN (CHỈ DỮ LIỆU) — cho phép đăng ký lại bằng SĐT cũ
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_delete_user_data(
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  t     record;
  v_phone text;
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;

  SELECT phone INTO v_phone FROM public.profiles WHERE id = p_user_id;

  -- Xoá dữ liệu người dùng ở mọi bảng public có cột user_id / sender_id /
  -- receiver_id / author_id / owner_id, trừ chính profiles (xoá sau cùng).
  FOR t IN
    SELECT c.table_name, c.column_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND tb.table_type = 'BASE TABLE'
       AND c.table_name <> 'profiles'
       AND c.data_type = 'uuid'
       AND c.column_name IN ('user_id','sender_id','receiver_id','author_id',
                             'owner_id','actor_id','from_user_id','to_user_id',
                             'blocked_user_id','follower_id','following_id')
  LOOP
    BEGIN
      EXECUTE format('DELETE FROM public.%I WHERE %I = $1', t.table_name, t.column_name)
        USING p_user_id;
    EXCEPTION WHEN others THEN NULL; END;
  END LOOP;

  -- Gỡ blacklist: KHÔNG chặn đăng ký lại.
  BEGIN
    DELETE FROM public.blocked_devices
     WHERE blocked_user_id = p_user_id
        OR (v_phone IS NOT NULL AND phone = v_phone);
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.phone_blacklist WHERE phone = v_phone;
  EXCEPTION WHEN others THEN NULL; END;

  BEGIN DELETE FROM public.profiles WHERE id = p_user_id;
  EXCEPTION WHEN others THEN NULL; END;

  BEGIN DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM auth.sessions WHERE user_id = p_user_id;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM auth.identities WHERE user_id = p_user_id;
  EXCEPTION WHEN others THEN NULL; END;
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'phone', v_phone, 'can_signup_again', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_data(uuid) TO authenticated;


-- ---------------------------------------------------------------------
-- 3) BLOCK IP — giữ nguyên dữ liệu, chỉ chuyển trạng thái + blacklist
--    Bắt buộc mã xác nhận 792006.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_block_user_ip(
  p_user_id uuid,
  p_code    text,
  p_reason  text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_phone text;
  v_dev   int := 0;
  v_ph    int := 0;
BEGIN
  IF NOT public._is_current_admin() THEN RAISE EXCEPTION 'not_admin'; END IF;
  IF p_code IS DISTINCT FROM '792006' THEN RAISE EXCEPTION 'confirmation_required'; END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;

  SELECT phone INTO v_phone FROM public.profiles WHERE id = p_user_id;

  UPDATE public.profiles
     SET is_banned        = true,
         banned_until     = NULL,
         permanent_banned = true,
         ban_reason       = COALESCE(NULLIF(btrim(p_reason), ''), ban_reason),
         banned_at        = now(),
         banned_by        = v_admin
   WHERE id = p_user_id;

  INSERT INTO public.blocked_devices(fingerprint, ip, reason, blocked_user_id, created_by)
  SELECT DISTINCT d.fingerprint, d.ip,
         COALESCE(NULLIF(btrim(p_reason), ''), 'block_ip'), p_user_id, v_admin
    FROM public.device_registrations d
   WHERE d.user_id = p_user_id
     AND (d.fingerprint IS NOT NULL OR d.ip IS NOT NULL);
  GET DIAGNOSTICS v_dev = ROW_COUNT;

  IF v_phone IS NOT NULL AND length(btrim(v_phone)) > 0 THEN
    INSERT INTO public.blocked_devices(phone, reason, blocked_user_id, created_by)
    SELECT v_phone, COALESCE(NULLIF(btrim(p_reason), ''), 'block_ip'), p_user_id, v_admin
     WHERE NOT EXISTS (SELECT 1 FROM public.blocked_devices WHERE phone = v_phone);
    GET DIAGNOSTICS v_ph = ROW_COUNT;
  END IF;

  BEGIN UPDATE auth.users SET banned_until = 'infinity'::timestamptz WHERE id = p_user_id;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM auth.refresh_tokens WHERE user_id = p_user_id::text;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM auth.sessions WHERE user_id = p_user_id;
  EXCEPTION WHEN others THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'devices_blocked', v_dev,
                            'phone_blocked', v_ph, 'phone', v_phone);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_block_user_ip(uuid, text, text) TO authenticated;
