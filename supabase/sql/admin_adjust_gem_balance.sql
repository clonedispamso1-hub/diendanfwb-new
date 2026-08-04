-- =====================================================================
-- RPC ADMIN: cộng / trừ Gem an toàn (bypass trigger chống sửa client)
-- Chạy 1 lần trong Supabase SQL Editor của project zbuwddjcqdlyijcunwgd.
-- =====================================================================
-- Hàm chạy SECURITY DEFINER với owner = postgres, nên trigger chặn
-- "gem_balance" từ client KHÔNG áp dụng cho hàm này.
-- Chỉ user có role 'admin' hoặc 'super_admin' trong bảng user_roles
-- (hoặc bảng profiles cột role) mới được phép gọi.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_adjust_gem_balance(
  p_target_user_id uuid,
  p_amount         bigint,        -- số dương = cộng, âm = trừ
  p_reason         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_is_admin boolean := false;
  v_old      bigint;
  v_new      bigint;
  v_max      bigint := 9223372036854775000;  -- cận trên an toàn
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;

  -- Kiểm tra quyền admin (tương thích cả 2 mô hình: user_roles & profiles.role)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller AND role::text IN ('admin','super_admin','moderator')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    SELECT (role IN ('admin','super_admin','moderator'))
      INTO v_is_admin
      FROM public.profiles
      WHERE id = v_caller;
  END IF;

  IF NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Bạn không có quyền admin');
  END IF;

  IF p_amount IS NULL OR p_amount = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ');
  END IF;

  -- Khoá hàng để tránh race condition
  SELECT COALESCE(gem_balance, 0)
    INTO v_old
    FROM public.profiles
    WHERE id = p_target_user_id
    FOR UPDATE;

  IF v_old IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'USER_NOT_FOUND', 'message', 'Không tìm thấy user');
  END IF;

  v_new := v_old + p_amount;
  IF v_new < 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE',
      'message', 'Số dư không đủ để trừ', 'old', v_old, 'requested', p_amount);
  END IF;
  IF v_new > v_max THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OVERFLOW', 'message', 'Vượt giới hạn Gem');
  END IF;

  UPDATE public.profiles
     SET gem_balance = v_new
   WHERE id = p_target_user_id;

  -- Best-effort ghi log nếu có bảng activity_log / admin_logs (không bắt buộc).
  BEGIN
    INSERT INTO public.admin_logs(admin_id, target_id, action, detail, created_at)
    VALUES (v_caller, p_target_user_id, 'adjust_gem',
            jsonb_build_object('amount', p_amount, 'old', v_old, 'new', v_new, 'reason', p_reason),
            now());
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'old', v_old, 'new', v_new, 'amount', p_amount);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_gem_balance(uuid, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_adjust_gem_balance(uuid, bigint, text) TO authenticated;
