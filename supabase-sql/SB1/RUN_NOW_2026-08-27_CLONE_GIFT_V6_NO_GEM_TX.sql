-- =====================================================================
-- 🎁 CLONE GIFT V6 — CHẠY TRÊN SUPABASE #1 (core/auth/ví)
--
-- KHÁC V5: KHÔNG ghi `gem_transactions` (không dùng cột from_id nữa).
-- Gift Clone chỉ còn đúng 2 luồng:
--   • Clone → USER THẬT: TRỪ Xu clone + `post_gifts` (claimed = false, Xu treo)
--     + trả needs_notification = true ⇒ app ghi notification (chuông).
--     Người nhận bấm "Nhận" ⇒ claim_post_gift_v2 mới cộng Xu + hiệu ứng.
--   • Clone → CLONE: TRỪ Xu clone gửi + CỘNG Xu clone nhận ngay,
--     claimed = true, KHÔNG notification.
--
-- ATOMIC + IDEMPOTENT theo p_idem. Chạy lại nhiều lần vẫn an toàn.
-- KHÔNG đụng luồng user thật tặng nhau (send_post_gift_v2 / claim_post_gift_v2).
-- =====================================================================

BEGIN;

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
ALTER TABLE public.admin_gift_batch_log ADD COLUMN IF NOT EXISTS receiver_id uuid;

GRANT SELECT ON public.admin_gift_batch_log TO authenticated;
GRANT ALL ON public.admin_gift_batch_log TO service_role;
ALTER TABLE public.admin_gift_batch_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_gift_batch_log_read ON public.admin_gift_batch_log;
CREATE POLICY admin_gift_batch_log_read ON public.admin_gift_batch_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

DROP FUNCTION IF EXISTS public.admin_clone_gift_post_v6(uuid, uuid, uuid, text, bigint, text);
CREATE FUNCTION public.admin_clone_gift_post_v6(
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
  v_admin      uuid := auth.uid();
  v_idem       text := NULLIF(btrim(COALESCE(p_idem, '')), '');
  v_key        text := NULLIF(btrim(COALESCE(p_gift_key, '')), '');
  v_bal        bigint;
  v_new_bal    bigint;
  v_recv_bal   bigint;
  v_gift_id    uuid;
  v_name       text;
  v_locked     uuid;
  v_prev       public.admin_gift_batch_log;
  v_recv_src   text;
  v_recv_clone boolean;
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

  SELECT account_source INTO v_recv_src FROM public.profiles WHERE id = p_receiver_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND', 'message', 'Không tìm thấy ví người nhận.');
  END IF;
  v_recv_clone := (COALESCE(v_recv_src, '') = 'internal');

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

  -- (B) Khoá ví clone gửi, kiểm tra số dư.
  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles WHERE id = p_account FOR UPDATE;
  IF v_bal IS NULL THEN
    RAISE EXCEPTION 'CLONE_PROFILE_NOT_FOUND';
  END IF;
  IF v_bal < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  -- (C) Ghi quà. Clone→clone: claimed ngay. Clone→user thật: treo chờ "Nhận".
  INSERT INTO public.post_gifts(post_id, from_user_id, receiver_id, amount, gift_key, claimed, claimed_at)
  VALUES (p_post_id, p_account, p_receiver_id, p_amount, v_key,
          v_recv_clone, CASE WHEN v_recv_clone THEN now() ELSE NULL END)
  RETURNING id INTO v_gift_id;
  IF v_gift_id IS NULL THEN
    RAISE EXCEPTION 'GIFT_INSERT_FAILED';
  END IF;

  -- (D) Trừ Xu clone gửi (luôn luôn).
  UPDATE public.profiles SET gem_balance = v_bal - p_amount
   WHERE id = p_account RETURNING gem_balance INTO v_new_bal;

  -- (E) Chỉ CỘNG Xu ngay khi người nhận cũng là clone.
  IF v_recv_clone THEN
    UPDATE public.profiles SET gem_balance = COALESCE(gem_balance, 0) + p_amount
     WHERE id = p_receiver_id RETURNING gem_balance INTO v_recv_bal;
  ELSE
    v_recv_bal := NULL;
  END IF;

  -- (F) KHÔNG ghi gem_transactions ở luồng Gift Clone (bỏ hẳn from_id).

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
    'receiver_is_clone', v_recv_clone,
    'needs_notification', NOT v_recv_clone,
    'status', CASE WHEN v_recv_clone THEN 'completed' ELSE 'pending' END);

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

REVOKE ALL ON FUNCTION public.admin_clone_gift_post_v6(uuid, uuid, uuid, text, bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_clone_gift_post_v6(uuid, uuid, uuid, text, bigint, text) TO authenticated;

COMMIT;
