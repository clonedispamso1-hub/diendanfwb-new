-- ============================================================
-- FWB Feed V3 — Category System + Location Fields
-- Idempotent. No DROP. Existing data preserved.
-- ============================================================

-- `category` already exists on public.posts (text/enum) — no ALTER needed.
-- Sub-tag stored as text so we can reuse across FWB / ONS / Dating / …
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS relationship_type text;

-- Location tagging for the "matching board" pages (FWB / ONS / Dating).
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS district text;

-- Speed up per-category timeline queries.
CREATE INDEX IF NOT EXISTS idx_posts_category_created
  ON public.posts (category, created_at DESC);

-- Speed up filters like "all FWB_HOT posts".
CREATE INDEX IF NOT EXISTS idx_posts_relationship_type
  ON public.posts (relationship_type)
  WHERE relationship_type IS NOT NULL;

-- Speed up "posts near {province}/{district}" filters.
CREATE INDEX IF NOT EXISTS idx_posts_location
  ON public.posts (province, district)
  WHERE province IS NOT NULL;
