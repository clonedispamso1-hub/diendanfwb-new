-- =====================================================================
-- Task #5.6 – Gói 2: Gift Escrow System
-- Tự chạy trên Supabase SQL Editor. An toàn re-run.
-- =====================================================================

BEGIN;

-- 1. ENUM trạng thái
DO $$ BEGIN
  CREATE TYPE public.message_gift_status AS ENUM
    ('pending','claimed','refunded','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Bảng message_gifts (escrow)
CREATE TABLE IF NOT EXISTS public.message_gifts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   UUID UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gift_key     TEXT NOT NULL,
  gift_name    TEXT NOT NULL,
  gift_emoji   TEXT NOT NULL,
  amount       BIGINT NOT NULL CHECK (amount > 0),
  status       public.message_gift_status NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at   TIMESTAMPTZ,
  refunded_at  TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

CREATE INDEX IF NOT EXISTS idx_message_gifts_receiver ON public.message_gifts(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_message_gifts_sender   ON public.message_gifts(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_message_gifts_msg      ON public.message_gifts(message_id);
CREATE INDEX IF NOT EXISTS idx_message_gifts_expires  ON public.message_gifts(expires_at) WHERE status = 'pending';

GRANT SELECT ON public.message_gifts TO authenticated;
GRANT ALL    ON public.message_gifts TO service_role;

ALTER TABLE public.message_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "msg_gifts_select_own" ON public.message_gifts;
CREATE POLICY "msg_gifts_select_own"
  ON public.message_gifts FOR SELECT
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Realtime (bỏ qua nếu đã add)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_gifts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. RPC: send_message_gift
CREATE OR REPLACE FUNCTION public.send_message_gift(
  p_receiver_id UUID,
  p_gift_key    TEXT,
  p_gift_name   TEXT,
  p_gift_emoji  TEXT,
  p_amount      BIGINT
)
RETURNS TABLE(gift_id UUID, message_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sender UUID := auth.uid();
  v_balance BIGINT;
  v_msg_id UUID;
  v_gift_id UUID;
  v_content TEXT;
BEGIN
  IF v_sender IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_sender = p_receiver_id THEN
    RAISE EXCEPTION 'Cannot gift to yourself' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount' USING ERRCODE = '22023';
  END IF;

  SELECT gem_balance INTO v_balance
  FROM public.profiles WHERE id = v_sender FOR UPDATE;

  IF COALESCE(v_balance, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance' USING ERRCODE = '53100';
  END IF;

  UPDATE public.profiles
     SET gem_balance = gem_balance - p_amount
   WHERE id = v_sender;

  v_content := '🎁 ' || p_gift_emoji || ' ' || p_gift_name;

  INSERT INTO public.messages (sender_id, receiver_id, content, is_read)
  VALUES (v_sender, p_receiver_id, v_content, false)
  RETURNING id INTO v_msg_id;

  INSERT INTO public.message_gifts
    (message_id, sender_id, receiver_id, gift_key, gift_name, gift_emoji, amount, status)
  VALUES
    (v_msg_id, v_sender, p_receiver_id, p_gift_key, p_gift_name, p_gift_emoji, p_amount, 'pending')
  RETURNING id INTO v_gift_id;

  INSERT INTO public.gem_transactions
    (from_id, to_id, amount, action_type, note, metadata)
  VALUES
    (v_sender, NULL, p_amount, 'gift_send_pending',
     'Đã gửi ' || p_gift_name,
     jsonb_build_object(
       'gift_id', v_gift_id, 'message_id', v_msg_id,
       'gift_key', p_gift_key, 'gift_emoji', p_gift_emoji,
       'receiver_id', p_receiver_id
     ));

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  VALUES (
    p_receiver_id,
    'gift_received_pending',
    'Bạn nhận được quà 🎁',
    (SELECT COALESCE(full_name, username, 'Ai đó') FROM public.profiles WHERE id = v_sender)
      || ' vừa tặng bạn ' || p_gift_emoji || ' ' || p_gift_name
      || ' (' || p_amount || '⭐)',
    jsonb_build_object(
      'kind', 'gift_received_pending',
      'gift_id', v_gift_id, 'message_id', v_msg_id,
      'sender_id', v_sender, 'amount', p_amount
    ),
    false
  );

  RETURN QUERY SELECT v_gift_id, v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.send_message_gift(UUID, TEXT, TEXT, TEXT, BIGINT) TO authenticated;

-- 4. RPC: claim_message_gift
CREATE OR REPLACE FUNCTION public.claim_message_gift(p_gift_id UUID)
RETURNS public.message_gifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_gift public.message_gifts;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_gift FROM public.message_gifts
   WHERE id = p_gift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_gift.receiver_id <> v_uid THEN
    RAISE EXCEPTION 'Not the receiver' USING ERRCODE = '42501';
  END IF;
  IF v_gift.status <> 'pending' THEN
    RAISE EXCEPTION 'Gift already processed: %', v_gift.status USING ERRCODE = '22023';
  END IF;
  IF v_gift.expires_at < now() THEN
    UPDATE public.message_gifts SET status = 'expired' WHERE id = v_gift.id;
    RAISE EXCEPTION 'Gift expired' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_gift.amount
   WHERE id = v_uid;

  UPDATE public.message_gifts
     SET status = 'claimed', claimed_at = now()
   WHERE id = v_gift.id
   RETURNING * INTO v_gift;

  INSERT INTO public.gem_transactions
    (from_id, to_id, amount, action_type, note, metadata)
  VALUES
    (NULL, v_gift.receiver_id, v_gift.amount, 'gift_receive',
     'Đã nhận ' || v_gift.gift_name,
     jsonb_build_object(
       'gift_id', v_gift.id, 'message_id', v_gift.message_id,
       'gift_key', v_gift.gift_key, 'gift_emoji', v_gift.gift_emoji
     ));

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  VALUES (
    v_gift.sender_id,
    'gift_claimed',
    'Quà đã được nhận 🎉',
    (SELECT COALESCE(full_name, username, 'Người nhận') FROM public.profiles WHERE id = v_uid)
      || ' đã nhận quà ' || v_gift.gift_emoji || ' ' || v_gift.gift_name || ' của bạn.',
    jsonb_build_object(
      'kind', 'gift_claimed',
      'gift_id', v_gift.id, 'message_id', v_gift.message_id,
      'receiver_id', v_uid, 'amount', v_gift.amount
    ),
    false
  );

  RETURN v_gift;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_message_gift(UUID) TO authenticated;

-- 5. RPC: refund_message_gift (idempotent, chỉ chạy khi đã hết hạn)
CREATE OR REPLACE FUNCTION public.refund_message_gift(p_gift_id UUID)
RETURNS public.message_gifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gift public.message_gifts;
BEGIN
  SELECT * INTO v_gift FROM public.message_gifts
   WHERE id = p_gift_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gift not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_gift.status <> 'pending' THEN
    RETURN v_gift;
  END IF;
  IF v_gift.expires_at > now() THEN
    RAISE EXCEPTION 'Gift not yet expired' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance,0) + v_gift.amount
   WHERE id = v_gift.sender_id;

  UPDATE public.message_gifts
     SET status = 'refunded', refunded_at = now()
   WHERE id = v_gift.id
   RETURNING * INTO v_gift;

  INSERT INTO public.gem_transactions
    (from_id, to_id, amount, action_type, note, metadata)
  VALUES
    (NULL, v_gift.sender_id, v_gift.amount, 'gift_refund',
     'Hoàn quà ' || v_gift.gift_name,
     jsonb_build_object(
       'gift_id', v_gift.id, 'message_id', v_gift.message_id,
       'gift_key', v_gift.gift_key
     ));

  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  VALUES (
    v_gift.sender_id,
    'gift_refunded',
    'Quà đã được hoàn ⏳',
    'Quà ' || v_gift.gift_emoji || ' ' || v_gift.gift_name
      || ' đã được hoàn về ví vì người nhận không nhận trong 7 ngày.',
    jsonb_build_object(
      'kind', 'gift_refunded',
      'gift_id', v_gift.id, 'amount', v_gift.amount
    ),
    false
  );

  RETURN v_gift;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refund_message_gift(UUID) TO authenticated;

-- 6. RPC: sweep_expired_gifts – dọn hàng loạt (client hoặc pg_cron gọi)
CREATE OR REPLACE FUNCTION public.sweep_expired_gifts()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.message_gifts
     WHERE status = 'pending' AND expires_at < now()
     LIMIT 100
  LOOP
    PERFORM public.refund_message_gift(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sweep_expired_gifts() TO authenticated;

COMMIT;
