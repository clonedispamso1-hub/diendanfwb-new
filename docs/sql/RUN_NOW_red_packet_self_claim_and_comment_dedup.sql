-- =====================================================================
-- 2026-06-29  Red-packet self-claim + comment notification dedup
--
-- Run once in Supabase SQL Editor (project zbuwddjcqdlyijcunwgd).
-- Idempotent.
-- =====================================================================

-- 1) Allow the post creator to claim from their own Lucky Drop packet.
--    Removes the `CANNOT_CLAIM_OWN` guard while keeping every other rule
--    (single claim per user, must have liked AND commented, atomic decrement).
CREATE OR REPLACE FUNCTION public.claim_post_reward_random(post_uuid uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       uuid := auth.uid();
  v_post     public.posts%rowtype;
  v_has_like boolean;
  v_has_cmt  boolean;
  v_amount   bigint;
  v_roll     integer;
  v_min_tier bigint;
  v_max_tier bigint;
  v_author   public.profiles%rowtype;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = post_uuid FOR UPDATE;
  IF v_post.id IS NULL THEN RAISE EXCEPTION 'POST_NOT_FOUND'; END IF;
  IF NOT COALESCE(v_post.reward_enabled, false) THEN RAISE EXCEPTION 'REWARD_DISABLED'; END IF;
  IF COALESCE(v_post.reward_mode, 'fixed') <> 'random' THEN RAISE EXCEPTION 'WRONG_MODE'; END IF;
  IF v_post.coin_pool_remaining <= 0 THEN RAISE EXCEPTION 'REWARD_EXHAUSTED'; END IF;

  IF EXISTS (SELECT 1 FROM public.post_coin_claims WHERE post_id = post_uuid AND user_id = v_me) THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED';
  END IF;

  -- Owners are exempt from the like+comment requirement so they can grab
  -- a leftover share from their own packet without spoofing engagement.
  IF v_post.user_id <> v_me THEN
    SELECT EXISTS(SELECT 1 FROM public.likes    WHERE post_id = post_uuid AND user_id = v_me) INTO v_has_like;
    SELECT EXISTS(SELECT 1 FROM public.comments WHERE post_id = post_uuid AND user_id = v_me) INTO v_has_cmt;
    IF NOT v_has_like OR NOT v_has_cmt THEN RAISE EXCEPTION 'NEED_LIKE_AND_COMMENT'; END IF;
  END IF;

  v_roll := floor(random() * 100)::int + 1;
  IF v_roll <= 90 THEN v_min_tier := 1000; v_max_tier := 1999;
  ELSE                  v_min_tier := 2000; v_max_tier := 10000; END IF;
  v_amount := v_min_tier + floor(random() * (v_max_tier - v_min_tier + 1))::bigint;
  IF v_amount > v_post.coin_pool_remaining THEN v_amount := v_post.coin_pool_remaining; END IF;

  INSERT INTO public.post_coin_claims(post_id, user_id, coins_received)
    VALUES (post_uuid, v_me, v_amount);

  UPDATE public.posts
     SET claimed_count       = claimed_count + 1,
         coin_pool_remaining = coin_pool_remaining - v_amount,
         reward_enabled      = CASE WHEN (coin_pool_remaining - v_amount) <= 0 THEN false ELSE reward_enabled END
   WHERE id = post_uuid;

  SELECT * INTO v_author FROM public.profiles WHERE id = v_post.user_id;

  -- Delayed credit: insert pending notification, NOT a direct balance bump.
  INSERT INTO public.notifications(user_id, type, title, message, data, is_pending_claim)
  VALUES (
    v_me,
    'red_packet_pending',
    '🧧 Bạn vừa nhận được lì xì!',
    format('Bạn vừa nhận được lì xì trị giá %s từ bài viết của %s',
           v_amount,
           COALESCE(v_author.full_name, v_author.username, 'người dùng')),
    jsonb_build_object(
      'kind', 'red_packet_pending',
      'amount', v_amount,
      'post_id', v_post.id::text,
      'from_id', v_post.user_id::text,
      'from_name', COALESCE(v_author.full_name, v_author.username, 'người dùng')
    ),
    true
  );

  RETURN jsonb_build_object(
    'ok', true,
    'coins', v_amount,
    'pending', true,
    'coin_pool_remaining', v_post.coin_pool_remaining - v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_post_reward_random(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_post_reward_random(uuid) TO authenticated;


-- 2) Hard dedup for comment notifications.
--    Some integrations were inserting two rows per comment (one before the
--    actor profile was hydrated, leaving a default gray avatar). This
--    BEFORE INSERT trigger collapses any duplicate firing of the same
--    (recipient, post, commenter, comment_id) tuple within a 10-minute
--    window and KEEPS the row that carries actor metadata.
CREATE OR REPLACE FUNCTION public.notifications_dedup_comment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_comment_id  text := COALESCE(NEW.data->>'comment_id', NEW.data->>'reply_id', NEW.data->>'target_comment_id');
  v_post_id     text := COALESCE(NEW.data->>'post_id', NEW.data->>'target_id', NEW.data->>'target_post_id', NEW.data->>'video_id');
  v_actor       text := COALESCE(NEW.data->>'sender_id', NEW.data->>'actor_id', NEW.data->>'from_id', NEW.data->>'commenter_id');
  v_has_avatar  boolean := COALESCE(NULLIF(NEW.data->>'actor_avatar',''), NULLIF(NEW.data->>'sender_avatar','')) IS NOT NULL;
  v_existing    public.notifications%ROWTYPE;
BEGIN
  IF NEW.type NOT IN (
    'comment_post','comment_video','comment','reply','comment_reply',
    'post_comment','video_comment','new_comment'
  ) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_existing FROM public.notifications n
   WHERE n.user_id = NEW.user_id
     AND n.type = NEW.type
     AND n.created_at > now() - interval '10 minutes'
     AND (
       (v_comment_id IS NOT NULL AND (n.data->>'comment_id') = v_comment_id)
       OR (
         v_comment_id IS NULL
         AND v_post_id IS NOT NULL
         AND v_actor IS NOT NULL
         AND COALESCE(n.data->>'post_id', n.data->>'target_id', n.data->>'video_id') = v_post_id
         AND COALESCE(n.data->>'sender_id', n.data->>'actor_id', n.data->>'from_id') = v_actor
       )
     )
   ORDER BY n.created_at DESC
   LIMIT 1;

  IF v_existing.id IS NULL THEN RETURN NEW; END IF;

  -- A duplicate exists. If the incoming row has avatar metadata and the
  -- existing one doesn't, upgrade the stored row in place. Then drop the
  -- new INSERT either way.
  IF v_has_avatar AND COALESCE(NULLIF(v_existing.data->>'actor_avatar',''), NULLIF(v_existing.data->>'sender_avatar','')) IS NULL THEN
    UPDATE public.notifications
       SET data = COALESCE(data,'{}'::jsonb) || COALESCE(NEW.data,'{}'::jsonb),
           is_read = false,
           created_at = now()
     WHERE id = v_existing.id;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_dedup_comment ON public.notifications;
CREATE TRIGGER trg_notifications_dedup_comment
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_dedup_comment();

-- One-time cleanup: collapse any pre-existing duplicate pairs, keeping the
-- row that already carries actor avatar metadata.
WITH ranked AS (
  SELECT id,
         user_id, type,
         COALESCE(data->>'comment_id', data->>'reply_id') AS comment_key,
         COALESCE(NULLIF(data->>'actor_avatar',''), NULLIF(data->>'sender_avatar','')) AS av,
         created_at,
         row_number() OVER (
           PARTITION BY user_id, type, COALESCE(data->>'comment_id', data->>'reply_id')
           ORDER BY (CASE WHEN COALESCE(NULLIF(data->>'actor_avatar',''), NULLIF(data->>'sender_avatar','')) IS NULL THEN 1 ELSE 0 END),
                    created_at DESC
         ) AS rn
    FROM public.notifications
   WHERE type IN ('comment_post','comment_video','comment','reply','comment_reply','post_comment','video_comment','new_comment')
     AND COALESCE(data->>'comment_id', data->>'reply_id') IS NOT NULL
)
DELETE FROM public.notifications n
 USING ranked r
 WHERE n.id = r.id AND r.rn > 1;
