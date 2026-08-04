-- =====================================================================
-- 2026-07-01  Red Packet (Lì Xì) — production schema
--
-- Idempotent. Safe to run on top of the existing create_post_red_packet
-- deployment. Provides:
--   * red_packets, red_packet_claims, red_packet_config tables
--   * wallet_transactions ledger (for auditing)
--   * RLS + GRANTs for authenticated / service_role
--   * create_post_red_packet(uuid, bigint, int)
--   * claim_red_packet(uuid)  — engagement-gated, weighted-random, atomic
--   * credit_red_packet_claim(uuid) — notification-mediated wallet credit
--
-- All amounts are bigint. Sum invariant enforced: sum of claim amounts
-- for a packet always equals its total_amount (last packet takes the
-- exact remaining amount). Row-level locks prevent race conditions.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.red_packet_config (
  id            int PRIMARY KEY DEFAULT 1,
  min_reward    bigint NOT NULL DEFAULT 100,
  max_reward    bigint NOT NULL DEFAULT 10000,
  max_packs     int    NOT NULL DEFAULT 1000,
  daily_send_limit int  NOT NULL DEFAULT 50,
  expiration_seconds int
);
INSERT INTO public.red_packet_config(id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.red_packets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  sender_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  total_amount      bigint NOT NULL CHECK (total_amount > 0),
  remaining_amount  bigint NOT NULL CHECK (remaining_amount >= 0),
  packet_count      int    NOT NULL CHECK (packet_count > 0),
  remaining_count   int    NOT NULL CHECK (remaining_count >= 0),
  status            text   NOT NULL DEFAULT 'active',
  expires_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT red_packets_post_unique UNIQUE (post_id)
);
CREATE INDEX IF NOT EXISTS red_packets_sender_idx ON public.red_packets(sender_id);

CREATE TABLE IF NOT EXISTS public.red_packet_claims (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id    uuid NOT NULL REFERENCES public.red_packets(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount       bigint NOT NULL CHECK (amount > 0),
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  credited     boolean NOT NULL DEFAULT false,
  credited_at  timestamptz,
  notification_id uuid,
  CONSTRAINT red_packet_claims_unique UNIQUE (packet_id, user_id)
);
CREATE INDEX IF NOT EXISTS red_packet_claims_user_idx ON public.red_packet_claims(user_id);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  delta           bigint NOT NULL,
  kind            text   NOT NULL,
  ref_packet_id   uuid REFERENCES public.red_packets(id) ON DELETE SET NULL,
  ref_claim_id    uuid REFERENCES public.red_packet_claims(id) ON DELETE SET NULL,
  balance_after   bigint,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_tx_user_idx ON public.wallet_transactions(user_id, created_at DESC);

-- ---------------- GRANTs (required for PostgREST Data API) ----------------
GRANT SELECT ON public.red_packets           TO authenticated, anon;
GRANT SELECT ON public.red_packet_claims     TO authenticated;
GRANT SELECT ON public.wallet_transactions   TO authenticated;
GRANT SELECT ON public.red_packet_config     TO authenticated, anon;
GRANT ALL    ON public.red_packets, public.red_packet_claims,
                public.wallet_transactions, public.red_packet_config TO service_role;

-- ---------------- RLS ----------------
ALTER TABLE public.red_packets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.red_packet_claims     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.red_packet_config     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rp_select_all         ON public.red_packets;
CREATE POLICY rp_select_all         ON public.red_packets       FOR SELECT USING (true);

DROP POLICY IF EXISTS rpc_select_own        ON public.red_packet_claims;
CREATE POLICY rpc_select_own        ON public.red_packet_claims FOR SELECT
  USING (user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.red_packets p
                     WHERE p.id = red_packet_claims.packet_id
                       AND p.sender_id = auth.uid()));

DROP POLICY IF EXISTS wt_select_own         ON public.wallet_transactions;
CREATE POLICY wt_select_own         ON public.wallet_transactions FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS cfg_read              ON public.red_packet_config;
CREATE POLICY cfg_read              ON public.red_packet_config FOR SELECT USING (true);

-- All mutations flow exclusively through SECURITY DEFINER RPCs; no INSERT/UPDATE
-- policies are exposed to end users.

