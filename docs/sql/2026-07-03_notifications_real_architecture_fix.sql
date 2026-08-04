-- =====================================================================
-- 2026-07-03  Notifications real-architecture fix
--
-- This migration is based on the current notification architecture in this
-- repository:
--   public.notifications(id, user_id, type, title, message, data, is_read,
--   is_pending_claim, created_at, ...optional legacy columns)
--
-- IMPORTANT DIFFERENCE FROM THE FAILED MIGRATION
-- ----------------------------------------------
-- The previous file generated `dedup_key = type || ':' || COALESCE(..., '')`.
-- For existing rows whose payload did not contain the assumed keys, this
-- produced bad keys such as `like:`. A unique index on (user_id,type,dedup_key)
-- then failed because many legacy like rows shared the same meaningless key.
--
-- This migration never treats an empty identifier as a valid dedup key.
-- If the payload does not contain a real target id, dedup_key is NULL and the
-- row is intentionally excluded from the unique index.
-- =====================================================================

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NULL THEN
    RAISE EXCEPTION 'public.notifications does not exist; stop and inspect production schema first';
  END IF;
END $$;

-- Keep the real table shape. Add only the one column needed to support safe
-- server-side dedup; do not rename/drop any current notification columns.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedup_key text;

-- ---------------------------------------------------------------------
-- Real dedup key builder.
-- Returns NULL when the payload has no reliable identifier.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notif_real_dedup_key(p_type text, p_data jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text := lower(coalesce(p_type, ''));
  d jsonb := coalesce(p_data, '{}'::jsonb);
  target text;
  actor text;
  milestone text;
BEGIN
  -- Raw like notifications. The canonical identifier is the liked entity id
  -- inside data JSON, not an empty fallback. These rows are mostly hidden by
  -- the UI, but if old triggers still create them they must not duplicate.
  IF t IN ('like', 'like_post', 'post_like', 'like_video', 'video_like', 'comment_like') THEN
    target := nullif(coalesce(
      d->>'post_id',
      d->>'target_post_id',
      d->>'video_id',
      d->>'target_video_id',
      d->>'comment_id',
      d->>'target_comment_id',
      d->>'reply_id',
      d->>'target_id',
      d->>'entity_id'
    ), '');
    IF target IS NULL THEN
      RETURN NULL;
    END IF;
    RETURN t || ':' || target;
  END IF;

  -- Like milestone notifications are already generated once per post+milestone.
  IF t = 'like_milestone' THEN
    target := nullif(coalesce(d->>'post_id', d->>'target_post_id', d->>'target_id'), '');
    milestone := nullif(d->>'milestone', '');
    IF target IS NULL OR milestone IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || target || ':' || milestone;
  END IF;

  -- Comment/reply notifications: comment id is the strongest key. If the
  -- creator path did not include comment_id, fall back only when both target
  -- post/video and actor are present.
  IF t IN ('comment_post', 'comment_video', 'comment', 'reply', 'comment_reply', 'post_comment', 'video_comment', 'new_comment') THEN
    target := nullif(coalesce(d->>'comment_id', d->>'reply_id', d->>'target_comment_id'), '');
    IF target IS NOT NULL THEN RETURN t || ':comment:' || target; END IF;

    target := nullif(coalesce(d->>'post_id', d->>'target_post_id', d->>'video_id', d->>'target_video_id', d->>'target_id'), '');
    actor := nullif(coalesce(d->>'sender_id', d->>'actor_id', d->>'from_id', d->>'from_user_id', d->>'commenter_id'), '');
    IF target IS NOT NULL AND actor IS NOT NULL THEN
      RETURN t || ':fallback:' || target || ':' || actor;
    END IF;
    RETURN NULL;
  END IF;

  -- Rewards/gifts must be deduped by transaction/gift/claim identifiers, not
  -- by post_id alone, because the same sender can send multiple gifts to the
  -- same post/video.
  IF t IN ('gift_post', 'gift_video', 'candy_transfer', 'gem_transfer', 'transfer_gem', 'gem_received') THEN
    target := nullif(coalesce(d->>'transaction_id', d->>'tx_id', d->>'tx', d->>'gift_id'), '');
    IF target IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || target;
  END IF;

  -- One pending red-packet claim per recipient/post is the real business rule.
  IF t IN ('red_packet_pending', 'red_packet_claimed') THEN
    target := nullif(coalesce(d->>'claim_id', d->>'post_id', d->>'red_packet_id'), '');
    IF target IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || target;
  END IF;

  IF t = 'profile_view_agg' THEN
    target := nullif(coalesce(d->>'view_date', d->>'date'), '');
    IF target IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || target;
  END IF;

  IF t IN ('follow', 'new_follower') THEN
    actor := nullif(coalesce(d->>'sender_id', d->>'actor_id', d->>'from_id', d->>'from_user_id', d->>'follower_id', d->>'user_id'), '');
    IF actor IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || actor;
  END IF;

  IF t = 'connection_request' THEN
    target := nullif(d->>'request_id', '');
    IF target IS NULL THEN RETURN NULL; END IF;
    RETURN t || ':' || target;
  END IF;

  RETURN NULL;
END;
$$;

-- Replace the unsafe helper left by the failed migration, if it exists, with a
-- compatibility wrapper that returns NULL instead of `like:` for unknown data.
CREATE OR REPLACE FUNCTION public.notif_build_dedup_key(p_type text, p_data jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.notif_real_dedup_key(p_type, p_data);
$$;

-- Backfill every row using the real key builder. Bad legacy values like
-- `like:` become NULL when there is no target id in data.
UPDATE public.notifications
   SET dedup_key = public.notif_real_dedup_key(type, coalesce(data, '{}'::jsonb));

-- Ensure future inserts get the real dedup_key before any later trigger tries
-- to aggregate or before the unique index evaluates the row.
CREATE OR REPLACE FUNCTION public.notifications_prepare_dedup_key()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.dedup_key := public.notif_real_dedup_key(NEW.type, coalesce(NEW.data, '{}'::jsonb));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_00_prepare_dedup_key ON public.notifications;
CREATE TRIGGER trg_notifications_00_prepare_dedup_key
  BEFORE INSERT OR UPDATE OF type, data ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_prepare_dedup_key();

-- ---------------------------------------------------------------------
-- Preserve and harden the existing comment dedup trigger.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notifications_dedup_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comment_id  text := nullif(coalesce(NEW.data->>'comment_id', NEW.data->>'reply_id', NEW.data->>'target_comment_id'), '');
  v_post_id     text := nullif(coalesce(NEW.data->>'post_id', NEW.data->>'target_id', NEW.data->>'target_post_id', NEW.data->>'video_id', NEW.data->>'target_video_id'), '');
  v_actor       text := nullif(coalesce(NEW.data->>'sender_id', NEW.data->>'actor_id', NEW.data->>'from_id', NEW.data->>'from_user_id', NEW.data->>'commenter_id'), '');
  v_has_avatar  boolean := coalesce(nullif(NEW.data->>'actor_avatar',''), nullif(NEW.data->>'sender_avatar','')) IS NOT NULL;
  v_existing_id uuid;
  v_existing_data jsonb;
BEGIN
  IF lower(coalesce(NEW.type, '')) NOT IN (
    'comment_post','comment_video','comment','reply','comment_reply',
    'post_comment','video_comment','new_comment'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT n.id, n.data INTO v_existing_id, v_existing_data
    FROM public.notifications n
   WHERE n.user_id = NEW.user_id
     AND n.type = NEW.type
     AND n.created_at > now() - interval '10 minutes'
     AND (
       (v_comment_id IS NOT NULL AND nullif(coalesce(n.data->>'comment_id', n.data->>'reply_id', n.data->>'target_comment_id'), '') = v_comment_id)
       OR (
         v_comment_id IS NULL
         AND v_post_id IS NOT NULL
         AND v_actor IS NOT NULL
         AND nullif(coalesce(n.data->>'post_id', n.data->>'target_id', n.data->>'target_post_id', n.data->>'video_id', n.data->>'target_video_id'), '') = v_post_id
         AND nullif(coalesce(n.data->>'sender_id', n.data->>'actor_id', n.data->>'from_id', n.data->>'from_user_id', n.data->>'commenter_id'), '') = v_actor
       )
     )
   ORDER BY n.created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_existing_id IS NULL THEN RETURN NEW; END IF;

  IF v_has_avatar AND coalesce(nullif(v_existing_data->>'actor_avatar',''), nullif(v_existing_data->>'sender_avatar','')) IS NULL THEN
    UPDATE public.notifications
       SET data = coalesce(data, '{}'::jsonb) || coalesce(NEW.data, '{}'::jsonb),
           is_read = false,
           created_at = now(),
           dedup_key = public.notif_real_dedup_key(type, coalesce(data, '{}'::jsonb) || coalesce(NEW.data, '{}'::jsonb))
     WHERE id = v_existing_id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_dedup_comment ON public.notifications;
CREATE TRIGGER trg_notifications_dedup_comment
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_dedup_comment();

-- ---------------------------------------------------------------------
-- Preserve and harden the existing like aggregation trigger.
-- It aggregates only when the payload has a real liked target id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notifications_aggregate_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := public.notif_real_dedup_key(NEW.type, coalesce(NEW.data, '{}'::jsonb));
  v_actor text := nullif(coalesce(NEW.data->>'sender_id', NEW.data->>'actor_id', NEW.data->>'from_id', NEW.data->>'from_user_id', NEW.data->>'user_id'), '');
  v_actor_name text := coalesce(NEW.data->>'actor_name', NEW.data->>'sender_name');
  v_actor_avatar text := coalesce(NEW.data->>'actor_avatar', NEW.data->>'sender_avatar');
  v_existing_id uuid;
  v_existing_data jsonb;
  v_actors jsonb;
  v_already boolean := false;
BEGIN
  IF lower(coalesce(NEW.type, '')) NOT IN ('like', 'like_post', 'post_like', 'like_video', 'video_like', 'comment_like') THEN
    RETURN NEW;
  END IF;

  IF v_key IS NULL OR v_actor IS NULL THEN
    NEW.dedup_key := v_key;
    RETURN NEW;
  END IF;

  NEW.dedup_key := v_key;

  SELECT id, data INTO v_existing_id, v_existing_data
    FROM public.notifications
   WHERE user_id = NEW.user_id
     AND type = NEW.type
     AND dedup_key = v_key
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_existing_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_actors := coalesce(v_existing_data->'actors', '[]'::jsonb);
  SELECT EXISTS (SELECT 1 FROM jsonb_array_elements(v_actors) e WHERE e->>'id' = v_actor)
    INTO v_already;

  IF NOT v_already THEN
    v_actors := v_actors || jsonb_build_object(
      'id', v_actor,
      'name', v_actor_name,
      'avatar', v_actor_avatar,
      'at', now()
    );
  END IF;

  UPDATE public.notifications
     SET data = coalesce(data, '{}'::jsonb)
                || coalesce(NEW.data, '{}'::jsonb)
                || jsonb_build_object(
                     'actors', v_actors,
                     'aggregated', true,
                     'last_actor_id', v_actor,
                     'last_actor_name', v_actor_name,
                     'last_actor_avatar', v_actor_avatar,
                     'count', jsonb_array_length(v_actors)
                   ),
         is_read = false,
         created_at = now(),
         dedup_key = v_key
   WHERE id = v_existing_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_aggregate_like ON public.notifications;
CREATE TRIGGER trg_notifications_aggregate_like
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_aggregate_like();

-- ---------------------------------------------------------------------
-- Historical cleanup before the unique index.
-- Only rows with a real dedup_key participate. Rows without a target id are
-- left untouched instead of being forced into one bad key such as `like:`.
-- ---------------------------------------------------------------------
WITH like_keyed AS (
  SELECT id,
         user_id,
         type,
         public.notif_real_dedup_key(type, coalesce(data, '{}'::jsonb)) AS k,
         created_at,
         nullif(coalesce(data->>'sender_id', data->>'actor_id', data->>'from_id', data->>'from_user_id', data->>'user_id'), '') AS actor_id
    FROM public.notifications
   WHERE lower(coalesce(type, '')) IN ('like', 'like_post', 'post_like', 'like_video', 'video_like', 'comment_like')
), grouped AS (
  SELECT user_id,
         type,
         k,
         (array_agg(id ORDER BY created_at DESC))[1] AS keep_id,
         max(created_at) AS newest,
         jsonb_agg(DISTINCT actor_id) FILTER (WHERE actor_id IS NOT NULL) AS actors
    FROM like_keyed
   WHERE k IS NOT NULL
   GROUP BY user_id, type, k
  HAVING count(*) > 1
)
UPDATE public.notifications n
   SET created_at = g.newest,
       dedup_key = g.k,
       data = coalesce(n.data, '{}'::jsonb) || jsonb_build_object(
         'aggregated', true,
         'count', greatest(coalesce(jsonb_array_length(g.actors), 0), 1),
         'actor_ids', coalesce(g.actors, '[]'::jsonb)
       )
  FROM grouped g
 WHERE n.id = g.keep_id;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, type, public.notif_real_dedup_key(type, coalesce(data, '{}'::jsonb))
           ORDER BY created_at DESC, id DESC
         ) AS rn
    FROM public.notifications
   WHERE lower(coalesce(type, '')) IN ('like', 'like_post', 'post_like', 'like_video', 'video_like', 'comment_like')
     AND public.notif_real_dedup_key(type, coalesce(data, '{}'::jsonb)) IS NOT NULL
)
DELETE FROM public.notifications n
 USING ranked r
 WHERE n.id = r.id
   AND r.rn > 1;

-- Clean legacy comment duplicates only when a real comment/reply key exists.
WITH ranked_comments AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, type, public.notif_real_dedup_key(type, coalesce(data, '{}'::jsonb))
           ORDER BY
             CASE WHEN coalesce(nullif(data->>'actor_avatar',''), nullif(data->>'sender_avatar','')) IS NULL THEN 1 ELSE 0 END,
             created_at DESC,
             id DESC
         ) AS rn
    FROM public.notifications
   WHERE lower(coalesce(type, '')) IN ('comment_post','comment_video','comment','reply','comment_reply','post_comment','video_comment','new_comment')
     AND public.notif_real_dedup_key(type, coalesce(data, '{}'::jsonb)) IS NOT NULL
)
DELETE FROM public.notifications n
 USING ranked_comments r
 WHERE n.id = r.id
   AND r.rn > 1;

