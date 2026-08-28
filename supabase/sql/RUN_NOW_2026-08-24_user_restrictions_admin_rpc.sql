-- =====================================================================
-- Supabase #1 (core) — Admin RPC cho public.user_restrictions
-- Mục tiêu: Admin Panel áp dụng / gỡ / đổi thời hạn hạn chế mà KHÔNG
-- phải tắt RLS và KHÔNG mở quyền cho PUBLIC/anon.
--
-- Giữ nguyên schema thật:
--   id, user_id, kind, reason, expires_at, created_by, created_at
-- (các cột khác nếu có sẽ dùng giá trị mặc định của bảng).
--
-- Chạy 1 lần trên SQL Editor của Supabase #1.
-- =====================================================================

-- 1) Áp dụng hạn chế (thay thế hạn chế cùng loại đang tồn tại).
CREATE OR REPLACE FUNCTION public.admin_apply_restriction(
  p_user_id    uuid,
  p_kind       text,
  p_reason     text        DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL   -- NULL = vĩnh viễn
)
RETURNS public.user_restrictions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r public.user_restrictions;
BEGIN
  IF NOT public._is_current_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;

  DELETE FROM public.user_restrictions
   WHERE user_id = p_user_id AND kind = p_kind;

  INSERT INTO public.user_restrictions (user_id, kind, reason, expires_at, created_by)
  VALUES (p_user_id, p_kind, NULLIF(btrim(COALESCE(p_reason, '')), ''), p_expires_at, auth.uid())
  RETURNING * INTO r;

  RETURN r;
END; $$;

-- 2) Gỡ hạn chế.
CREATE OR REPLACE FUNCTION public.admin_revoke_restriction(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_current_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  DELETE FROM public.user_restrictions WHERE id = p_id;
  RETURN true;
END; $$;

-- 3) Đổi thời hạn.
CREATE OR REPLACE FUNCTION public.admin_set_restriction_expiry(
  p_id         uuid,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._is_current_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only';
  END IF;
  UPDATE public.user_restrictions SET expires_at = p_expires_at WHERE id = p_id;
  RETURN true;
END; $$;

-- 4) Chỉ cấp EXECUTE cho user đã đăng nhập (không cấp anon/public).
REVOKE ALL ON FUNCTION public.admin_apply_restriction(uuid, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_revoke_restriction(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_restriction_expiry(uuid, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_apply_restriction(uuid, text, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_restriction(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_restriction_expiry(uuid, timestamptz) TO authenticated;

-- 5) (tuỳ chọn, khuyến nghị) Index phục vụ lọc hạn chế còn hiệu lực.
CREATE INDEX IF NOT EXISTS user_restrictions_expires_idx
  ON public.user_restrictions (user_id, expires_at);

-- Ghi chú: hạn chế tự hết hiệu lực khi expires_at <= now()
-- (client đã lọc theo expires_at, không cần job xoá dữ liệu).
