-- =====================================================================
-- CANDY ADMIN / REPORTS / REPUTATION / NOTIFICATIONS — PRODUCTION SAFE SYNC
-- Target: existing long-running project database (NOT an empty database)
-- Rerun-safe: yes. Designed to avoid data loss and avoid one-error-at-a-time fixes.
--
-- Guarantees:
--   - Creates required tables only when missing.
--   - Adds every required column with ADD COLUMN IF NOT EXISTS.
--   - Backfills NULLs before defaults / NOT NULL.
--   - Applies NOT NULL only after the table has no NULL for that column.
--   - Adds FK / UNIQUE / CHECK constraints only when safe and guarded.
--   - Uses NOT VALID for FK/CHECK constraints so old bad rows do not block the migration.
--   - Uses CREATE INDEX IF NOT EXISTS.
--   - Drops/recreates triggers and policies idempotently.
--   - Uses CREATE OR REPLACE FUNCTION for all RPC/helpers.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------
-- Helper functions for safe DDL on a live database
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.candy__table_exists(p_table text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT to_regclass('public.' || quote_ident(p_table)) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.candy__column_exists(p_table text, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table
      AND column_name = p_column
  );
$$;

CREATE OR REPLACE FUNCTION public.candy__constraint_exists(p_table text, p_constraint text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = p_table
      AND c.conname = p_constraint
  );
$$;

CREATE OR REPLACE FUNCTION public.candy__set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Legacy-compatible alias used by older SQL/features.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- 1) CREATE TABLE IF NOT EXISTS — minimal definitions only
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (id uuid);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

CREATE TABLE IF NOT EXISTS public.posts (id uuid);
GRANT SELECT ON public.posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;

CREATE TABLE IF NOT EXISTS public.comments (id uuid);
GRANT SELECT ON public.comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;

