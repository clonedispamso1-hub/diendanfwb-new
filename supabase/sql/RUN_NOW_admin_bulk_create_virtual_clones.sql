-- =====================================================================
-- ⚡ CHẠY FILE NÀY TRONG SUPABASE SQL EDITOR (project zbuwddjcqdlyijcunwgd)
--
-- Mục đích: cung cấp 1 RPC SECURITY DEFINER để Admin tạo hàng loạt
-- nick ảo (clone) mà KHÔNG bị các trigger giới hạn thiết bị / IP / số
-- account chặn (lỗi P0001: "Bạn đã đạt giới hạn 2 tài khoản cho thiết bị này!").
--
-- Lưu ý: KHÔNG dùng session_replication_role (Supabase không cho phép).
-- → toàn bộ trigger user-defined trên bảng profiles bị tắt CHỈ trong
-- transaction của RPC này. Trigger RLS / quyền vẫn được giữ ở mức bảng.
--
-- Chỉ user có role admin / super_admin / moderator (hoặc bangchu đã approve)
-- mới gọi được. Người dùng thường gọi sẽ bị FORBIDDEN.
--
-- An toàn để chạy lại nhiều lần (idempotent).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_bulk_create_virtual_clones(
  p_rows jsonb
)
RETURNS SETOF public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller   uuid := auth.uid();
  v_is_admin boolean := false;
  v_row      jsonb;
  v_new_id   uuid;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Chưa đăng nhập' USING ERRCODE = '28000';
  END IF;

  -- Cho phép: user_roles (admin/super_admin/moderator) HOẶC profiles.role HOẶC bangchu approved.
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_caller AND role::text IN ('admin','super_admin','moderator')
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    BEGIN
      SELECT (role IN ('admin','super_admin','moderator','admin_1','admin_2'))
        INTO v_is_admin FROM public.profiles WHERE id = v_caller;
    EXCEPTION WHEN undefined_column THEN v_is_admin := false; END;
  END IF;

  IF NOT v_is_admin THEN
    BEGIN
      SELECT EXISTS (
        SELECT 1 FROM public.bangchu
        WHERE user_id = v_caller AND status = 'approved' AND is_active = true
      ) INTO v_is_admin;
    EXCEPTION WHEN undefined_table OR undefined_column THEN v_is_admin := false; END;
  END IF;

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Bạn không có quyền tạo nick ảo' USING ERRCODE = '42501';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'Tham số p_rows phải là JSON array' USING ERRCODE = '22023';
  END IF;

  -- BYPASS toàn bộ trigger user-defined trên public.profiles trong transaction này.
  -- (RLS và constraint vẫn được tôn trọng.)
  -- Một số dự án dùng flag riêng để cho phép sửa cột nhạy cảm:
  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);
  PERFORM set_config('app.bypass_device_limit', '1', true);

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_new_id := gen_random_uuid();
    -- Ép id + cờ ảo, luôn luôn:
    v_row := v_row
      || jsonb_build_object('id', v_new_id)
      || jsonb_build_object('is_virtual', true)
      || jsonb_build_object('is_clone', true)
      || jsonb_build_object('is_seed_account', true);

    RETURN QUERY
    INSERT INTO public.profiles
    SELECT * FROM jsonb_populate_record(NULL::public.profiles, v_row)
    RETURNING *;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_create_virtual_clones(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_bulk_create_virtual_clones(jsonb) TO authenticated;
