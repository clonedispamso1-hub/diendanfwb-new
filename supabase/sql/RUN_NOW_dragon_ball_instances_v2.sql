-- =====================================================================
-- DRAGON BALL — INSTANCE-BASED REDESIGN (v2)
-- Mỗi viên Ngọc = 1 record riêng trong dragon_ball_instances.
-- Bảng user_dragon_ball_inventory (qty theo tier) trở thành CACHE tự đồng bộ
-- qua trigger để realtime UI hiện tại vẫn hoạt động.
--
-- Gameplay:
--   - Gift: người tặng bị trừ Coin ngay. Người nhận CHỈ nhận Notification.
--   - Claim: sinh 1 instance với sender_id + post_id, KHÔNG cộng Coin.
--   - Exchange(tier): tiêu 1 viên OLDEST (FIFO) của tier → cộng Coin.
--   - Summon: tiêu FIFO 1 viên mỗi tier (1..7) → user nhận Bao Lì Xì random,
--             mỗi sender liên quan cũng được 1 Bao Lì Xì random (claimable).
-- =====================================================================

-- 0) INSTANCE TABLE
CREATE TABLE IF NOT EXISTS public.dragon_ball_instances (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier         smallint NOT NULL CHECK (tier BETWEEN 1 AND 7),
  sender_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  post_id      uuid,
  source       text NOT NULL DEFAULT 'gift', -- 'gift' | 'system' | 'admin'
  acquired_at  timestamptz NOT NULL DEFAULT now(),
  consumed_at  timestamptz,
  consumed_reason text,        -- 'exchange' | 'summon'
  consumed_summon_id uuid
);

CREATE INDEX IF NOT EXISTS dbi_owner_active_idx
  ON public.dragon_ball_instances (owner_id, tier, acquired_at)
  WHERE consumed_at IS NULL;
CREATE INDEX IF NOT EXISTS dbi_summon_idx
  ON public.dragon_ball_instances (consumed_summon_id)
  WHERE consumed_summon_id IS NOT NULL;

GRANT SELECT ON public.dragon_ball_instances TO authenticated;
GRANT ALL ON public.dragon_ball_instances TO service_role;

ALTER TABLE public.dragon_ball_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dbi_own_select ON public.dragon_ball_instances;
CREATE POLICY dbi_own_select
  ON public.dragon_ball_instances FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR sender_id = auth.uid());

-- 1) AGGREGATE CACHE (giữ tên cũ user_dragon_ball_inventory để UI hiện tại vẫn chạy)
-- Table đã tồn tại từ v1. Nếu chưa, tạo:
CREATE TABLE IF NOT EXISTS public.user_dragon_ball_inventory (
  user_id  uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier     smallint NOT NULL CHECK (tier BETWEEN 1 AND 7),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tier)
);
GRANT SELECT ON public.user_dragon_ball_inventory TO authenticated;
GRANT ALL ON public.user_dragon_ball_inventory TO service_role;
ALTER TABLE public.user_dragon_ball_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_inventory_select" ON public.user_dragon_ball_inventory;
CREATE POLICY "own_inventory_select"
  ON public.user_dragon_ball_inventory FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- Helper: recompute cache row từ instances (active = chưa consumed)
