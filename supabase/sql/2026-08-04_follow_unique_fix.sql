-- ============================================================
-- FIX BUG THẢ TIM (buff tim) — chạy 1 lần trên Supabase (SQL Editor)
-- Mỗi cặp (follower_id, following_id) chỉ tồn tại ĐÚNG 1 record.
-- ============================================================

-- 1) Dọn record trùng (giữ lại bản ghi cũ nhất của mỗi cặp)
DELETE FROM public.follows f
USING public.follows keep
WHERE f.follower_id = keep.follower_id
  AND f.following_id = keep.following_id
  AND f.ctid > keep.ctid;

-- 2) Chặn tự thả tim chính mình
DELETE FROM public.follows WHERE follower_id = following_id;

-- 3) UNIQUE constraint — DB là nguồn sự thật, frontend không thể buff
CREATE UNIQUE INDEX IF NOT EXISTS follows_unique_pair
  ON public.follows (follower_id, following_id);

-- 4) (tuỳ chọn) Chặn ở tầng DB việc tự thả tim
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'follows_no_self'
  ) THEN
    ALTER TABLE public.follows
      ADD CONSTRAINT follows_no_self CHECK (follower_id <> following_id);
  END IF;
END $$;
