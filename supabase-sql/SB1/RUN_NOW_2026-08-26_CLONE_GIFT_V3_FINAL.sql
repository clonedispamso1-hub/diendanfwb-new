-- =====================================================================
-- 🎁 CLONE GIFT V3 — FINAL (CHẠY 1 LẦN TRÊN SUPABASE #1)
--
-- Mục tiêu:
--   • Clone (tài khoản thứ hai) có Xu → tặng quà cho MỌI bài viết:
--     user thật / clone / admin. Không phân biệt loại người nhận.
--   • Giá quà do app truyền vào (p_amount) — CÙNG NGUỒN GIÁ với popup quà
--     của user thường. KHÔNG đọc/phụ thuộc bảng `gift_items`.
--   • ATOMIC: khoá idempotency + tạo `post_gifts` + trừ Xu + ghi lịch sử ví
--     nằm trong CÙNG 1 transaction. Bất kỳ lỗi nào ⇒ rollback toàn bộ
--     (không trừ Xu, không quà mồ côi).
--   • Retry an toàn: cùng `p_idem` ⇒ KHÔNG trừ Xu lần 2, KHÔNG tạo quà lần 2,
--     trả lại đúng `gift_id` cũ để app không tạo notification trùng.
--   • Notification: app gọi ĐÚNG RPC `notify_post_gift_v5` ở Supabase #3
--     (idempotent theo gift_id) — giống hệt luồng user thường. RPC này KHÔNG
--     tự ghi notifications ở SB1 (tránh overload / bảng sai DB).
--
-- Dọn rác: DROP các RPC gift-clone cũ không còn dùng.
-- Chạy lại nhiều lần vẫn an toàn.
-- =====================================================================

BEGIN;

-- 1) Sổ chống trùng (idempotency) --------------------------------------
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

-- 2) RPC DUY NHẤT của luồng tặng quà bằng clone -------------------------
DROP FUNCTION IF EXISTS public.admin_clone_gift_post_v3(uuid, uuid, uuid, text, bigint, text);
CREATE FUNCTION public.admin_clone_gift_post_v3(
  p_account     uuid,   -- clone gửi quà
  p_post_id     uuid,   -- bài viết (nằm ở Supabase #3)
  p_receiver_id uuid,   -- chủ bài viết: user thật / clone / admin
  p_gift_key    text,
  p_amount      bigint, -- giá quà hiện tại của website
  p_idem        text    -- BẮT BUỘC: khoá chống trùng khi retry
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
  v_gift_id  uuid;
  v_name     text;
  v_locked   uuid;
  v_prev     public.admin_gift_batch_log;
BEGIN
  -- Chỉ Admin thật được gọi.
  IF v_admin IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_admin AND p.is_admin = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Admin.');
  END IF;

  IF v_idem IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'IDEM_REQUIRED',
      'message', 'Thiếu khoá chống trùng.');
  END IF;
  IF p_account IS NULL OR p_post_id IS NULL OR v_key IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_INPUT',
      'message', 'Thiếu tài khoản gửi, bài viết hoặc loại quà.');
  END IF;
  IF p_receiver_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND',
      'message', 'Không xác định được chủ bài viết.');
  END IF;
  IF p_receiver_id = p_account THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF',
      'message', 'Không tự tặng chính mình.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AMOUNT_INVALID',
      'message', 'Số Xu không hợp lệ.');
  END IF;
  -- Người nhận chỉ cần có ví trên SB1 (user thật / clone / admin đều được).
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND',
      'message', 'Không tìm thấy ví người nhận.');
  END IF;

  -- (A) CHỐT IDEMPOTENCY TRƯỚC MỌI THAY ĐỔI.
  -- Retry / gọi song song cùng idem_key ⇒ không chèn được ⇒ trả kết quả cũ.
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

  -- (B) Khoá ví clone và kiểm tra số dư.
  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles WHERE id = p_account FOR UPDATE;
  IF v_bal IS NULL THEN
    RAISE EXCEPTION 'CLONE_PROFILE_NOT_FOUND';
  END IF;
  IF v_bal < p_amount THEN
    -- Rollback cả dòng idempotency: lượt này chưa xảy ra, cho phép thử lại.
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  -- (C) Tạo quà pending (đúng bảng của luồng user thường).
  INSERT INTO public.post_gifts(post_id, from_user_id, receiver_id, amount, gift_key, claimed)
  VALUES (p_post_id, p_account, p_receiver_id, p_amount, v_key, false)
  RETURNING id INTO v_gift_id;
  IF v_gift_id IS NULL THEN
    RAISE EXCEPTION 'GIFT_INSERT_FAILED';
  END IF;

  -- (D) Trừ Xu của clone.
  UPDATE public.profiles SET gem_balance = v_bal - p_amount
   WHERE id = p_account RETURNING gem_balance INTO v_new_bal;

  -- (E) Lịch sử ví — cùng định dạng với quà của user thường ('gift_v1').
  INSERT INTO public.gem_transactions(
    from_id, to_id, amount, note, action_type, post_id, status, created_at
  )
  VALUES (p_account, p_receiver_id, p_amount, 'Tặng quà ' || v_key,
          'gift_v1', p_post_id, 'pending', now());

  -- (F) Ghi gift_id vào sổ chống trùng để retry trả lại đúng quà cũ.
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
    'needs_notification', true,
    'status', 'pending');

EXCEPTION
  WHEN sqlstate 'P0001' THEN
    -- Lỗi nghiệp vụ do RAISE ở trên: transaction đã rollback sạch.
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

REVOKE ALL ON FUNCTION public.admin_clone_gift_post_v3(uuid, uuid, uuid, text, bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_clone_gift_post_v3(uuid, uuid, uuid, text, bigint, text) TO authenticated;

-- 3) DỌN RÁC — các RPC gift clone cũ không còn nơi nào gọi --------------
DROP FUNCTION IF EXISTS public.admin_internal_gift_post_v2(uuid, uuid, uuid, text, bigint, text);
DROP FUNCTION IF EXISTS public.admin_internal_gift_post(uuid, uuid, text, bigint, text);
DROP FUNCTION IF EXISTS public.admin_internal_gift_posts(int, int);

COMMIT;

-- Kiểm tra nhanh sau khi chạy:
--   SELECT proname FROM pg_proc WHERE proname LIKE '%gift_post%';
--   → chỉ còn: send_post_gift_v2, admin_clone_gift_post_v3 (và claim_*).