CREATE OR REPLACE FUNCTION public._dbi_recount(p_user uuid, p_tier smallint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_q int;
BEGIN
  SELECT COUNT(*)::int INTO v_q
    FROM public.dragon_ball_instances
   WHERE owner_id = p_user AND tier = p_tier AND consumed_at IS NULL;

  INSERT INTO public.user_dragon_ball_inventory(user_id, tier, quantity, updated_at)
  VALUES (p_user, p_tier, v_q, now())
  ON CONFLICT (user_id, tier) DO UPDATE
    SET quantity = EXCLUDED.quantity, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public._dbi_sync_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._dbi_recount(NEW.owner_id, NEW.tier);
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public._dbi_recount(NEW.owner_id, NEW.tier);
    IF OLD.owner_id <> NEW.owner_id OR OLD.tier <> NEW.tier THEN
      PERFORM public._dbi_recount(OLD.owner_id, OLD.tier);
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public._dbi_recount(OLD.owner_id, OLD.tier);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS dbi_sync ON public.dragon_ball_instances;
CREATE TRIGGER dbi_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.dragon_ball_instances
  FOR EACH ROW EXECUTE FUNCTION public._dbi_sync_trg();

-- BACKFILL: nếu cache có quantity > số instance thực → sinh instance ảo (source='migration')
DO $$
DECLARE r record; missing int;
BEGIN
  FOR r IN SELECT user_id, tier, quantity FROM public.user_dragon_ball_inventory WHERE quantity > 0 LOOP
    SELECT r.quantity - COUNT(*) INTO missing
      FROM public.dragon_ball_instances
     WHERE owner_id = r.user_id AND tier = r.tier AND consumed_at IS NULL;
    IF missing > 0 THEN
      INSERT INTO public.dragon_ball_instances(owner_id, tier, source)
      SELECT r.user_id, r.tier, 'migration' FROM generate_series(1, missing);
    END IF;
  END LOOP;
END$$;

-- 2) SUMMONS TABLE (giữ v1 + thêm participants)
CREATE TABLE IF NOT EXISTS public.dragon_summons (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  coins_won  bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dragon_summons_user_idx ON public.dragon_summons(user_id, created_at DESC);
GRANT SELECT ON public.dragon_summons TO authenticated;
GRANT ALL    ON public.dragon_summons TO service_role;
ALTER TABLE public.dragon_summons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_summons_select" ON public.dragon_summons;
CREATE POLICY "own_summons_select"
  ON public.dragon_summons FOR SELECT
  TO authenticated USING (user_id = auth.uid());

-- 3) PARTICIPANTS (người tặng viên đã dùng — nhận Bao Lì Xì thưởng)
CREATE TABLE IF NOT EXISTS public.dragon_summon_participants (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summon_id    uuid NOT NULL REFERENCES public.dragon_summons(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reward_amount bigint NOT NULL,
  claimed_at   timestamptz,
  notif_id     uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dsp_sender_idx ON public.dragon_summon_participants(sender_id, claimed_at);
GRANT SELECT ON public.dragon_summon_participants TO authenticated;
GRANT ALL ON public.dragon_summon_participants TO service_role;
ALTER TABLE public.dragon_summon_participants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dsp_own ON public.dragon_summon_participants;
CREATE POLICY dsp_own ON public.dragon_summon_participants FOR SELECT
  TO authenticated USING (sender_id = auth.uid());

-- 4) CLAIM DRAGON BALL GIFT → tạo 1 instance với sender_id/post_id
DROP FUNCTION IF EXISTS public.claim_dragon_ball_gift(uuid);
CREATE OR REPLACE FUNCTION public.claim_dragon_ball_gift(p_notif_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_row  public.notifications%rowtype;
  v_tier smallint;
  v_sender uuid;
  v_post uuid;
  v_instance_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;
  SELECT * INTO v_row FROM public.notifications WHERE id = p_notif_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;
  IF v_row.user_id <> v_me THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;
  IF COALESCE((v_row.data->>'claimed')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED');
  END IF;
  v_tier := NULLIF(v_row.data->>'ball_tier','')::smallint;
  IF v_tier IS NULL OR v_tier < 1 OR v_tier > 7 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TIER');
  END IF;
  v_sender := NULLIF(v_row.data->>'from_user_id','')::uuid;
  IF v_sender IS NULL THEN v_sender := NULLIF(v_row.data->>'sender_id','')::uuid; END IF;
  v_post := NULLIF(v_row.data->>'post_id','')::uuid;

  INSERT INTO public.dragon_ball_instances(owner_id, tier, sender_id, post_id, source)
  VALUES (v_me, v_tier, v_sender, v_post, 'gift')
  RETURNING id INTO v_instance_id;

  UPDATE public.notifications
     SET is_read = true,
         is_pending_claim = false,
         data = COALESCE(data,'{}'::jsonb) || jsonb_build_object(
           'claimed', true,
           'status','claimed',
           'instance_id', v_instance_id
         )
   WHERE id = p_notif_id;

  RETURN jsonb_build_object('ok', true, 'tier', v_tier, 'instance_id', v_instance_id, 'insert_ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_dragon_ball_gift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_dragon_ball_gift(uuid) TO authenticated;

-- 5) EXCHANGE — tiêu FIFO 1 viên OLDEST của tier
DROP FUNCTION IF EXISTS public.exchange_dragon_ball(smallint);
CREATE OR REPLACE FUNCTION public.exchange_dragon_ball(p_tier smallint)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_inst_id uuid;
  v_coin bigint;
  v_newbal bigint;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;
  v_coin := CASE p_tier
    WHEN 1 THEN 5000 WHEN 2 THEN 10000 WHEN 3 THEN 30000
    WHEN 4 THEN 80000 WHEN 5 THEN 100000 WHEN 6 THEN 200000
    WHEN 7 THEN 500000 ELSE NULL END;
  IF v_coin IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TIER');
  END IF;

  SELECT id INTO v_inst_id
    FROM public.dragon_ball_instances
   WHERE owner_id = v_me AND tier = p_tier AND consumed_at IS NULL
   ORDER BY acquired_at ASC
   FOR UPDATE SKIP LOCKED
   LIMIT 1;
  IF v_inst_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALLS');
  END IF;

  UPDATE public.dragon_ball_instances
     SET consumed_at = now(), consumed_reason = 'exchange'
   WHERE id = v_inst_id;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);
  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance,0) + v_coin
   WHERE id = v_me
   RETURNING gem_balance INTO v_newbal;

  BEGIN
    INSERT INTO public.coin_transactions(user_id, amount, transaction_type)
    VALUES (v_me, v_coin, 'dragon_ball_exchange');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'tier', p_tier, 'coins', v_coin, 'new_balance', v_newbal);
