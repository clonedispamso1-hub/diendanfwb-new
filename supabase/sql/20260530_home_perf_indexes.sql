-- Home page performance indexes (idempotent, schema-safe).
-- Áp dụng cho các query của FeedPage / ChatPage / Suggested.
-- Không động data, không đổi RLS, không đổi cột.

-- Posts: feed chính sắp xếp theo created_at desc và lọc theo category
CREATE INDEX IF NOT EXISTS posts_created_at_desc_idx
  ON public.posts (created_at DESC);

CREATE INDEX IF NOT EXISTS posts_category_created_at_idx
  ON public.posts (category, created_at DESC);

CREATE INDEX IF NOT EXISTS posts_user_created_at_idx
  ON public.posts (user_id, created_at DESC);

-- Follows / Blocks: dùng để ưu tiên & filter feed
CREATE INDEX IF NOT EXISTS follows_follower_idx
  ON public.follows (follower_id);

CREATE INDEX IF NOT EXISTS follows_following_idx
  ON public.follows (following_id);

-- Bảng user_blocks chỉ tồn tại ở DB mới — bọc trong DO để tránh fail trên DB cũ.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_blocks') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS user_blocks_blocker_idx ON public.user_blocks (blocker_id)';
  END IF;
END $$;

-- Videos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'videos_social') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS videos_social_created_at_idx ON public.videos_social (created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS videos_social_user_created_idx ON public.videos_social (user_id, created_at DESC)';
  END IF;
END $$;

-- Messages: chat box / inbox
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'messages') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS messages_sender_created_idx ON public.messages (sender_id, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS messages_receiver_created_idx ON public.messages (receiver_id, created_at DESC)';
  END IF;
END $$;

-- Post gifts (popup tổng tip)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'post_gifts') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS post_gifts_post_idx ON public.post_gifts (post_id)';
  END IF;
END $$;

ANALYZE public.posts;
ANALYZE public.follows;
