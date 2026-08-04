-- =====================================================================
-- DRAGON BALL — INVENTORY REDESIGN
-- Ngọc Rồng trở thành vật phẩm trong Rương đồ. Không tự cộng Coin nữa.
-- Người chơi phải claim từ notification (vào inventory) rồi tự chọn
-- "Đổi Coin" từng viên hoặc gom đủ 7 viên để "Gọi Rồng" nhận Bao Lì Xì.
-- =====================================================================

-- 1) INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.user_dragon_ball_inventory (
  user_id  uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier     smallint NOT NULL CHECK (tier BETWEEN 1 AND 7),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, tier)
);

GRANT SELECT ON public.user_dragon_ball_inventory TO authenticated;
GRANT ALL    ON public.user_dragon_ball_inventory TO service_role;

ALTER TABLE public.user_dragon_ball_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_inventory_select" ON public.user_dragon_ball_inventory;
CREATE POLICY "own_inventory_select"
  ON public.user_dragon_ball_inventory FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2) DRAGON SUMMONS LOG
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
  TO authenticated
  USING (user_id = auth.uid());

-- 3) CLAIM DRAGON BALL GIFT — thay vì cộng Coin, tăng số lượng viên trong inventory
DROP FUNCTION IF EXISTS public.claim_dragon_ball_gift(uuid);

CREATE OR REPLACE FUNCTION public.claim_dragon_ball_gift(p_notif_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_row  public.notifications%rowtype;
  v_tier smallint;
  v_new_qty integer;
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

  INSERT INTO public.user_dragon_ball_inventory(user_id, tier, quantity, updated_at)
  VALUES (v_me, v_tier, 1, now())
  ON CONFLICT (user_id, tier) DO UPDATE
    SET quantity = public.user_dragon_ball_inventory.quantity + 1,
        updated_at = now()
  RETURNING quantity INTO v_new_qty;

  UPDATE public.notifications
     SET is_read = true,
         data = COALESCE(data,'{}'::jsonb) || jsonb_build_object('claimed', true, 'status', 'claimed')
   WHERE id = p_notif_id;

  RETURN jsonb_build_object('ok', true, 'tier', v_tier, 'quantity', v_new_qty);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_dragon_ball_gift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_dragon_ball_gift(uuid) TO authenticated;

-- 4) EXCHANGE — Đổi 1 viên tier thành Coin theo bảng giá
DROP FUNCTION IF EXISTS public.exchange_dragon_ball(smallint);

CREATE OR REPLACE FUNCTION public.exchange_dragon_ball(p_tier smallint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_qty    integer;
  v_coin   bigint;
  v_newbal bigint;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;

  v_coin := CASE p_tier
    WHEN 1 THEN 5000
    WHEN 2 THEN 10000
    WHEN 3 THEN 30000
    WHEN 4 THEN 80000
    WHEN 5 THEN 100000
    WHEN 6 THEN 200000
    WHEN 7 THEN 500000
    ELSE NULL END;
  IF v_coin IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TIER');
  END IF;

  SELECT quantity INTO v_qty
    FROM public.user_dragon_ball_inventory
   WHERE user_id = v_me AND tier = p_tier
   FOR UPDATE;
  IF v_qty IS NULL OR v_qty < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALLS');
  END IF;

  UPDATE public.user_dragon_ball_inventory
     SET quantity = quantity - 1, updated_at = now()
   WHERE user_id = v_me AND tier = p_tier;

  PERFORM set_config('app.allow_gem_change',   '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_coin
   WHERE id = v_me
   RETURNING gem_balance INTO v_newbal;

  BEGIN
    INSERT INTO public.coin_transactions(user_id, amount, transaction_type)
    VALUES (v_me, v_coin, 'dragon_ball_exchange');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'tier', p_tier, 'coins', v_coin,
                            'quantity', v_qty - 1, 'new_balance', v_newbal);
END;
$$;

REVOKE ALL ON FUNCTION public.exchange_dragon_ball(smallint) FROM public;
GRANT EXECUTE ON FUNCTION public.exchange_dragon_ball(smallint) TO authenticated;

-- 5) SUMMON DRAGON — cần đủ 7 tier x1, random Coin thưởng
DROP FUNCTION IF EXISTS public.summon_dragon();

CREATE OR REPLACE FUNCTION public.summon_dragon()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_cnt    integer;
  v_roll   integer;
  v_coins  bigint;
  v_newbal bigint;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;

  -- Lock all 7 rows and verify each tier has >= 1
  SELECT COUNT(*) INTO v_cnt
    FROM public.user_dragon_ball_inventory
   WHERE user_id = v_me AND quantity >= 1
   FOR UPDATE;
  IF v_cnt < 7 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INCOMPLETE_SET');
  END IF;
  -- Also check tiers 1..7 all present
  SELECT COUNT(DISTINCT tier) INTO v_cnt
    FROM public.user_dragon_ball_inventory
   WHERE user_id = v_me AND quantity >= 1 AND tier BETWEEN 1 AND 7;
  IF v_cnt < 7 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INCOMPLETE_SET');
  END IF;

  UPDATE public.user_dragon_ball_inventory
     SET quantity = quantity - 1, updated_at = now()
   WHERE user_id = v_me AND tier BETWEEN 1 AND 7;

  -- Random reward: 40% 20k, 30% 100k, 20% 500k, 10% 1,000,000
  v_roll := floor(random() * 100)::int + 1;
  v_coins := CASE
    WHEN v_roll <= 40 THEN 20000
    WHEN v_roll <= 70 THEN 100000
    WHEN v_roll <= 90 THEN 500000
    ELSE 1000000
  END;

  PERFORM set_config('app.allow_gem_change',   '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_coins
   WHERE id = v_me
   RETURNING gem_balance INTO v_newbal;

  INSERT INTO public.dragon_summons(user_id, coins_won) VALUES (v_me, v_coins);

  BEGIN
    INSERT INTO public.coin_transactions(user_id, amount, transaction_type)
    VALUES (v_me, v_coins, 'dragon_summon');
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at)
  VALUES (v_me, 'system',
          '🎉 Rồng Thần đã ban thưởng!',
          'Bạn đã gọi thành công Rồng Thần và nhận được ' || v_coins::text || ' Coin.',
          jsonb_build_object('kind','system','coins',v_coins),
          false, now());

  RETURN jsonb_build_object('ok', true, 'coins', v_coins, 'new_balance', v_newbal);
END;
$$;

REVOKE ALL ON FUNCTION public.summon_dragon() FROM public;
GRANT EXECUTE ON FUNCTION public.summon_dragon() TO authenticated;

-- 6) VIEW: my inventory summary (dùng cho client fetch tiện)
CREATE OR REPLACE VIEW public.my_dragon_ball_inventory AS
SELECT tier, quantity FROM public.user_dragon_ball_inventory
 WHERE user_id = auth.uid();

GRANT SELECT ON public.my_dragon_ball_inventory TO authenticated;
