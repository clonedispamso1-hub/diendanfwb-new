-- ============================================================
-- LEADERBOARD V2 — Social Competition System
-- Chạy thủ công trong Supabase SQL Editor. KHÔNG migrate tự động.
-- An toàn để chạy lại nhiều lần (idempotent).
-- ============================================================

-- 1) COLUMNS ---------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_donate_points        bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weekly_dragon_tiger_profit  bigint  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interaction_points          bigint  NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_weekly_donate       ON public.profiles (weekly_donate_points       DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_weekly_dragon_tiger ON public.profiles (weekly_dragon_tiger_profit DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_interaction         ON public.profiles (interaction_points         DESC);

-- 2) RPC: cộng điểm tương tác (cho phép client gọi, dùng auth.uid()) ---
CREATE OR REPLACE FUNCTION public.award_interaction_points(p_delta integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_delta IS NULL OR p_delta = 0 THEN RETURN; END IF;
  UPDATE public.profiles
     SET interaction_points = GREATEST(0, COALESCE(interaction_points,0) + p_delta)
   WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_interaction_points(integer) TO authenticated;

-- 3) RPC: ghi nhận lời/lỗ Rồng Hổ ------------------------------
CREATE OR REPLACE FUNCTION public.record_dragon_tiger_result(p_profit bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_profit IS NULL OR p_profit = 0 THEN RETURN; END IF;
  UPDATE public.profiles
     SET weekly_dragon_tiger_profit = COALESCE(weekly_dragon_tiger_profit,0) + p_profit
   WHERE id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_dragon_tiger_result(bigint) TO authenticated;

-- 4) TRIGGER: gem_transactions → cộng donate + interaction -----
-- transfer  : +amount weekly_donate_points cho from_id, +10 interaction
-- tip_post / tip_video / gift_*: +amount weekly_donate_points cho from_id, +5 interaction
CREATE OR REPLACE FUNCTION public.trg_gem_tx_award()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pts integer := 0;
BEGIN
  IF NEW.from_id IS NULL OR COALESCE(NEW.amount,0) <= 0 THEN RETURN NEW; END IF;

  IF NEW.action_type = 'transfer' THEN
    v_pts := 10;
  ELSIF NEW.action_type IN ('tip_post','tip_video','gift_post','gift_video','gift') THEN
    v_pts := 5;
  ELSE
    RETURN NEW;
  END IF;

  UPDATE public.profiles
     SET weekly_donate_points = COALESCE(weekly_donate_points,0) + NEW.amount,
         interaction_points   = COALESCE(interaction_points,0) + v_pts
   WHERE id = NEW.from_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gem_tx_award ON public.gem_transactions;
CREATE TRIGGER trg_gem_tx_award
AFTER INSERT ON public.gem_transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_gem_tx_award();

-- 5) TRIGGER: likes → +5 interaction cho người like ------------
CREATE OR REPLACE FUNCTION public.trg_likes_award()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.profiles
     SET interaction_points = COALESCE(interaction_points,0) + 5
   WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_likes_award ON public.likes;
CREATE TRIGGER trg_likes_award
AFTER INSERT ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.trg_likes_award();

-- 6) TRIGGER: comments → +5 interaction (reply cũng tính) ------
CREATE OR REPLACE FUNCTION public.trg_comments_award()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.profiles
     SET interaction_points = COALESCE(interaction_points,0) + 5
   WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comments_award ON public.comments;
CREATE TRIGGER trg_comments_award
AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.trg_comments_award();

-- 7) WEEKLY RESET ----------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_weekly_leaderboards()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
     SET weekly_donate_points = 0,
         weekly_dragon_tiger_profit = 0,
         interaction_points = 0;
$$;
GRANT EXECUTE ON FUNCTION public.reset_weekly_leaderboards() TO service_role;

-- 8) CRON: chạy mỗi thứ Hai 00:00 UTC --------------------------
-- Cần extension pg_cron đã enable. Nếu chưa có, bỏ qua block dưới
-- và tự lên lịch ở phía cron khác.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('reset_weekly_leaderboards')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='reset_weekly_leaderboards');
    PERFORM cron.schedule(
      'reset_weekly_leaderboards',
      '0 0 * * 1',
      $cron$ SELECT public.reset_weekly_leaderboards(); $cron$
    );
  END IF;
END $$;

-- ============================================================
-- DONE. Sau khi chạy SQL này:
--  • Trigger tự động cộng điểm khi like/comment/transfer/tip.
--  • RPC award_interaction_points & record_dragon_tiger_result
--    được FE gọi cho các hành động không qua bảng (dragon-tiger).
--  • Cron reset weekly mỗi thứ Hai 00:00 UTC.
-- ============================================================