-- =====================================================================
-- create_post_red_packet(p_post_id, p_total, p_packs)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.create_post_red_packet(
  p_post_id uuid, p_total bigint, p_packs int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me      uuid := auth.uid();
  v_post    public.posts%rowtype;
  v_cfg     public.red_packet_config%rowtype;
  v_bal     bigint;
  v_pkt_id  uuid;
BEGIN
  IF v_me IS NULL             THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_total IS NULL OR p_total <= 0 THEN RAISE EXCEPTION 'INVALID_TOTAL'; END IF;
  IF p_packs IS NULL OR p_packs <= 0 THEN RAISE EXCEPTION 'INVALID_PACKS'; END IF;
  IF p_packs > p_total        THEN RAISE EXCEPTION 'PACKS_EXCEED_TOTAL'; END IF;

  SELECT * INTO v_cfg FROM public.red_packet_config WHERE id = 1;
  IF p_packs > COALESCE(v_cfg.max_packs, 1000) THEN
    RAISE EXCEPTION 'PACKS_LIMIT_EXCEEDED';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF v_post.id IS NULL       THEN RAISE EXCEPTION 'POST_NOT_FOUND'; END IF;
  IF v_post.user_id <> v_me  THEN RAISE EXCEPTION 'NOT_POST_OWNER'; END IF;
  IF EXISTS (SELECT 1 FROM public.red_packets WHERE post_id = p_post_id) THEN
    RAISE EXCEPTION 'ALREADY_ATTACHED';
  END IF;

  SELECT gem_balance INTO v_bal FROM public.profiles WHERE id = v_me FOR UPDATE;
  IF COALESCE(v_bal, 0) < p_total THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  UPDATE public.profiles SET gem_balance = gem_balance - p_total WHERE id = v_me;

  INSERT INTO public.red_packets(post_id, sender_id, total_amount, remaining_amount,
                                 packet_count, remaining_count)
  VALUES (p_post_id, v_me, p_total, p_total, p_packs, p_packs)
  RETURNING id INTO v_pkt_id;

  INSERT INTO public.wallet_transactions(user_id, delta, kind, ref_packet_id, balance_after)
  VALUES (v_me, -p_total, 'red_packet_send', v_pkt_id, v_bal - p_total);

  -- Keep legacy post-card fields in sync so the existing inline packet
  -- UI continues to render correctly.
  BEGIN
    UPDATE public.posts
       SET reward_enabled = true,
           reward_mode = 'random',
           coin_pool_total = p_total,
           coin_pool_remaining = p_total,
           claimed_count = 0
     WHERE id = p_post_id;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'packet_id', v_pkt_id,
                            'total', p_total, 'packs', p_packs);
END;
$$;
REVOKE ALL ON FUNCTION public.create_post_red_packet(uuid, bigint, int) FROM public;
GRANT EXECUTE ON FUNCTION public.create_post_red_packet(uuid, bigint, int) TO authenticated;

