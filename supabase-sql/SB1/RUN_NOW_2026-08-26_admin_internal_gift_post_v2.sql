-- =====================================================================
-- CHẠY TRÊN SUPABASE #1 — FIX lỗi `gift_id_invalid` khi clone tặng quà.
--
-- Nguyên nhân: `admin_internal_gift_post` (bản cũ) chỉ trừ xu + ghi
-- gem_transactions, KHÔNG tạo bản ghi `public.post_gifts` và không trả
-- `gift_id` → client không có gift_id hợp lệ để tạo notification ở SB3
-- ⇒ "trừ xu nhưng quà không tới".
--
-- Bản v2 dưới đây:
--   • Người gửi = clone `p_account`; người nhận `p_receiver_id` do app truyền
--     (đã xác thực bài viết trên Supabase #3) → KHÔNG đọc `public.posts` ở SB1.
--   • GIÁ QUÀ do app truyền (`p_amount`) — CÙNG NGUỒN GIÁ với popup user
--     thường. KHÔNG tạo bảng/catalog giá mới, KHÔNG phụ thuộc `gift_items`
--     (DB #1 không có bảng này).
--   • Trừ xu + INSERT `post_gifts` (RETURNING id → gift_id) + gem_transactions
--     trong CÙNG 1 transaction: không tạo được post_gifts ⇒ RAISE ⇒ rollback,
--     không trừ xu.
--   • Idempotent theo `p_idem`: retry KHÔNG trừ xu / KHÔNG tạo quà lần 2,
--     và trả lại đúng `gift_id` cũ.
-- RPC cũ giữ nguyên (không DROP) để không ảnh hưởng nơi khác.
-- Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.admin_gift_batch_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idem_key     text UNIQUE NOT NULL,
  admin_id     uuid,
  account_id   uuid NOT NULL,
  post_id      uuid NOT NULL,
  gift_key     text NOT NULL,
  amount       bigint NOT NULL,
  gift_id      uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_gift_batch_log
  ADD COLUMN IF NOT EXISTS receiver_id uuid;

GRANT SELECT ON public.admin_gift_batch_log TO authenticated;
GRANT ALL ON public.admin_gift_batch_log TO service_role;
ALTER TABLE public.admin_gift_batch_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_gift_batch_log_read ON public.admin_gift_batch_log;
CREATE POLICY admin_gift_batch_log_read ON public.admin_gift_batch_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP FUNCTION IF EXISTS public.admin_internal_gift_post_v2(uuid, uuid, uuid, text, bigint, text);
CREATE OR REPLACE FUNCTION public.admin_internal_gift_post_v2(
  p_account     uuid,
  p_post_id     uuid,
  p_receiver_id uuid,
  p_gift_key    text,
  p_amount      bigint,
  p_idem        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin   uuid := auth.uid();
  v_bal     bigint;
  v_new_bal bigint;
  v_gift_id uuid;
  v_name    text;
  v_key     text := NULLIF(btrim(COALESCE(p_gift_key, '')), '');
  v_idem    text := NULLIF(p_idem, '');
  v_prev    public.admin_gift_batch_log;
BEGIN
  IF v_admin IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_admin AND p.is_admin = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Admin.');
  END IF;

  -- Idempotent: cùng idem_key → trả kết quả cũ (kèm gift_id cũ).
  IF v_idem IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.admin_gift_batch_log WHERE idem_key = v_idem;
    IF v_prev.id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true,
        'gift_id', v_prev.gift_id, 'receiver_id', v_prev.receiver_id,
        'amount', v_prev.amount, 'gift_key', v_prev.gift_key);
    END IF;
  END IF;

  IF p_post_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT',
      'message', 'Thiếu bài viết hoặc loại quà.');
  END IF;
  IF p_receiver_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND',
      'message', 'Không xác định được chủ bài viết.');
  END IF;
  IF p_receiver_id = p_account THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF',
      'message', 'Clone không tự tặng mình.');
  END IF;
  -- Người nhận chỉ cần có ví trên SB1 (KHÔNG chặn vì là user thật).
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND',
      'message', 'Không tìm thấy ví người nhận.');
  END IF;
  -- Giá quà = giá app truyền (cùng nguồn với popup user thường).
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AMOUNT_INVALID',
      'message', 'Số xu không hợp lệ.');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles WHERE id = p_account FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND',
      'message', 'Không thấy ví clone.');
  END IF;
  IF v_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE',
      'message', 'Clone không đủ xu.');
  END IF;

  -- 1) Tạo bản ghi quà TRƯỚC: lỗi ở đây ⇒ exception ⇒ rollback ⇒ KHÔNG trừ xu.
  INSERT INTO public.post_gifts(post_id, from_user_id, receiver_id, amount, gift_key, claimed)
  VALUES (p_post_id, p_account, p_receiver_id, p_amount, v_key, false)
  RETURNING id INTO v_gift_id;

  IF v_gift_id IS NULL THEN
    RAISE EXCEPTION 'GIFT_INSERT_FAILED: không tạo được post_gifts';
  END IF;

  -- 2) Chỉ trừ xu sau khi quà đã có gift_id.
  UPDATE public.profiles SET gem_balance = v_bal - p_amount
   WHERE id = p_account RETURNING gem_balance INTO v_new_bal;

  SELECT COALESCE(full_name, username, 'Người dùng') INTO v_name
    FROM public.profiles WHERE id = p_account;

  -- Lịch sử ví — hỗ trợ cả 2 kiểu schema gem_transactions đang tồn tại.
  BEGIN
    INSERT INTO public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    VALUES (p_account, p_receiver_id, p_amount, 'Tặng quà ' || v_key, 'gift_v1', p_post_id, 'pending', now());
  EXCEPTION WHEN undefined_table OR undefined_column OR check_violation THEN
    BEGIN
      INSERT INTO public.gem_transactions(client_request_id, sender_id, receiver_id, amount, kind, sender_balance_after)
      VALUES (v_idem, p_account, p_receiver_id, p_amount,
              'admin_internal_gift:' || v_key, v_new_bal);
    EXCEPTION WHEN undefined_table OR undefined_column OR check_violation OR unique_violation THEN
      NULL;
    END;
  END;

  IF v_idem IS NOT NULL THEN
    INSERT INTO public.admin_gift_batch_log(idem_key, admin_id, account_id, post_id, gift_key, amount, gift_id, receiver_id)
    VALUES (v_idem, v_admin, p_account, p_post_id, v_key, p_amount, v_gift_id, p_receiver_id)
    ON CONFLICT (idem_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true,
    'gift_id', v_gift_id, 'receiver_id', p_receiver_id, 'sender_name', v_name,
    'amount', p_amount, 'gift_key', v_key, 'new_balance', v_new_bal);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_internal_gift_post_v2(uuid, uuid, uuid, text, bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_internal_gift_post_v2(uuid, uuid, uuid, text, bigint, text) TO authenticated;
