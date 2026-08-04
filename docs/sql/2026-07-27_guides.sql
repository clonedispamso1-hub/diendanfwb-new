-- =========================================================================
-- Guide Center (Hướng Dẫn) — content-managed knowledge base.
--
-- Public read for all users; only admins may write. Powered by
-- `profiles.is_admin` per existing project convention.
-- Idempotent; safe to run more than once.
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.guides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE,
  title       text NOT NULL,
  category    text,
  excerpt     text,
  body        text,
  cover_url   text,
  is_pinned   boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Data API access.
GRANT SELECT ON public.guides TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.guides TO authenticated;
GRANT ALL ON public.guides TO service_role;

ALTER TABLE public.guides ENABLE ROW LEVEL SECURITY;

-- Read: everyone.
DROP POLICY IF EXISTS guides_read_all ON public.guides;
CREATE POLICY guides_read_all ON public.guides
  FOR SELECT USING (true);

-- Write: only admins (profiles.is_admin = true).
DROP POLICY IF EXISTS guides_write_admin ON public.guides;
CREATE POLICY guides_write_admin ON public.guides
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- Auto-bump updated_at on UPDATE.
CREATE OR REPLACE FUNCTION public.guides_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guides_touch ON public.guides;
CREATE TRIGGER trg_guides_touch
  BEFORE UPDATE ON public.guides
  FOR EACH ROW EXECUTE FUNCTION public.guides_touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_guides_sort
  ON public.guides (is_pinned DESC, sort_order ASC, created_at DESC);
