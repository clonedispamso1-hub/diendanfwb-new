-- =====================================================================
-- ⚡ CHẠY FILE NÀY MỘT LẦN TRONG SUPABASE SQL EDITOR
-- Mục đích: Loại bỏ lag 5–10s khi feed load đếm likes/comments/views.
--
-- Cách làm:
--   1. Thêm 3 cột cached vào public.posts: likes_count, comments_count, views_count.
--   2. Tạo trigger AFTER INSERT/DELETE trên post_likes, comments, post_views
--      để auto cập nhật cột cached (atomic, race-safe).
--   3. Backfill giá trị hiện tại cho toàn bộ bài viết.
--
-- An toàn để chạy lại nhiều lần (idempotent).
-- KHÔNG đụng RLS, KHÔNG đụng dữ liệu hiện tại.
-- =====================================================================

-- ===== B1. Thêm cột cached (nếu chưa có) =====
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS likes_count    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS views_count    integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS posts_likes_count_idx    ON public.posts (likes_count    DESC);
CREATE INDEX IF NOT EXISTS posts_comments_count_idx ON public.posts (comments_count DESC);
CREATE INDEX IF NOT EXISTS posts_views_count_idx    ON public.posts (views_count    DESC);

-- ===== B2. Helper functions cho trigger =====

-- Phát hiện tên bảng "likes" (codebase đang dùng public.likes, prompt nhắc tới post_likes).
-- Trigger sẽ được gắn vào bảng nào tồn tại; nếu cả hai tồn tại thì gắn cả hai.

CREATE OR REPLACE FUNCTION public._bump_post_likes_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._bump_post_comments_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET comments_count = comments_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._bump_post_views_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.posts SET views_count = views_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.posts SET views_count = GREATEST(views_count - 1, 0) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ===== B3. Gắn trigger (DROP + CREATE để idempotent, bọc IF EXISTS) =====

DO $$
BEGIN
  -- LIKES: hỗ trợ cả tên "likes" (codebase hiện tại) và "post_likes" (prompt yêu cầu).
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'likes') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS likes_bump_post_count ON public.likes';
    EXECUTE 'CREATE TRIGGER likes_bump_post_count
             AFTER INSERT OR DELETE ON public.likes
             FOR EACH ROW EXECUTE FUNCTION public._bump_post_likes_count()';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'post_likes') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS post_likes_bump_post_count ON public.post_likes';
    EXECUTE 'CREATE TRIGGER post_likes_bump_post_count
             AFTER INSERT OR DELETE ON public.post_likes
             FOR EACH ROW EXECUTE FUNCTION public._bump_post_likes_count()';
  END IF;

  -- COMMENTS
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'comments') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS comments_bump_post_count ON public.comments';
    EXECUTE 'CREATE TRIGGER comments_bump_post_count
             AFTER INSERT OR DELETE ON public.comments
             FOR EACH ROW EXECUTE FUNCTION public._bump_post_comments_count()';
  END IF;

  -- VIEWS
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'post_views') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS post_views_bump_post_count ON public.post_views';
    EXECUTE 'CREATE TRIGGER post_views_bump_post_count
             AFTER INSERT OR DELETE ON public.post_views
             FOR EACH ROW EXECUTE FUNCTION public._bump_post_views_count()';
  END IF;
END $$;

-- ===== B4. BACKFILL — đếm lại 1 lần cho toàn bộ posts hiện có =====

DO $$
DECLARE
  has_likes      boolean := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='likes');
  has_post_likes boolean := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_likes');
  has_comments   boolean := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='comments');
  has_views      boolean := EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='post_views');
BEGIN
  IF has_likes THEN
    EXECUTE $sql$
      UPDATE public.posts p
         SET likes_count = sub.c
        FROM (SELECT post_id, COUNT(*)::int AS c FROM public.likes GROUP BY post_id) sub
       WHERE p.id = sub.post_id
    $sql$;
  ELSIF has_post_likes THEN
    EXECUTE $sql$
      UPDATE public.posts p
         SET likes_count = sub.c
        FROM (SELECT post_id, COUNT(*)::int AS c FROM public.post_likes GROUP BY post_id) sub
       WHERE p.id = sub.post_id
    $sql$;
  END IF;

  IF has_comments THEN
    EXECUTE $sql$
      UPDATE public.posts p
         SET comments_count = sub.c
        FROM (SELECT post_id, COUNT(*)::int AS c FROM public.comments GROUP BY post_id) sub
       WHERE p.id = sub.post_id
    $sql$;
  END IF;

  IF has_views THEN
    EXECUTE $sql$
      UPDATE public.posts p
         SET views_count = sub.c
        FROM (SELECT post_id, COUNT(*)::int AS c FROM public.post_views GROUP BY post_id) sub
       WHERE p.id = sub.post_id
    $sql$;
  END IF;
END $$;

-- ===== B5. Cho phép Data API đọc 3 cột mới (cùng quyền với bảng posts hiện tại) =====
-- RLS hiện tại của posts đã quyết định ai đọc được; cột mới chỉ là counter công khai.

-- Xong. Frontend sẽ tự đọc likes_count / comments_count / views_count từ payload.
