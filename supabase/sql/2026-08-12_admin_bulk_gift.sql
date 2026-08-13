-- =====================================================================
-- ADMIN PANEL V5 — Tặng quà hàng loạt bằng "Tài khoản thứ hai" (clone)
-- Chạy 1 lần trong Supabase SQL Editor của DB hiện tại (KHÔNG tạo DB mới).
-- Tái sử dụng đúng hệ thống quà hiện có: gift_items + post_gifts +
-- notifications('gift_v1') + gem_transactions — giống send_post_gift().
-- =====================================================================

-- 1) Bảng chống gửi trùng khi retry -----------------------------------
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

GRANT SELECT ON public.admin_gift_batch_log TO authenticated;
GRANT ALL ON public.admin_gift_batch_log TO service_role;
ALTER TABLE public.admin_gift_batch_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_gift_batch_log_read ON public.admin_gift_batch_log;
CREATE POLICY admin_gift_batch_log_read ON public.admin_gift_batch_log
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin = true));

-- 2) RPC: clone tặng quà cho 1 bài viết -------------------------------
DROP FUNCTION IF EXISTS public.admin_internal_gift_post(uuid, uuid, text, bigint, text);
CREATE OR REPLACE FUNCTION public.admin_internal_gift_post(
  p_account  uuid,
  p_post_id  uuid,
  p_gift_key text,
  p_amount   bigint,
  p_idem     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin   uuid := auth.uid();
  v_from    uuid := p_account;
  v_to      uuid;
  v_item    public.gift_items;
  v_bal     bigint;
  v_new_bal bigint;
  v_gift_id uuid;
  v_notif   uuid;
  v_name    text;
  v_idem    text := COALESCE(NULLIF(p_idem, ''), NULL);
  v_prev    public.admin_gift_batch_log;
BEGIN
  -- Chỉ Admin thật mới được gọi.
  IF v_admin IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_admin AND p.is_admin = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Admin.');
  END IF;

  -- Idempotent: cùng idem_key -> trả kết quả cũ, KHÔNG gửi trùng.
  IF v_idem IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.admin_gift_batch_log WHERE idem_key = v_idem;
    IF v_prev.id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'gift_id', v_prev.gift_id,
                                'amount', v_prev.amount, 'gift_key', v_prev.gift_key);
    END IF;
  END IF;

  SELECT * INTO v_item FROM public.gift_items WHERE key = p_gift_key;
  IF v_item.id IS NULL OR v_item.is_active = false THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GIFT_UNAVAILABLE', 'message', 'Quà không khả dụng.');
  END IF;
  IF p_amount IS NULL OR p_amount < v_item.min_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_LOW',
      'message', 'Tối thiểu ' || v_item.min_amount::text || ' xu cho ' || v_item.name || '.');
  END IF;

  SELECT user_id INTO v_to FROM public.posts WHERE id = p_post_id;
  IF v_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'POST_NOT_FOUND', 'message', 'Bài viết không tồn tại.');
  END IF;
  IF v_to = v_from THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CANNOT_GIFT_SELF', 'message', 'Clone không tự tặng mình.');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);
  PERFORM set_config('app.allow_candy_change', '1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_bal FROM public.profiles WHERE id = v_from FOR UPDATE;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PROFILE_NOT_FOUND', 'message', 'Không thấy ví clone.');
  END IF;
  IF v_bal < p_amount THEN
    -- An toàn: bỏ qua clone thiếu xu, không dừng cả tiến trình.
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Clone không đủ xu.');
  END IF;

  UPDATE public.profiles SET gem_balance = v_bal - p_amount
   WHERE id = v_from RETURNING gem_balance INTO v_new_bal;

  INSERT INTO public.post_gifts(post_id, from_user_id, receiver_id, amount, gift_key, claimed)
  VALUES (p_post_id, v_from, v_to, p_amount, v_item.key, false)
  RETURNING id INTO v_gift_id;

  SELECT COALESCE(full_name, username, 'Người dùng') INTO v_name
    FROM public.profiles WHERE id = v_from;

  INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at)
  VALUES (
    v_to, 'gift_v1',
    v_item.emoji || ' ' || COALESCE(v_name, 'Ai đó') || ' đã tặng bạn một ' || v_item.name || '.',
    'Giá trị ' || to_char(p_amount, 'FM999,999,999,999') || ' xu. Bấm Nhận để cộng vào ví.',
    jsonb_build_object(
      'kind', 'gift_v1', 'gift_id', v_gift_id, 'gift_key', v_item.key,
      'gift_name', v_item.name, 'emoji', v_item.emoji, 'effect', v_item.effect,
      'amount', p_amount, 'status', 'pending', 'post_id', p_post_id,
      'sender_id', v_from, 'from_user_id', v_from
    ),
    false, now()
  ) RETURNING id INTO v_notif;

  UPDATE public.post_gifts SET notif_id = v_notif WHERE id = v_gift_id;

  BEGIN
    INSERT INTO public.gem_transactions(from_id, to_id, amount, note, action_type, post_id, status, created_at)
    VALUES (v_from, v_to, p_amount, 'Tặng quà ' || v_item.name, 'gift_v1', p_post_id, 'pending', now());
  EXCEPTION WHEN undefined_table OR undefined_column OR check_violation THEN
    NULL;
  END;

  IF v_idem IS NOT NULL THEN
    INSERT INTO public.admin_gift_batch_log(idem_key, admin_id, account_id, post_id, gift_key, amount, gift_id)
    VALUES (v_idem, v_admin, v_from, p_post_id, v_item.key, p_amount, v_gift_id)
    ON CONFLICT (idem_key) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'gift_id', v_gift_id, 'notif_id', v_notif,
    'amount', p_amount, 'gift_key', v_item.key, 'emoji', v_item.emoji,
    'new_balance', v_new_bal);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_internal_gift_post(uuid, uuid, text, bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_internal_gift_post(uuid, uuid, text, bigint, text) TO authenticated;

-- 3) Danh sách bài viết để chọn tặng (mới nhất trước) ------------------
DROP FUNCTION IF EXISTS public.admin_internal_gift_posts(int, int);
CREATE OR REPLACE FUNCTION public.admin_internal_gift_posts(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id uuid, user_id uuid, content text, created_at timestamptz,
  author_name text, author_username text, author_avatar text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT po.id, po.user_id, LEFT(COALESCE(po.content, ''), 160), po.created_at,
         pr.full_name, pr.username, pr.avatar_url
    FROM public.posts po
    JOIN public.profiles pr ON pr.id = po.user_id
   WHERE EXISTS (SELECT 1 FROM public.profiles a WHERE a.id = auth.uid() AND a.is_admin = true)
   ORDER BY po.created_at DESC
   LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.admin_internal_gift_posts(int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_internal_gift_posts(int, int) TO authenticated;
