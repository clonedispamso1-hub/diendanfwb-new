-- =====================================================================
-- FIX: "Bài viết không tồn tại" khi tặng quà sau khi `posts` chuyển sang
--      Supabase #3 (db3).
--
-- Chạy file này trên SUPABASE #1 (db1 — nơi giữ ví/xu/gem, post_gifts,
-- notifications, gem_transactions).
--
-- Thay đổi duy nhất so với `send_post_gift` v1:
--   • KHÔNG còn `SELECT ... FROM public.posts WHERE id = p_post_id`.
--   • Chủ bài viết (`p_receiver_id`) do client truyền vào sau khi ĐÃ xác thực
--     bài viết tồn tại trên Supabase #3.
--   • Không tạo/kiểm tra FOREIGN KEY tới `public.posts` cho luồng này.
-- =====================================================================

DROP FUNCTION IF EXISTS public.send_post_gift_v2(uuid, uuid, text, bigint);
CREATE OR REPLACE FUNCTION public.send_post_gift_v2(
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
  v_notif   uuid;
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

  -- Người nhận phải có ví trên Supabase #1.
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

  INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at)
  VALUES (
    v_to,
    'gift_v1',
    v_item.emoji || ' ' || COALESCE(v_name, 'Ai đó') || ' đã tặng bạn một ' || v_item.name || '.',
    'Giá trị ' || to_char(p_amount, 'FM999,999,999,999') || ' xu. Bấm Nhận để cộng vào ví.',
    jsonb_build_object(
      'kind', 'gift_v1',
      'gift_id', v_gift_id,
      'gift_key', v_item.key,
      'gift_name', v_item.name,
      'emoji', v_item.emoji,
      'effect', v_item.effect,
      'amount', p_amount,
      'status', 'pending',
      'post_id', p_post_id,
      'sender_id', v_from,
      'from_user_id', v_from
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

  SELECT COALESCE(SUM(amount), 0) INTO v_total FROM public.post_gifts WHERE post_id = p_post_id;

  RETURN jsonb_build_object(
    'ok', true, 'gift_id', v_gift_id, 'notif_id', v_notif,
    'amount', p_amount, 'gift_key', v_item.key, 'emoji', v_item.emoji,
    'effect', v_item.effect, 'new_balance', v_new_bal, 'total_gifted', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_post_gift_v2(uuid, uuid, text, bigint) FROM public;
GRANT EXECUTE ON FUNCTION public.send_post_gift_v2(uuid, uuid, text, bigint) TO authenticated;

-- Bỏ ràng buộc FK tới `posts` cho luồng tặng quà (posts nay ở Supabase #3).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.post_gifts'::regclass
       AND contype = 'f'
       AND confrelid = 'public.posts'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.post_gifts DROP CONSTRAINT %I', r.conname);
  END LOOP;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
