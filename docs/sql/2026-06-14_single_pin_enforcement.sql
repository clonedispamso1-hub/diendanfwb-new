-- =====================================================================
-- SINGLE-PIN ENFORCEMENT (2026-06-14)
-- Chạy thủ công trong Supabase SQL Editor. Idempotent.
-- Đảm bảo TẠI BẤT KỲ THỜI ĐIỂM nào chỉ có 1 bài pinned trong public.posts.
-- Khi ghim bài mới: tự động unpin tất cả bài còn lại.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.admin_pin_post(p_post_id uuid, p_hours integer)
RETURNS public.posts LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.posts;
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_hours IS NULL OR p_hours <= 0 THEN
    -- Bỏ ghim bài này
    UPDATE public.posts
       SET is_pinned = false, pinned_until = NULL
     WHERE id = p_post_id
     RETURNING * INTO r;
  ELSE
    -- 1) Unpin tất cả bài khác trước
    UPDATE public.posts
       SET is_pinned = false, pinned_until = NULL
     WHERE id <> p_post_id
       AND is_pinned = true;

    -- 2) Pin bài mới
    UPDATE public.posts
       SET is_pinned    = true,
           pinned_until = now() + make_interval(hours => p_hours)
     WHERE id = p_post_id
     RETURNING * INTO r;
  END IF;

  RETURN r;
END$$;

GRANT EXECUTE ON FUNCTION public.admin_pin_post(uuid, integer) TO authenticated;

-- One-off cleanup: nếu đang có nhiều bài pinned, chỉ giữ lại bài mới nhất.
WITH keep AS (
  SELECT id FROM public.posts
   WHERE is_pinned = true
   ORDER BY COALESCE(pinned_until, now() + interval '100 years') DESC, created_at DESC
   LIMIT 1
)
UPDATE public.posts
   SET is_pinned = false, pinned_until = NULL
 WHERE is_pinned = true
   AND id NOT IN (SELECT id FROM keep);
