-- =====================================================================
-- 🎁 GIFT FLOW FINAL — CHẠY NGUYÊN KHỐI TRÊN SUPABASE #1 (core/ví)
-- An toàn khi chạy lại nhiều lần. KHÔNG tạo DB mới, KHÔNG đụng logic khác.
--
-- LUỒNG CHUẨN (2 pha):
--   PHA 1 — A tặng: DB trừ Gem của A NGAY, tạo post_gifts (claimed = false).
--           B CHƯA được cộng Gem. Notification pending nằm ở Supabase #3.
--   PHA 2 — B bấm Nhận: claim_post_gift_v2 atomic → cộng Gem cho B đúng 1 lần.
--
-- Không frontend nào được tự cộng/trừ gem_balance: chỉ 2 RPC dưới đây.
-- Luồng chuyển Gem (claim_transfer) và rút Gem KHÔNG bị đụng tới.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0) SCHEMA post_gifts — bổ sung cột còn thiếu (gift_key là lỗi hay gặp)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_gifts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      uuid,
  from_user_id uuid,
  amount       bigint NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS gift_key    text;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS receiver_id uuid;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS claimed     boolean NOT NULL DEFAULT false;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS claimed_at  timestamptz;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS post_gifts_post_idx     ON public.post_gifts (post_id);
CREATE INDEX IF NOT EXISTS post_gifts_receiver_idx ON public.post_gifts (receiver_id);
CREATE INDEX IF NOT EXISTS post_gifts_pending_idx
  ON public.post_gifts (receiver_id) WHERE claimed = false;

ALTER TABLE public.post_gifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_gifts_read_all ON public.post_gifts;
CREATE POLICY post_gifts_read_all ON public.post_gifts FOR SELECT USING (true);

-- Client chỉ được ĐỌC. Mọi ghi đi qua RPC SECURITY DEFINER bên dưới.
GRANT SELECT ON public.post_gifts TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.post_gifts FROM anon, authenticated;
GRANT ALL ON public.post_gifts TO service_role;