END;
$$;
REVOKE ALL ON FUNCTION public.exchange_dragon_ball(smallint) FROM public;
GRANT EXECUTE ON FUNCTION public.exchange_dragon_ball(smallint) TO authenticated;

-- 6) SUMMON DRAGON — FIFO 1 viên/tier, tặng bao lì xì cho user + từng sender
DROP FUNCTION IF EXISTS public.summon_dragon();
CREATE OR REPLACE FUNCTION public.summon_dragon()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_summon_id uuid := gen_random_uuid();
  v_tier smallint;
  v_inst_id uuid;
  v_sender uuid;
  v_coins bigint;
  v_roll int;
  v_newbal bigint;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_senders uuid[] := ARRAY[]::uuid[];
  v_r record;
  v_reward bigint;
  v_notif_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;

  -- Chọn oldest 1 viên mỗi tier (1..7). Nếu thiếu tier → INCOMPLETE.
  FOR v_tier IN 1..7 LOOP
    SELECT id, sender_id INTO v_inst_id, v_sender
      FROM public.dragon_ball_instances
     WHERE owner_id = v_me AND tier = v_tier AND consumed_at IS NULL
     ORDER BY acquired_at ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1;
    IF v_inst_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INCOMPLETE_SET');
    END IF;
    v_ids := array_append(v_ids, v_inst_id);
    IF v_sender IS NOT NULL AND v_sender <> v_me THEN
      v_senders := array_append(v_senders, v_sender);
    END IF;
  END LOOP;

  -- Random Coin thưởng user gọi rồng
  v_roll := floor(random() * 100)::int + 1;
  v_coins := CASE
    WHEN v_roll <= 40 THEN 20000
    WHEN v_roll <= 70 THEN 100000
    WHEN v_roll <= 90 THEN 500000
    ELSE 1000000 END;

  INSERT INTO public.dragon_summons(id, user_id, coins_won) VALUES (v_summon_id, v_me, v_coins);

  UPDATE public.dragon_ball_instances
     SET consumed_at = now(), consumed_reason = 'summon', consumed_summon_id = v_summon_id
   WHERE id = ANY(v_ids);

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);
  UPDATE public.profiles SET gem_balance = COALESCE(gem_balance,0) + v_coins
   WHERE id = v_me RETURNING gem_balance INTO v_newbal;

  BEGIN
    INSERT INTO public.coin_transactions(user_id, amount, transaction_type)
    VALUES (v_me, v_coins, 'dragon_summon');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Reward mỗi sender (đã dedupe). Tạo participant + notification Bao Lì Xì claim.
  FOR v_r IN SELECT DISTINCT unnest FROM unnest(v_senders) LOOP
    v_roll := floor(random() * 100)::int + 1;
    v_reward := CASE
      WHEN v_roll <= 50 THEN 5000
      WHEN v_roll <= 80 THEN 20000
      WHEN v_roll <= 95 THEN 100000
      ELSE 500000 END;

    INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at)
    VALUES (
      v_r.unnest, 'dragon_reward',
      '🧧 Bạn nhận được Bao Lì Xì từ Rồng Thần',
      'Một người bạn đã dùng viên Ngọc bạn tặng để triệu hồi Rồng. Bấm để mở Bao Lì Xì.',
      jsonb_build_object('kind','dragon_reward','summon_id', v_summon_id, 'status','pending'),
      false, now()
    ) RETURNING id INTO v_notif_id;

    INSERT INTO public.dragon_summon_participants(summon_id, sender_id, reward_amount, notif_id)
    VALUES (v_summon_id, v_r.unnest, v_reward, v_notif_id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'coins', v_coins, 'new_balance', v_newbal, 'summon_id', v_summon_id);
