-- =====================================================================
-- 🎁 GIFT SYSTEM V3 — FIX NHẬN QUÀ (CHẠY TRÊN SUPABASE #1)
--
-- Nguyên nhân gốc: các RPC quà trên SB1 còn INSERT/UPDATE bảng
-- public.notifications. Notification nay CHỈ tồn tại trên SUPABASE #3, nên
-- mọi lỗi ở bước notification làm ROLLBACK cả transaction → xu không được
-- cộng, quà "nhận mãi không được".
--
-- Sau bản này:
--   • SB1 chỉ xử lý: ví (profiles.gem_balance), post_gifts, message_gifts,
--     gem_transactions.
--   • SB1 KHÔNG còn đọc/ghi public.notifications trong luồng quà.
--   • Claim là ATOMIC: UPDATE ... WHERE claimed = false RETURNING ...
--     Nếu đã nhận → trả về code ALREADY_CLAIMED (không rollback, không lỗi).
--   • Spam click: chỉ đúng 1 request thắng dòng chưa claimed → cộng xu 1 lần.
--
-- Chạy nguyên khối trong SQL Editor của SUPABASE #1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Bỏ trigger khoá xoá notification quà trên SB1 (bảng này không còn dùng)
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_guard_pending_gift_notification ON public.notifications;

-- ---------------------------------------------------------------------
-- 1) GỬI QUÀ BÀI VIẾT — send_post_gift_v2 (không chạm notifications)
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
  v_from    uuid := auth.uid();
  v_to      uuid := p_receiver_id;
  v_item    public.gift_items;
  v_bal     bigint;
  v_new_bal bigint;
  v_gift_id uuid;
  v_total   bigint;
  v_name    text;
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

  SELECT * INTO v_item FROM public.gift_items WHERE key = p_gift_key;
  IF v_item.id IS NULL OR v_item.is_active = false
     OR (v_item.event_ends_at IS NOT NULL AND v_item.event_ends_at < now()) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GIFT_UNAVAILABLE', 'message', 'Quà này hiện không khả dụng.');
  END IF;

  IF p_amount IS NULL OR p_amount < v_item.min_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_LOW',
      'message', 'Tối thiểu ' || v_item.min_amount::text || ' xu cho ' || v_item.name || '.');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles WHERE id = v_from FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', 'Không tìm thấy ví của bạn.');
  END IF;
  IF v_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Bạn không đủ xu.');
  END IF;

  UPDATE public.profiles SET gem_balance = v_bal - p_amount
   WHERE id = v_from RETURNING gem_balance INTO v_new_bal;

  INSERT INTO public.post_gifts(post_id, from_user_id, receiver_id, amount, gift_key, claimed)
  VALUES (p_post_id, v_from, v_to, p_amount, v_item.key, false)
  RETURNING id INTO v_gift_id;

  SELECT COALESCE(full_name, username, 'Người dùng') INTO v_name
    FROM public.profiles WHERE id = v_from;

  BEGIN
    INSERT INTO public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    VALUES (v_from, v_to, p_amount, 'Tặng quà ' || v_item.name, 'gift_v1', p_post_id, 'pending', now());
  EXCEPTION WHEN undefined_table OR undefined_column OR check_violation THEN
    NULL;
  END;

  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM public.post_gifts WHERE post_id = p_post_id;

  -- Notification do CLIENT tạo trên SUPABASE #3 (needs_notification = true).
  RETURN jsonb_build_object(
    'ok', true,
    'gift_id', v_gift_id,
    'needs_notification', true,
    'receiver_id', v_to,
    'sender_id', v_from,
    'sender_name', v_name,
    'amount', p_amount,
    'gift_key', v_item.key,
    'gift_name', v_item.name,
    'emoji', v_item.emoji,
    'effect', v_item.effect,
    'new_balance', v_new_bal,
    'total_gifted', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_post_gift_v2(uuid, uuid, text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.send_post_gift_v2(uuid, uuid, text, bigint) TO authenticated;

-- ---------------------------------------------------------------------
-- 2) NHẬN QUÀ BÀI VIẾT — claim_post_gift_v2 (atomic, không notifications)
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
  v_notif   uuid;
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

  -- ATOMIC: chỉ đúng 1 transaction thắng được dòng chưa claimed.
  UPDATE public.post_gifts
     SET claimed = true, claimed_at = now()
   WHERE id = p_gift_id
     AND receiver_id = v_me
     AND claimed = false
  RETURNING amount, notif_id INTO v_amount, v_notif;

  IF v_amount IS NULL THEN
    -- Không rollback: phân biệt "đã nhận" vs "không phải của bạn".
    IF EXISTS (SELECT 1 FROM public.post_gifts WHERE id = p_gift_id AND receiver_id = v_me) THEN
      SELECT amount INTO v_amount FROM public.post_gifts WHERE id = p_gift_id;
      SELECT COALESCE(gem_balance, 0) INTO v_new_bal FROM public.profiles WHERE id = v_me;
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED',
        'message', 'Quà này đã được nhận trước đó.',
        'amount', COALESCE(v_amount, 0), 'new_balance', COALESCE(v_new_bal, 0));
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'GIFT_NOT_FOUND',
      'message', 'Không tìm thấy quà này của bạn.');
  END IF;

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_amount
   WHERE id = v_me
  RETURNING gem_balance INTO v_new_bal;

  -- gem_transactions là phụ trợ: lỗi ở đây KHÔNG được làm mất xu đã cộng.
  BEGIN
    UPDATE public.gem_transactions SET status = 'completed'
     WHERE id = (SELECT id FROM public.gem_transactions
                  WHERE to_id = v_me AND action_type = 'gift_v1'
                    AND status = 'pending' AND amount = v_amount
                  ORDER BY created_at LIMIT 1);
  EXCEPTION WHEN others THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'code', 'CLAIMED',
    'gift_id', p_gift_id, 'notif_id', v_notif,
    'amount', v_amount, 'new_balance', v_new_bal);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_post_gift_v2(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_post_gift_v2(uuid) TO authenticated;

-- Bản cũ claim_post_gift giữ tên nhưng chỉ uỷ quyền sang v2 (tương thích).
DROP FUNCTION IF EXISTS public.claim_post_gift(uuid);
CREATE FUNCTION public.claim_post_gift(p_gift_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.claim_post_gift_v2(p_gift_id);
$$;

REVOKE ALL ON FUNCTION public.claim_post_gift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_post_gift(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 3) NHẬN QUÀ TRONG CHAT — claim_message_gift (cùng logic, trả jsonb)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_message_gift(uuid);
CREATE FUNCTION public.claim_message_gift(p_gift_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      uuid := auth.uid();
  v_gift    public.message_gifts;
  v_new_bal bigint;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Bạn cần đăng nhập.');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  -- Hết hạn thì không cho nhận (đánh dấu expired, không rollback).
  UPDATE public.message_gifts
     SET status = 'expired'
   WHERE id = p_gift_id AND status = 'pending' AND expires_at < now();

  -- ATOMIC: chỉ 1 request thắng được dòng pending.
  UPDATE public.message_gifts
     SET status = 'claimed', claimed_at = now()
   WHERE id = p_gift_id
     AND receiver_id = v_me
     AND status = 'pending'
  RETURNING * INTO v_gift;

  IF v_gift.id IS NULL THEN
    SELECT * INTO v_gift FROM public.message_gifts WHERE id = p_gift_id AND receiver_id = v_me;
    IF v_gift.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'GIFT_NOT_FOUND', 'message', 'Không tìm thấy quà này của bạn.');
    END IF;
    SELECT COALESCE(gem_balance, 0) INTO v_new_bal FROM public.profiles WHERE id = v_me;
    RETURN jsonb_build_object('ok', false,
      'code', CASE WHEN v_gift.status = 'claimed' THEN 'ALREADY_CLAIMED' ELSE upper(v_gift.status) END,
      'message', CASE WHEN v_gift.status = 'claimed' THEN 'Quà này đã được nhận trước đó.'
                      WHEN v_gift.status = 'expired' THEN 'Quà đã hết hạn.'
                      ELSE 'Quà đã được xử lý.' END,
      'status', v_gift.status, 'amount', v_gift.amount, 'new_balance', COALESCE(v_new_bal, 0));
  END IF;

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_gift.amount
   WHERE id = v_me
  RETURNING gem_balance INTO v_new_bal;

  BEGIN
    INSERT INTO public.gem_transactions
      (from_id, to_id, amount, action_type, note, metadata)
    VALUES
      (NULL, v_me, v_gift.amount, 'gift_receive', 'Đã nhận ' || v_gift.gift_name,
       jsonb_build_object('gift_id', v_gift.id, 'message_id', v_gift.message_id,
                          'gift_key', v_gift.gift_key, 'gift_emoji', v_gift.gift_emoji));
  EXCEPTION WHEN others THEN NULL;
  END;

  -- KHÔNG insert notifications ở SB1: client tạo/cập nhật trên SUPABASE #3.
  RETURN jsonb_build_object('ok', true, 'code', 'CLAIMED',
    'gift_id', v_gift.id, 'message_id', v_gift.message_id,
    'status', 'claimed', 'amount', v_gift.amount, 'new_balance', v_new_bal,
    'sender_id', v_gift.sender_id, 'receiver_id', v_gift.receiver_id,
    'gift_key', v_gift.gift_key, 'gift_name', v_gift.gift_name, 'gift_emoji', v_gift.gift_emoji);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_message_gift(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_message_gift(uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 4) REALTIME cho post_gifts (ví/quà ở SB1)
-- ---------------------------------------------------------------------
ALTER TABLE public.post_gifts REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.post_gifts;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