-- Recompute after cleanup so the surviving rows match the final helper.
UPDATE public.notifications
   SET dedup_key = public.notif_real_dedup_key(type, coalesce(data, '{}'::jsonb));

-- Replace the failed/partial unique index. The predicate excludes NULL keys,
-- so legacy rows with insufficient payload cannot block the migration.
DROP INDEX IF EXISTS public.notifications_like_dedup_uidx;
CREATE UNIQUE INDEX notifications_like_dedup_uidx
  ON public.notifications (user_id, type, dedup_key)
  WHERE type IN ('like', 'like_post', 'post_like', 'like_video', 'video_like', 'comment_like')
    AND dedup_key IS NOT NULL;

-- Optional compatibility RPC. If any client/trigger starts using the old
-- function name from the failed migration, it now follows the real key rules.
CREATE OR REPLACE FUNCTION public.notifications_upsert_like(
  p_user_id  uuid,
  p_actor    uuid,
  p_type     text,
  p_data     jsonb DEFAULT '{}'::jsonb,
  p_title    text  DEFAULT NULL,
  p_message  text  DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := public.notif_real_dedup_key(p_type, coalesce(p_data, '{}'::jsonb));
  v_data jsonb := coalesce(p_data, '{}'::jsonb) || jsonb_build_object('sender_id', p_actor);
BEGIN
  IF p_user_id IS NULL OR p_actor IS NULL OR p_user_id = p_actor THEN
    RETURN;
  END IF;

  IF v_key IS NULL THEN
    INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at, dedup_key)
    VALUES (p_user_id, p_type, p_title, p_message, v_data, false, now(), NULL);
    RETURN;
  END IF;

  INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at, dedup_key)
  VALUES (p_user_id, p_type, p_title, p_message, v_data, false, now(), v_key)
  ON CONFLICT (user_id, type, dedup_key)
    WHERE type IN ('like', 'like_post', 'post_like', 'like_video', 'video_like', 'comment_like')
      AND dedup_key IS NOT NULL
  DO UPDATE
     SET data = coalesce(public.notifications.data, '{}'::jsonb)
                || coalesce(EXCLUDED.data, '{}'::jsonb)
                || jsonb_build_object('aggregated', true),
         title = coalesce(EXCLUDED.title, public.notifications.title),
         message = coalesce(EXCLUDED.message, public.notifications.message),
         is_read = false,
         created_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.notifications_upsert_like(uuid, uuid, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.notifications_upsert_like(uuid, uuid, text, jsonb, text, text)
  TO authenticated, service_role;

-- Quick verification query to run manually after the migration:
-- SELECT user_id, type, dedup_key, count(*)
-- FROM public.notifications
-- WHERE type IN ('like', 'like_post', 'post_like', 'like_video', 'video_like', 'comment_like')
--   AND dedup_key IS NOT NULL
-- GROUP BY 1,2,3
-- HAVING count(*) > 1;
-- Expected result: zero rows.
-- =====================================================================