END;
$$;
REVOKE ALL ON FUNCTION public.summon_dragon() FROM public;
GRANT EXECUTE ON FUNCTION public.summon_dragon() TO authenticated;

-- 7) CLAIM SUMMON ENVELOPE — sender mở bao lì xì thưởng
DROP FUNCTION IF EXISTS public.claim_summon_envelope(uuid);
CREATE OR REPLACE FUNCTION public.claim_summon_envelope(p_notif_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_notif public.notifications%rowtype;
  v_summon uuid;
  v_part public.dragon_summon_participants%rowtype;
  v_newbal bigint;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;
  SELECT * INTO v_notif FROM public.notifications WHERE id = p_notif_id FOR UPDATE;
  IF v_notif.id IS NULL OR v_notif.user_id <> v_me THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;
  IF COALESCE((v_notif.data->>'claimed')::boolean,false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED');
  END IF;
  v_summon := NULLIF(v_notif.data->>'summon_id','')::uuid;
  IF v_summon IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID');
  END IF;

  SELECT * INTO v_part
    FROM public.dragon_summon_participants
   WHERE summon_id = v_summon AND sender_id = v_me AND claimed_at IS NULL
   FOR UPDATE LIMIT 1;
  IF v_part.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_REWARD');
  END IF;

  UPDATE public.dragon_summon_participants SET claimed_at = now() WHERE id = v_part.id;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);
  UPDATE public.profiles SET gem_balance = COALESCE(gem_balance,0) + v_part.reward_amount
   WHERE id = v_me RETURNING gem_balance INTO v_newbal;

  BEGIN
    INSERT INTO public.coin_transactions(user_id, amount, transaction_type)
    VALUES (v_me, v_part.reward_amount, 'dragon_summon_reward');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  UPDATE public.notifications
     SET is_read = true,
         data = COALESCE(data,'{}'::jsonb) || jsonb_build_object('claimed', true, 'status','claimed', 'coins', v_part.reward_amount)
   WHERE id = p_notif_id;

  RETURN jsonb_build_object('ok', true, 'coins', v_part.reward_amount, 'new_balance', v_newbal);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_summon_envelope(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_summon_envelope(uuid) TO authenticated;

-- 8) UPDATE gift_dragon_ball_to_post → message không hiển thị Coin nữa
DROP FUNCTION IF EXISTS public.gift_dragon_ball_to_post(uuid, smallint);
CREATE OR REPLACE FUNCTION public.gift_dragon_ball_to_post(
  p_post_id uuid, p_tier smallint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_from uuid := auth.uid();
  v_to uuid;
  v_amount bigint;
  v_bal bigint;
  v_new_bal bigint;
  v_gift_id uuid;
  v_tx_id uuid;
  v_notif_id uuid;
  v_sender_name text;
BEGIN
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;
  IF p_tier IS NULL OR p_tier < 1 OR p_tier > 7 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TIER');
  END IF;

  v_amount := CASE p_tier
    WHEN 1 THEN 5000 WHEN 2 THEN 10000 WHEN 3 THEN 30000
    WHEN 4 THEN 80000 WHEN 5 THEN 100000 WHEN 6 THEN 200000
    WHEN 7 THEN 500000 END;

  SELECT user_id INTO v_to FROM public.posts WHERE id = p_post_id;
  IF v_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND');
  END IF;
  IF v_to = v_from THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_SELF_GIFT');
  END IF;

  SELECT gem_balance, COALESCE(full_name, username, 'Ai đó')
    INTO v_bal, v_sender_name
    FROM public.profiles WHERE id = v_from FOR UPDATE;
  IF COALESCE(v_bal,0) < v_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Không đủ Coin');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);
  UPDATE public.profiles SET gem_balance = v_bal - v_amount
   WHERE id = v_from RETURNING gem_balance INTO v_new_bal;

  BEGIN
    INSERT INTO public.post_gifts(post_id, from_user_id, amount, ball_tier)
    VALUES (p_post_id, v_from, v_amount, p_tier) RETURNING id INTO v_gift_id;
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO public.post_gifts(post_id, from_user_id, amount)
    VALUES (p_post_id, v_from, v_amount) RETURNING id INTO v_gift_id;
  END;

  BEGIN
    INSERT INTO public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    VALUES (v_from, v_to, v_amount, 'Tặng Ngọc Rồng ' || p_tier::text || ' sao', 'gift_dragon_ball', p_post_id, 'pending', now())
    RETURNING id INTO v_tx_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_tx_id := NULL; END;

  INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at)
  VALUES (
    v_to, 'gift_post',
    '🐉 Bạn nhận được Ngọc Rồng ' || p_tier::text || ' Sao!',
    '🐉 ' || v_sender_name || ' vừa tặng bạn Ngọc Rồng ' || p_tier::text || ' Sao. Bấm để nhận vào Rương đồ.',
    jsonb_build_object(
      'ball_tier', p_tier, 'status','pending', 'post_id', p_post_id,
      'from_user_id', v_from, 'sender_id', v_from,
      'gift_id', v_gift_id, 'transaction_id', v_tx_id, 'auto_settled', false
    ),
    false, now()
  ) RETURNING id INTO v_notif_id;

  RETURN jsonb_build_object('ok', true, 'ball_tier', p_tier, 'new_balance', v_new_bal,
                            'sender_new_balance', v_new_bal, 'notif_id', v_notif_id,
                            'gift_id', v_gift_id, 'status', 'pending');
END;
$$;
REVOKE ALL ON FUNCTION public.gift_dragon_ball_to_post(uuid, smallint) FROM public;
GRANT EXECUTE ON FUNCTION public.gift_dragon_ball_to_post(uuid, smallint) TO authenticated;
