-- =====================================================================
-- 2026-07-05  Notifications v4 — Full rewrite (Facebook/Threads style)
--
-- Mục tiêu:
--   • Follow / Like: 1 notification duy nhất cho mỗi (recipient, entity),
--     danh sách actors gộp bên trong (không spam khi follow-unfollow-follow
--     hoặc like-unlike-like).
--   • Comment / Reply: 1 notification cho mỗi comment/reply (có preview),
--     click để scroll tới đúng comment.
--   • Wallet transfer: 1 notification cho mỗi giao dịch gem.
--   • System: giữ nguyên, không bị aggregate ảnh hưởng.
--   • Badge chỉ đếm rows chưa đọc (is_read = false).
--   • Realtime: notifications publish qua supabase_realtime.
--
-- Idempotent — có thể chạy lại nhiều lần.
-- KHÔNG drop dữ liệu cũ, chỉ thêm cột / trigger / RPC.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) Schema extension (không xoá cột cũ)
-- ---------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind          text,
  ADD COLUMN IF NOT EXISTS entity_type   text,
  ADD COLUMN IF NOT EXISTS entity_id     text,
  ADD COLUMN IF NOT EXISTS actor_ids     uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS actors_count  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_actor_id uuid,
  ADD COLUMN IF NOT EXISTS link          text,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now();

