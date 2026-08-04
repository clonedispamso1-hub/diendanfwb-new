-- =====================================================================
-- 2026-07-26  Lucky Money v2 (post-attached, per-packet min/max, auto refund)
--             + per-post Facebook / Zalo contact overrides
--
-- Idempotent. Safe to re-run. Does NOT touch schema cron privileges.
-- Skips pg_cron scheduling entirely if the extension is unavailable or
-- privileges are insufficient.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Post-level Facebook / Zalo override columns
-- ---------------------------------------------------------------------
ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS zalo_url     text;

-- ---------------------------------------------------------------------
-- 2. Per-packet min / max / refunded_at columns
-- ---------------------------------------------------------------------
ALTER TABLE public.red_packets
  ADD COLUMN IF NOT EXISTS min_reward  bigint,
  ADD COLUMN IF NOT EXISTS max_reward  bigint,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

CREATE INDEX IF NOT EXISTS red_packets_active_expiry_idx
  ON public.red_packets(expires_at)
  WHERE status = 'active';

-- ---------------------------------------------------------------------
-- 3. create_post_lucky_money  — v2 creator (min / max / expiration)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_post_lucky_money(
  p_post_id             uuid,
  p_total               bigint,
  p_max_recipients      int,
  p_min_reward          bigint,
  p_max_reward          bigint,
  p_expiration_seconds  int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_post   public.posts%rowtype;
  v_bal    bigint;
  v_pkt_id uuid;
  v_expiry timestamptz;
BEGIN
  IF v_me IS NULL                     THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF p_total IS NULL OR p_total <= 0  THEN RAISE EXCEPTION 'INVALID_TOTAL'; END IF;
  IF p_max_recipients IS NULL OR p_max_recipients <= 0 THEN RAISE EXCEPTION 'INVALID_PACKS'; END IF;
  IF p_min_reward IS NULL OR p_min_reward <= 0 THEN RAISE EXCEPTION 'INVALID_MIN'; END IF;
  IF p_max_reward IS NULL OR p_max_reward < p_min_reward THEN RAISE EXCEPTION 'INVALID_MAX'; END IF;
  IF p_max_recipients * p_min_reward > p_total THEN RAISE EXCEPTION 'MIN_TOO_HIGH_FOR_TOTAL'; END IF;
  IF p_max_reward > p_total THEN RAISE EXCEPTION 'MAX_EXCEEDS_TOTAL'; END IF;
  IF p_expiration_seconds IS NULL OR p_expiration_seconds < 60 THEN
    RAISE EXCEPTION 'INVALID_EXPIRATION';
  END IF;

  SELECT * INTO v_post FROM public.posts WHERE id = p_post_id FOR UPDATE;
  IF v_post.id IS NULL      THEN RAISE EXCEPTION 'POST_NOT_FOUND'; END IF;
  IF v_post.user_id <> v_me THEN RAISE EXCEPTION 'NOT_POST_OWNER'; END IF;
  IF EXISTS (SELECT 1 FROM public.red_packets WHERE post_id = p_post_id) THEN
    RAISE EXCEPTION 'ALREADY_ATTACHED';
  END IF;

  SELECT gem_balance INTO v_bal FROM public.profiles WHERE id = v_me FOR UPDATE;
  IF COALESCE(v_bal, 0) < p_total THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  UPDATE public.profiles SET gem_balance = gem_balance - p_total WHERE id = v_me;

  v_expiry := now() + make_interval(secs => p_expiration_seconds);

  INSERT INTO public.red_packets(
    post_id, sender_id, total_amount, remaining_amount,
    packet_count, remaining_count, status, expires_at,
    min_reward, max_reward
  )
  VALUES (
    p_post_id, v_me, p_total, p_total,
    p_max_recipients, p_max_recipients, 'active', v_expiry,
    p_min_reward, p_max_reward
  )
  RETURNING id INTO v_pkt_id;

  INSERT INTO public.wallet_transactions(user_id, delta, kind, ref_packet_id, balance_after)
  VALUES (v_me, -p_total, 'lucky_money_send', v_pkt_id, v_bal - p_total);

  RETURN jsonb_build_object(
    'ok', true, 'packet_id', v_pkt_id, 'total', p_total,
    'packs', p_max_recipients, 'expires_at', v_expiry
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_post_lucky_money(uuid, bigint, int, bigint, bigint, int) FROM public;
GRANT  EXECUTE ON FUNCTION public.create_post_lucky_money(uuid, bigint, int, bigint, bigint, int) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. claim_post_lucky_money  — v2 claimer
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_post_lucky_money(p_post_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me       uuid := auth.uid();
  v_pkt      public.red_packets%rowtype;
  v_amount   bigint;
  v_lo       bigint;
  v_hi       bigint;
  v_avail    bigint;
  v_claim_id uuid;
  v_new_bal  bigint;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;

  SELECT * INTO v_pkt FROM public.red_packets
   WHERE post_id = p_post_id FOR UPDATE;
  IF v_pkt.id IS NULL           THEN RAISE EXCEPTION 'PACKET_NOT_FOUND'; END IF;
  IF v_pkt.status <> 'active'   THEN RAISE EXCEPTION 'PACKET_INACTIVE'; END IF;
  IF v_pkt.sender_id = v_me     THEN RAISE EXCEPTION 'CANNOT_CLAIM_OWN'; END IF;
  IF v_pkt.remaining_count <= 0 THEN RAISE EXCEPTION 'EXHAUSTED'; END IF;
  IF v_pkt.expires_at IS NOT NULL AND v_pkt.expires_at <= now() THEN
    RAISE EXCEPTION 'EXPIRED';
  END IF;

  IF EXISTS (SELECT 1 FROM public.red_packet_claims
              WHERE packet_id = v_pkt.id AND user_id = v_me) THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED';
  END IF;

  IF v_pkt.remaining_count = 1 THEN
    v_amount := v_pkt.remaining_amount;
  ELSE
    v_lo := COALESCE(v_pkt.min_reward, 1);
    v_hi := COALESCE(v_pkt.max_reward, v_pkt.remaining_amount);
    v_avail := v_pkt.remaining_amount - (v_pkt.remaining_count - 1) * v_lo;
    IF v_avail < v_lo THEN v_avail := v_lo; END IF;
    IF v_hi > v_avail THEN v_hi := v_avail; END IF;
    IF v_hi < v_lo THEN v_hi := v_lo; END IF;
    v_amount := v_lo + floor(random() * (v_hi - v_lo + 1))::bigint;
    IF v_amount > v_pkt.remaining_amount THEN v_amount := v_pkt.remaining_amount; END IF;
  END IF;

  INSERT INTO public.red_packet_claims(packet_id, user_id, amount, credited, credited_at)
  VALUES (v_pkt.id, v_me, v_amount, true, now())
  RETURNING id INTO v_claim_id;

  UPDATE public.red_packets
     SET remaining_amount = remaining_amount - v_amount,
         remaining_count  = remaining_count - 1,
         status = CASE WHEN remaining_count - 1 <= 0 THEN 'depleted' ELSE 'active' END
   WHERE id = v_pkt.id;

  PERFORM set_config('app.allow_gem_change', '1', true);
  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance,0) + v_amount
   WHERE id = v_me
   RETURNING gem_balance INTO v_new_bal;

  INSERT INTO public.wallet_transactions(user_id, delta, kind, ref_packet_id, ref_claim_id, balance_after)
  VALUES (v_me, v_amount, 'lucky_money_claim', v_pkt.id, v_claim_id, v_new_bal);

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'packet_id', v_pkt.id);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_post_lucky_money(uuid) FROM public;
GRANT  EXECUTE ON FUNCTION public.claim_post_lucky_money(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. refund_expired_lucky_money() — pg_cron target
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_expired_lucky_money()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r        public.red_packets%rowtype;
  v_new_bal bigint;
  v_count  int := 0;
BEGIN
  FOR r IN
    SELECT * FROM public.red_packets
     WHERE status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
     FOR UPDATE SKIP LOCKED
  LOOP
    IF r.remaining_amount > 0 THEN
      PERFORM set_config('app.allow_gem_change', '1', true);
      UPDATE public.profiles
         SET gem_balance = COALESCE(gem_balance,0) + r.remaining_amount
       WHERE id = r.sender_id
       RETURNING gem_balance INTO v_new_bal;

      INSERT INTO public.wallet_transactions(user_id, delta, kind, ref_packet_id, balance_after)
      VALUES (r.sender_id, r.remaining_amount, 'lucky_money_refund', r.id, v_new_bal);
    END IF;

    UPDATE public.red_packets
       SET status = 'expired',
           remaining_amount = 0,
           refunded_at = now()
     WHERE id = r.id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.refund_expired_lucky_money() FROM public;

COMMIT;

-- =====================================================================
-- 6. pg_cron scheduling — OUTSIDE the main transaction, fully optional
--
-- All cron work is wrapped in exception blocks. We NEVER:
--   * run CREATE EXTENSION pg_cron  (that touches schema cron grants
--     and produces "dependent privileges exist" on re-run)
--   * REVOKE / GRANT anything on schema cron
--
-- If pg_cron is not installed OR the current role can't touch cron.*,
-- this section silently skips. The tables/columns/functions above are
-- already committed and fully functional; sweeping just won't be
-- automated (you can call SELECT public.refund_expired_lucky_money();
-- from any scheduled worker or manually).
-- =====================================================================
DO $$
DECLARE
  v_has_cron boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
  ) INTO v_has_cron;

  IF NOT v_has_cron THEN
    RAISE NOTICE 'pg_cron not installed — skipping refund sweep schedule';
    RETURN;
  END IF;

  BEGIN
    PERFORM cron.unschedule('lucky_money_refund_sweep');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  BEGIN
    PERFORM cron.schedule(
      'lucky_money_refund_sweep',
      '* * * * *',
      $CRON$ SELECT public.refund_expired_lucky_money(); $CRON$
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule lucky_money_refund_sweep (insufficient privilege on cron schema); skipping.';
  END;
END $$;
