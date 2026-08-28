-- =====================================================================
-- KHÔI PHỤC TÀI KHOẢN ADMIN BỊ KHÓA NHẦM (Anti Clone)
-- Chạy thủ công trên SQL Editor. KHÔNG whitelist IP toàn cục.
-- Chỉ gỡ đúng các bản ghi block sinh ra bởi lần khóa nhầm này
-- (blocked_user_id = tài khoản admin đó). Block của user khác giữ nguyên.
-- =====================================================================

-- 1) Hàm khôi phục — chỉ admin gọi được.
CREATE OR REPLACE FUNCTION public.admin_restore_admin_account(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.mi_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.profiles
     SET is_banned = false,
         ban_level = 0,
         ban_reason = NULL,
         banned_at = NULL,
         is_admin = true
   WHERE id = p_user;

  BEGIN DELETE FROM public.blocked_ips      WHERE blocked_user_id = p_user; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.blocked_devices  WHERE blocked_user_id = p_user; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.blocked_cookies  WHERE blocked_user_id = p_user; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.phone_blacklist  WHERE blocked_user_id = p_user; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.blocked_phones   WHERE blocked_user_id = p_user; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.forced_logouts   WHERE user_id = p_user;         EXCEPTION WHEN others THEN NULL; END;

  BEGIN
    INSERT INTO public.member_activity_log (user_id, action, detail)
    VALUES (p_user, 'unban', 'Khôi phục tài khoản admin bị khóa nhầm');
  EXCEPTION WHEN others THEN NULL; END;

  v := jsonb_build_object('ok', true, 'user', p_user);
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.admin_restore_admin_account(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- =====================================================================
-- 2) KHÔI PHỤC NGAY (chạy trực tiếp, không cần đăng nhập admin)
--    Thay 'TEN_ADMIN' bằng username (hoặc dùng email/SĐT ở WHERE).
-- =====================================================================
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.profiles WHERE username = 'TEN_ADMIN';
  IF v_id IS NULL THEN RAISE EXCEPTION 'Không tìm thấy tài khoản'; END IF;

  UPDATE public.profiles
     SET is_banned = false, ban_level = 0, ban_reason = NULL,
         banned_at = NULL, is_admin = true
   WHERE id = v_id;

  BEGIN DELETE FROM public.blocked_ips      WHERE blocked_user_id = v_id; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.blocked_devices  WHERE blocked_user_id = v_id; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.blocked_cookies  WHERE blocked_user_id = v_id; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.phone_blacklist  WHERE blocked_user_id = v_id; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.blocked_phones   WHERE blocked_user_id = v_id; EXCEPTION WHEN others THEN NULL; END;
  BEGIN DELETE FROM public.forced_logouts   WHERE user_id = v_id;         EXCEPTION WHEN others THEN NULL; END;
END $$;

-- 3) KIỂM TRA
-- SELECT id, username, is_admin, is_banned, ban_level FROM public.profiles WHERE username = 'TEN_ADMIN';
-- SELECT * FROM public.blocked_devices WHERE blocked_user_id = (SELECT id FROM public.profiles WHERE username='TEN_ADMIN');
