-- ============================================================
-- Supabase 3 (uaqsetfdciyzxpuhulux) — SCHEMA BẢNG NỘI DUNG
-- Chạy TOÀN BỘ file này trong SQL Editor của Supabase 3.
-- An toàn để chạy lại (IF NOT EXISTS / DO $$ ... $$).
--
-- Không có FK xuyên project: user_id / post_id chỉ là khoá logic (uuid).
-- ============================================================

-- ---------- posts ----------
CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  content text,
  image_url text,
  image_urls text[],
  gif_url text,
  likes_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  views_count integer NOT NULL DEFAULT 0,
  bot_likes integer NOT NULL DEFAULT 0,
  virtual_view_base integer NOT NULL DEFAULT 0,
  display_view_offset integer NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'home',
  status text NOT NULL DEFAULT 'published',
  category text NOT NULL DEFAULT 'general',
  has_images boolean NOT NULL DEFAULT false,
  is_anonymous boolean NOT NULL DEFAULT false,
  is_edited boolean NOT NULL DEFAULT false,
  is_locked boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  is_featured boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  is_admin_post boolean NOT NULL DEFAULT false,
  is_popup boolean NOT NULL DEFAULT false,
  comments_disabled boolean NOT NULL DEFAULT false,
  priority_new boolean NOT NULL DEFAULT false,
  priority_level integer NOT NULL DEFAULT 0,
  reward_enabled boolean NOT NULL DEFAULT false,
  reward_mode text NOT NULL DEFAULT 'fixed',
  coin_pool_total integer NOT NULL DEFAULT 0,
  coin_pool_remaining integer NOT NULL DEFAULT 0,
  coin_per_person integer NOT NULL DEFAULT 0,
  max_claimers integer NOT NULL DEFAULT 0,
  claimed_count integer NOT NULL DEFAULT 0,
  admin_priority text DEFAULT 'info',
  post_code text,
  relationship_type text,
  province text,
  district text,
  facebook_url text,
  zalo_url text,
  pin_until timestamptz,
  pinned_at timestamptz,
  pinned_until timestamptz,
  priority_until timestamptz,
  featured_until timestamptz,
  locked_at timestamptz,
  locked_reason text,
  bumped_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS posts_created_at_idx ON public.posts (created_at DESC);
CREATE INDEX IF NOT EXISTS posts_user_id_idx ON public.posts (user_id);
CREATE INDEX IF NOT EXISTS posts_feed_idx ON public.posts (visibility, status, created_at DESC);

-- ---------- comments ----------
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  parent_id uuid,
  content text,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comments_post_idx ON public.comments (post_id, created_at);
CREATE INDEX IF NOT EXISTS comments_user_idx ON public.comments (user_id);

-- ---------- likes ----------
CREATE TABLE IF NOT EXISTS public.likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS likes_post_idx ON public.likes (post_id);
CREATE INDEX IF NOT EXISTS likes_user_idx ON public.likes (user_id);

-- ---------- follows ----------
CREATE TABLE IF NOT EXISTS public.follows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL,
  following_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS follows_follower_idx ON public.follows (follower_id);
CREATE INDEX IF NOT EXISTS follows_following_idx ON public.follows (following_id);

-- ---------- messages (bảng có thể đã tồn tại từ đợt migrate trước) ----------
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  content text,
  image_url text,
  reply_to uuid,
  is_read boolean NOT NULL DEFAULT false,
  is_recalled boolean NOT NULL DEFAULT false,
  recalled_at timestamptz,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS reply_to uuid;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_recalled boolean NOT NULL DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS recalled_at timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;
CREATE INDEX IF NOT EXISTS messages_pair_idx ON public.messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS messages_receiver_idx ON public.messages (receiver_id, is_read);

-- ============================================================
-- GRANTS (bắt buộc — Data API không tự cấp quyền trên schema public)
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posts','comments','likes','follows','messages'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Nội dung công khai (feed) đọc bằng anon vì người dùng đăng nhập ở Supabase 1,
-- token đó KHÔNG hợp lệ ở Supabase 3.
GRANT SELECT ON public.posts TO anon;
GRANT SELECT ON public.comments TO anon;
GRANT SELECT ON public.likes TO anon;
GRANT SELECT ON public.follows TO anon;

-- ============================================================
-- RLS
-- Lưu ý bảo mật: `messages` KHÔNG cấp quyền cho anon. Sau khi copy dữ liệu,
-- mọi đọc/ghi tin nhắn phải đi qua server function của website (service role)
-- hoặc bật third-party auth trỏ JWT của Supabase 1 sang Supabase 3.
-- ============================================================
ALTER TABLE public.posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='posts' AND policyname='posts_public_read') THEN
    CREATE POLICY posts_public_read ON public.posts FOR SELECT TO anon, authenticated
      USING (is_deleted = false AND is_hidden = false AND status = 'published');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='comments' AND policyname='comments_public_read') THEN
    CREATE POLICY comments_public_read ON public.comments FOR SELECT TO anon, authenticated
      USING (is_hidden = false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='likes' AND policyname='likes_public_read') THEN
    CREATE POLICY likes_public_read ON public.likes FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='follows' AND policyname='follows_public_read') THEN
    CREATE POLICY follows_public_read ON public.follows FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- ---------- Realtime ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posts','comments','likes','follows','messages'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
  END LOOP;
END $$;
