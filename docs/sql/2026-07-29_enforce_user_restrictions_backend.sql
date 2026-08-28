-- =====================================================================
-- ENFORCE user_restrictions ở BACKEND (không chỉ ẩn nút frontend).
--
-- Mọi thao tác POST / COMMENT / MESSAGE / LIKE / COMMENT_LIKE của user
-- sẽ bị BEFORE INSERT trigger từ chối nếu user đang có restriction còn
-- hạn (hoặc bị `suspend` — chặn tất cả).
--
-- Kèm helper `enforce_restriction(kind)` để dùng trong các RPC khác
-- (ví dụ tìm-quanh-đây / find_zalo / gift ...).
--
-- An toàn để chạy lại nhiều lần (idempotent). Không đụng dữ liệu cũ.
-- Yêu cầu file docs/sql/RUN_NOW_user_restrictions.sql đã chạy trước
-- (đã tạo bảng public.user_restrictions + hàm has_active_restriction).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Helper: kiểm tra + raise. Dùng cho trigger và cho RPC bất kỳ.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.enforce_restriction(text);
CREATE OR REPLACE FUNCTION public.enforce_restriction(_kind text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.user_restrictions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- suspend luôn chặn TOÀN BỘ hành động khác
  SELECT * INTO v_row
  FROM public.user_restrictions
  WHERE user_id = v_uid
    AND kind IN ('suspend', _kind)
    AND (expires_at IS NULL OR expires_at > now())
  ORDER BY (kind = 'suspend') DESC, created_at DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    RAISE EXCEPTION 'RESTRICTED:%:%:%',
      v_row.kind,
      COALESCE(v_row.reason, ''),
      COALESCE(to_char(v_row.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'), 'permanent')
      USING ERRCODE = '42501';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.enforce_restriction(text) TO authenticated, anon, service_role;

-- ---------------------------------------------------------------------
-- 2) Trigger factory cho từng bảng — mỗi trigger gọi enforce_restriction
-- ---------------------------------------------------------------------

-- posts (đăng bài)
DROP FUNCTION IF EXISTS public._trg_restrict_posts() CASCADE;
CREATE OR REPLACE FUNCTION public._trg_restrict_posts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enforce_restriction('post');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_restrict_posts ON public.posts;
CREATE TRIGGER trg_restrict_posts
  BEFORE INSERT ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public._trg_restrict_posts();

-- comments (bình luận)
DROP FUNCTION IF EXISTS public._trg_restrict_comments() CASCADE;
CREATE OR REPLACE FUNCTION public._trg_restrict_comments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enforce_restriction('comment');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_restrict_comments ON public.comments;
CREATE TRIGGER trg_restrict_comments
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public._trg_restrict_comments();

-- messages (nhắn tin)
DROP FUNCTION IF EXISTS public._trg_restrict_messages() CASCADE;
CREATE OR REPLACE FUNCTION public._trg_restrict_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enforce_restriction('message');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_restrict_messages ON public.messages;
CREATE TRIGGER trg_restrict_messages
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public._trg_restrict_messages();

-- likes (thả tim bài viết)
DROP FUNCTION IF EXISTS public._trg_restrict_likes() CASCADE;
CREATE OR REPLACE FUNCTION public._trg_restrict_likes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enforce_restriction('like');
  RETURN NEW;
END;
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='likes' AND relnamespace='public'::regnamespace) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_restrict_likes ON public.likes';
    EXECUTE 'CREATE TRIGGER trg_restrict_likes BEFORE INSERT ON public.likes FOR EACH ROW EXECUTE FUNCTION public._trg_restrict_likes()';
  END IF;
END $$;

-- comment_likes (thả tim comment)
DROP FUNCTION IF EXISTS public._trg_restrict_comment_likes() CASCADE;
CREATE OR REPLACE FUNCTION public._trg_restrict_comment_likes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enforce_restriction('like');
  RETURN NEW;
END;
$$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname='comment_likes' AND relnamespace='public'::regnamespace) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_restrict_comment_likes ON public.comment_likes';
    EXECUTE 'CREATE TRIGGER trg_restrict_comment_likes BEFORE INSERT ON public.comment_likes FOR EACH ROW EXECUTE FUNCTION public._trg_restrict_comment_likes()';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) Ghi chú: các RPC như find_zalo / nearby / gift ... nên gọi:
--       PERFORM public.enforce_restriction('find_zalo');
--       PERFORM public.enforce_restriction('nearby');
--       PERFORM public.enforce_restriction('gift');
--    ở đầu function để backend từ chối khi user đang bị hạn chế.
-- ---------------------------------------------------------------------