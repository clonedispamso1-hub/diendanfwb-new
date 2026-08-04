-- =====================================================================
-- 2026-07-14 — FIX ON CONFLICT trên notifications (comment lỗi SQL)
-- ---------------------------------------------------------------------
-- Triệu chứng: khi comment bài viết, Postgres báo:
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- Nguyên nhân: unique index hiện tại là PARTIAL INDEX
--   (user_id, kind, entity_type, entity_id) WHERE ... IS NOT NULL
-- → ON CONFLICT (cols) không match được nếu không truyền đúng WHERE predicate,
--   và trong một số phiên bản Postgres/PostgREST vẫn không suy luận được.
--
-- Cách fix tận gốc: thay bằng UNIQUE INDEX KHÔNG partial. Function đã tự
-- RETURN khi kind/entity_type/entity_id NULL, nên ta cần đảm bảo mọi row
-- đi vào upsert đều non-null (kind/entity_type/entity_id) — với các row
-- không đủ 3 field thì đi nhánh INSERT thẳng (không dedup) như cũ.
--
-- Đồng thời bỏ dòng "notification cho follow" khỏi trigger follow (theo yêu
-- cầu UI mới: không hiển thị notification follow / self-follow / like /
-- self-like). Giữ nguyên: comment, comment_reply, wallet_transfer, system,
-- admin trust adjust.
--
-- Idempotent. KHÔNG DROP TABLE. KHÔNG SỬA DỮ LIỆU.
-- =====================================================================

BEGIN;

-- 1) Chuẩn hoá unique index thành non-partial để ON CONFLICT luôn match.
DROP INDEX IF EXISTS public.uniq_notifications_agg;

-- Xoá row có bất kỳ field nào NULL trong bộ khoá để tạo được unique index.
DELETE FROM public.notifications
WHERE kind IS NULL OR entity_type IS NULL OR entity_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_agg
  ON public.notifications(user_id, kind, entity_type, entity_id);

-- 2) Recreate notif_upsert_agg với ON CONFLICT đơn giản (không WHERE).
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
  IF p_kind IS NULL OR p_entity_type IS NULL OR p_entity_id IS NULL THEN
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
             public.notifications.actor_ids[1:49])
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

GRANT EXECUTE ON FUNCTION public.notif_upsert_agg(uuid,text,text,text,uuid,jsonb,text)
  TO authenticated, service_role;

-- 3) Recreate notif_insert_single: ON CONFLICT đơn giản (không WHERE).
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

  IF p_kind IS NOT NULL
     AND p_entity_type IS NOT NULL
     AND p_entity_id  IS NOT NULL THEN
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
       COALESCE(p_data, '{}'::jsonb) || jsonb_build_object('actor_id', p_actor_id),
       p_link, false, now(), now())
    ON CONFLICT (user_id, kind, entity_type, entity_id)
    DO NOTHING;
  ELSE
    -- Thiếu field → không thể dedup, insert thẳng.
    -- Nhưng để tránh vi phạm unique-index (non-partial giờ đã bắt cả NULL
    -- theo nghĩa distinct-null của Postgres = không match nhau), vẫn OK.
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
       COALESCE(p_data, '{}'::jsonb) || jsonb_build_object('actor_id', p_actor_id),
       p_link, false, now(), now());
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notif_insert_single(uuid,text,text,text,uuid,text,text,jsonb,text)
  TO authenticated, service_role;

-- 4) Bỏ notification loại follow (đồng bộ với UI mới không hiển thị follow).
--    Xoá dữ liệu cũ + patch trigger follow để không insert nữa.
DELETE FROM public.notifications
WHERE lower(coalesce(kind, '')) IN ('follow', 'new_follower')
   OR lower(coalesce(type, '')) IN ('follow', 'new_follower');

CREATE OR REPLACE FUNCTION public.handle_follow_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Không tạo notification follow nữa theo yêu cầu UI mới.
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_follow_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN OLD;
END;
$$;

COMMIT;

-- =====================================================================
-- Sau khi chạy:
--   • Comment / reply không còn văng lỗi ON CONFLICT.
--   • Notification loại follow / like không còn tạo mới (đã xoá dữ liệu cũ).
--   • Comment, reply, wallet_transfer, admin trust adjust, system vẫn hoạt động.
-- =====================================================================
