-- =====================================================================
-- LUCKY GEM DROP — random-allocation pooled reward on posts.
-- Run via Supabase SQL Editor on DB zbuwddjcqdlyijcunwgd.
-- Backward-compatible with existing coin_spin_rewards (fixed mode).
-- =====================================================================

-- 1) Add reward_mode column ('fixed' | 'random'); default 'fixed' preserves
-- existing behaviour of create_post_reward_pool / claim_post_reward.
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS reward_mode text NOT NULL DEFAULT 'fixed';

-- 2) RPC: author creates a Lucky Gem Drop pool (random allocation, no max).
CREATE OR REPLACE FUNCTION public.create_post_lucky_pool(
  p_post_id uuid,
  p_total   bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me    uuid := auth.uid();
  v_owner uuid;
  v_bal   bigint;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_total IS NULL OR p_total < 1000 THEN RAISE EXCEPTION 'INVALID_TOTAL'; END IF;

  SELECT user_id INTO v_owner FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'POST_NOT_FOUND'; END IF;
  IF v_owner <> v_me THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  IF EXISTS (SELECT 1 FROM public.posts WHERE id = p_post_id AND reward_enabled = true) THEN
    RAISE EXCEPTION 'POOL_ALREADY_EXISTS';
  END IF;

  PERFORM set_config('app.allow_gem_change',  '1', true);
  PERFORM set_config('app.allow_candy_change','1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_bal FROM public.profiles WHERE id = v_me FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  IF v_bal < p_total THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  UPDATE public.profiles SET gem_balance = v_bal - p_total WHERE id = v_me;

  UPDATE public.posts
     SET coin_pool_total     = p_total,
         coin_pool_remaining = p_total,
         max_claimers        = 999999,
         claimed_count       = 0,
         coin_per_person     = 0,
         reward_enabled      = true,
         reward_mode         = 'random'
   WHERE id = p_post_id;

  INSERT INTO public.coin_transactions(user_id, amount, transaction_type, reference_post_id)
    VALUES (v_me, -p_total, 'lucky_pool_create', p_post_id);

  RETURN jsonb_build_object('ok', true, 'total', p_total);
END;
$$;

REVOKE ALL ON FUNCTION public.create_post_lucky_pool(uuid, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.create_post_lucky_pool(uuid, bigint) TO authenticated;

-- 3) RPC: claim a random share. Requires the claimer to have BOTH a like and
-- a comment on the post. Awards a random integer in [1000, min(10000, remaining)].
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
  v_cap      bigint;
  v_new_bal  bigint;
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

  v_cap := LEAST(10000::bigint, v_post.coin_pool_remaining);
  IF v_cap < 1000 THEN
    v_amount := v_post.coin_pool_remaining; -- drain leftover
  ELSE
    v_amount := 1000 + floor(random() * (v_cap - 1000 + 1))::bigint;
  END IF;
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
    'coin_pool_remaining', v_post.coin_pool_remaining - v_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_post_reward_random(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_post_reward_random(uuid) TO authenticated;
