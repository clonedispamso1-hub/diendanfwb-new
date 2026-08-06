-- =====================================================================
-- FIX 2026-08-06 · admin_reset_password
-- Lỗi: column "confirmed_at" can only be updated to DEFAULT
-- auth.users.confirmed_at là GENERATED COLUMN → không được UPDATE.
-- Bản này chỉ set email_confirmed_at / phone_confirmed_at.
-- Chạy trong SQL Editor của Supabase (DB đang dùng). Idempotent.
-- =====================================================================

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
         -- KHÔNG set confirmed_at: cột generated trong auth.users, Postgres tự tính.
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
