-- =====================================================================
-- LUCKY GEM DROP v2 — weighted random distribution (90% small / 10% big)
-- Replaces public.claim_post_reward_random from RUN_NOW_lucky_gem_drop.sql
-- Run via Supabase SQL Editor on DB zbuwddjcqdlyijcunwgd.
-- =====================================================================

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
  v_new_bal  bigint;
  v_roll     integer;
  v_min_tier bigint;
  v_max_tier bigint;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = post_uuid FOR UPDATE;
  IF v_post.id IS NULL THEN RAISE EXCEPTION 'POST_NOT_FOUND'; END IF;
  IF v_post.user_id = v_me THEN RAISE EXCEPTION 'CANNOT_CLAIM_OWN'; END IF;
  IF NOT COALESCE(v_post.reward_enabled, false) THEN RAISE EXCEPTION 'REWARD_DISABLED'; END IF;
  IF COALESCE(v_post.reward_mode, 'fixed') <> 'random' THEN RAISE EXCEPTION 'WRONG_MODE'; END IF;
  IF v_post.coin_pool_remaining <= 0 THEN RAISE EXCEPTION 'REWARD_EXHAUSTED'; END IF;

  IF EXISTS (SELECT 1 FROM public.post_coin_claims WHERE post_id = post_uuid AND user_id = v_me) THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.likes    WHERE post_id = post_uuid AND user_id = v_me) INTO v_has_like;
  SELECT EXISTS(SELECT 1 FROM public.comments WHERE post_id = post_uuid AND user_id = v_me) INTO v_has_cmt;
  IF NOT v_has_like OR NOT v_has_cmt THEN
    RAISE EXCEPTION 'NEED_LIKE_AND_COMMENT';
  END IF;

  -- Weighted distribution: 90% chance small tier, 10% chance big tier.
  v_roll := floor(random() * 100)::int + 1;
  IF v_roll <= 90 THEN
    v_min_tier := 1000;
    v_max_tier := 1999;
  ELSE
    v_min_tier := 2000;
    v_max_tier := 10000;
  END IF;
  v_amount := v_min_tier + floor(random() * (v_max_tier - v_min_tier + 1))::bigint;

  -- Cap by remaining pool so we never overspend.
  IF v_amount > v_post.coin_pool_remaining THEN
    v_amount := v_post.coin_pool_remaining;
  END IF;

  INSERT INTO public.post_coin_claims(post_id, user_id, coins_received)
    VALUES (post_uuid, v_me, v_amount);

  UPDATE public.posts
     SET claimed_count       = claimed_count + 1,
         coin_pool_remaining = coin_pool_remaining - v_amount,
         reward_enabled      = CASE
           WHEN (coin_pool_remaining - v_amount) <= 0 THEN false
           ELSE reward_enabled END
   WHERE id = post_uuid;

  PERFORM set_config('app.allow_gem_change',  '1', true);
  PERFORM set_config('app.allow_candy_change','1', true);

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_amount
   WHERE id = v_me
   RETURNING gem_balance INTO v_new_bal;

  INSERT INTO public.coin_transactions(user_id, amount, transaction_type, reference_post_id)
    VALUES (v_me, v_amount, 'lucky_claim', post_uuid);

  RETURN jsonb_build_object(
    'ok', true,
    'coins', v_amount,
    'new_balance', v_new_bal,
    'coin_pool_remaining', v_post.coin_pool_remaining - v_amount,
    'tier', CASE WHEN v_roll <= 90 THEN 'small' ELSE 'big' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_post_reward_random(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_post_reward_random(uuid) TO authenticated;
