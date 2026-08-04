-- ============================================================
-- Final polish v2 — SAFE / SCHEMA-COMPATIBLE
-- Generated: 2026-07-03
-- Thay thế hoàn toàn file cũ 2026-07-03_final_polish_gifs_and_notifications.sql
-- (file cũ đã lỗi: ERROR: column "entity_id" does not exist)
--
-- WHY THE PREVIOUS MIGRATION FAILED
-- ---------------------------------
-- File cũ giả định bảng public.notifications có các cột
--   recipient_id, actor_id, entity_id, payload
-- Nhưng schema thật (theo supabase/sql/20260629_notifications_v2.sql và
-- client code trong src/pages/Notifications.tsx + notifications-panel.tsx)
-- lại là:
--   id, user_id, type, title, message, data (jsonb),
--   is_read, is_pending_claim, created_at
-- Vì vậy mọi ALTER/INDEX/UPDATE tham chiếu entity_id đều lỗi ngay câu đầu tiên.
--
-- WHAT THIS FILE DOES DIFFERENTLY
-- -------------------------------
-- 1. KHÔNG chạm tới các cột đang có. Không rename, không drop.
-- 2. Chỉ ADD COLUMN IF NOT EXISTS cho những cột mới thực sự cần
--    (actor_ids, actor_count, dedup_key) trên notifications.
-- 3. Dedup key được sinh từ (type + data->>'post_id'/'comment_id'/'from_id'…)
--    thay cho entity_id ảo.
-- 4. Trigger/RPC upsert-like dùng user_id + dedup_key (khớp cột thật).
-- 5. Bảng gifs/gif_categories + cột media_url/media_type/gif_id trên comments
--    dùng IF NOT EXISTS nên chạy lại nhiều lần vẫn an toàn.
-- 6. Nếu public.has_role(uuid,text/app_role) không tồn tại, xem block cuối
--    file để dùng cách check admin khác (hoặc bỏ policy admin_write).
--
-- HÃY CHẠY FILE INSPECT 2026-07-03_INSPECT_before_migration.sql TRƯỚC
-- để xác nhận cột thật, rồi mới chạy file này.
-- ============================================================


-- ------------------------------------------------------------
-- 1) GIF categories & GIF library (admin-managed)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gif_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  label       text NOT NULL,
  emoji       text,
  sort_order  int  NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gifs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id  uuid NOT NULL REFERENCES public.gif_categories(id) ON DELETE CASCADE,
  url          text NOT NULL,
  preview_url  text,
  width        int,
  height       int,
  sort_order   int  NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS gifs_category_idx        ON public.gifs (category_id, sort_order);
CREATE INDEX IF NOT EXISTS gif_categories_active_idx ON public.gif_categories (is_active, sort_order);

GRANT SELECT ON public.gif_categories TO anon, authenticated;
GRANT SELECT ON public.gifs           TO anon, authenticated;
GRANT ALL    ON public.gif_categories TO service_role;
GRANT ALL    ON public.gifs           TO service_role;

ALTER TABLE public.gif_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gifs           ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gif_categories_public_read" ON public.gif_categories;
CREATE POLICY "gif_categories_public_read"
  ON public.gif_categories FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "gifs_public_read" ON public.gifs;
CREATE POLICY "gifs_public_read"
  ON public.gifs FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Ghi (chỉ admin). Nếu has_role không tồn tại, xem block cuối file.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
              WHERE n.nspname='public' AND p.proname='has_role') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS "gif_categories_admin_write" ON public.gif_categories;
      CREATE POLICY "gif_categories_admin_write"
        ON public.gif_categories FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin'))
        WITH CHECK (public.has_role(auth.uid(), 'admin'));

      DROP POLICY IF EXISTS "gifs_admin_write" ON public.gifs;
      CREATE POLICY "gifs_admin_write"
        ON public.gifs FOR ALL
        TO authenticated
        USING (public.has_role(auth.uid(), 'admin'))
        WITH CHECK (public.has_role(auth.uid(), 'admin'));
    $p$;
  END IF;
