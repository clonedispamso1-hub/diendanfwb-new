-- ============================================================
-- ADMIN MODERATION CONTROLS FOR public.posts
-- Run this in your Supabase SQL editor against the existing DB.
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bumped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS comments_disabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_level INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS posts_feed_order_idx
  ON public.posts (is_pinned DESC, priority_level DESC, COALESCE(bumped_at, created_at) DESC);

-- Helper to check admin (reads profiles.is_admin, no hardcoded email)
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

-- Admin override policies (alongside existing owner policies)
DROP POLICY IF EXISTS "Admins can update any post" ON public.posts;
CREATE POLICY "Admins can update any post"
  ON public.posts FOR UPDATE TO authenticated
  USING (public.is_current_user_admin())
  WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS "Admins can delete any post" ON public.posts;
CREATE POLICY "Admins can delete any post"
  ON public.posts FOR DELETE TO authenticated
  USING (public.is_current_user_admin());
