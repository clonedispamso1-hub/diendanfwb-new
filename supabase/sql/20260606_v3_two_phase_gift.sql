-- =====================================================================
-- SCRIPT SQL ĐẬP ĐI XÂY LẠI (V3) — CHẠY NGUYÊN KHỐI TRÊN SUPABASE SQL EDITOR
-- Ngày: 06/06/2026
--
-- LUỒNG TIỀN CHUẨN:
--   PHA 1: Người gửi bấm Tặng Gem cho bài viết -> DB trừ gem_balance người gửi ngay.
--          Người nhận CHƯA được cộng tiền. Tiền nằm pending trong notifications.
--   PHA 2: Người nhận bấm Nhận -> DB cộng gem_balance người nhận, đổi notification completed.
--
-- TUYỆT ĐỐI:
--   - Không check Admin.
--   - Không để frontend update profiles.gem_balance trực tiếp.
--   - Chỉ frontend gọi 2 RPC V3 này.
-- =====================================================================

------------------------------------------------------------------------
-- 1. DROP các hàm cũ lỗi để tránh xung đột
------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.gift_gem_to_post_v2(uuid, bigint);
DROP FUNCTION IF EXISTS public.claim_gift_gem_notification(uuid);
DROP FUNCTION IF EXISTS public.claim_gift_notification(uuid);
DROP FUNCTION IF EXISTS public.gift_gem_to_post_v3(uuid, bigint);
DROP FUNCTION IF EXISTS public.claim_gift_gem_v3(uuid);

------------------------------------------------------------------------
-- 2. Tạo hàm RPC Tặng/Chuyển tiền V3
--    Ai đăng nhập cũng gọi được, đủ số dư thì trừ người gửi và tạo notification pending.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_gem_to_post_v3(
  p_post_id uuid,
  p_amount bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid := auth.uid();
  v_to uuid;
  v_bal bigint;
  v_new_bal bigint;
  v_notif_id uuid;
  v_gift_id uuid;
  v_tx_id uuid;
  v_total_gem bigint;
BEGIN
  IF v_from IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem không hợp lệ');
  END IF;

  SELECT user_id INTO v_to
    FROM public.posts
   WHERE id = p_post_id;

  IF v_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Bài viết không tồn tại');
  END IF;

  IF v_to = v_from THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF', 'message', 'Không thể tự tặng Gem cho mình');
  END IF;

  -- Kích hoạt bypass trigger trong transaction hiện tại để RPC server được sửa gem_balance.
  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles
   WHERE id = v_from
   FOR UPDATE;

  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', 'Không tìm thấy ví người gửi');
  END IF;

  IF v_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Tài khoản của bạn không đủ số dư Gem');
  END IF;

  -- PHA 1: TRỪ TIỀN người gửi ngay lập tức dưới DB.
  UPDATE public.profiles
     SET gem_balance = v_bal - p_amount
   WHERE id = v_from
   RETURNING gem_balance INTO v_new_bal;

  -- Ghi post_gifts để tổng Gem dưới bài viết không mất khi refresh.
  BEGIN
    INSERT INTO public.post_gifts(post_id, from_user_id, amount)
    VALUES (p_post_id, v_from, p_amount)
    RETURNING id INTO v_gift_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_gift_id := NULL;
  END;

  -- Ghi gem_transactions pending nếu bảng/cột đang tồn tại trong DB cũ.
  BEGIN
    INSERT INTO public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    VALUES (v_from, v_to, p_amount, 'Tặng Gem cho bài viết', 'gift_post', p_post_id, 'pending', now())
    RETURNING id INTO v_tx_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_tx_id := NULL;
  END;

  -- Tạo thông báo TREO TIỀN trạng thái pending cho người nhận.
  INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at)
  VALUES (
    v_to,
    'gift_post',
    '🎁 Bạn nhận được quà Gem từ bài viết!',
    'Bạn được tặng ' || p_amount::text || ' Gem. Bấm Nhận để cộng tiền vào ví chính.',
    jsonb_build_object(
      'amount', p_amount,
      'status', 'pending',
      'post_id', p_post_id,
      'from_user_id', v_from,
      'sender_id', v_from,
      'gift_id', v_gift_id,
      'transaction_id', v_tx_id,
      'auto_settled', false
    ),
    false,
    now()
  ) RETURNING id INTO v_notif_id;

  BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_gem
      FROM public.post_gifts
     WHERE post_id = p_post_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_total_gem := NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Tặng thành công, đã trừ số dư người gửi',
    'notif_id', v_notif_id,
    'gift_id', v_gift_id,
    'transaction_id', v_tx_id,
    'amount', p_amount,
    'new_balance', v_new_bal,
    'sender_new_balance', v_new_bal,
    'total_gem', v_total_gem,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.gift_gem_to_post_v3(uuid, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.gift_gem_to_post_v3(uuid, bigint) TO authenticated;

------------------------------------------------------------------------
-- 3. Tạo hàm RPC Nhận tiền V3
--    Chính chủ notification bấm Nhận -> cộng tiền người nhận, đổi status completed.
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_gift_gem_v3(
  p_notification_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_notif public.notifications%rowtype;
  v_amount bigint;
  v_new_bal bigint;
  v_tx_id uuid;
  v_status text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;

  SELECT * INTO v_notif
    FROM public.notifications
   WHERE id = p_notification_id
   FOR UPDATE;

  IF v_notif.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Thông báo không tồn tại');
  END IF;

  IF v_notif.user_id <> v_me THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Bạn không có quyền nhận thông báo này');
  END IF;

  v_status := COALESCE(v_notif.data->>'status', 'pending');
  IF v_status = 'completed' OR COALESCE((v_notif.data->>'auto_settled')::boolean, false) IS TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_CLAIMED', 'message', 'Bạn đã nhận số Gem này trước đó rồi');
  END IF;

  v_amount := COALESCE((v_notif.data->>'amount')::bigint, 0);
  IF v_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Gem nhận không hợp lệ');
  END IF;

  -- Kích hoạt bypass trigger trong transaction hiện tại để RPC server được sửa gem_balance.
  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  -- PHA 2: CỘNG TIỀN vào ví người nhận.
  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_amount
   WHERE id = v_me
   RETURNING gem_balance INTO v_new_bal;

  IF v_new_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', 'Không tìm thấy ví người nhận');
  END IF;

  -- Cập nhật trạng thái thông báo thành đã hoàn thành.
  UPDATE public.notifications
     SET is_read = true,
         data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
           'status', 'completed',
           'auto_settled', true,
           'claimed_at', to_jsonb(now())
         )
   WHERE id = p_notification_id;

  v_tx_id := NULLIF(v_notif.data->>'transaction_id', '')::uuid;
  IF v_tx_id IS NOT NULL THEN
    BEGIN
      UPDATE public.gem_transactions
         SET status = 'completed'
       WHERE id = v_tx_id;
    EXCEPTION WHEN undefined_table OR undefined_column THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'message', 'Đã nhận Gem vào ví thành công',
    'amount', v_amount,
    'new_balance', v_new_bal,
    'status', 'completed'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_gift_gem_v3(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_gift_gem_v3(uuid) TO authenticated;