-- =====================================================================
-- claim_red_packet(p_post_id)   — weighted random, engagement-gated
-- =====================================================================
CREATE OR REPLACE FUNCTION public.claim_red_packet(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me      uuid := auth.uid();
  v_pkt     public.red_packets%rowtype;
  v_has_l   boolean;
  v_has_c   boolean;
  v_amount  bigint;
  v_roll    int;
  v_lo      bigint;
  v_hi      bigint;
  v_claim_id uuid;
  v_notif_id uuid;
  v_sender  public.profiles%rowtype;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO v_pkt FROM public.red_packets
   WHERE post_id = p_post_id FOR UPDATE;
  IF v_pkt.id IS NULL           THEN RAISE EXCEPTION 'PACKET_NOT_FOUND'; END IF;
  IF v_pkt.sender_id = v_me     THEN RAISE EXCEPTION 'CANNOT_CLAIM_OWN'; END IF;
  IF v_pkt.remaining_count <= 0 THEN RAISE EXCEPTION 'EXHAUSTED'; END IF;

  IF EXISTS (SELECT 1 FROM public.red_packet_claims
              WHERE packet_id = v_pkt.id AND user_id = v_me) THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.likes    WHERE post_id = p_post_id AND user_id = v_me) INTO v_has_l;
  SELECT EXISTS(SELECT 1 FROM public.comments WHERE post_id = p_post_id AND user_id = v_me) INTO v_has_c;
  IF NOT v_has_l OR NOT v_has_c THEN RAISE EXCEPTION 'NEED_LIKE_AND_COMMENT'; END IF;

  IF v_pkt.remaining_count = 1 THEN
    -- last packet: take everything left to preserve the sum invariant.
    v_amount := v_pkt.remaining_amount;
  ELSE
    v_roll := floor(random() * 1000)::int + 1;
    IF v_roll <= 700 THEN
      v_lo := 100;   v_hi := 500;
    ELSIF v_roll <= 950 THEN
      v_lo := 500;   v_hi := 1000;
    ELSIF v_roll <= 995 THEN
      v_lo := 1000;  v_hi := 3000;
    ELSE
      v_lo := 3000;  v_hi := 10000;
    END IF;
    v_amount := v_lo + floor(random() * (v_hi - v_lo + 1))::bigint;

    -- Reserve at least 1 GEM for each remaining packet after this one.
    IF v_amount > v_pkt.remaining_amount - (v_pkt.remaining_count - 1) THEN
      v_amount := GREATEST(1, v_pkt.remaining_amount - (v_pkt.remaining_count - 1));
    END IF;
  END IF;

  INSERT INTO public.red_packet_claims(packet_id, user_id, amount)
    VALUES (v_pkt.id, v_me, v_amount)
    RETURNING id INTO v_claim_id;

  UPDATE public.red_packets
     SET remaining_amount = remaining_amount - v_amount,
         remaining_count  = remaining_count - 1,
         status = CASE WHEN remaining_count - 1 <= 0 THEN 'exhausted' ELSE status END
   WHERE id = v_pkt.id;

  SELECT * INTO v_sender FROM public.profiles WHERE id = v_pkt.sender_id;

  INSERT INTO public.notifications(user_id, type, title, message, data, is_pending_claim)
  VALUES (
    v_me,
    'red_packet_pending',
    '🧧 Bạn vừa nhận được lì xì!',
    format('Bạn nhận được %s GEM từ lì xì của %s',
           v_amount,
           COALESCE(v_sender.full_name, v_sender.username, 'người dùng')),
    jsonb_build_object(
      'kind', 'red_packet_pending',
      'amount', v_amount,
      'claim_id', v_claim_id::text,
      'packet_id', v_pkt.id::text,
      'post_id', p_post_id::text,
      'from_id', v_pkt.sender_id::text,
      'from_name', COALESCE(v_sender.full_name, v_sender.username, 'người dùng')
    ),
    true
  )
  RETURNING id INTO v_notif_id;

  UPDATE public.red_packet_claims SET notification_id = v_notif_id WHERE id = v_claim_id;

  -- Keep legacy posts counters in sync for the existing UI.
  BEGIN
    UPDATE public.posts
       SET claimed_count       = COALESCE(claimed_count, 0) + 1,
           coin_pool_remaining = GREATEST(0, COALESCE(coin_pool_remaining, 0) - v_amount),
           reward_enabled      = CASE
             WHEN COALESCE(coin_pool_remaining, 0) - v_amount <= 0 THEN false
             ELSE reward_enabled END
     WHERE id = p_post_id;
  EXCEPTION WHEN undefined_column THEN NULL; END;

  RETURN jsonb_build_object(
    'ok', true,
    'claim_id', v_claim_id,
    'amount', v_amount,
    'pending', true,
    'remaining_count',  v_pkt.remaining_count - 1,
    'remaining_amount', v_pkt.remaining_amount - v_amount
  );
END;
$$;
REVOKE ALL ON FUNCTION public.claim_red_packet(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_red_packet(uuid) TO authenticated;

-- =====================================================================
-- credit_red_packet_claim(p_claim_id)  — wallet credit on notification press
-- =====================================================================
CREATE OR REPLACE FUNCTION public.credit_red_packet_claim(p_claim_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_claim  public.red_packet_claims%rowtype;
  v_new    bigint;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO v_claim FROM public.red_packet_claims WHERE id = p_claim_id FOR UPDATE;
  IF v_claim.id IS NULL       THEN RAISE EXCEPTION 'CLAIM_NOT_FOUND'; END IF;
  IF v_claim.user_id <> v_me  THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_claim.credited THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'amount', v_claim.amount);
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_claim.amount
   WHERE id = v_me
   RETURNING gem_balance INTO v_new;

  UPDATE public.red_packet_claims
     SET credited = true, credited_at = now()
   WHERE id = p_claim_id;

  INSERT INTO public.wallet_transactions(user_id, delta, kind, ref_packet_id,
                                         ref_claim_id, balance_after)
  VALUES (v_me, v_claim.amount, 'red_packet_receive', v_claim.packet_id,
          v_claim.id, v_new);

  IF v_claim.notification_id IS NOT NULL THEN
    UPDATE public.notifications
       SET is_pending_claim = false,
           is_claimed = true,
           is_read = true
     WHERE id = v_claim.notification_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'amount', v_claim.amount, 'new_balance', v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.credit_red_packet_claim(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.credit_red_packet_claim(uuid) TO authenticated;