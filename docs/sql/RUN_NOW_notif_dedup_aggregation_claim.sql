-- =====================================================================
-- 2026-06-23  Fix: chống spam thông báo + gộp like + claim_notification_reward
--
-- Chạy 1 lần trong Supabase SQL Editor (project zbuwddjcqdlyijcunwgd).
-- Idempotent — chạy lại nhiều lần không vỡ schema.
-- =====================================================================

-- 0) Cột is_claimed (nếu chưa có) ------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_claimed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_notifications_user_unclaimed
  ON public.notifications(user_id) WHERE is_claimed = false;

-- 1) DEDUP COMMENT: trigger BEFORE INSERT --------------------------------
-- Nếu cùng (user_id, type, post_id, commenter_id, comment_id) đã có trong
-- 10 phút gần nhất → bỏ qua INSERT (return NULL).
CREATE OR REPLACE FUNCTION public.notifications_dedup_comment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_comment_id  text := COALESCE(NEW.data->>'comment_id', NEW.data->>'reply_id', NEW.data->>'target_comment_id');
  v_post_id     text := COALESCE(NEW.data->>'post_id', NEW.data->>'target_id', NEW.data->>'target_post_id', NEW.data->>'video_id');
  v_actor       text := COALESCE(NEW.data->>'sender_id', NEW.data->>'actor_id', NEW.data->>'from_id', NEW.data->>'commenter_id');
  v_exists      boolean;
BEGIN
  IF NEW.type NOT IN ('comment_post','comment_video','comment','reply','comment_reply','post_comment','video_comment','new_comment') THEN
    RETURN NEW;
  END IF;

  -- Match theo comment_id nếu có (mạnh nhất), nếu không có thì theo (post, actor) trong 10 phút.
  SELECT EXISTS (
    SELECT 1 FROM public.notifications n
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
  ) INTO v_exists;

  IF v_exists THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_dedup_comment ON public.notifications;
CREATE TRIGGER trg_notifications_dedup_comment
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_dedup_comment();

-- 2) GỘP LIKE: trigger BEFORE INSERT -------------------------------------
-- Nếu có notif like cùng post của cùng user trong 30 phút → UPDATE actors
-- của bản cũ thay vì tạo bản mới (skip INSERT).
CREATE OR REPLACE FUNCTION public.notifications_aggregate_like()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_post_id text := COALESCE(NEW.data->>'post_id', NEW.data->>'target_id', NEW.data->>'video_id');
  v_actor   text := COALESCE(NEW.data->>'sender_id', NEW.data->>'actor_id', NEW.data->>'from_id');
  v_actor_name text := COALESCE(NEW.data->>'actor_name', NEW.data->>'sender_name');
  v_actor_avatar text := COALESCE(NEW.data->>'actor_avatar', NEW.data->>'sender_avatar');
  v_existing public.notifications%ROWTYPE;
  v_actors jsonb;
  v_already boolean := false;
BEGIN
  IF NEW.type NOT IN ('like_post','like_video') THEN
    RETURN NEW;
  END IF;
  IF v_post_id IS NULL OR v_actor IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_existing FROM public.notifications n
   WHERE n.user_id = NEW.user_id
     AND n.type = NEW.type
     AND COALESCE(n.data->>'post_id', n.data->>'target_id', n.data->>'video_id') = v_post_id
     AND n.created_at > now() - interval '30 minutes'
   ORDER BY n.created_at DESC LIMIT 1;

  IF v_existing.id IS NULL THEN RETURN NEW; END IF;

  v_actors := COALESCE(v_existing.data->'actors', '[]'::jsonb);
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_actors) e WHERE e->>'id' = v_actor
  ) INTO v_already;

  IF NOT v_already THEN
    v_actors := v_actors || jsonb_build_object(
      'id', v_actor, 'name', v_actor_name, 'avatar', v_actor_avatar
    );
  END IF;

  UPDATE public.notifications
     SET data = COALESCE(data, '{}'::jsonb)
                || jsonb_build_object('actors', v_actors, 'aggregated', true,
                       'last_actor_id', v_actor, 'last_actor_name', v_actor_name,
                       'last_actor_avatar', v_actor_avatar,
                       'count', jsonb_array_length(v_actors)),
         is_read = false,
         created_at = now()
   WHERE id = v_existing.id;

  RETURN NULL;  -- bỏ INSERT mới
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_aggregate_like ON public.notifications;
CREATE TRIGGER trg_notifications_aggregate_like
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_aggregate_like();

-- 3) RPC claim_notification_reward — atomic, chống double-claim ---------
CREATE OR REPLACE FUNCTION public.claim_notification_reward(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_notif public.notifications%ROWTYPE;
  v_amount bigint;
  v_new_balance bigint;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  END IF;

  -- Atomic: chỉ claim được khi is_claimed = false (1 lần duy nhất)
  UPDATE public.notifications
     SET is_claimed = true,
         data = COALESCE(data, '{}'::jsonb) || jsonb_build_object('claimed', true, 'claimed_at', now())
   WHERE id = p_notification_id
     AND user_id = v_user
     AND is_claimed = false
   RETURNING * INTO v_notif;

  IF v_notif.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED_OR_NOT_FOUND');
  END IF;

  v_amount := COALESCE(NULLIF(regexp_replace(COALESCE(v_notif.data->>'amount',''), '[^0-9]', '', 'g'), '')::bigint, 0);

  IF v_amount > 0 THEN
    PERFORM set_config('app.allow_gem_change', '1', true);
    UPDATE public.profiles
       SET gem_balance = COALESCE(gem_balance, 0) + v_amount
     WHERE id = v_user
     RETURNING gem_balance INTO v_new_balance;
  ELSE
    SELECT gem_balance INTO v_new_balance FROM public.profiles WHERE id = v_user;
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'new_balance', v_new_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_reward(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_reward(uuid) TO authenticated;

-- 4) Chuyển Gem trực tiếp (transfer) — KHÔNG cần claim, cộng thẳng -----
-- secure_transfer_gem đã cộng thẳng vào gem_balance người nhận.
-- Đảm bảo notifications của loại 'candy_transfer'/'gem_transfer'/'gem_received'
-- không tạo trạng thái pending → set is_claimed=true ngay.
UPDATE public.notifications
   SET is_claimed = true
 WHERE type IN ('candy_transfer','gem_transfer','gem_received')
   AND is_claimed = false;
