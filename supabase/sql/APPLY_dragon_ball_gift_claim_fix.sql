-- Apply to the existing project zbuwddjcqdlyijcunwgd.
-- Gift spends sender Coin but never credits recipient Coin/Gem.

CREATE OR REPLACE FUNCTION public.claim_dragon_ball_gift(p_notif_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me uuid := auth.uid();
  v_row public.notifications%rowtype;
  v_tier smallint;
  v_sender uuid;
  v_post uuid;
  v_instance_id uuid;
BEGIN
  IF v_me IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED'); END IF;
  SELECT * INTO v_row FROM public.notifications WHERE id = p_notif_id FOR UPDATE;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); END IF;
  IF v_row.user_id <> v_me THEN RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); END IF;
  IF COALESCE((v_row.data->>'claimed')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED');
  END IF;
  v_tier := NULLIF(v_row.data->>'ball_tier', '')::smallint;
  IF v_tier IS NULL OR v_tier NOT BETWEEN 1 AND 7 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TIER');
  END IF;
  v_sender := COALESCE(NULLIF(v_row.data->>'from_user_id', '')::uuid, NULLIF(v_row.data->>'sender_id', '')::uuid);
  v_post := NULLIF(v_row.data->>'post_id', '')::uuid;

  INSERT INTO public.dragon_ball_instances(owner_id, tier, sender_id, post_id, source)
  VALUES (v_me, v_tier, v_sender, v_post, 'gift') RETURNING id INTO v_instance_id;

  UPDATE public.notifications
  SET is_read = true,
      is_pending_claim = false,
      data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
        'claimed', true, 'status', 'claimed', 'instance_id', v_instance_id
      )
  WHERE id = p_notif_id;

  RETURN jsonb_build_object('ok', true, 'tier', v_tier, 'instance_id', v_instance_id, 'insert_ok', true);
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'claim_dragon_ball_gift failed notif=% user=% error=%', p_notif_id, v_me, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'code', 'INSERT_FAILED', 'message', SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_dragon_ball_gift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_dragon_ball_gift(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_pending_dragon_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.type IN ('gift_post', 'dragon_reward')
     AND COALESCE((OLD.data->>'claimed')::boolean, false) = false
     AND COALESCE(OLD.data->>'status', 'pending') = 'pending'
     AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'Pending rewards must be claimed before deletion';
  END IF;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS protect_pending_dragon_notifications ON public.notifications;
CREATE TRIGGER protect_pending_dragon_notifications
BEFORE DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.protect_pending_dragon_notifications();

CREATE OR REPLACE FUNCTION public.auto_claim_expired_dragon_envelopes()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record; v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT n.id AS notif_id, n.user_id, p.id AS participant_id, p.reward_amount
    FROM public.notifications n
    JOIN public.dragon_summon_participants p ON p.notif_id = n.id AND p.sender_id = n.user_id
    WHERE n.type = 'dragon_reward' AND p.claimed_at IS NULL
      AND n.created_at <= now() - interval '5 minutes'
    FOR UPDATE OF n, p SKIP LOCKED
  LOOP
    UPDATE public.dragon_summon_participants SET claimed_at = now() WHERE id = v_row.participant_id;
    PERFORM set_config('app.allow_gem_change', '1', true);
    PERFORM set_config('app.allow_candy_change', '1', true);
    UPDATE public.profiles SET gem_balance = COALESCE(gem_balance, 0) + v_row.reward_amount WHERE id = v_row.user_id;
    UPDATE public.notifications
    SET is_read = true, is_pending_claim = false,
        data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
          'claimed', true, 'status', 'claimed', 'coins', v_row.reward_amount, 'auto_claimed', true
        )
    WHERE id = v_row.notif_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.auto_claim_expired_dragon_envelopes() FROM public;
GRANT EXECUTE ON FUNCTION public.auto_claim_expired_dragon_envelopes() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-claim-dragon-envelopes') THEN
    PERFORM cron.schedule('auto-claim-dragon-envelopes', '* * * * *',
      'select public.auto_claim_expired_dragon_envelopes();');
  END IF;
END $$;

-- Remove old duplicate transfer notifications already emitted for Dragon Ball gifts.
DELETE FROM public.notifications n
USING public.gem_transactions tx
WHERE tx.id::text = n.data->>'transaction_id'
  AND tx.action_type = 'gift_dragon_ball'
  AND n.type IN ('wallet_transfer', 'candy_transfer', 'gem_received', 'transfer_gem');