END $$;

INSERT INTO public.gif_categories (slug, label, emoji, sort_order) VALUES
  ('happy',       'Vui',        '😀', 10),
  ('funny',       'Hài hước',    '😂', 20),
  ('love',        'Yêu',        '😍', 30),
  ('heart',       'Trái tim',   '❤️', 40),
  ('flirty',      'Nháy mắt',   '😏', 50),
  ('sad',         'Buồn',       '😭', 60),
  ('hot',         'Nóng',       '🔥', 70),
  ('pointing',    'Chỉ tay',    '👇', 80),
  ('like',        'Thích',      '👍', 90),
  ('celebration', 'Chúc mừng',  '🎉', 100)
ON CONFLICT (slug) DO NOTHING;


-- ------------------------------------------------------------
-- 2) Comment media attachment (1 image HOẶC 1 GIF / comment)
--    Add-only, không đụng tới cột hiện có.
-- ------------------------------------------------------------
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS media_url  text,
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS gif_id     uuid;

-- Constraint & FK chỉ tạo nếu chưa tồn tại
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_media_type_check'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_media_type_check
      CHECK (media_type IS NULL OR media_type IN ('image','gif'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_gif_id_fkey'
  ) THEN
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_gif_id_fkey
      FOREIGN KEY (gif_id) REFERENCES public.gifs(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ------------------------------------------------------------
-- 3) Notifications dedup + grouping (schema-compatible)
--    Bảng thật dùng: user_id, type, data (jsonb), is_read, created_at.
--    KHÔNG tồn tại entity_id / recipient_id / actor_id / payload.
-- ------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS actor_ids   uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS actor_count int    NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dedup_key   text;

-- Helper: sinh dedup_key từ data JSON. Dùng post_id / comment_id / from_id
-- nếu có, fallback là type + id để không đụng.
CREATE OR REPLACE FUNCTION public.notif_build_dedup_key(p_type text, p_data jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT p_type || ':' || COALESCE(
    p_data->>'post_id',
    p_data->>'comment_id',
    p_data->>'video_id',
    p_data->>'from_id',
    ''
  );
$$;

-- Backfill dedup_key cho các dòng cũ (chỉ khi đang NULL)
UPDATE public.notifications
   SET dedup_key = public.notif_build_dedup_key(type, COALESCE(data,'{}'::jsonb))
 WHERE dedup_key IS NULL;

-- Unique index chỉ cho notif dạng "like" — để upsert cộng dồn actor.
-- (comment/reply KHÔNG unique — mỗi comment là 1 sự kiện riêng.)
CREATE UNIQUE INDEX IF NOT EXISTS notifications_like_dedup_uidx
  ON public.notifications (user_id, type, dedup_key)
  WHERE type IN ('like','post_like','video_like','comment_like');

-- RPC upsert like — client gọi hoặc trigger gọi.
CREATE OR REPLACE FUNCTION public.notifications_upsert_like(
  p_user_id  uuid,   -- người nhận notif (chủ post/comment)
  p_actor    uuid,   -- người vừa like
  p_type     text,   -- 'like' | 'post_like' | 'video_like' | 'comment_like'
  p_data     jsonb DEFAULT '{}'::jsonb,
  p_title    text  DEFAULT NULL,
  p_message  text  DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF p_user_id IS NULL OR p_actor IS NULL OR p_user_id = p_actor THEN
    RETURN;
  END IF;

  v_key := public.notif_build_dedup_key(p_type, COALESCE(p_data,'{}'::jsonb));

  INSERT INTO public.notifications
        (user_id, type, title, message, data,
         actor_ids, actor_count, dedup_key, is_read, created_at)
  VALUES (p_user_id, p_type, p_title, p_message, COALESCE(p_data,'{}'::jsonb),
          ARRAY[p_actor]::uuid[], 1, v_key, false, now())
  ON CONFLICT (user_id, type, dedup_key)
    WHERE type IN ('like','post_like','video_like','comment_like')
  DO UPDATE
     SET actor_ids  = (
           SELECT ARRAY(SELECT DISTINCT unnest(public.notifications.actor_ids || EXCLUDED.actor_ids))
         ),
         actor_count = COALESCE(array_length(
           (SELECT ARRAY(SELECT DISTINCT unnest(public.notifications.actor_ids || EXCLUDED.actor_ids))), 1
         ), 1),
         is_read     = false,
         created_at  = now(),
         data        = COALESCE(EXCLUDED.data, public.notifications.data),
         title       = COALESCE(EXCLUDED.title,   public.notifications.title),
         message     = COALESCE(EXCLUDED.message, public.notifications.message);
END;
$$;

REVOKE ALL ON FUNCTION public.notifications_upsert_like(uuid, uuid, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.notifications_upsert_like(uuid, uuid, text, jsonb, text, text)
  TO authenticated, service_role;

-- Dọn like-notif trùng nhau trong lịch sử: giữ dòng mới nhất, gộp actor.
WITH grouped AS (
  SELECT user_id, type,
         public.notif_build_dedup_key(type, COALESCE(data,'{}'::jsonb)) AS k,
         (array_agg(id ORDER BY created_at DESC))[1]   AS keep_id,
          max(created_at)                              AS newest,
          array_remove(array_agg(DISTINCT NULLIF(data->>'from_id','')::uuid), NULL) AS actors
    FROM public.notifications
   WHERE type IN ('like','post_like','video_like','comment_like')
   GROUP BY user_id, type, k
   HAVING count(*) > 1
)
UPDATE public.notifications n
   SET actor_ids   = COALESCE(g.actors, n.actor_ids),
       actor_count = COALESCE(array_length(g.actors,1), n.actor_count),
       created_at  = g.newest,
       dedup_key   = g.k
  FROM grouped g
 WHERE n.id = g.keep_id;

DELETE FROM public.notifications n
 USING (
   SELECT id FROM (
     SELECT id,
            row_number() OVER (
              PARTITION BY user_id, type,
                           public.notif_build_dedup_key(type, COALESCE(data,'{}'::jsonb))
              ORDER BY created_at DESC
            ) AS rn
       FROM public.notifications
      WHERE type IN ('like','post_like','video_like','comment_like')
   ) x WHERE x.rn > 1
 ) dead
 WHERE n.id = dead.id;

-- Dọn duplicate comment notif (nếu app cũ từng insert đôi cùng comment_id + from_id)
DELETE FROM public.notifications n
 USING (
   SELECT id FROM (
     SELECT id,
            row_number() OVER (
              PARTITION BY user_id, type,
                           COALESCE(data->>'comment_id',''),
                           COALESCE(data->>'from_id','')
              ORDER BY created_at ASC
            ) AS rn
       FROM public.notifications
      WHERE type IN ('comment','reply','comment_post','comment_video','new_comment')
        AND COALESCE(data->>'comment_id','') <> ''
   ) x WHERE x.rn > 1
 ) dead
 WHERE n.id = dead.id;


-- ------------------------------------------------------------
-- 4) Unread badge helper — dùng cột user_id thật.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notifications_unread_count(p_user uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int
    FROM public.notifications
   WHERE user_id = p_user
     AND is_read = false;
$$;

REVOKE ALL ON FUNCTION public.notifications_unread_count(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.notifications_unread_count(uuid)
  TO authenticated, service_role;


-- ============================================================
-- Nếu project KHÔNG có public.has_role(uuid, ...) thì policy
-- admin_write ở block #1 sẽ bị bỏ qua. Bạn có 2 lựa chọn:
--  A) Tạo has_role theo pattern user_roles chuẩn của Lovable, rồi
--     chạy lại file này để tạo 2 policy admin_write.
--  B) Thay 2 policy admin_write bằng cách check admin riêng của bạn
--     (vd: EXISTS (SELECT 1 FROM public.admin_users WHERE id = auth.uid())).
-- ============================================================
-- END OF MIGRATION
-- ============================================================