-- ---------------------------------------------------------------------
-- 1) PHA 1 — send_post_gift_v2: chỉ TRỪ Gem người gửi, tạo quà pending
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.send_post_gift_v2(uuid, uuid, text, bigint);
CREATE FUNCTION public.send_post_gift_v2(
  p_post_id     uuid,
  p_receiver_id uuid,
  p_gift_key    text,
  p_amount      bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from       uuid := auth.uid();
  v_to         uuid := p_receiver_id;
  v_bal        bigint;
  v_new_bal    bigint;
  v_gift_id    uuid;
  v_total      bigint;
  v_name       text;
  v_key        text := NULLIF(btrim(COALESCE(p_gift_key, '')), '');
  v_gift_name  text;
  v_emoji      text;
  v_effect     text;
  v_min        bigint := 1;
  v_has_items  boolean;
  v_active     boolean;
BEGIN
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Bạn cần đăng nhập.');
  END IF;
  IF v_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND', 'message', 'Không xác định được chủ bài viết.');
  END IF;
  IF v_to = v_from THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF', 'message', 'Không thể tự tặng quà cho mình.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_to) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND', 'message', 'Không tìm thấy ví người nhận.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ.');
  END IF;

  -- Catalog quà là tuỳ chọn: thiếu bảng/khoá vẫn tặng được (không đổi nghiệp vụ).
  SELECT to_regclass('public.gift_items') IS NOT NULL INTO v_has_items;
  IF v_has_items AND v_key IS NOT NULL THEN
    SELECT name, emoji, effect, COALESCE(min_amount, 1), COALESCE(is_active, true)
      INTO v_gift_name, v_emoji, v_effect, v_min, v_active
      FROM public.gift_items WHERE key = v_key;
    IF v_gift_name IS NOT NULL THEN
      IF v_active IS FALSE THEN
        RETURN jsonb_build_object('ok', false, 'code', 'GIFT_UNAVAILABLE', 'message', 'Quà này hiện không khả dụng.');
      END IF;
      IF p_amount < v_min THEN
        RETURN jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_LOW',
          'message', 'Tối thiểu ' || v_min::text || ' xu cho ' || v_gift_name || '.');
      END IF;
    END IF;
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles WHERE id = v_from FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', 'Không tìm thấy ví của bạn.');
  END IF;
  IF v_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Bạn không đủ Gem.');
  END IF;

  -- PHA 1: TRỪ NGAY của người gửi. Người nhận CHƯA được cộng.
  UPDATE public.profiles SET gem_balance = v_bal - p_amount
   WHERE id = v_from RETURNING gem_balance INTO v_new_bal;

  INSERT INTO public.post_gifts(post_id, from_user_id, receiver_id, amount, gift_key, claimed)
  VALUES (p_post_id, v_from, v_to, p_amount, v_key, false)
  RETURNING id INTO v_gift_id;

  SELECT COALESCE(full_name, username, 'Người dùng') INTO v_name
    FROM public.profiles WHERE id = v_from;

  BEGIN
    INSERT INTO public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    VALUES (v_from, v_to, p_amount, 'Tặng quà ' || COALESCE(v_gift_name, 'Gem'), 'gift_v1', p_post_id, 'pending', now());
  EXCEPTION WHEN others THEN NULL;
  END;

  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM public.post_gifts WHERE post_id = p_post_id;

  RETURN jsonb_build_object(
    'ok', true,
    'gift_id', v_gift_id,
    'needs_notification', true,          -- notification pending nằm ở SB3
    'receiver_id', v_to,
    'sender_id', v_from,
    'sender_name', v_name,
    'amount', p_amount,
    'gift_key', v_key,
    'gift_name', COALESCE(v_gift_name, 'Gem'),
    'emoji', COALESCE(v_emoji, '🎁'),
    'effect', v_effect,
    'new_balance', v_new_bal,
    'total_gifted', v_total,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_post_gift_v2(uuid, uuid, text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.send_post_gift_v2(uuid, uuid, text, bigint) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) PHA 2 — claim_post_gift_v2: ATOMIC, cộng Gem đúng 1 lần
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_post_gift_v2(uuid);
CREATE FUNCTION public.claim_post_gift_v2(p_gift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      uuid := auth.uid();
  v_amount  bigint;
  v_new_bal bigint;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Bạn cần đăng nhập.');
  END IF;
  IF p_gift_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GIFT_NOT_FOUND', 'message', 'Không tìm thấy quà.');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  -- Chỉ đúng 1 transaction thắng được dòng chưa claimed → không cộng 2 lần.
  UPDATE public.post_gifts
     SET claimed = true, claimed_at = now()
   WHERE id = p_gift_id
     AND receiver_id = v_me
     AND claimed = false
  RETURNING amount INTO v_amount;

  IF v_amount IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.post_gifts WHERE id = p_gift_id AND receiver_id = v_me) THEN
      SELECT COALESCE(gem_balance, 0) INTO v_new_bal FROM public.profiles WHERE id = v_me;
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED',
        'message', 'Quà này đã được nhận trước đó.', 'amount', 0, 'new_balance', COALESCE(v_new_bal, 0));
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'GIFT_NOT_FOUND', 'message', 'Không tìm thấy quà này của bạn.');
  END IF;

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_amount
   WHERE id = v_me
  RETURNING gem_balance INTO v_new_bal;

  BEGIN
    UPDATE public.gem_transactions SET status = 'completed'
     WHERE id = (SELECT id FROM public.gem_transactions
                  WHERE to_id = v_me AND action_type = 'gift_v1'
                    AND status = 'pending' AND amount = v_amount
                  ORDER BY created_at LIMIT 1);
  EXCEPTION WHEN others THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'code', 'CLAIMED',
    'gift_id', p_gift_id, 'amount', v_amount, 'new_balance', v_new_bal);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_post_gift_v2(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_post_gift_v2(uuid) TO authenticated;

-- Alias tương thích bản cũ.
DROP FUNCTION IF EXISTS public.claim_post_gift(uuid);
CREATE FUNCTION public.claim_post_gift(p_gift_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.claim_post_gift_v2(p_gift_id);
$$;
REVOKE ALL ON FUNCTION public.claim_post_gift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_post_gift(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) Nhận tất cả — gộp mọi quà pending trong 1 transaction
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_all_post_gifts_v2();
CREATE FUNCTION public.claim_all_post_gifts_v2()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_me      uuid := auth.uid();
  v_total   bigint := 0;
  v_count   int := 0;
  v_ids     uuid[] := '{}';
  v_new_bal bigint;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  WITH claimed AS (
    UPDATE public.post_gifts
       SET claimed = true, claimed_at = now()
     WHERE receiver_id = v_me AND claimed = false
    RETURNING id, amount
  )
  SELECT COALESCE(SUM(amount), 0), COUNT(*), COALESCE(array_agg(id), '{}')
    INTO v_total, v_count, v_ids FROM claimed;

  IF v_count = 0 THEN
    SELECT COALESCE(gem_balance, 0) INTO v_new_bal FROM public.profiles WHERE id = v_me;
    RETURN jsonb_build_object('ok', true, 'total', 0, 'count', 0,
      'new_balance', v_new_bal, 'gift_ids', '[]'::jsonb);
  END IF;

  UPDATE public.profiles SET gem_balance = COALESCE(gem_balance, 0) + v_total
   WHERE id = v_me RETURNING gem_balance INTO v_new_bal;

  RETURN jsonb_build_object('ok', true, 'total', v_total, 'count', v_count,
    'new_balance', v_new_bal, 'gift_ids', to_jsonb(v_ids));
END $$;

REVOKE ALL ON FUNCTION public.claim_all_post_gifts_v2() FROM public;
GRANT EXECUTE ON FUNCTION public.claim_all_post_gifts_v2() TO authenticated;

COMMIT;
