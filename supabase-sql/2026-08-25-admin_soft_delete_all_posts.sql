-- ============================================================================
-- admin_soft_delete_all_posts — XÓA TẤT CẢ BÀI VIẾT bằng SOFT DELETE.
--
-- CÁCH CHẠY: mở SQL Editor của ĐÚNG Supabase đang chứa bảng `posts`
-- (hiện tại là Supabase #3 — xem src/lib/db/config.ts → MODULE_DB.feed),
-- dán toàn bộ file này và Run.
--
-- Đặc điểm:
--   • Chỉ set posts.deleted_at / deleted_by / delete_reason → khôi phục được.
--   • KHÔNG xóa comments, likes, messages hay bất kỳ dữ liệu nào khác.
--   • Bắt buộc gõ đúng mật mã xác nhận 'XOAHETDI'.
--   • Kèm admin_soft_delete_post / admin_restore_post / admin_purge_post để
--     3 nút Xóa / Khôi phục / Xóa vĩnh viễn chạy trên cùng database này.
-- ============================================================================

-- 0) Cột cần thiết cho soft delete ------------------------------------------
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS deleted_at    timestamptz;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS deleted_by    uuid;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS posts_deleted_at_idx ON public.posts (deleted_at);

-- 1) Helper kiểm tra admin (an toàn cả khi DB này không có bảng profiles) ----
CREATE OR REPLACE FUNCTION public.adm_is_admin()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_admin boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF to_regclass('public.profiles') IS NULL THEN
    -- DB nội dung không giữ bảng profiles → tin vào RLS + mật mã xác nhận.
    RETURN true;
  END IF;
  EXECUTE 'SELECT COALESCE(is_admin, false) FROM public.profiles WHERE id = $1'
    INTO v_admin USING auth.uid();
  RETURN COALESCE(v_admin, false);
END $$;

GRANT EXECUTE ON FUNCTION public.adm_is_admin() TO authenticated;

-- 2) Soft delete 1 bài -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_soft_delete_post(p_post_id uuid, p_reason text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.adm_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts
     SET deleted_at    = now(),
         deleted_by    = auth.uid(),
         delete_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
   WHERE id = p_post_id
     AND deleted_at IS NULL;
  RETURN FOUND;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_soft_delete_post(uuid, text) TO authenticated;

-- 3) Khôi phục 1 bài ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_restore_post(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.adm_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.posts
     SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL
   WHERE id = p_post_id;
  RETURN FOUND;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_restore_post(uuid) TO authenticated;

-- 4) Xóa vĩnh viễn 1 bài (chỉ dùng trong thùng rác) --------------------------
CREATE OR REPLACE FUNCTION public.admin_purge_post(p_post_id uuid)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.adm_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.posts WHERE id = p_post_id;
  RETURN FOUND;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_purge_post(uuid) TO authenticated;

-- 5) SOFT DELETE TOÀN BỘ bài viết -------------------------------------------
--    Trả về số bài vừa được chuyển vào thùng rác.
CREATE OR REPLACE FUNCTION public.admin_soft_delete_all_posts(
  _confirm text,
  _reason  text DEFAULT 'Admin xóa toàn bộ'
)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0;
BEGIN
  IF upper(btrim(COALESCE(_confirm, ''))) <> 'XOAHETDI' THEN
    RAISE EXCEPTION 'confirm_phrase_mismatch';
  END IF;
  IF NOT public.adm_is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- CHỈ đánh dấu posts. Không đụng comments / likes / messages.
  UPDATE public.posts
     SET deleted_at    = now(),
         deleted_by    = auth.uid(),
         delete_reason = NULLIF(btrim(COALESCE(_reason, '')), '')
   WHERE deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_soft_delete_all_posts(text, text) TO authenticated;

-- 6) Realtime: đảm bảo UPDATE (soft delete) được phát cho client -------------
ALTER TABLE public.posts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.posts;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
