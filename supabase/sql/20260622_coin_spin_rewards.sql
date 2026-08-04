-- =====================================================================
-- Coin Spin Reward System (post-level pooled rewards)
-- Chạy trên DB cũ (zbuwddjcqdlyijcunwgd) qua Supabase SQL Editor.
-- Backward-compatible: ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.
-- =====================================================================

-- 1) Extend posts table
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS coin_pool_total      bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coin_pool_remaining  bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_claimers         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claimed_count        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coin_per_person      bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_enabled       boolean NOT NULL DEFAULT false;

-- 2) Claim table
CREATE TABLE IF NOT EXISTS public.post_coin_claims (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id        uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  coins_received bigint NOT NULL CHECK (coins_received > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT post_coin_claims_unique UNIQUE (post_id, user_id)
);
CREATE INDEX IF NOT EXISTS post_coin_claims_post_idx ON public.post_coin_claims(post_id);
CREATE INDEX IF NOT EXISTS post_coin_claims_user_idx ON public.post_coin_claims(user_id, created_at DESC);

GRANT SELECT ON public.post_coin_claims TO authenticated;
GRANT ALL    ON public.post_coin_claims TO service_role;

ALTER TABLE public.post_coin_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "claims read own or owner" ON public.post_coin_claims;
CREATE POLICY "claims read own or owner"
  ON public.post_coin_claims FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.posts p WHERE p.id = post_id AND p.user_id = auth.uid())
  );
-- No INSERT/UPDATE/DELETE policy: writes only through SECURITY DEFINER RPC.

-- 3) Transaction log
CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount             bigint NOT NULL,
  transaction_type   text   NOT NULL,
  reference_post_id  uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coin_tx_user_idx ON public.coin_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coin_tx_post_idx ON public.coin_transactions(reference_post_id);

GRANT SELECT ON public.coin_transactions TO authenticated;
GRANT ALL    ON public.coin_transactions TO service_role;

ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coin tx read own" ON public.coin_transactions;
CREATE POLICY "coin tx read own"
  ON public.coin_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4) RPC: author creates reward pool (deducts from author balance)
CREATE OR REPLACE FUNCTION public.create_post_reward_pool(
  p_post_id uuid,
  p_total   bigint,
  p_max     integer
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
  v_per   bigint;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_total IS NULL OR p_total <= 0 THEN RAISE EXCEPTION 'INVALID_TOTAL'; END IF;
  IF p_max   IS NULL OR p_max   <= 0 THEN RAISE EXCEPTION 'INVALID_MAX'; END IF;
  IF (p_total % p_max) <> 0 THEN RAISE EXCEPTION 'NOT_DIVISIBLE'; END IF;

  v_per := p_total / p_max;

  SELECT user_id INTO v_owner FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'POST_NOT_FOUND'; END IF;
  IF v_owner <> v_me  THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

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
         max_claimers        = p_max,
         claimed_count       = 0,
         coin_per_person     = v_per,
         reward_enabled      = true
   WHERE id = p_post_id;

  INSERT INTO public.coin_transactions(user_id, amount, transaction_type, reference_post_id)
    VALUES (v_me, -p_total, 'reward_pool_create', p_post_id);

  RETURN jsonb_build_object(
    'ok', true,
    'coin_per_person', v_per,
    'coin_pool_total', p_total,
    'max_claimers',    p_max
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_post_reward_pool(uuid, bigint, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.create_post_reward_pool(uuid, bigint, integer) TO authenticated;

-- 5) RPC: claim reward (atomic, race-safe)
CREATE OR REPLACE FUNCTION public.claim_post_reward(post_uuid uuid)
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
  v_new_bal  bigint;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = post_uuid FOR UPDATE;
  IF v_post.id IS NULL THEN RAISE EXCEPTION 'POST_NOT_FOUND'; END IF;
  IF v_post.user_id = v_me THEN RAISE EXCEPTION 'CANNOT_CLAIM_OWN'; END IF;
  IF NOT COALESCE(v_post.reward_enabled, false) THEN RAISE EXCEPTION 'REWARD_DISABLED'; END IF;

  IF v_post.claimed_count >= v_post.max_claimers
     OR v_post.coin_pool_remaining < v_post.coin_per_person
     OR v_post.coin_per_person <= 0 THEN
    RAISE EXCEPTION 'REWARD_EXHAUSTED';
  END IF;

  IF EXISTS (SELECT 1 FROM public.post_coin_claims WHERE post_id = post_uuid AND user_id = v_me) THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.likes    WHERE post_id = post_uuid AND user_id = v_me) INTO v_has_like;
  SELECT EXISTS(SELECT 1 FROM public.comments WHERE post_id = post_uuid AND user_id = v_me) INTO v_has_cmt;

  IF NOT v_has_like OR NOT v_has_cmt THEN
    RAISE EXCEPTION 'NEED_LIKE_AND_COMMENT';
  END IF;

  INSERT INTO public.post_coin_claims(post_id, user_id, coins_received)
    VALUES (post_uuid, v_me, v_post.coin_per_person);

  UPDATE public.posts
     SET claimed_count       = claimed_count + 1,
         coin_pool_remaining = coin_pool_remaining - v_post.coin_per_person,
         reward_enabled      = CASE
           WHEN (claimed_count + 1) >= max_claimers
             OR (coin_pool_remaining - v_post.coin_per_person) < coin_per_person
           THEN false ELSE reward_enabled END
   WHERE id = post_uuid;

  PERFORM set_config('app.allow_gem_change',  '1', true);
  PERFORM set_config('app.allow_candy_change','1', true);

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_post.coin_per_person
   WHERE id = v_me
   RETURNING gem_balance INTO v_new_bal;

  INSERT INTO public.coin_transactions(user_id, amount, transaction_type, reference_post_id)
    VALUES (v_me, v_post.coin_per_person, 'reward_claim', post_uuid);

  RETURN jsonb_build_object(
    'ok', true,
    'coins', v_post.coin_per_person,
    'new_balance', v_new_bal,
    'claimed_count', v_post.claimed_count + 1,
    'max_claimers', v_post.max_claimers,
    'coin_pool_remaining', v_post.coin_pool_remaining - v_post.coin_per_person
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_post_reward(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_post_reward(uuid) TO authenticated;

-- 6) Realtime publication (guarded)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_coin_claims;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