CREATE TABLE IF NOT EXISTS public.reports (id uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

CREATE TABLE IF NOT EXISTS public.report_messages (id uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_messages TO authenticated;
GRANT ALL ON public.report_messages TO service_role;

CREATE TABLE IF NOT EXISTS public.notifications (id uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE TABLE IF NOT EXISTS public.reputation_history (id uuid);
GRANT SELECT, INSERT ON public.reputation_history TO authenticated;
GRANT ALL ON public.reputation_history TO service_role;

CREATE TABLE IF NOT EXISTS public.admin_logs (id uuid);
GRANT SELECT, INSERT ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;

CREATE TABLE IF NOT EXISTS public.pinned_posts (id uuid);
GRANT SELECT ON public.pinned_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pinned_posts TO authenticated;
GRANT ALL ON public.pinned_posts TO service_role;

CREATE TABLE IF NOT EXISTS public.banned_words (id uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.banned_words TO authenticated;
GRANT ALL ON public.banned_words TO service_role;

-- ---------------------------------------------------------------------
-- 2) ADD COLUMNS IF NOT EXISTS — never add NOT NULL directly
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS public_id text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS province text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_status text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_locked boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_online boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_virtual boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_seed_account boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location_ready boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_fwb_active boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_onboarding_completed boolean;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gem_balance integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS candy integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS followers_count integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_level integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vip_exp integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS trust_score integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reputation integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS reputation_score integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name_changes integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS height integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weight integer;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS photos text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS interests text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS personality_tags text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS communication_styles text[];
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_until timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls text[];
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS media_url text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS visibility text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS moderation_status text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS has_images boolean;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS has_video boolean;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_locked boolean;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments_muted boolean;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_pinned boolean;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_hidden boolean;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_featured boolean;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_admin_post boolean;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_anonymous boolean;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS display_view_offset integer;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS likes_count integer;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS comments_count integer;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS reports_count integer;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS view_count integer;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS bumped_at timestamptz;

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS post_id uuid;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS parent_id uuid;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS content text;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_hidden boolean;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_deleted boolean;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS likes_count integer;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS reports_count integer;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reporter_id uuid;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reported_id uuid;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS post_id uuid;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS comment_id uuid;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS message_id uuid;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS detail text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_by uuid;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.report_messages ADD COLUMN IF NOT EXISTS report_id uuid;
ALTER TABLE public.report_messages ADD COLUMN IF NOT EXISTS sender_id uuid;
ALTER TABLE public.report_messages ADD COLUMN IF NOT EXISTS is_admin boolean;
ALTER TABLE public.report_messages ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.report_messages ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.report_messages ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.report_messages ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS data jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_read boolean;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS updated_at timestamptz;

ALTER TABLE public.reputation_history ADD COLUMN IF NOT EXISTS user_id uuid;
ALTER TABLE public.reputation_history ADD COLUMN IF NOT EXISTS admin_id uuid;
ALTER TABLE public.reputation_history ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE public.reputation_history ADD COLUMN IF NOT EXISTS points integer;
ALTER TABLE public.reputation_history ADD COLUMN IF NOT EXISTS old_score integer;
ALTER TABLE public.reputation_history ADD COLUMN IF NOT EXISTS new_score integer;
ALTER TABLE public.reputation_history ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.reputation_history ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS admin_id uuid;
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS action text;
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS target_type text;
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS detail jsonb;
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS metadata jsonb;
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.admin_logs ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE public.pinned_posts ADD COLUMN IF NOT EXISTS post_id uuid;
ALTER TABLE public.pinned_posts ADD COLUMN IF NOT EXISTS pinned_by uuid;
ALTER TABLE public.pinned_posts ADD COLUMN IF NOT EXISTS pinned_until timestamptz;
ALTER TABLE public.pinned_posts ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.pinned_posts ADD COLUMN IF NOT EXISTS created_at timestamptz;

ALTER TABLE public.banned_words ADD COLUMN IF NOT EXISTS word text;
ALTER TABLE public.banned_words ADD COLUMN IF NOT EXISTS severity text;
ALTER TABLE public.banned_words ADD COLUMN IF NOT EXISTS penalty integer;
ALTER TABLE public.banned_words ADD COLUMN IF NOT EXISTS is_active boolean;
ALTER TABLE public.banned_words ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE public.banned_words ADD COLUMN IF NOT EXISTS created_at timestamptz;
ALTER TABLE public.banned_words ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- ---------------------------------------------------------------------
-- 3) BACKFILL old rows BEFORE defaults / NOT NULL
-- ---------------------------------------------------------------------
UPDATE public.profiles SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.posts SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.comments SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.reports SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.report_messages SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.notifications SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.reputation_history SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.admin_logs SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.pinned_posts SET id = gen_random_uuid() WHERE id IS NULL;
UPDATE public.banned_words SET id = gen_random_uuid() WHERE id IS NULL;

UPDATE public.profiles
SET
  full_name = COALESCE(full_name, display_name, username, 'Người dùng'),
  display_name = COALESCE(display_name, full_name, username, 'Người dùng'),
  avatar_url = COALESCE(avatar_url, avatar),
  avatar = COALESCE(avatar, avatar_url),
  role = COALESCE(role, 'user'),
  status = COALESCE(status, 'active'),
  account_status = COALESCE(account_status, CASE WHEN COALESCE(account_locked, false) OR COALESCE(is_banned, false) THEN 'suspended' ELSE 'active' END),
  is_admin = COALESCE(is_admin, false),
  is_banned = COALESCE(is_banned, false),
  account_locked = COALESCE(account_locked, false),
  is_online = COALESCE(is_online, false),
  is_virtual = COALESCE(is_virtual, false),
  is_seed_account = COALESCE(is_seed_account, false),
  location_ready = COALESCE(location_ready, false),
  is_fwb_active = COALESCE(is_fwb_active, false),
  is_onboarding_completed = COALESCE(is_onboarding_completed, false),
  gem_balance = COALESCE(gem_balance, candy, 0),
  candy = COALESCE(candy, gem_balance, 0),
  followers_count = COALESCE(followers_count, 0),
  vip_level = COALESCE(vip_level, 0),
  vip_exp = COALESCE(vip_exp, 0),
  trust_score = COALESCE(trust_score, 100),
  reputation = COALESCE(reputation, reputation_score, 100),
  reputation_score = COALESCE(reputation_score, reputation, 100),
  name_changes = COALESCE(name_changes, 0),
  photos = COALESCE(photos, '{}'::text[]),
  interests = COALESCE(interests, '{}'::text[]),
  personality_tags = COALESCE(personality_tags, '{}'::text[]),
  communication_styles = COALESCE(communication_styles, '{}'::text[]),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

UPDATE public.posts
SET
  content = COALESCE(content, ''),
  image_urls = COALESCE(image_urls, CASE WHEN COALESCE(image_url, image) IS NULL THEN '{}'::text[] ELSE ARRAY[COALESCE(image_url, image)] END),
  image_url = COALESCE(image_url, image, CASE WHEN array_length(image_urls, 1) > 0 THEN image_urls[1] ELSE NULL END),
  image = COALESCE(image, image_url, CASE WHEN array_length(image_urls, 1) > 0 THEN image_urls[1] ELSE NULL END),
  category = COALESCE(category, 'fwb'),
  visibility = COALESCE(visibility, 'home'),
  status = COALESCE(status, 'published'),
  moderation_status = COALESCE(moderation_status, 'approved'),
  has_images = COALESCE(has_images, array_length(image_urls, 1) > 0, image_url IS NOT NULL, image IS NOT NULL, false),
  has_video = COALESCE(has_video, video_url IS NOT NULL, false),
  is_locked = COALESCE(is_locked, false),
  comments_muted = COALESCE(comments_muted, false),
  is_pinned = COALESCE(is_pinned, false),
  is_hidden = COALESCE(is_hidden, false),
  is_featured = COALESCE(is_featured, false),
  is_admin_post = COALESCE(is_admin_post, false),
  is_anonymous = COALESCE(is_anonymous, false),
  display_view_offset = COALESCE(display_view_offset, 0),
  likes_count = COALESCE(likes_count, 0),
  comments_count = COALESCE(comments_count, 0),
  reports_count = COALESCE(reports_count, 0),
  view_count = COALESCE(view_count, 0),
  metadata = COALESCE(metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now()),
  bumped_at = COALESCE(bumped_at, created_at, now());

UPDATE public.comments
SET
  content = COALESCE(content, ''),
  is_hidden = COALESCE(is_hidden, false),
  is_deleted = COALESCE(is_deleted, false),
  likes_count = COALESCE(likes_count, 0),
  reports_count = COALESCE(reports_count, 0),
  metadata = COALESCE(metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

UPDATE public.reports
SET
  target_type = COALESCE(target_type, CASE WHEN post_id IS NOT NULL THEN 'post' WHEN comment_id IS NOT NULL THEN 'comment' WHEN message_id IS NOT NULL THEN 'message' WHEN reported_id IS NOT NULL THEN 'user' ELSE 'post' END),
  target_id = COALESCE(target_id, post_id, comment_id, message_id, reported_id),
  reason = COALESCE(reason, 'other'),
  status = COALESCE(status, 'pending'),
  priority = COALESCE(priority, 'normal'),
  metadata = COALESCE(metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

UPDATE public.report_messages
SET
  is_admin = COALESCE(is_admin, false),
  body = COALESCE(body, message, ''),
  message = COALESCE(message, body, ''),
  metadata = COALESCE(metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, now());

UPDATE public.notifications
SET
  type = COALESCE(type, 'system'),
  title = COALESCE(title, ''),
  message = COALESCE(message, body, ''),
  body = COALESCE(body, message, ''),
  data = COALESCE(data, metadata, '{}'::jsonb),
  metadata = COALESCE(metadata, data, '{}'::jsonb),
  is_read = COALESCE(is_read, false),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

UPDATE public.reputation_history
SET
  reason = COALESCE(reason, 'system'),
  points = COALESCE(points, 0),
  old_score = COALESCE(old_score, 100),
  new_score = COALESCE(new_score, old_score, 100),
  metadata = COALESCE(metadata, '{}'::jsonb),
  created_at = COALESCE(created_at, now());

UPDATE public.admin_logs
SET
  action = COALESCE(action, 'unknown'),
  target_type = COALESCE(target_type, 'system'),
  detail = COALESCE(detail, metadata, '{}'::jsonb),
  metadata = COALESCE(metadata, detail, '{}'::jsonb),
  created_at = COALESCE(created_at, now());

UPDATE public.pinned_posts SET created_at = COALESCE(created_at, now());

UPDATE public.banned_words
SET
  word = COALESCE(word, ''),
  severity = COALESCE(severity, 'medium'),
  penalty = COALESCE(penalty, 0),
  is_active = COALESCE(is_active, true),
  created_at = COALESCE(created_at, now()),
  updated_at = COALESCE(updated_at, now());

-- ---------------------------------------------------------------------
-- 4) SET DEFAULT after backfill
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.profiles ALTER COLUMN full_name SET DEFAULT 'Người dùng';
ALTER TABLE public.profiles ALTER COLUMN display_name SET DEFAULT 'Người dùng';
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'user';
ALTER TABLE public.profiles ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE public.profiles ALTER COLUMN account_status SET DEFAULT 'active';
ALTER TABLE public.profiles ALTER COLUMN is_admin SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN is_banned SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN account_locked SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN is_online SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN is_virtual SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN is_seed_account SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN location_ready SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN is_fwb_active SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN is_onboarding_completed SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN gem_balance SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN candy SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN followers_count SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN vip_level SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN vip_exp SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN trust_score SET DEFAULT 100;
ALTER TABLE public.profiles ALTER COLUMN reputation SET DEFAULT 100;
ALTER TABLE public.profiles ALTER COLUMN reputation_score SET DEFAULT 100;
ALTER TABLE public.profiles ALTER COLUMN name_changes SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN photos SET DEFAULT '{}'::text[];
ALTER TABLE public.profiles ALTER COLUMN interests SET DEFAULT '{}'::text[];
ALTER TABLE public.profiles ALTER COLUMN personality_tags SET DEFAULT '{}'::text[];
ALTER TABLE public.profiles ALTER COLUMN communication_styles SET DEFAULT '{}'::text[];
ALTER TABLE public.profiles ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.profiles ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.posts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.posts ALTER COLUMN content SET DEFAULT '';
ALTER TABLE public.posts ALTER COLUMN image_urls SET DEFAULT '{}'::text[];
ALTER TABLE public.posts ALTER COLUMN category SET DEFAULT 'fwb';
ALTER TABLE public.posts ALTER COLUMN visibility SET DEFAULT 'home';
ALTER TABLE public.posts ALTER COLUMN status SET DEFAULT 'published';
ALTER TABLE public.posts ALTER COLUMN moderation_status SET DEFAULT 'approved';
ALTER TABLE public.posts ALTER COLUMN has_images SET DEFAULT false;
ALTER TABLE public.posts ALTER COLUMN has_video SET DEFAULT false;
ALTER TABLE public.posts ALTER COLUMN is_locked SET DEFAULT false;
ALTER TABLE public.posts ALTER COLUMN comments_muted SET DEFAULT false;
ALTER TABLE public.posts ALTER COLUMN is_pinned SET DEFAULT false;
ALTER TABLE public.posts ALTER COLUMN is_hidden SET DEFAULT false;
ALTER TABLE public.posts ALTER COLUMN is_featured SET DEFAULT false;
ALTER TABLE public.posts ALTER COLUMN is_admin_post SET DEFAULT false;
ALTER TABLE public.posts ALTER COLUMN is_anonymous SET DEFAULT false;
ALTER TABLE public.posts ALTER COLUMN display_view_offset SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN likes_count SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN comments_count SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN reports_count SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN view_count SET DEFAULT 0;
ALTER TABLE public.posts ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE public.posts ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.posts ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.posts ALTER COLUMN bumped_at SET DEFAULT now();

ALTER TABLE public.comments ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.comments ALTER COLUMN content SET DEFAULT '';
ALTER TABLE public.comments ALTER COLUMN is_hidden SET DEFAULT false;
ALTER TABLE public.comments ALTER COLUMN is_deleted SET DEFAULT false;
ALTER TABLE public.comments ALTER COLUMN likes_count SET DEFAULT 0;
ALTER TABLE public.comments ALTER COLUMN reports_count SET DEFAULT 0;
ALTER TABLE public.comments ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE public.comments ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.comments ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.reports ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.reports ALTER COLUMN target_type SET DEFAULT 'post';
ALTER TABLE public.reports ALTER COLUMN reason SET DEFAULT 'other';
ALTER TABLE public.reports ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.reports ALTER COLUMN priority SET DEFAULT 'normal';
ALTER TABLE public.reports ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE public.reports ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.reports ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.report_messages ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.report_messages ALTER COLUMN is_admin SET DEFAULT false;
ALTER TABLE public.report_messages ALTER COLUMN body SET DEFAULT '';
ALTER TABLE public.report_messages ALTER COLUMN message SET DEFAULT '';
ALTER TABLE public.report_messages ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE public.report_messages ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.notifications ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.notifications ALTER COLUMN type SET DEFAULT 'system';
ALTER TABLE public.notifications ALTER COLUMN title SET DEFAULT '';
ALTER TABLE public.notifications ALTER COLUMN message SET DEFAULT '';
ALTER TABLE public.notifications ALTER COLUMN body SET DEFAULT '';
ALTER TABLE public.notifications ALTER COLUMN data SET DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications ALTER COLUMN is_read SET DEFAULT false;
ALTER TABLE public.notifications ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.notifications ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.reputation_history ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.reputation_history ALTER COLUMN reason SET DEFAULT 'system';
ALTER TABLE public.reputation_history ALTER COLUMN points SET DEFAULT 0;
ALTER TABLE public.reputation_history ALTER COLUMN old_score SET DEFAULT 100;
ALTER TABLE public.reputation_history ALTER COLUMN new_score SET DEFAULT 100;
ALTER TABLE public.reputation_history ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE public.reputation_history ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.admin_logs ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.admin_logs ALTER COLUMN action SET DEFAULT 'unknown';
ALTER TABLE public.admin_logs ALTER COLUMN target_type SET DEFAULT 'system';
ALTER TABLE public.admin_logs ALTER COLUMN detail SET DEFAULT '{}'::jsonb;
ALTER TABLE public.admin_logs ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE public.admin_logs ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.pinned_posts ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.pinned_posts ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.banned_words ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.banned_words ALTER COLUMN word SET DEFAULT '';
ALTER TABLE public.banned_words ALTER COLUMN severity SET DEFAULT 'medium';
ALTER TABLE public.banned_words ALTER COLUMN penalty SET DEFAULT 0;
ALTER TABLE public.banned_words ALTER COLUMN is_active SET DEFAULT true;
ALTER TABLE public.banned_words ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.banned_words ALTER COLUMN updated_at SET DEFAULT now();

-- ---------------------------------------------------------------------
-- 5) SET NOT NULL only after a per-column backfill + runtime validation.
-- ---------------------------------------------------------------------
-- This section intentionally does not rely on the bulk UPDATEs above. Each
-- NOT NULL conversion performs its own NULL repair, counts remaining NULLs,
-- and skips the constraint instead of failing if legacy data/triggers still
-- leave NULLs behind.
CREATE OR REPLACE FUNCTION public.candy__safe_set_not_null(
  p_table text,
  p_column text,
  p_backfill_sql text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_null_count bigint;
BEGIN
  IF NOT public.candy__table_exists(p_table) THEN
    RAISE NOTICE 'Skipping NOT NULL on %.% because table does not exist', p_table, p_column;
    RETURN;
  END IF;

  IF NOT public.candy__column_exists(p_table, p_column) THEN
    RAISE NOTICE 'Skipping NOT NULL on %.% because column does not exist', p_table, p_column;
    RETURN;
  END IF;

  IF p_backfill_sql IS NOT NULL AND length(trim(p_backfill_sql)) > 0 THEN
    EXECUTE p_backfill_sql;
  END IF;

  EXECUTE format('SELECT COUNT(*) FROM public.%I WHERE %I IS NULL', p_table, p_column)
  INTO v_null_count;

  RAISE NOTICE 'NULL audit before NOT NULL %.%: % rows', p_table, p_column, v_null_count;

  IF v_null_count > 0 THEN
    RAISE NOTICE 'Skipping NOT NULL on %.% because NULL rows still exist', p_table, p_column;
  ELSE
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET NOT NULL', p_table, p_column);
    RAISE NOTICE 'Applied NOT NULL on %.%', p_table, p_column;
  END IF;
END;
$$;

-- Temporarily prevent user triggers on posts from reintroducing NULLs while
-- post columns are audited. Built-in/internal constraint triggers are not disabled.
-- Only triggers disabled by this migration are re-enabled later; triggers that
-- were already disabled before the migration are preserved as disabled.
CREATE TEMP TABLE IF NOT EXISTS candy__disabled_post_triggers (
  tgname name PRIMARY KEY
) ON COMMIT DROP;

DO $$
DECLARE
  v_trigger record;
BEGIN
  IF public.candy__table_exists('posts') THEN
    FOR v_trigger IN
      SELECT tgname
      FROM pg_trigger
      WHERE tgrelid = 'public.posts'::regclass
        AND NOT tgisinternal
        AND tgenabled <> 'D'
    LOOP
      INSERT INTO candy__disabled_post_triggers(tgname)
      VALUES (v_trigger.tgname)
      ON CONFLICT (tgname) DO NOTHING;
      EXECUTE format('ALTER TABLE public.posts DISABLE TRIGGER %I', v_trigger.tgname);
      RAISE NOTICE 'Temporarily disabled trigger public.posts.%', v_trigger.tgname;
    END LOOP;
  END IF;
END $$;

-- Profiles
SELECT public.candy__safe_set_not_null('profiles','id', $$UPDATE public.profiles SET id = gen_random_uuid() WHERE id IS NULL$$);
SELECT public.candy__safe_set_not_null('profiles','is_admin', $$UPDATE public.profiles SET is_admin = false WHERE is_admin IS NULL$$);
SELECT public.candy__safe_set_not_null('profiles','is_banned', $$UPDATE public.profiles SET is_banned = false WHERE is_banned IS NULL$$);
SELECT public.candy__safe_set_not_null('profiles','account_locked', $$UPDATE public.profiles SET account_locked = false WHERE account_locked IS NULL$$);
SELECT public.candy__safe_set_not_null('profiles','reputation', $$UPDATE public.profiles SET reputation = COALESCE(reputation_score, 100) WHERE reputation IS NULL$$);
SELECT public.candy__safe_set_not_null('profiles','created_at', $$UPDATE public.profiles SET created_at = now() WHERE created_at IS NULL$$);
SELECT public.candy__safe_set_not_null('profiles','updated_at', $$UPDATE public.profiles SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL$$);

-- Posts: every INSERT/trigger path later must supply or coalesce these values.
SELECT public.candy__safe_set_not_null('posts','id', $$UPDATE public.posts SET id = gen_random_uuid() WHERE id IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','content', $$UPDATE public.posts SET content = '' WHERE content IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','image_urls', $$UPDATE public.posts SET image_urls = CASE WHEN COALESCE(image_url, image) IS NULL THEN '{}'::text[] ELSE ARRAY[COALESCE(image_url, image)] END WHERE image_urls IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','visibility', $$UPDATE public.posts SET visibility = 'home' WHERE visibility IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','status', $$UPDATE public.posts SET status = 'published' WHERE status IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','has_images', $$UPDATE public.posts SET has_images = COALESCE(array_length(image_urls, 1) > 0, image_url IS NOT NULL, image IS NOT NULL, false) WHERE has_images IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','has_video', $$UPDATE public.posts SET has_video = COALESCE(video_url IS NOT NULL, false) WHERE has_video IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','is_locked', $$UPDATE public.posts SET is_locked = false WHERE is_locked IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','comments_muted', $$UPDATE public.posts SET comments_muted = false WHERE comments_muted IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','is_pinned', $$UPDATE public.posts SET is_pinned = false WHERE is_pinned IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','is_hidden', $$UPDATE public.posts SET is_hidden = false WHERE is_hidden IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','is_featured', $$UPDATE public.posts SET is_featured = false WHERE is_featured IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','is_admin_post', $$UPDATE public.posts SET is_admin_post = false WHERE is_admin_post IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','is_anonymous', $$UPDATE public.posts SET is_anonymous = false WHERE is_anonymous IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','metadata', $$UPDATE public.posts SET metadata = '{}'::jsonb WHERE metadata IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','created_at', $$UPDATE public.posts SET created_at = now() WHERE created_at IS NULL$$);
SELECT public.candy__safe_set_not_null('posts','updated_at', $$UPDATE public.posts SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL$$);

-- Re-enable any user triggers on posts after NOT NULL auditing.
DO $$
DECLARE
  v_trigger record;
BEGIN
  IF public.candy__table_exists('posts') THEN
    FOR v_trigger IN
      SELECT tgname
      FROM candy__disabled_post_triggers
    LOOP
      EXECUTE format('ALTER TABLE public.posts ENABLE TRIGGER %I', v_trigger.tgname);
      RAISE NOTICE 'Re-enabled trigger public.posts.%', v_trigger.tgname;
    END LOOP;
  END IF;
END $$;

-- Comments
SELECT public.candy__safe_set_not_null('comments','id', $$UPDATE public.comments SET id = gen_random_uuid() WHERE id IS NULL$$);
SELECT public.candy__safe_set_not_null('comments','content', $$UPDATE public.comments SET content = '' WHERE content IS NULL$$);
SELECT public.candy__safe_set_not_null('comments','is_hidden', $$UPDATE public.comments SET is_hidden = false WHERE is_hidden IS NULL$$);
SELECT public.candy__safe_set_not_null('comments','created_at', $$UPDATE public.comments SET created_at = now() WHERE created_at IS NULL$$);
SELECT public.candy__safe_set_not_null('comments','updated_at', $$UPDATE public.comments SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL$$);

-- Reports
SELECT public.candy__safe_set_not_null('reports','id', $$UPDATE public.reports SET id = gen_random_uuid() WHERE id IS NULL$$);
SELECT public.candy__safe_set_not_null('reports','target_type', $$UPDATE public.reports SET target_type = CASE WHEN post_id IS NOT NULL THEN 'post' WHEN comment_id IS NOT NULL THEN 'comment' WHEN message_id IS NOT NULL THEN 'message' WHEN reported_id IS NOT NULL THEN 'user' ELSE 'post' END WHERE target_type IS NULL$$);
SELECT public.candy__safe_set_not_null('reports','reason', $$UPDATE public.reports SET reason = 'other' WHERE reason IS NULL$$);
SELECT public.candy__safe_set_not_null('reports','detail', $$UPDATE public.reports SET detail = '' WHERE detail IS NULL$$);
SELECT public.candy__safe_set_not_null('reports','status', $$UPDATE public.reports SET status = 'pending' WHERE status IS NULL$$);
SELECT public.candy__safe_set_not_null('reports','metadata', $$UPDATE public.reports SET metadata = '{}'::jsonb WHERE metadata IS NULL$$);
SELECT public.candy__safe_set_not_null('reports','created_at', $$UPDATE public.reports SET created_at = now() WHERE created_at IS NULL$$);
SELECT public.candy__safe_set_not_null('reports','updated_at', $$UPDATE public.reports SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL$$);

-- Report messages
SELECT public.candy__safe_set_not_null('report_messages','id', $$UPDATE public.report_messages SET id = gen_random_uuid() WHERE id IS NULL$$);
SELECT public.candy__safe_set_not_null('report_messages','is_admin', $$UPDATE public.report_messages SET is_admin = false WHERE is_admin IS NULL$$);
SELECT public.candy__safe_set_not_null('report_messages','body', $$UPDATE public.report_messages SET body = COALESCE(message, '') WHERE body IS NULL$$);
SELECT public.candy__safe_set_not_null('report_messages','message', $$UPDATE public.report_messages SET message = COALESCE(body, '') WHERE message IS NULL$$);
SELECT public.candy__safe_set_not_null('report_messages','metadata', $$UPDATE public.report_messages SET metadata = '{}'::jsonb WHERE metadata IS NULL$$);
SELECT public.candy__safe_set_not_null('report_messages','created_at', $$UPDATE public.report_messages SET created_at = now() WHERE created_at IS NULL$$);

-- Notifications
SELECT public.candy__safe_set_not_null('notifications','id', $$UPDATE public.notifications SET id = gen_random_uuid() WHERE id IS NULL$$);
SELECT public.candy__safe_set_not_null('notifications','type', $$UPDATE public.notifications SET type = 'system' WHERE type IS NULL$$);
SELECT public.candy__safe_set_not_null('notifications','title', $$UPDATE public.notifications SET title = '' WHERE title IS NULL$$);
SELECT public.candy__safe_set_not_null('notifications','message', $$UPDATE public.notifications SET message = COALESCE(body, '') WHERE message IS NULL$$);
SELECT public.candy__safe_set_not_null('notifications','body', $$UPDATE public.notifications SET body = COALESCE(message, '') WHERE body IS NULL$$);
SELECT public.candy__safe_set_not_null('notifications','data', $$UPDATE public.notifications SET data = COALESCE(metadata, '{}'::jsonb) WHERE data IS NULL$$);
SELECT public.candy__safe_set_not_null('notifications','metadata', $$UPDATE public.notifications SET metadata = COALESCE(data, '{}'::jsonb) WHERE metadata IS NULL$$);
SELECT public.candy__safe_set_not_null('notifications','is_read', $$UPDATE public.notifications SET is_read = false WHERE is_read IS NULL$$);
SELECT public.candy__safe_set_not_null('notifications','created_at', $$UPDATE public.notifications SET created_at = now() WHERE created_at IS NULL$$);
SELECT public.candy__safe_set_not_null('notifications','updated_at', $$UPDATE public.notifications SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL$$);

-- Reputation history
SELECT public.candy__safe_set_not_null('reputation_history','id', $$UPDATE public.reputation_history SET id = gen_random_uuid() WHERE id IS NULL$$);
SELECT public.candy__safe_set_not_null('reputation_history','reason', $$UPDATE public.reputation_history SET reason = 'system' WHERE reason IS NULL$$);
SELECT public.candy__safe_set_not_null('reputation_history','points', $$UPDATE public.reputation_history SET points = 0 WHERE points IS NULL$$);
SELECT public.candy__safe_set_not_null('reputation_history','old_score', $$UPDATE public.reputation_history SET old_score = 100 WHERE old_score IS NULL$$);
SELECT public.candy__safe_set_not_null('reputation_history','new_score', $$UPDATE public.reputation_history SET new_score = COALESCE(old_score, 100) WHERE new_score IS NULL$$);
SELECT public.candy__safe_set_not_null('reputation_history','metadata', $$UPDATE public.reputation_history SET metadata = '{}'::jsonb WHERE metadata IS NULL$$);
SELECT public.candy__safe_set_not_null('reputation_history','created_at', $$UPDATE public.reputation_history SET created_at = now() WHERE created_at IS NULL$$);

-- Admin logs
SELECT public.candy__safe_set_not_null('admin_logs','id', $$UPDATE public.admin_logs SET id = gen_random_uuid() WHERE id IS NULL$$);
SELECT public.candy__safe_set_not_null('admin_logs','action', $$UPDATE public.admin_logs SET action = 'unknown' WHERE action IS NULL$$);
SELECT public.candy__safe_set_not_null('admin_logs','target_type', $$UPDATE public.admin_logs SET target_type = 'system' WHERE target_type IS NULL$$);
SELECT public.candy__safe_set_not_null('admin_logs','detail', $$UPDATE public.admin_logs SET detail = COALESCE(metadata, '{}'::jsonb) WHERE detail IS NULL$$);
SELECT public.candy__safe_set_not_null('admin_logs','metadata', $$UPDATE public.admin_logs SET metadata = COALESCE(detail, '{}'::jsonb) WHERE metadata IS NULL$$);
SELECT public.candy__safe_set_not_null('admin_logs','created_at', $$UPDATE public.admin_logs SET created_at = now() WHERE created_at IS NULL$$);

-- Pinned posts
SELECT public.candy__safe_set_not_null('pinned_posts','id', $$UPDATE public.pinned_posts SET id = gen_random_uuid() WHERE id IS NULL$$);
SELECT public.candy__safe_set_not_null('pinned_posts','created_at', $$UPDATE public.pinned_posts SET created_at = now() WHERE created_at IS NULL$$);

-- Banned words
SELECT public.candy__safe_set_not_null('banned_words','id', $$UPDATE public.banned_words SET id = gen_random_uuid() WHERE id IS NULL$$);
SELECT public.candy__safe_set_not_null('banned_words','word', $$UPDATE public.banned_words SET word = '' WHERE word IS NULL$$);
SELECT public.candy__safe_set_not_null('banned_words','severity', $$UPDATE public.banned_words SET severity = 'medium' WHERE severity IS NULL$$);
SELECT public.candy__safe_set_not_null('banned_words','penalty', $$UPDATE public.banned_words SET penalty = 0 WHERE penalty IS NULL$$);
SELECT public.candy__safe_set_not_null('banned_words','is_active', $$UPDATE public.banned_words SET is_active = true WHERE is_active IS NULL$$);
SELECT public.candy__safe_set_not_null('banned_words','created_at', $$UPDATE public.banned_words SET created_at = now() WHERE created_at IS NULL$$);
SELECT public.candy__safe_set_not_null('banned_words','updated_at', $$UPDATE public.banned_words SET updated_at = COALESCE(created_at, now()) WHERE updated_at IS NULL$$);

-- ---------------------------------------------------------------------
-- 6) Primary / unique / check constraints — all guarded and data-safe
-- ---------------------------------------------------------------------
DO $$
DECLARE
  has_dupes boolean;
BEGIN
  -- Primary keys: add only if no PK exists, id exists, id has no NULLs and no duplicates.
  PERFORM 1;
END $$;

DO $$
DECLARE
  t text;
  has_bad boolean;
  pk_name text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','posts','comments','reports','report_messages','notifications','reputation_history','admin_logs','pinned_posts','banned_words'] LOOP
    pk_name := t || '_pkey';
    IF public.candy__table_exists(t)
       AND public.candy__column_exists(t, 'id')
       AND NOT public.candy__constraint_exists(t, pk_name) THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id IS NULL)', t) INTO has_bad;
      IF NOT has_bad THEN
        EXECUTE format('SELECT EXISTS (SELECT id FROM public.%I GROUP BY id HAVING count(*) > 1)', t) INTO has_bad;
        IF NOT has_bad THEN
          EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id)', t, pk_name);
        END IF;
      END IF;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  has_dupes boolean;
BEGIN
  IF public.candy__table_exists('profiles') AND public.candy__column_exists('profiles','username') AND NOT public.candy__constraint_exists('profiles','profiles_username_key') THEN
    SELECT EXISTS (SELECT username FROM public.profiles WHERE username IS NOT NULL AND username <> '' GROUP BY username HAVING count(*) > 1) INTO has_dupes;
    IF NOT has_dupes THEN
      ALTER TABLE public.profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);
    END IF;
  END IF;

  IF public.candy__table_exists('profiles') AND public.candy__column_exists('profiles','public_id') AND NOT public.candy__constraint_exists('profiles','profiles_public_id_key') THEN
    SELECT EXISTS (SELECT public_id FROM public.profiles WHERE public_id IS NOT NULL AND public_id <> '' GROUP BY public_id HAVING count(*) > 1) INTO has_dupes;
    IF NOT has_dupes THEN
      ALTER TABLE public.profiles ADD CONSTRAINT profiles_public_id_key UNIQUE (public_id);
    END IF;
  END IF;

  IF public.candy__table_exists('banned_words') AND public.candy__column_exists('banned_words','word') AND NOT public.candy__constraint_exists('banned_words','banned_words_word_key') THEN
    SELECT EXISTS (SELECT lower(word) FROM public.banned_words WHERE word IS NOT NULL AND word <> '' GROUP BY lower(word) HAVING count(*) > 1) INTO has_dupes;
    IF NOT has_dupes THEN
      ALTER TABLE public.banned_words ADD CONSTRAINT banned_words_word_key UNIQUE (word);
    END IF;
  END IF;

  IF public.candy__table_exists('pinned_posts') AND public.candy__column_exists('pinned_posts','post_id') AND NOT public.candy__constraint_exists('pinned_posts','pinned_posts_post_id_key') THEN
    SELECT EXISTS (SELECT post_id FROM public.pinned_posts WHERE post_id IS NOT NULL GROUP BY post_id HAVING count(*) > 1) INTO has_dupes;
    IF NOT has_dupes THEN
      ALTER TABLE public.pinned_posts ADD CONSTRAINT pinned_posts_post_id_key UNIQUE (post_id);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT public.candy__constraint_exists('reports','reports_target_type_check') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_target_type_check CHECK (target_type IN ('post','comment','message','user','profile','other')) NOT VALID;
  END IF;
  IF NOT public.candy__constraint_exists('reports','reports_status_check') THEN
    ALTER TABLE public.reports ADD CONSTRAINT reports_status_check CHECK (status IN ('pending','reviewing','resolved','rejected','deleted','dismissed')) NOT VALID;
  END IF;
  IF NOT public.candy__constraint_exists('posts','posts_status_check') THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_status_check CHECK (status IN ('published','pending','rejected','hidden','deleted','draft')) NOT VALID;
  END IF;
  IF NOT public.candy__constraint_exists('posts','posts_visibility_check') THEN
    ALTER TABLE public.posts ADD CONSTRAINT posts_visibility_check CHECK (visibility IN ('home','profile','home_only','feedback','public','private')) NOT VALID;
  END IF;
  IF NOT public.candy__constraint_exists('banned_words','banned_words_severity_check') THEN
    ALTER TABLE public.banned_words ADD CONSTRAINT banned_words_severity_check CHECK (severity IN ('low','medium','high','critical')) NOT VALID;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7) Foreign keys — create only when table/columns/constraint allow; NOT VALID
