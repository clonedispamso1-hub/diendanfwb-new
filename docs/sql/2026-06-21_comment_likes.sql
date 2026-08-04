-- ============================================================
-- 2026-06-21 — comment_likes (persistent comment reactions)
-- Safe to re-run. Does NOT modify posts / comments / profiles.
-- Run inside the Supabase SQL editor of the project currently
-- in use (db: zbuwddjcqdlyijcunwgd).
-- ============================================================

-- 1. Table ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.comment_likes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id  uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id)      ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comment_likes_unique UNIQUE (comment_id, user_id)
);

-- 2. Grants (PostgREST needs explicit grants on public schema)
GRANT SELECT, INSERT, DELETE ON public.comment_likes TO authenticated;
GRANT SELECT                 ON public.comment_likes TO anon;
GRANT ALL                    ON public.comment_likes TO service_role;

-- 3. Indexes --------------------------------------------------
CREATE INDEX IF NOT EXISTS comment_likes_comment_idx ON public.comment_likes (comment_id);
CREATE INDEX IF NOT EXISTS comment_likes_user_idx    ON public.comment_likes (user_id);
CREATE INDEX IF NOT EXISTS comment_likes_created_idx ON public.comment_likes (created_at DESC);

-- 4. RLS ------------------------------------------------------
ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comment_likes_select_all"  ON public.comment_likes;
DROP POLICY IF EXISTS "comment_likes_insert_own"  ON public.comment_likes;
DROP POLICY IF EXISTS "comment_likes_delete_own"  ON public.comment_likes;

-- Anyone authenticated (and anon for public reads) can see who liked.
CREATE POLICY "comment_likes_select_all"
  ON public.comment_likes
  FOR SELECT
  USING (true);

-- A user may only insert a like as themselves.
CREATE POLICY "comment_likes_insert_own"
  ON public.comment_likes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- A user may only remove their own like.
CREATE POLICY "comment_likes_delete_own"
  ON public.comment_likes
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 5. Realtime -------------------------------------------------
-- Add table to the supabase_realtime publication so the frontend
-- receives INSERT / DELETE events instantly. Safe if already added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'comment_likes'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.comment_likes';
  END IF;
END$$;
