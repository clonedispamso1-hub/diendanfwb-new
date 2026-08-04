-- =========================================================================
-- Admin Notice / "Quan trọng" system.
--
-- Adds columns required to publish admin announcements and to track
-- per-user read state without touching the existing posts flow.
--
-- The user will run this SQL manually in Supabase (per their request).
-- Idempotent: safe to run more than once.
-- =========================================================================

-- 1. Columns on public.posts ------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_admin_post   boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_priority  text          NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS is_popup        boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pinned       boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_until    timestamptz   NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'posts_admin_priority_check'
  ) THEN
    ALTER TABLE public.posts
      ADD CONSTRAINT posts_admin_priority_check
      CHECK (admin_priority IN ('urgent', 'important', 'info'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS posts_admin_notice_idx
  ON public.posts (is_admin_post, is_pinned DESC, created_at DESC)
  WHERE is_admin_post = true;

CREATE INDEX IF NOT EXISTS posts_admin_popup_idx
  ON public.posts (created_at DESC)
  WHERE is_admin_post = true AND is_popup = true;

-- 2. Read tracking ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_notice_reads (
  user_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  post_id  uuid        NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_notice_reads TO authenticated;
GRANT ALL ON public.admin_notice_reads TO service_role;

ALTER TABLE public.admin_notice_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own admin_notice_reads"
  ON public.admin_notice_reads;

CREATE POLICY "users manage own admin_notice_reads"
  ON public.admin_notice_reads
  FOR ALL
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS admin_notice_reads_user_idx
  ON public.admin_notice_reads (user_id, read_at DESC);

-- 3. RPC helpers -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unread_admin_notices_count(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.posts p
  WHERE p.is_admin_post = true
    AND NOT EXISTS (
      SELECT 1 FROM public.admin_notice_reads r
      WHERE  r.user_id = _user_id
        AND  r.post_id = p.id
    );
$$;

CREATE OR REPLACE FUNCTION public.mark_admin_notices_read(_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.admin_notice_reads (user_id, post_id)
  SELECT _user_id, p.id
  FROM   public.posts p
  WHERE  p.is_admin_post = true
  ON CONFLICT DO NOTHING;
$$;

GRANT EXECUTE ON FUNCTION public.unread_admin_notices_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_admin_notices_read(uuid)    TO authenticated;