-- ---------------------------------------------------------------------
DO $$
DECLARE
  item text[];
BEGIN
  FOREACH item SLICE 1 IN ARRAY ARRAY[
    ARRAY['profiles','profiles_id_fkey','id','auth.users','id','CASCADE'],
    ARRAY['posts','posts_user_id_fkey','user_id','auth.users','id','CASCADE'],
    ARRAY['comments','comments_post_id_fkey','post_id','public.posts','id','CASCADE'],
    ARRAY['comments','comments_user_id_fkey','user_id','auth.users','id','CASCADE'],
    ARRAY['comments','comments_parent_id_fkey','parent_id','public.comments','id','CASCADE'],
    ARRAY['reports','reports_reporter_id_fkey','reporter_id','auth.users','id','CASCADE'],
    ARRAY['reports','reports_reported_id_fkey','reported_id','auth.users','id','SET NULL'],
    ARRAY['reports','reports_post_id_fkey','post_id','public.posts','id','SET NULL'],
    ARRAY['reports','reports_comment_id_fkey','comment_id','public.comments','id','SET NULL'],
    ARRAY['reports','reports_resolved_by_fkey','resolved_by','auth.users','id','SET NULL'],
    ARRAY['report_messages','report_messages_report_id_fkey','report_id','public.reports','id','CASCADE'],
    ARRAY['report_messages','report_messages_sender_id_fkey','sender_id','auth.users','id','CASCADE'],
    ARRAY['notifications','notifications_user_id_fkey','user_id','auth.users','id','CASCADE'],
    ARRAY['notifications','notifications_actor_id_fkey','actor_id','auth.users','id','SET NULL'],
    ARRAY['reputation_history','reputation_history_user_id_fkey','user_id','auth.users','id','CASCADE'],
    ARRAY['reputation_history','reputation_history_admin_id_fkey','admin_id','auth.users','id','SET NULL'],
    ARRAY['admin_logs','admin_logs_admin_id_fkey','admin_id','auth.users','id','SET NULL'],
    ARRAY['pinned_posts','pinned_posts_post_id_fkey','post_id','public.posts','id','CASCADE'],
    ARRAY['pinned_posts','pinned_posts_pinned_by_fkey','pinned_by','auth.users','id','SET NULL'],
    ARRAY['banned_words','banned_words_created_by_fkey','created_by','auth.users','id','SET NULL']
  ] LOOP
    IF public.candy__table_exists(item[1])
       AND public.candy__column_exists(item[1], item[3])
       AND NOT public.candy__constraint_exists(item[1], item[2])
       AND (
         item[4] NOT LIKE 'public.%'
         OR EXISTS (
           SELECT 1
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
           WHERE n.nspname = 'public'
             AND t.relname = split_part(item[4], '.', 2)
             AND c.contype IN ('p', 'u')
         )
       ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %s(%I) ON DELETE %s NOT VALID',
        item[1], item[2], item[3], item[4], item[5], item[6]
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 8) Indexes — all IF NOT EXISTS
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_public_id ON public.profiles(public_id);
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin ON public.profiles(is_admin);
CREATE INDEX IF NOT EXISTS idx_profiles_account_status ON public.profiles(account_status);
CREATE INDEX IF NOT EXISTS idx_profiles_reputation ON public.profiles(reputation);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON public.posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category_created ON public.posts(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_visibility_created ON public.posts(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_status_created ON public.posts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_pinned_created ON public.posts(is_pinned, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_bumped_at ON public.posts(bumped_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_user_id ON public.comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON public.comments(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON public.reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON public.reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_target ON public.reports(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON public.reports(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_report_messages_report ON public.report_messages(report_id, created_at);
CREATE INDEX IF NOT EXISTS idx_report_messages_sender ON public.report_messages(sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications(user_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reputation_history_user ON public.reputation_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reputation_history_admin ON public.reputation_history(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON public.admin_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_target ON public.admin_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON public.admin_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pinned_posts_post_id ON public.pinned_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_pinned_posts_created ON public.pinned_posts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_banned_words_word ON public.banned_words(word);
CREATE INDEX IF NOT EXISTS idx_banned_words_active ON public.banned_words(is_active);

-- ---------------------------------------------------------------------
-- 9) Triggers — drop then recreate
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.candy__set_updated_at();

DROP TRIGGER IF EXISTS trg_posts_updated_at ON public.posts;
CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION public.candy__set_updated_at();

DROP TRIGGER IF EXISTS trg_comments_updated_at ON public.comments;
CREATE TRIGGER trg_comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.candy__set_updated_at();

DROP TRIGGER IF EXISTS trg_reports_updated_at ON public.reports;
CREATE TRIGGER trg_reports_updated_at BEFORE UPDATE ON public.reports FOR EACH ROW EXECUTE FUNCTION public.candy__set_updated_at();

DROP TRIGGER IF EXISTS trg_notifications_updated_at ON public.notifications;
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.candy__set_updated_at();

DROP TRIGGER IF EXISTS trg_banned_words_updated_at ON public.banned_words;
CREATE TRIGGER trg_banned_words_updated_at BEFORE UPDATE ON public.banned_words FOR EACH ROW EXECUTE FUNCTION public.candy__set_updated_at();

CREATE OR REPLACE FUNCTION public.candy__sync_account_lock_on_reputation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reputation IS DISTINCT FROM OLD.reputation THEN
    NEW.reputation_score := NEW.reputation;
    IF NEW.reputation < 70 THEN
      NEW.account_locked := true;
      NEW.is_banned := true;
      NEW.account_status := 'suspended';
    ELSIF COALESCE(OLD.ban_reason, '') = '' THEN
      NEW.account_locked := false;
      NEW.is_banned := false;
      NEW.account_status := 'active';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_lock ON public.profiles;
CREATE TRIGGER trg_profiles_sync_lock BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.candy__sync_account_lock_on_reputation();

-- ---------------------------------------------------------------------
-- 10) RLS + policies — drop then recreate
-- ---------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reputation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pinned_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.banned_words ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()), false);
$$;
GRANT EXECUTE ON FUNCTION public.is_current_user_admin() TO anon, authenticated;

DROP POLICY IF EXISTS profiles_public_read ON public.profiles;
DROP POLICY IF EXISTS profiles_self_insert ON public.profiles;
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_all ON public.profiles;
CREATE POLICY profiles_public_read ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_self_insert ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_admin_all ON public.profiles FOR ALL TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS posts_public_read ON public.posts;
DROP POLICY IF EXISTS posts_owner_insert ON public.posts;
DROP POLICY IF EXISTS posts_owner_update ON public.posts;
DROP POLICY IF EXISTS posts_owner_delete ON public.posts;
DROP POLICY IF EXISTS posts_admin_all ON public.posts;
CREATE POLICY posts_public_read ON public.posts FOR SELECT USING (COALESCE(is_hidden, false) = false OR public.is_current_user_admin() OR user_id = auth.uid());
CREATE POLICY posts_owner_insert ON public.posts FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY posts_owner_update ON public.posts FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY posts_owner_delete ON public.posts FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY posts_admin_all ON public.posts FOR ALL TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS comments_public_read ON public.comments;
DROP POLICY IF EXISTS comments_owner_insert ON public.comments;
DROP POLICY IF EXISTS comments_owner_update ON public.comments;
DROP POLICY IF EXISTS comments_owner_delete ON public.comments;
DROP POLICY IF EXISTS comments_admin_all ON public.comments;
CREATE POLICY comments_public_read ON public.comments FOR SELECT USING (COALESCE(is_hidden, false) = false OR public.is_current_user_admin() OR user_id = auth.uid());
CREATE POLICY comments_owner_insert ON public.comments FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY comments_owner_update ON public.comments FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY comments_owner_delete ON public.comments FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY comments_admin_all ON public.comments FOR ALL TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS reports_participant_read ON public.reports;
DROP POLICY IF EXISTS reports_owner_insert ON public.reports;
DROP POLICY IF EXISTS reports_admin_all ON public.reports;
CREATE POLICY reports_participant_read ON public.reports FOR SELECT TO authenticated USING (reporter_id = auth.uid() OR reported_id = auth.uid() OR public.is_current_user_admin());
CREATE POLICY reports_owner_insert ON public.reports FOR INSERT TO authenticated WITH CHECK (reporter_id = auth.uid());
CREATE POLICY reports_admin_all ON public.reports FOR ALL TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS report_messages_read ON public.report_messages;
DROP POLICY IF EXISTS report_messages_insert ON public.report_messages;
DROP POLICY IF EXISTS report_messages_admin_all ON public.report_messages;
CREATE POLICY report_messages_read ON public.report_messages FOR SELECT TO authenticated USING (
  public.is_current_user_admin()
  OR EXISTS (SELECT 1 FROM public.reports r WHERE r.id = report_id AND (r.reporter_id = auth.uid() OR r.reported_id = auth.uid()))
);
CREATE POLICY report_messages_insert ON public.report_messages FOR INSERT TO authenticated WITH CHECK (sender_id = auth.uid() OR public.is_current_user_admin());
CREATE POLICY report_messages_admin_all ON public.report_messages FOR ALL TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS notifications_owner_read ON public.notifications;
DROP POLICY IF EXISTS notifications_owner_update ON public.notifications;
DROP POLICY IF EXISTS notifications_owner_delete ON public.notifications;
DROP POLICY IF EXISTS notifications_admin_all ON public.notifications;
CREATE POLICY notifications_owner_read ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_owner_update ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_owner_delete ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_admin_all ON public.notifications FOR ALL TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS reputation_history_owner_read ON public.reputation_history;
DROP POLICY IF EXISTS reputation_history_admin_read ON public.reputation_history;
DROP POLICY IF EXISTS reputation_history_admin_insert ON public.reputation_history;
CREATE POLICY reputation_history_owner_read ON public.reputation_history FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY reputation_history_admin_read ON public.reputation_history FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE POLICY reputation_history_admin_insert ON public.reputation_history FOR INSERT TO authenticated WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS admin_logs_admin_read ON public.admin_logs;
DROP POLICY IF EXISTS admin_logs_admin_insert ON public.admin_logs;
CREATE POLICY admin_logs_admin_read ON public.admin_logs FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE POLICY admin_logs_admin_insert ON public.admin_logs FOR INSERT TO authenticated WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS pinned_posts_public_read ON public.pinned_posts;
DROP POLICY IF EXISTS pinned_posts_admin_all ON public.pinned_posts;
CREATE POLICY pinned_posts_public_read ON public.pinned_posts FOR SELECT USING (true);
CREATE POLICY pinned_posts_admin_all ON public.pinned_posts FOR ALL TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

DROP POLICY IF EXISTS banned_words_admin_read ON public.banned_words;
DROP POLICY IF EXISTS banned_words_admin_all ON public.banned_words;
CREATE POLICY banned_words_admin_read ON public.banned_words FOR SELECT TO authenticated USING (public.is_current_user_admin());
CREATE POLICY banned_words_admin_all ON public.banned_words FOR ALL TO authenticated USING (public.is_current_user_admin()) WITH CHECK (public.is_current_user_admin());

-- ---------------------------------------------------------------------
-- 11) RPC / functions — CREATE OR REPLACE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._assert_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: admin only' USING ERRCODE = '42501';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public._assert_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.notifications(user_id, type, title, message, body, data, metadata, is_read)
  VALUES (p_user_id, COALESCE(p_type, 'system'), COALESCE(p_title, ''), COALESCE(p_message, ''), COALESCE(p_message, ''), COALESCE(p_data, '{}'::jsonb), COALESCE(p_data, '{}'::jsonb), false)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid,text,text,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_post(p_post_id uuid, p_reason text, p_detail text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  SELECT user_id INTO v_owner FROM public.posts WHERE id = p_post_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'POST_NOT_FOUND'; END IF;
  INSERT INTO public.reports(reporter_id, reported_id, target_type, target_id, post_id, reason, detail, status)
  VALUES (auth.uid(), v_owner, 'post', p_post_id, p_post_id, COALESCE(p_reason, 'other'), p_detail, 'pending')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.report_post(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.report_message(p_message_id uuid, p_reported_id uuid, p_reason text, p_detail text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.reports(reporter_id, reported_id, target_type, target_id, message_id, reason, detail, status)
  VALUES (auth.uid(), p_reported_id, 'message', p_message_id, p_message_id, COALESCE(p_reason, 'other'), p_detail, 'pending')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.report_message(uuid,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_penalty(p_user_id uuid, p_points integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_old int; v_new int;
BEGIN
  PERFORM public._assert_admin();
  IF COALESCE(p_points, 0) = 0 THEN RAISE EXCEPTION 'INVALID_POINTS'; END IF;
  SELECT reputation INTO v_old FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'USER_NOT_FOUND'; END IF;
  v_new := GREATEST(0, LEAST(100, v_old + p_points));
  UPDATE public.profiles SET reputation = v_new, reputation_score = v_new WHERE id = p_user_id;
  INSERT INTO public.reputation_history(user_id, admin_id, reason, points, old_score, new_score)
  VALUES (p_user_id, auth.uid(), COALESCE(p_reason, 'admin_adjustment'), p_points, v_old, v_new);
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'apply_penalty', 'user', p_user_id, jsonb_build_object('points', p_points, 'old', v_old, 'new', v_new, 'reason', p_reason));
  PERFORM public.create_notification(
    p_user_id,
    CASE WHEN p_points < 0 THEN 'reputation_down' ELSE 'reputation_up' END,
    CASE WHEN p_points < 0 THEN 'Điểm uy tín bị trừ' ELSE 'Điểm uy tín được cộng' END,
    COALESCE(p_reason, ''),
    jsonb_build_object('points', p_points, 'old', v_old, 'new', v_new)
  );
  RETURN jsonb_build_object('ok', true, 'old', v_old, 'new', v_new);
END;
$$;
GRANT EXECUTE ON FUNCTION public.apply_penalty(uuid,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pin_post(p_post_id uuid, p_until timestamptz DEFAULT NULL, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin();
  UPDATE public.posts SET is_pinned = true, bumped_at = now() WHERE id = p_post_id;
  IF EXISTS (SELECT 1 FROM public.pinned_posts WHERE post_id = p_post_id) THEN
    UPDATE public.pinned_posts
    SET pinned_by = auth.uid(), pinned_until = p_until, note = p_note
    WHERE post_id = p_post_id;
  ELSE
    INSERT INTO public.pinned_posts(post_id, pinned_by, pinned_until, note)
    VALUES (p_post_id, auth.uid(), p_until, p_note);
  END IF;
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'pin_post', 'post', p_post_id, jsonb_build_object('until', p_until, 'note', p_note));
END;
$$;
GRANT EXECUTE ON FUNCTION public.pin_post(uuid,timestamptz,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unpin_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin();
  UPDATE public.posts SET is_pinned = false WHERE id = p_post_id;
  DELETE FROM public.pinned_posts WHERE post_id = p_post_id;
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'unpin_post', 'post', p_post_id, '{}'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unpin_post(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.lock_post(p_post_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  PERFORM public._assert_admin();
  UPDATE public.posts SET is_locked = true WHERE id = p_post_id RETURNING user_id INTO v_owner;
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'lock_post', 'post', p_post_id, jsonb_build_object('reason', p_reason));
  IF v_owner IS NOT NULL THEN
    PERFORM public.create_notification(v_owner, 'post_locked', 'Bài viết của bạn bị khoá', COALESCE(p_reason, 'Bài viết đã bị khoá bởi quản trị viên'), jsonb_build_object('post_id', p_post_id));
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.lock_post(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlock_post(p_post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  PERFORM public._assert_admin();
  UPDATE public.posts SET is_locked = false WHERE id = p_post_id RETURNING user_id INTO v_owner;
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'unlock_post', 'post', p_post_id, '{}'::jsonb);
  IF v_owner IS NOT NULL THEN
    PERFORM public.create_notification(v_owner, 'post_unlocked', 'Bài viết đã mở khoá', '', jsonb_build_object('post_id', p_post_id));
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.unlock_post(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mute_comments(p_post_id uuid, p_muted boolean DEFAULT true)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  PERFORM public._assert_admin();
  UPDATE public.posts SET comments_muted = COALESCE(p_muted, true) WHERE id = p_post_id RETURNING user_id INTO v_owner;
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), CASE WHEN COALESCE(p_muted, true) THEN 'mute_comments' ELSE 'unmute_comments' END, 'post', p_post_id, jsonb_build_object('muted', COALESCE(p_muted, true)));
  IF v_owner IS NOT NULL THEN
    PERFORM public.create_notification(
      v_owner,
      CASE WHEN COALESCE(p_muted, true) THEN 'comments_muted' ELSE 'comments_unmuted' END,
      CASE WHEN COALESCE(p_muted, true) THEN 'Bình luận đã bị tắt' ELSE 'Bình luận đã được bật lại' END,
      '',
      jsonb_build_object('post_id', p_post_id)
    );
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.mute_comments(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.lock_user(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin();
  UPDATE public.profiles
  SET account_locked = true,
      is_banned = true,
      account_status = 'suspended',
      ban_reason = COALESCE(p_reason, ban_reason, 'locked_by_admin')
  WHERE id = p_user_id;
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'lock_user', 'user', p_user_id, jsonb_build_object('reason', p_reason));
  PERFORM public.create_notification(p_user_id, 'account_locked', 'Tài khoản bị khoá', COALESCE(p_reason, 'Tài khoản đã bị khoá bởi quản trị viên'), '{}'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.lock_user(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlock_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin();
  UPDATE public.profiles
  SET account_locked = false,
      is_banned = false,
      account_status = 'active',
      ban_reason = NULL
  WHERE id = p_user_id;
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'unlock_user', 'user', p_user_id, '{}'::jsonb);
  PERFORM public.create_notification(p_user_id, 'account_unlocked', 'Tài khoản đã mở khoá', '', '{}'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.unlock_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_report(p_report_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_admin();
  UPDATE public.reports SET status = 'deleted', updated_at = now() WHERE id = p_report_id;
  INSERT INTO public.admin_logs(admin_id, action, target_type, target_id, detail)
  VALUES (auth.uid(), 'delete_report', 'report', p_report_id, '{}'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_report(uuid) TO authenticated;

-- Convenience aliases used by different UI iterations.
CREATE OR REPLACE FUNCTION public.admin_lock_account(p_user_id uuid, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.lock_user(p_user_id, p_reason); $$;
GRANT EXECUTE ON FUNCTION public.admin_lock_account(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_unlock_account(p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT public.unlock_user(p_user_id); $$;
GRANT EXECUTE ON FUNCTION public.admin_unlock_account(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 12) Final grants
-- ---------------------------------------------------------------------
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

GRANT SELECT ON public.posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.posts TO authenticated;
GRANT ALL ON public.posts TO service_role;

GRANT SELECT ON public.comments TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comments TO authenticated;
GRANT ALL ON public.comments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_messages TO authenticated;
GRANT ALL ON public.report_messages TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

GRANT SELECT, INSERT ON public.reputation_history TO authenticated;
GRANT ALL ON public.reputation_history TO service_role;

GRANT SELECT, INSERT ON public.admin_logs TO authenticated;
GRANT ALL ON public.admin_logs TO service_role;

GRANT SELECT ON public.pinned_posts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.pinned_posts TO authenticated;
GRANT ALL ON public.pinned_posts TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.banned_words TO authenticated;
GRANT ALL ON public.banned_words TO service_role;

COMMIT;

-- =====================================================================
-- Done. Safe to run again.
-- =====================================================================