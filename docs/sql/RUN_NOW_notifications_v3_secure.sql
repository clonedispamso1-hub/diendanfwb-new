-- =====================================================================
-- 2026-06-29  Notifications v3 — Hardened security model
--   * claim_pending_reward: SELECT ... FOR UPDATE row lock + atomic wallet
--     credit in a single transaction, server-side NOW() only.
--   * clear_update_notifications: refuses to wipe rows where
--     is_pending_claim = true.
--   * clear_interaction_notifications: also wipes profile_view_agg + likes.
--   * clear_system_notifications: brand new (admin broadcasts).
-- Idempotent. Run in Supabase SQL editor.
-- =====================================================================

-- 0) Safety: ensure column + index exist (no-op if v2 already ran) -----
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS is_pending_claim boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_notif_pending
  ON public.notifications(user_id) WHERE is_pending_claim = true;

-- 1) Hardened claim — explicit row lock + atomic credit ----------------
CREATE OR REPLACE FUNCTION public.claim_pending_reward(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me       uuid := auth.uid();
  v_n        public.notifications%rowtype;
  v_amount   bigint := 0;
  v_new_bal  bigint;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;

  -- (A) RowLock: acquire exclusive lock BEFORE evaluating state, so a
  --     concurrent duplicate click waits, then sees is_pending_claim=false
  --     and is rejected. Prevents double-credit even under millisecond races.
  SELECT *
    INTO v_n
    FROM public.notifications
   WHERE id = p_notification_id
     AND user_id = v_me
   FOR UPDATE;

  IF v_n.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  IF COALESCE(v_n.is_pending_claim, false) = false THEN
    -- already claimed (or never was claimable) — abort, no balance change.
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED');
  END IF;

  -- (B) Sanitize amount server-side. Strip non-digits, clamp to bigint.
  v_amount := COALESCE(
    NULLIF(regexp_replace(COALESCE(v_n.data->>'amount',''), '[^0-9]', '', 'g'), '')::bigint,
    0
  );

  -- (C) Atomic block: flip flag + credit wallet inside ONE transaction.
  --     plpgsql function body already runs in the caller's transaction,
  --     so any RAISE EXCEPTION below rolls back both writes together.
  UPDATE public.notifications
     SET is_pending_claim = false,
         is_read          = true,
         data             = COALESCE(data,'{}'::jsonb)
                         || jsonb_build_object('claimed_at', now()) -- server NOW(), never client clock
   WHERE id = v_n.id;

  IF v_amount > 0 THEN
    PERFORM set_config('app.allow_gem_change',  '1', true);
    PERFORM set_config('app.allow_candy_change','1', true);
    UPDATE public.profiles
       SET gem_balance = COALESCE(gem_balance, 0) + v_amount
     WHERE id = v_me
     RETURNING gem_balance INTO v_new_bal;
    IF v_new_bal IS NULL THEN
      -- Wallet row missing → abort the whole txn, notif flag rolls back too.
      RAISE EXCEPTION 'WALLET_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    SELECT gem_balance INTO v_new_bal FROM public.profiles WHERE id = v_me;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'amount', v_amount,
    'new_balance', v_new_bal,
    'claimed_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_reward(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_pending_reward(uuid) TO authenticated;

-- 2) Tương tác: wipe interactions (comments / replies / follows /
--    profile-view aggregates / like milestones / stray like rows). -----
CREATE OR REPLACE FUNCTION public.clear_interaction_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); v_n integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  WITH d AS (
    DELETE FROM public.notifications
     WHERE user_id = v_me
       AND (
            COALESCE(data->>'kind','') IN (
              'comment','reply','follow','like_milestone','profile_view_agg'
            )
         OR type IN (
              'comment_post','comment_video','reply','comment','new_comment',
              'post_comment','video_comment','comment_reply',
              'follow','new_follower','like_milestone',
              'profile_view_agg',
              'like_post','like_video','like'
            )
           )
     RETURNING 1
  ) SELECT count(*) INTO v_n FROM d;
  -- daily view ledger reset is server-side, using NOW() — never client clock.
  DELETE FROM public.profile_views
    WHERE profile_id = v_me
      AND view_date = (now() AT TIME ZONE 'UTC')::date;
  RETURN v_n;
END;
$$;

-- 3) Nhận thưởng: wipe rewards BUT freeze rows still pending claim. ----
CREATE OR REPLACE FUNCTION public.clear_update_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); v_n integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  WITH d AS (
    DELETE FROM public.notifications
     WHERE user_id = v_me
       AND is_pending_claim = false              -- SAFETY LOCK
       AND (
            COALESCE(data->>'kind','') IN (
              'red_packet_pending','red_packet_claimed',
              'gift_post','gift_video',
              'candy_transfer','gem_transfer','gem_received'
            )
         OR type IN (
              'red_packet_pending','red_packet_claimed',
              'gift_post','gift_video',
              'candy_transfer','gem_transfer','gem_received'
            )
           )
     RETURNING 1
  ) SELECT count(*) INTO v_n FROM d;
  RETURN v_n;
END;
$$;

-- 4) Hệ thống: admin broadcasts only. ----------------------------------
CREATE OR REPLACE FUNCTION public.clear_system_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_me uuid := auth.uid(); v_n integer;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  WITH d AS (
    DELETE FROM public.notifications
     WHERE user_id = v_me
       AND (
            COALESCE(data->>'kind','') IN ('system','admin_broadcast','announcement','maintenance')
         OR type IN ('system','admin_broadcast','announcement','maintenance','admin_message')
           )
     RETURNING 1
  ) SELECT count(*) INTO v_n FROM d;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_interaction_notifications() FROM public;
REVOKE ALL ON FUNCTION public.clear_update_notifications()      FROM public;
REVOKE ALL ON FUNCTION public.clear_system_notifications()      FROM public;
GRANT EXECUTE ON FUNCTION public.clear_interaction_notifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_update_notifications()      TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_system_notifications()      TO authenticated;
