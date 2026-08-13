-- ============================================================
-- V6.5 — SOFT DELETE cho public.posts (Thùng rác bài viết)
-- Chạy trực tiếp trong Supabase SQL Editor. Không phụ thuộc pg_cron.
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by   UUID,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS posts_deleted_at_idx ON public.posts (deleted_at DESC);

-- Helper admin (idempotent)
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated;

-- Ẩn bài đã xóa khỏi MỌI truy vấn của người dùng thường.
-- RESTRICTIVE => AND với các policy SELECT sẵn có, không phải sửa policy cũ.
DROP POLICY IF EXISTS "Hide soft-deleted posts" ON public.posts;
CREATE POLICY "Hide soft-deleted posts"
  ON public.posts AS RESTRICTIVE FOR SELECT
  TO anon, authenticated
  USING (deleted_at IS NULL OR public.is_current_user_admin());

-- ---------------- RPC ----------------

CREATE OR REPLACE FUNCTION public.admin_soft_delete_post(p_post_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.posts
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         delete_reason = NULLIF(btrim(coalesce(p_reason, '')), '')
   WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_restore_post(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.posts
     SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
   WHERE id = p_post_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_purge_post(p_post_id UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.posts WHERE id = p_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_soft_delete_post(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_restore_post(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_purge_post(UUID) TO authenticated;

-- ---------------- Cấu hình popup VIP dùng chung ----------------
INSERT INTO public.admin_site_settings (key, value)
VALUES ('vip_unlock_popup', jsonb_build_object(
  'title', 'MỞ KHÓA TÍNH NĂNG',
  'message', 'Tài khoản của bạn hiện chưa thể sử dụng tính năng này.',
  'benefits', jsonb_build_array('Gọi Voice','Video Call','Live','Kết bạn Zalo','Xem số Zalo','Hỗ trợ trực tiếp từ Admin'),
  'icon', 'lock',
  'buttonLabel', 'Liên hệ Admin',
  'link', ''
))
ON CONFLICT (key) DO NOTHING;
