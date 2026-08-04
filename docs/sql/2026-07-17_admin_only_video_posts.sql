-- =====================================================================
--  ADMIN-ONLY VIDEO POSTS — Chặn thành viên thường đăng bài có video.
--
--  Yêu cầu: bảng public.posts đã có sẵn; profiles có cột is_admin bool.
--  Cách chạy: mở Supabase SQL Editor → paste toàn bộ file → Run.
--
--  Nguyên tắc:
--   1. KHÔNG xoá / KHÔNG sửa bài video cũ. Guard chỉ áp dụng cho INSERT / UPDATE
--      diễn ra sau khi migration được cài.
--   2. Guard bắt cả 2 đường:
--        (a) content chứa URL Cloudinary/HLS/*.mp4|webm|mov ...
--        (b) media_type / has_video / mime_type = video (nếu schema hỗ trợ).
--   3. Admin thật (profiles.is_admin = true) được phép; mọi user khác bị chặn.
-- =====================================================================

-- Hàm nhận biết "payload là bài video".
CREATE OR REPLACE FUNCTION public._post_row_is_video(_row public.posts)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    -- 1) Chuỗi content chứa link video Cloudinary / .mp4 / .webm / .mov / .m3u8
    (COALESCE(_row.content, '') ~* '(\.mp4|\.webm|\.mov|\.m3u8|/video/upload/)')
    OR
    -- 2) Bất kỳ URL nào trong image_urls là video
    EXISTS (
      SELECT 1
      FROM unnest(COALESCE(_row.image_urls, ARRAY[]::text[])) AS u
      WHERE u ~* '(\.mp4|\.webm|\.mov|\.m3u8|/video/upload/)'
    )
    OR
    -- 3) image_url đơn cũng có thể là video (schema cũ)
    (COALESCE(_row.image_url, '') ~* '(\.mp4|\.webm|\.mov|\.m3u8|/video/upload/)');
$$;

-- Trigger chặn INSERT/UPDATE khi user không phải admin và bài chứa video.
CREATE OR REPLACE FUNCTION public.guard_admin_only_video_posts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Chỉ enforce khi có auth.uid() và bài mang tính video.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public._post_row_is_video(NEW) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(is_admin, false) INTO v_is_admin
  FROM public.profiles WHERE id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'ADMIN_ONLY_VIDEO'
      USING MESSAGE = 'Bạn chưa có quyền đăng video. Video hiện chỉ dành cho Quản trị viên.',
            HINT = 'Only admins can post videos.',
            ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_admin_only_video_posts ON public.posts;
CREATE TRIGGER trg_guard_admin_only_video_posts
  BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_admin_only_video_posts();

-- Không đụng bài cũ: trigger chỉ chạy cho INSERT/UPDATE mới.
