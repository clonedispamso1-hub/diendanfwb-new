-- =====================================================================
-- 🎁 CLONE GIFT V4 — HOTFIX: KHÔNG PHỤ THUỘC gem_transactions.from_id
--
--   • Gift Clone CHỈ chạy qua `admin_clone_gift_post_v4`.
--   • KHÔNG gọi, KHÔNG sửa `send_post_gift_v2`.
--   • Phần ghi lịch sử ví dùng SQL động theo cột thực tế của
--     `gem_transactions` (from_id/sender_id, to_id/receiver_id) và nếu
--     bảng/cột không khớp thì BỎ QUA — không làm hỏng giao dịch Xu.
-- Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_clone_gift_post_v4(
  p_account     uuid,
  p_post_id     uuid,
  p_receiver_id uuid,
  p_gift_key    text,
  p_amount      bigint,
  p_idem        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin    uuid := auth.uid();
  v_idem     text := NULLIF(btrim(COALESCE(p_idem, '')), '');
  v_key      text := NULLIF(btrim(COALESCE(p_gift_key, '')), '');
  v_bal      bigint;
  v_new_bal  bigint;
  v_recv_bal bigint;
  v_gift_id  uuid;
  v_name     text;
  v_locked   uuid;
  v_prev     public.admin_gift_batch_log;
  v_from_col text;
  v_to_col   text;
BEGIN
  IF v_admin IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_admin AND p.is_admin = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Admin.');
  END IF;

  IF v_idem IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'IDEM_REQUIRED', 'message', 'Thiếu khoá chống trùng.');
  END IF;
  IF p_account IS NULL OR p_post_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT', 'message', 'Thiếu tài khoản gửi, bài viết hoặc loại quà.');
  END IF;
  IF p_receiver_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND', 'message', 'Không xác định được chủ bài viết.');
  END IF;
  IF p_receiver_id = p_account THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF', 'message', 'Không tự tặng chính mình.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AMOUNT_INVALID', 'message', 'Số Xu không hợp lệ.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND', 'message', 'Không tìm thấy ví người nhận.');
  END IF;

  -- (A) Chốt idempotency trước mọi thay đổi.
  INSERT INTO public.admin_gift_batch_log(
    idem_key, admin_id, account_id, post_id, gift_key, amount, receiver_id
  )
  VALUES (v_idem, v_admin, p_account, p_post_id, v_key, p_amount, p_receiver_id)
  ON CONFLICT (idem_key) DO NOTHING
  RETURNING id INTO v_locked;

  IF v_locked IS NULL THEN
    SELECT * INTO v_prev FROM public.admin_gift_batch_log WHERE idem_key = v_idem;
    SELECT COALESCE(full_name, username, 'Người dùng') INTO v_name
      FROM public.profiles WHERE id = COALESCE(v_prev.account_id, p_account);
    RETURN jsonb_build_object('ok', true, 'duplicate', true,
      'gift_id', v_prev.gift_id,
      'receiver_id', COALESCE(v_prev.receiver_id, p_receiver_id),
      'sender_name', v_name,
      'amount', COALESCE(v_prev.amount, p_amount),
      'gift_key', COALESCE(v_prev.gift_key, v_key));
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  -- (B) Khoá ví clone, kiểm tra số dư.
  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles WHERE id = p_account FOR UPDATE;
  IF v_bal IS NULL THEN
    RAISE EXCEPTION 'CLONE_PROFILE_NOT_FOUND';
  END IF;
  IF v_bal < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  -- (C) Ghi quà — đã tính là nhận xong.
  INSERT INTO public.post_gifts(post_id, from_user_id, receiver_id, amount, gift_key, claimed, claimed_at)
  VALUES (p_post_id, p_account, p_receiver_id, p_amount, v_key, true, now())
  RETURNING id INTO v_gift_id;
  IF v_gift_id IS NULL THEN
    RAISE EXCEPTION 'GIFT_INSERT_FAILED';
  END IF;

  -- (D) Trừ Xu clone.
  UPDATE public.profiles SET gem_balance = v_bal - p_amount
   WHERE id = p_account RETURNING gem_balance INTO v_new_bal;

  -- (E) Cộng Xu cho chủ bài viết NGAY.
  UPDATE public.profiles SET gem_balance = COALESCE(gem_balance, 0) + p_amount
   WHERE id = p_receiver_id RETURNING gem_balance INTO v_recv_bal;

  -- (F) Lịch sử ví — SQL động, bỏ qua nếu schema không khớp.
  BEGIN
    SELECT c.column_name INTO v_from_col
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'gem_transactions'
       AND c.column_name IN ('from_id', 'sender_id', 'from_user_id')
     ORDER BY array_position(ARRAY['from_id','sender_id','from_user_id'], c.column_name)
     LIMIT 1;

    SELECT c.column_name INTO v_to_col
      FROM information_schema.columns c
     WHERE c.table_schema = 'public' AND c.table_name = 'gem_transactions'
       AND c.column_name IN ('to_id', 'receiver_id', 'to_user_id')
     ORDER BY array_position(ARRAY['to_id','receiver_id','to_user_id'], c.column_name)
     LIMIT 1;

    IF v_from_col IS NOT NULL AND v_to_col IS NOT NULL THEN
      EXECUTE format(
        'INSERT INTO public.gem_transactions(%I, %I, amount, note, action_type, post_id, status, created_at)
         VALUES ($1, $2, $3, $4, ''gift_v1'', $5, ''completed'', now())',
        v_from_col, v_to_col
      ) USING p_account, p_receiver_id, p_amount, 'Tặng quà ' || v_key, p_post_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- lịch sử ví không được phép làm hỏng giao dịch Xu
  END;

  UPDATE public.admin_gift_batch_log SET gift_id = v_gift_id WHERE id = v_locked;

  SELECT COALESCE(full_name, username, 'Người dùng') INTO v_name
    FROM public.profiles WHERE id = p_account;

  RETURN jsonb_build_object('ok', true,
    'gift_id', v_gift_id,
    'receiver_id', p_receiver_id,
    'sender_id', p_account,
    'sender_name', v_name,
    'amount', p_amount,
    'gift_key', v_key,
    'new_balance', v_new_bal,
    'receiver_balance', v_recv_bal,
    'status', 'completed');

EXCEPTION
  WHEN sqlstate 'P0001' THEN
    RETURN jsonb_build_object('ok', false,
      'code', CASE
                WHEN SQLERRM LIKE '%INSUFFICIENT_BALANCE%' THEN 'INSUFFICIENT_BALANCE'
                WHEN SQLERRM LIKE '%CLONE_PROFILE_NOT_FOUND%' THEN 'PROFILE_NOT_FOUND'
                ELSE 'GIFT_FAILED'
              END,
      'message', CASE
                WHEN SQLERRM LIKE '%INSUFFICIENT_BALANCE%' THEN 'Tài khoản gửi không đủ Xu.'
                WHEN SQLERRM LIKE '%CLONE_PROFILE_NOT_FOUND%' THEN 'Không thấy ví tài khoản gửi.'
                ELSE 'Không tạo được quà — đã hoàn tác toàn bộ.'
              END);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clone_gift_post_v4(uuid, uuid, uuid, text, bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_clone_gift_post_v4(uuid, uuid, uuid, text, bigint, text) TO authenticated;

COMMIT;
