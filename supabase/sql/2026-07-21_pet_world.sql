-- =====================================================================
-- Pet World migration
-- 1) Fully remove all Tai Xiu database objects (safe if already gone)
-- 2) Create Pet World schema, RLS, indexes, realtime
-- Run this once on the existing Supabase project.
-- =====================================================================

-- ============ 1) DROP Tai Xiu completely ============

-- Realtime publication members (ignore if missing)
DO $$ BEGIN
  PERFORM 1;
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.taixiu_sessions; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.taixiu_bets;     EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.taixiu_history;  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- Drop RPCs
DROP FUNCTION IF EXISTS public.taixiu_place_bet(uuid, text, bigint) CASCADE;
DROP FUNCTION IF EXISTS public.taixiu_place_bet(text, bigint) CASCADE;
DROP FUNCTION IF EXISTS public.taixiu_settle_session(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.taixiu_settle_session() CASCADE;
DROP FUNCTION IF EXISTS public.taixiu_start_next_session() CASCADE;
DROP FUNCTION IF EXISTS public.taixiu_tick() CASCADE;
DROP FUNCTION IF EXISTS public.taixiu_current_session() CASCADE;

-- Drop tables (cascades policies, triggers, indexes)
DROP TABLE IF EXISTS public.taixiu_bets     CASCADE;
DROP TABLE IF EXISTS public.taixiu_history  CASCADE;
DROP TABLE IF EXISTS public.taixiu_sessions CASCADE;

-- ============ 2) Pet World schema ============

-- Egg round counter (single global row)
CREATE TABLE IF NOT EXISTS public.pet_shop_state (
  id           smallint PRIMARY KEY DEFAULT 1,
  round        integer NOT NULL DEFAULT 1,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pet_shop_state_singleton CHECK (id = 1)
);
INSERT INTO public.pet_shop_state(id, round) VALUES (1, 1) ON CONFLICT (id) DO NOTHING;

-- Egg inventory owned by a user (unhatched)
CREATE TABLE IF NOT EXISTS public.pet_eggs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  egg_id         integer NOT NULL,        -- references EGGS[].id in code (1..100)
  bought_price   bigint  NOT NULL,
  bought_round   integer NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pet_eggs_user ON public.pet_eggs(user_id, created_at DESC);

-- Pet collection (hatched pets)
CREATE TABLE IF NOT EXISTS public.pet_collection (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  species        text NOT NULL,
  name           text NOT NULL,
  rarity         text NOT NULL,
  level          integer NOT NULL DEFAULT 1,
  exp            integer NOT NULL DEFAULT 0,
  hp             integer NOT NULL DEFAULT 100,
  hunger         integer NOT NULL DEFAULT 60,
  happiness      integer NOT NULL DEFAULT 80,
  times_fed      integer NOT NULL DEFAULT 0,
  from_egg_id    integer NOT NULL,
  birthday       timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pet_collection_user ON public.pet_collection(user_id, birthday DESC);

-- Feeding audit log
CREATE TABLE IF NOT EXISTS public.pet_feed_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pet_id       uuid NOT NULL REFERENCES public.pet_collection(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cost         bigint NOT NULL,
  gained_exp   integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pet_feed_pet ON public.pet_feed_history(pet_id, created_at DESC);

-- ============ RLS ============

ALTER TABLE public.pet_shop_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_eggs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_collection  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pet_feed_history ENABLE ROW LEVEL SECURITY;

-- Shop state: everyone can read, only service/authenticated updates (via RPC ideally)
DROP POLICY IF EXISTS pet_shop_state_read ON public.pet_shop_state;
CREATE POLICY pet_shop_state_read ON public.pet_shop_state
  FOR SELECT USING (true);

-- Eggs: only owner may read/insert/update/delete
DROP POLICY IF EXISTS pet_eggs_owner_all ON public.pet_eggs;
CREATE POLICY pet_eggs_owner_all ON public.pet_eggs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Pet collection: owner has full access, EVERYONE can SELECT to enable public profile browsing
DROP POLICY IF EXISTS pet_collection_public_read ON public.pet_collection;
CREATE POLICY pet_collection_public_read ON public.pet_collection
  FOR SELECT USING (true);

DROP POLICY IF EXISTS pet_collection_owner_write ON public.pet_collection;
CREATE POLICY pet_collection_owner_write ON public.pet_collection
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS pet_collection_owner_update ON public.pet_collection;
CREATE POLICY pet_collection_owner_update ON public.pet_collection
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS pet_collection_owner_delete ON public.pet_collection;
CREATE POLICY pet_collection_owner_delete ON public.pet_collection
  FOR DELETE USING (auth.uid() = user_id);

-- Feed history: only owner
DROP POLICY IF EXISTS pet_feed_owner_all ON public.pet_feed_history;
CREATE POLICY pet_feed_owner_all ON public.pet_feed_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ Grants (Data API access) ============
GRANT SELECT ON public.pet_shop_state  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pet_eggs        TO authenticated;
GRANT SELECT ON public.pet_collection  TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pet_collection  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pet_feed_history TO authenticated;
GRANT ALL ON public.pet_shop_state, public.pet_eggs, public.pet_collection, public.pet_feed_history TO service_role;

-- ============ Wallet RPC ============
-- Atomic Coin spend for Pet World. Coin is the same source AppHeader renders:
-- public.profiles.gem_balance. The function sets the trusted session flag used
-- by the gem_balance guard trigger, so client-side direct UPDATE remains blocked.
CREATE OR REPLACE FUNCTION public.pet_world_spend_coins(_amount bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance bigint;
  v_new_balance bigint;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Coin không hợp lệ');
  END IF;

  SELECT COALESCE(gem_balance, 0)
    INTO v_balance
    FROM public.profiles
   WHERE id = v_user
   FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', 'Không tìm thấy ví');
  END IF;

  IF v_balance < _amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INSUFFICIENT_BALANCE',
      'message', 'Không đủ Coin',
      'new_balance', v_balance
    );
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);

  UPDATE public.profiles
     SET gem_balance = v_balance - _amount
   WHERE id = v_user
   RETURNING gem_balance INTO v_new_balance;

  RETURN jsonb_build_object('ok', true, 'amount', _amount, 'new_balance', v_new_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.pet_world_spend_coins(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pet_world_spend_coins(bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pet_world_spend_coins(bigint) TO service_role;

-- ============ Realtime ============
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pet_collection; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pet_eggs;       EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.pet_shop_state; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- Done. Pet World is ready. Tai Xiu is gone.