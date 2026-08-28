-- ============================================================================
-- 🔐 SB1 — Bảo vệ các thao tác nhạy cảm bằng RPC verify quyền Admin ở SERVER.
-- Chạy file này trên Supabase #1 (DB cũ: gxfxqbhxoghdhokwjpex).
--
-- Trước đây client update thẳng bảng (profiles.approval_status, posts.status),
-- nghĩa là user có thể tự chế request nếu RLS lỏng. Nay mọi thao tác đi qua
-- RPC SECURITY DEFINER và luôn kiểm tra public._is_current_admin() (đọc cột
-- boolean is_admin trong DB + bảng user_roles).
-- ============================================================================

-- 1) Duyệt / từ chối tài khoản ------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_profile_approval(
  p_user_id uuid,
  p_status  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;
  IF NOT public._is_current_admin() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Bạn không có quyền admin');
  END IF;
  IF p_status NOT IN ('approved', 'rejected', 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Trạng thái không hợp lệ');
  END IF;

  UPDATE public.profiles SET approval_status = p_status WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Không tìm thấy hồ sơ');
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', p_status);
END;
$$;

-- 2) Duyệt / xoá bài viết chờ duyệt -------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_review_pending_post(
  p_post_id uuid,
  p_action  text   -- 'approve' | 'reject'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;
  IF NOT public._is_current_admin() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Bạn không có quyền admin');
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.posts SET status = 'published' WHERE id = p_post_id;
  ELSIF p_action = 'reject' THEN
    DELETE FROM public.posts WHERE id = p_post_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ACTION', 'message', 'Hành động không hợp lệ');
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Không tìm thấy bài viết');
  END IF;

  RETURN jsonb_build_object('ok', true, 'action', p_action);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_profile_approval(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.admin_review_pending_post(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_approval(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_pending_post(uuid, text) TO authenticated;
