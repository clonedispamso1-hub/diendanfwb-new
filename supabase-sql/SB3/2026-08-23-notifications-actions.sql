-- =====================================================================
-- CHẠY TRÊN SUPABASE #3  (logs/social — uaqsetfdciyzxpuhulux)
-- Bảng liên quan: public.posts, public.comments, public.notifications
-- (cả 3 bảng đều nằm trên SB3 → trigger chạy nội bộ, KHÔNG cross-DB).
--
-- Nội dung:
--   1. Bổ sung cột chuẩn cho notification: post_id, comment_id, actor_id.
--   2. Index cho badge unread / Gift pending / truy vấn theo bài.
--   3. Chống trùng: unique index (user_id, type, comment_id).
--   4. Trigger: có người COMMENT bài của tôi → notification cho tôi.
--   5. Trigger: có người REPLY comment của tôi → notification cho tôi.
--      Không tự thông báo cho chính mình.
--   6. Xoá comment → xoá luôn notification trỏ tới comment đó.
--
-- Idempotent: chạy lại nhiều lần vẫn an toàn. KHÔNG drop bảng, KHÔNG xoá
-- dữ liệu nghiệp vụ. KHÔNG đụng SB1/SB2 (Xu/Gem/Gift do app gọi RPC SB1
-- trước, chỉ khi RPC thành công app mới INSERT notification vào SB3).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cột
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='notifications') THEN
    RAISE EXCEPTION 'public.notifications không tồn tại — bạn đang chạy sai Supabase (file này dành cho SB3).';
  END IF;
END $$;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS post_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS comment_id uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS actor_id uuid;
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_pending_claim boolean NOT NULL DEFAULT false;

-- Backfill từ JSON data cho hàng cũ.
UPDATE public.notifications
   SET post_id = NULLIF(data->>'post_id','')::uuid
 WHERE post_id IS NULL AND (data->>'post_id') ~ '^[0-9a-fA-F-]{36}$';

UPDATE public.notifications
   SET comment_id = NULLIF(data->>'comment_id','')::uuid
 WHERE comment_id IS NULL AND (data->>'comment_id') ~ '^[0-9a-fA-F-]{36}$';

UPDATE public.notifications
   SET actor_id = COALESCE(last_actor_id, NULLIF(data->>'actor_id','')::uuid)
 WHERE actor_id IS NULL
   AND (last_actor_id IS NOT NULL OR (data->>'actor_id') ~ '^[0-9a-fA-F-]{36}$');

-- ---------------------------------------------------------------------
-- 2. Index
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_pending_gift
  ON public.notifications (user_id, created_at DESC)
  WHERE is_pending_claim = true;

CREATE INDEX IF NOT EXISTS idx_notifications_post_id
  ON public.notifications (post_id) WHERE post_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_comment_id
  ON public.notifications (comment_id) WHERE comment_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3. Chống trùng: 1 comment chỉ sinh tối đa 1 notification/loại/người nhận.
--    (dọn bản trùng cũ trước khi tạo unique index)
-- ---------------------------------------------------------------------
DELETE FROM public.notifications a
 USING public.notifications b
 WHERE a.comment_id IS NOT NULL
   AND a.comment_id = b.comment_id
   AND a.user_id = b.user_id
   AND COALESCE(a.type,'') = COALESCE(b.type,'')
   AND a.ctid > b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_comment_target
  ON public.notifications (user_id, type, comment_id)
  WHERE comment_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 4+5. Trigger tạo notification cho comment và reply
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_owner   uuid;
  v_parent_owner uuid;
  v_actor        uuid := NEW.user_id;
  v_preview      text := left(COALESCE(NEW.content, ''), 120);
BEGIN
  SELECT p.user_id INTO v_post_owner FROM public.posts p WHERE p.id = NEW.post_id;

  -- (a) Trả lời bình luận → báo cho chủ bình luận cha.
  IF NEW.parent_id IS NOT NULL THEN
    SELECT c.user_id INTO v_parent_owner FROM public.comments c WHERE c.id = NEW.parent_id;

    IF v_parent_owner IS NOT NULL AND v_parent_owner <> v_actor THEN
      INSERT INTO public.notifications
        (user_id, actor_id, last_actor_id, type, kind, title, message,
         post_id, comment_id, entity_type, entity_id, is_read, is_pending_claim, data, created_at)
      VALUES
        (v_parent_owner, v_actor, v_actor, 'comment_reply', 'comment_reply',
         'Có người trả lời bình luận của bạn', v_preview,
         NEW.post_id, NEW.id, 'comment', NEW.id, false, false,
         jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id,
                            'parent_id', NEW.parent_id, 'actor_id', v_actor),
         now())
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- (b) Bình luận vào bài → báo cho chủ bài (bỏ qua nếu trùng người vừa
  --     được báo ở (a), và bỏ qua khi tự bình luận bài của mình).
  IF v_post_owner IS NOT NULL
     AND v_post_owner <> v_actor
     AND (v_parent_owner IS NULL OR v_parent_owner <> v_post_owner) THEN
    INSERT INTO public.notifications
      (user_id, actor_id, last_actor_id, type, kind, title, message,
       post_id, comment_id, entity_type, entity_id, is_read, is_pending_claim, data, created_at)
    VALUES
      (v_post_owner, v_actor, v_actor, 'comment', 'comment',
       'Có người bình luận bài viết của bạn', v_preview,
       NEW.post_id, NEW.id, 'comment', NEW.id, false, false,
       jsonb_build_object('post_id', NEW.post_id, 'comment_id', NEW.id,
                          'actor_id', v_actor),
       now())
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_on_comment ON public.comments;
CREATE TRIGGER trg_notify_on_comment
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

-- ---------------------------------------------------------------------
-- 6. Comment bị xoá → notification trỏ tới nó cũng phải biến mất
--    (tránh click vào thông báo mà không tìm thấy bình luận).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_notifications_on_comment_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
   WHERE comment_id = OLD.id
     AND COALESCE(is_pending_claim, false) = false;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_cleanup_notifications_on_comment_delete ON public.comments;
CREATE TRIGGER trg_cleanup_notifications_on_comment_delete
  AFTER DELETE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_notifications_on_comment_delete();

-- Dọn 1 lần các notification mồ côi đang tồn tại.
DELETE FROM public.notifications n
 WHERE n.comment_id IS NOT NULL
   AND COALESCE(n.is_pending_claim, false) = false
   AND NOT EXISTS (SELECT 1 FROM public.comments c WHERE c.id = n.comment_id);

-- ---------------------------------------------------------------------
-- 7. Quyền (Data API) — giữ nguyên RLS hiện có, chỉ đảm bảo GRANT.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Realtime cho badge (bỏ qua nếu đã có trong publication).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'notifications đã có trong supabase_realtime';
END $$;
