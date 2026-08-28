-- ============================================================
-- FILE NÀY CHẠY TRÊN SUPABASE #3 (logs/stats)
-- URL: https://uaqsetfdciyzxpuhulux.supabase.co
-- Lý do: posts + comments đã cutover sang Supabase #3 (MODULE_DB.feed / comments = "logs")
-- KHÔNG chạy file này trên Supabase #1 hoặc #2.
-- ============================================================

-- ---------- POSTS ----------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS moderation_status  text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_reason  text,
  ADD COLUMN IF NOT EXISTS moderation_keyword text,
  ADD COLUMN IF NOT EXISTS moderated_at       timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_moderation_status_check'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_moderation_status_check
      CHECK (moderation_status IN ('approved', 'pending', 'flagged', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_posts_moderation_status
  ON public.posts (moderation_status);

CREATE INDEX IF NOT EXISTS idx_posts_moderation_status_created_at
  ON public.posts (moderation_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_moderated_at
  ON public.posts (moderated_at DESC)
  WHERE moderated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_posts_moderation_keyword
  ON public.posts (moderation_keyword)
  WHERE moderation_keyword IS NOT NULL;

-- ---------- COMMENTS ----------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS moderation_status  text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS moderation_reason  text,
  ADD COLUMN IF NOT EXISTS moderation_keyword text,
  ADD COLUMN IF NOT EXISTS moderated_at       timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_moderation_status_check'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_moderation_status_check
      CHECK (moderation_status IN ('approved', 'pending', 'flagged', 'rejected'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_comments_moderation_status
  ON public.comments (moderation_status);

CREATE INDEX IF NOT EXISTS idx_comments_moderation_status_created_at
  ON public.comments (moderation_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_moderated_at
  ON public.comments (moderated_at DESC)
  WHERE moderated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_moderation_keyword
  ON public.comments (moderation_keyword)
  WHERE moderation_keyword IS NOT NULL;