-- Aggregate uniqueness: chỉ ép unique cho các kind cần gom (follow, like).
-- comment/reply/wallet/system dùng entity_id riêng nên vẫn unique tự nhiên
-- nhờ entity_id (comment id / tx id).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_agg
  ON public.notifications(user_id, kind, entity_type, entity_id)
  WHERE kind IS NOT NULL
    AND entity_type IS NOT NULL
    AND entity_id  IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_updated
  ON public.notifications(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications(user_id) WHERE is_read = false;

-- ---------------------------------------------------------------------
-- 2) Helper: upsert aggregate notification
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_upsert_agg(
  p_user_id     uuid,
  p_kind        text,
  p_entity_type text,
  p_entity_id   text,
  p_actor_id    uuid,
  p_data        jsonb,
  p_link        text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_actor_id IS NULL OR p_user_id = p_actor_id THEN
    RETURN;
  END IF;

  INSERT INTO public.notifications
    (user_id, type, kind, entity_type, entity_id,
     actor_ids, actors_count, last_actor_id,
     data, link, is_read, created_at, updated_at)
  VALUES
    (p_user_id, p_kind, p_kind, p_entity_type, p_entity_id,
     ARRAY[p_actor_id]::uuid[], 1, p_actor_id,
     COALESCE(p_data, '{}'::jsonb) || jsonb_build_object('actor_id', p_actor_id),
     p_link, false, now(), now())
  ON CONFLICT (user_id, kind, entity_type, entity_id)
  DO UPDATE SET
    actor_ids = CASE
      WHEN p_actor_id = ANY(public.notifications.actor_ids)
        THEN public.notifications.actor_ids
      ELSE array_prepend(p_actor_id,
             public.notifications.actor_ids[1:49])   -- cap to 50 mới nhất
      END,
    actors_count = CASE
      WHEN p_actor_id = ANY(public.notifications.actor_ids)
        THEN public.notifications.actors_count
      ELSE public.notifications.actors_count + 1
      END,
    last_actor_id = p_actor_id,
    data = COALESCE(public.notifications.data, '{}'::jsonb)
           || COALESCE(p_data, '{}'::jsonb)
           || jsonb_build_object('actor_id', p_actor_id),
    link = COALESCE(p_link, public.notifications.link),
    is_read = false,
    updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.notif_upsert_agg(uuid,text,text,text,uuid,jsonb,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3) Helper: insert non-aggregated notification (comment / reply / wallet / system)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_insert_single(
  p_user_id     uuid,
  p_kind        text,
  p_entity_type text,
  p_entity_id   text,
  p_actor_id    uuid,
  p_title       text,
  p_message     text,
  p_data        jsonb,
  p_link        text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF p_actor_id IS NOT NULL AND p_actor_id = p_user_id THEN RETURN; END IF;

  INSERT INTO public.notifications
    (user_id, type, kind, entity_type, entity_id,
     actor_ids, actors_count, last_actor_id,
     title, message, data, link, is_read, created_at, updated_at)
  VALUES
    (p_user_id, p_kind, p_kind, p_entity_type, p_entity_id,
     CASE WHEN p_actor_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p_actor_id]::uuid[] END,
     CASE WHEN p_actor_id IS NULL THEN 0 ELSE 1 END,
     p_actor_id,
     p_title, p_message,
     COALESCE(p_data, '{}'::jsonb)
       || jsonb_build_object('actor_id', p_actor_id),
     p_link, false, now(), now())
  ON CONFLICT (user_id, kind, entity_type, entity_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notif_insert_single(uuid,text,text,text,uuid,text,text,jsonb,text) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Trigger: FOLLOW
--    A theo dõi B → 1 notification "follow" cho B, actor_ids gồm A.
--    Nếu C follow B thì cùng notification, actor thêm C.
--    Unfollow / follow lại KHÔNG tạo notif mới (dedup theo actor_id).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notif_after_follow_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notif_upsert_agg(
    NEW.following_id,
    'follow',
    'user',
    NEW.following_id::text,
    NEW.follower_id,
    jsonb_build_object('follower_id', NEW.follower_id),
    '/u/' || NEW.follower_id::text
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notif_after_follow_insert ON public.follows;
CREATE TRIGGER notif_after_follow_insert
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.trg_notif_after_follow_insert();

-- ---------------------------------------------------------------------
-- 5) Trigger: LIKE trên bài viết (public.likes)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.likes') IS NOT NULL THEN
    -- fine
  ELSE
    RAISE NOTICE 'public.likes not found — skipping like trigger';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trg_notif_after_like_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT user_id INTO v_owner FROM public.posts WHERE id = NEW.post_id;
  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;

  PERFORM public.notif_upsert_agg(
    v_owner,
    'like',
    'post',
    NEW.post_id::text,
    NEW.user_id,
    jsonb_build_object('post_id', NEW.post_id, 'liker_id', NEW.user_id),
    '/post/' || NEW.post_id::text
  );
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.likes') IS NOT NULL AND to_regclass('public.posts') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS notif_after_like_insert ON public.likes';
    EXECUTE 'CREATE TRIGGER notif_after_like_insert
             AFTER INSERT ON public.likes
             FOR EACH ROW EXECUTE FUNCTION public.trg_notif_after_like_insert()';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 6) Trigger: COMMENT & REPLY
--    Reply xác định bởi comments.parent_id (đã có trong schema hiện tại).
--    Comment root → notif cho chủ post.
--    Reply       → notif cho chủ comment gốc.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notif_after_comment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_owner    uuid;
  v_parent_owner  uuid;
  v_preview       text;
BEGIN
  v_preview := left(COALESCE(NEW.content, ''), 200);

  IF NEW.parent_id IS NULL THEN
    SELECT user_id INTO v_post_owner FROM public.posts WHERE id = NEW.post_id;
    IF v_post_owner IS NOT NULL AND v_post_owner <> NEW.user_id THEN
      PERFORM public.notif_insert_single(
        v_post_owner,
        'comment',
        'comment',
        NEW.id::text,
        NEW.user_id,
        NULL,
        v_preview,
        jsonb_build_object(
          'post_id', NEW.post_id,
          'comment_id', NEW.id,
          'comment_text', v_preview,
          'commenter_id', NEW.user_id
        ),
        '/post/' || NEW.post_id::text || '?comment=' || NEW.id::text
      );
    END IF;
  ELSE
    SELECT user_id INTO v_parent_owner FROM public.comments WHERE id = NEW.parent_id;
    IF v_parent_owner IS NOT NULL AND v_parent_owner <> NEW.user_id THEN
      PERFORM public.notif_insert_single(
        v_parent_owner,
        'comment_reply',
        'comment',
        NEW.id::text,
        NEW.user_id,
        NULL,
        v_preview,
        jsonb_build_object(
          'post_id', NEW.post_id,
          'comment_id', NEW.id,
          'parent_comment_id', NEW.parent_id,
          'comment_text', v_preview,
          'commenter_id', NEW.user_id
        ),
        '/post/' || NEW.post_id::text || '?comment=' || NEW.id::text
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.comments') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS notif_after_comment_insert ON public.comments';
    EXECUTE 'CREATE TRIGGER notif_after_comment_insert
             AFTER INSERT ON public.comments
             FOR EACH ROW EXECUTE FUNCTION public.trg_notif_after_comment_insert()';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 7) Trigger: WALLET (gem_transactions)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_notif_after_gem_tx_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
BEGIN
  IF NEW.to_id IS NULL OR NEW.from_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.to_id = NEW.from_id THEN RETURN NEW; END IF;

  v_amount := COALESCE(NEW.amount, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  PERFORM public.notif_insert_single(
    NEW.to_id,
    'wallet_transfer',
    'gem_tx',
    NEW.id::text,
    NEW.from_id,
    NULL,
    COALESCE(NEW.note, ''),
    jsonb_build_object(
      'tx_id', NEW.id,
      'amount', v_amount,
      'note', COALESCE(NEW.note, ''),
      'sender_id', NEW.from_id
    ),
    '/wallet'
  );
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.gem_transactions') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS notif_after_gem_tx_insert ON public.gem_transactions';
    EXECUTE 'CREATE TRIGGER notif_after_gem_tx_insert
             AFTER INSERT ON public.gem_transactions
             FOR EACH ROW EXECUTE FUNCTION public.trg_notif_after_gem_tx_insert()';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 8) RPC cho client
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_mark_read(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
     SET is_read = true, updated_at = now()
   WHERE id = p_id AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.notif_mark_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notif_mark_all_read()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
     SET is_read = true, updated_at = now()
   WHERE user_id = auth.uid() AND is_read = false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.notif_mark_all_read() TO authenticated;

CREATE OR REPLACE FUNCTION public.notif_unread_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(count(*)::int, 0)
    FROM public.notifications
   WHERE user_id = auth.uid() AND is_read = false;
$$;
GRANT EXECUTE ON FUNCTION public.notif_unread_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.notif_clear_all()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE user_id = auth.uid()
     AND COALESCE(is_pending_claim, false) = false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.notif_clear_all() TO authenticated;

-- ---------------------------------------------------------------------
-- 9) Realtime publication
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- Kiểm thử nhanh sau khi chạy migration:
--   1. A follow B, unfollow, follow → SELECT * FROM public.notifications
--      WHERE user_id = B  →  đúng 1 row kind='follow', actors_count=1.
--   2. Nhiều user like cùng post → 1 row kind='like', actors_count tăng.
--   3. Ai đó comment / reply → 1 row/comment với data.comment_id.
--   4. Gem transfer → 1 row kind='wallet_transfer' với data.amount, data.note.
--   5. SELECT public.notif_unread_count();
-- =====================================================================
