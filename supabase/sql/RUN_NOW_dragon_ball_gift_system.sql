-- =====================================================================
-- DRAGON BALL GIFT SYSTEM (Giai đoạn 1+2)
-- Chạy trên Supabase SQL Editor. Tương thích ngược với gift_gem_to_post_v3.
-- =====================================================================

-- 1) Thêm cột ball_tier vào post_gifts (1..7). NULL = tặng Gem tự do cũ.
ALTER TABLE public.post_gifts
  ADD COLUMN IF NOT EXISTS ball_tier smallint NULL;

ALTER TABLE public.post_gifts
  DROP CONSTRAINT IF EXISTS post_gifts_ball_tier_range;
ALTER TABLE public.post_gifts
  ADD CONSTRAINT post_gifts_ball_tier_range
  CHECK (ball_tier IS NULL OR (ball_tier BETWEEN 1 AND 7));

CREATE INDEX IF NOT EXISTS post_gifts_post_tier_idx
  ON public.post_gifts (post_id, ball_tier);

-- 2) RPC: Tặng 1 viên Ngọc Rồng cho bài viết.
--    Trừ Coin (gem_balance) người gửi, insert vào post_gifts, tạo notification pending.
--    Người nhận vẫn phải bấm "Nhận" trong notifications như luồng V3 cũ.
DROP FUNCTION IF EXISTS public.gift_dragon_ball_to_post(uuid, smallint);

CREATE OR REPLACE FUNCTION public.gift_dragon_ball_to_post(
  p_post_id uuid,
  p_tier    smallint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from     uuid := auth.uid();
  v_to       uuid;
  v_bal      bigint;
  v_new_bal  bigint;
  v_amount   bigint;
  v_notif_id uuid;
  v_gift_id  uuid;
  v_tx_id    uuid;
BEGIN
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;

  -- Bảng giá cố định
  v_amount := CASE p_tier
    WHEN 1 THEN 5000
    WHEN 2 THEN 10000
    WHEN 3 THEN 30000
    WHEN 4 THEN 80000
    WHEN 5 THEN 100000
    WHEN 6 THEN 200000
    WHEN 7 THEN 500000
    ELSE NULL
  END;

  IF v_amount IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TIER', 'message', 'Loại Ngọc Rồng không hợp lệ');
  END IF;

  SELECT user_id INTO v_to FROM public.posts WHERE id = p_post_id;
  IF v_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Bài viết không tồn tại');
  END IF;
  IF v_to = v_from THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF', 'message', 'Không thể tự tặng cho chính mình');
  END IF;

  PERFORM set_config('app.allow_gem_change',   '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles WHERE id = v_from FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', 'Không tìm thấy ví người gửi');
  END IF;
  IF v_bal < v_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Không đủ Coin');
  END IF;

  UPDATE public.profiles SET gem_balance = v_bal - v_amount
   WHERE id = v_from RETURNING gem_balance INTO v_new_bal;

  BEGIN
    INSERT INTO public.post_gifts(post_id, from_user_id, amount, ball_tier)
    VALUES (p_post_id, v_from, v_amount, p_tier)
    RETURNING id INTO v_gift_id;
  EXCEPTION WHEN undefined_column THEN
    INSERT INTO public.post_gifts(post_id, from_user_id, amount)
    VALUES (p_post_id, v_from, v_amount)
    RETURNING id INTO v_gift_id;
  END;

  BEGIN
    INSERT INTO public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    VALUES (v_from, v_to, v_amount,
            'Tặng Ngọc Rồng ' || p_tier::text || ' sao', 'gift_dragon_ball', p_post_id, 'pending', now())
    RETURNING id INTO v_tx_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_tx_id := NULL;
  END;

  INSERT INTO public.notifications(user_id, type, title, message, data, is_read, is_pending_claim, created_at)
  VALUES (
    v_to,
    'gift_post',
    'Bạn nhận được Ngọc Rồng ' || p_tier::text || ' sao',
    'Bạn được tặng 1 viên Ngọc Rồng ' || p_tier::text || ' sao. Bấm Nhận để đưa vào Rương đồ.',
    jsonb_build_object(
      'amount', v_amount,
      'ball_tier', p_tier,
      'status', 'pending',
      'post_id', p_post_id,
      'from_user_id', v_from,
      'sender_id', v_from,
      'gift_id', v_gift_id,
      'transaction_id', v_tx_id,
      'auto_settled', false
    ),
    false, true, now()
  ) RETURNING id INTO v_notif_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ball_tier', p_tier,
    'amount', v_amount,
    'new_balance', v_new_bal,
    'sender_new_balance', v_new_bal,
    'notif_id', v_notif_id,
    'gift_id', v_gift_id,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gift_dragon_ball_to_post(uuid, smallint) FROM public;
GRANT EXECUTE ON FUNCTION public.gift_dragon_ball_to_post(uuid, smallint) TO authenticated;

-- 3) View tổng hợp tier đã nhận trên mỗi bài viết (dùng cho footer + admin).
CREATE OR REPLACE VIEW public.post_dragon_ball_progress AS
SELECT
  post_id,
  ball_tier,
  COUNT(*)::int      AS gift_count,
  SUM(amount)::bigint AS total_amount
FROM public.post_gifts
WHERE ball_tier IS NOT NULL
GROUP BY post_id, ball_tier;

GRANT SELECT ON public.post_dragon_ball_progress TO authenticated, anon;
