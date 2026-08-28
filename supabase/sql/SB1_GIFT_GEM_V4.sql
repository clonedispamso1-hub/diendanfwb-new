-- =====================================================================
-- 🎁 SB1_GIFT_GEM_V4 — NGUỒN SỰ THẬT DUY NHẤT CHO TIỀN & QUÀ (Supabase #1)
-- Chạy nguyên khối trong SQL Editor của SB1. An toàn khi chạy lại nhiều lần.
--
-- Nguyên tắc:
--   • sender LUÔN = auth.uid(); client KHÔNG được truyền sender_id.
--   • Một transaction duy nhất: lock ví (FOR UPDATE) → kiểm tra đủ Gem →
--     trừ sender → cộng receiver → ghi gem_transactions → ghi post_gifts →
--     ghi outbox event 'gift_notification_pending'.
--   • idempotency_key UNIQUE: double-click / retry / refresh không thể
--     giao dịch hai lần.
--   • Lỗi bất kỳ bước nào → RAISE → rollback toàn bộ (không ghi nửa vời).
--   • Notification nằm ở SB3, chỉ được tạo bởi backend qua outbox (xem
--     SB3_GIFT_NOTIFICATIONS_V4.sql). Frontend KHÔNG được insert.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1) OUTBOX — hàng đợi event để backend tạo notification ở SB3
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gift_outbox (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type       text NOT NULL,
  idempotency_key  text NOT NULL UNIQUE,        -- = idempotency_key của giao dịch
  aggregate_id     uuid,                        -- gift_id / gem_transaction_id
  payload          jsonb NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempts         int  NOT NULL DEFAULT 0,
  last_error       text,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  locked_at        timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);

CREATE INDEX IF NOT EXISTS gift_outbox_due_idx
  ON public.gift_outbox (next_attempt_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.gift_outbox ENABLE ROW LEVEL SECURITY;
-- Không có policy cho anon/authenticated → client tuyệt đối không đọc/ghi.
REVOKE ALL ON public.gift_outbox FROM anon, authenticated;
GRANT ALL ON public.gift_outbox TO service_role;

-- ---------------------------------------------------------------------
-- 2) post_gifts — external reference sang posts ở SB3 (KHÔNG FK)
-- ---------------------------------------------------------------------
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS gift_key        text;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS receiver_id     uuid;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS event_id        uuid;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS context         text;
ALTER TABLE public.post_gifts ADD COLUMN IF NOT EXISTS gem_tx_id       uuid;

-- Chốt kiến trúc: KHÔNG có foreign key sang posts (posts sống ở SB3).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'post_gifts' AND c.contype = 'f'
       AND pg_get_constraintdef(c.oid) ILIKE '%REFERENCES%posts%'
  LOOP
    EXECUTE format('ALTER TABLE public.post_gifts DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS post_gifts_idem_uidx
  ON public.post_gifts (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS post_gifts_event_uidx
  ON public.post_gifts (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS post_gifts_receiver_idx ON public.post_gifts (receiver_id);
CREATE INDEX IF NOT EXISTS post_gifts_post_idx     ON public.post_gifts (post_id);

ALTER TABLE public.post_gifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS post_gifts_read_all ON public.post_gifts;
CREATE POLICY post_gifts_read_all ON public.post_gifts FOR SELECT USING (true);
-- Không có policy INSERT/UPDATE/DELETE: chỉ RPC SECURITY DEFINER được ghi.
REVOKE INSERT, UPDATE, DELETE ON public.post_gifts FROM anon, authenticated;
GRANT SELECT ON public.post_gifts TO anon, authenticated;
GRANT ALL ON public.post_gifts TO service_role;

-- gem_transactions.client_request_id là khoá idempotency của sổ cái ví.
ALTER TABLE public.gem_transactions ADD COLUMN IF NOT EXISTS client_request_id text;
ALTER TABLE public.gem_transactions ADD COLUMN IF NOT EXISTS event_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS gem_tx_client_request_uidx
  ON public.gem_transactions (client_request_id) WHERE client_request_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 3) Helper — chuẩn hoá & kiểm tra idempotency key
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._gift_norm_idem(p_key text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(btrim(COALESCE(p_key, '')), '');
$$;

-- ---------------------------------------------------------------------
-- 4) RPC DUY NHẤT: gift_send_v4
--    Dùng cho Feed / Profile / VIP. post_id có thể NULL (tặng trực tiếp
--    vào profile / phòng VIP) — khi đó chỉ ghi ví + gift record.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.gift_send_v4(uuid, text, bigint, text, uuid, text);
CREATE OR REPLACE FUNCTION public.gift_send_v4(
  p_receiver_id     uuid,
  p_gift_key        text,
  p_amount          bigint,
  p_idempotency_key text,
  p_post_id         uuid DEFAULT NULL,
  p_context         text DEFAULT 'feed'         -- 'feed' | 'profile' | 'vip'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender     uuid := auth.uid();
  v_idem       text := public._gift_norm_idem(p_idempotency_key);
  v_item       public.gift_items;
  v_sender_bal bigint;
  v_recv_bal   bigint;
  v_gift_id    uuid;
  v_tx_id      uuid;
  v_event_id   uuid;
  v_sender_nm  text;
  v_existing   public.post_gifts;
BEGIN
  -- --- 4.1 xác thực người gửi (client không được truyền sender) ---------
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED',
                              'message', 'Bạn cần đăng nhập.');
  END IF;
  IF v_idem IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_REQUIRED',
                              'message', 'Thiếu idempotency key.');
  END IF;
  IF p_receiver_id IS NULL OR p_receiver_id = v_sender THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_INVALID',
                              'message', 'Người nhận không hợp lệ.');
  END IF;
  IF COALESCE(p_context, '') NOT IN ('feed', 'profile', 'vip') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CONTEXT_INVALID',
                              'message', 'Nguồn tặng quà không hợp lệ.');
  END IF;

  -- --- 4.2 idempotency: trả lại kết quả cũ, KHÔNG trừ lần hai ----------
  SELECT * INTO v_existing FROM public.post_gifts WHERE idempotency_key = v_idem;
  IF v_existing.id IS NOT NULL THEN
    SELECT COALESCE(gem_balance, 0) INTO v_sender_bal
      FROM public.profiles WHERE id = v_sender;
    RETURN jsonb_build_object(
      'ok', true, 'duplicate', true,
      'gift_id', v_existing.id, 'event_id', v_existing.event_id,
      'receiver_id', v_existing.receiver_id, 'gift_key', v_existing.gift_key,
      'amount', v_existing.amount, 'new_balance', v_sender_bal
    );
  END IF;

  -- --- 4.3 catalog quà ------------------------------------------------
  SELECT * INTO v_item FROM public.gift_items
   WHERE key = p_gift_key AND is_active = true
     AND (event_ends_at IS NULL OR event_ends_at > now());
  IF v_item.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GIFT_INVALID',
                              'message', 'Quà không tồn tại hoặc đã hết hạn.');
  END IF;
  IF p_amount IS NULL OR p_amount < v_item.min_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AMOUNT_TOO_LOW',
             'message', format('Tối thiểu %s xu cho %s.', v_item.min_amount, v_item.name));
  END IF;

  -- --- 4.4 receiver phải tồn tại (server-side, không tin client) -------
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND',
                              'message', 'Không tìm thấy người nhận.');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);

  -- --- 4.5 LOCK ví theo thứ tự id cố định (chống deadlock) -------------
  PERFORM 1 FROM public.profiles
   WHERE id IN (v_sender, p_receiver_id)
   ORDER BY id
     FOR UPDATE;

  SELECT COALESCE(gem_balance, 0) INTO v_sender_bal
    FROM public.profiles WHERE id = v_sender;

  IF v_sender_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_GEM',
             'message', 'Bạn không đủ xu.', 'balance', v_sender_bal);
  END IF;

  -- --- 4.6 chuyển Gem --------------------------------------------------
  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) - p_amount, updated_at = now()
   WHERE id = v_sender
  RETURNING gem_balance INTO v_sender_bal;

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + p_amount, updated_at = now()
   WHERE id = p_receiver_id
  RETURNING gem_balance INTO v_recv_bal;

  IF v_sender_bal IS NULL OR v_recv_bal IS NULL OR v_sender_bal < 0 THEN
    RAISE EXCEPTION 'GIFT_BALANCE_UPDATE_FAILED';   -- rollback toàn bộ
  END IF;

  v_event_id := gen_random_uuid();

  -- --- 4.7 sổ cái ví ---------------------------------------------------
  INSERT INTO public.gem_transactions(
    client_request_id, event_id, sender_id, receiver_id, amount, kind,
    sender_balance_after, receiver_balance_after
  )
  VALUES (
    v_idem, v_event_id, v_sender, p_receiver_id, p_amount,
    'gift:' || v_item.key, v_sender_bal, v_recv_bal
  )
  RETURNING id INTO v_tx_id;

  -- --- 4.8 gift record (post_id là external reference sang SB3) --------
  INSERT INTO public.post_gifts(
    post_id, from_user_id, receiver_id, amount, gift_key,
    event_id, idempotency_key, context, gem_tx_id
  )
  VALUES (
    p_post_id, v_sender, p_receiver_id, p_amount, v_item.key,
    v_event_id, v_idem, p_context, v_tx_id
  )
  RETURNING id INTO v_gift_id;

  SELECT COALESCE(display_name, full_name, username, 'Người dùng')
    INTO v_sender_nm FROM public.profiles WHERE id = v_sender;

  -- --- 4.9 outbox event (backend sẽ tạo notification ở SB3) ------------
  INSERT INTO public.gift_outbox(event_type, idempotency_key, aggregate_id, payload)
  VALUES (
    'gift_notification_pending', v_idem, v_gift_id,
    jsonb_build_object(
      'event_id',    v_event_id,
      'gift_id',     v_gift_id,
      'gem_tx_id',   v_tx_id,
      'sender_id',   v_sender,
      'sender_name', v_sender_nm,
      'receiver_id', p_receiver_id,
      'post_id',     p_post_id,
      'context',     p_context,
      'gift_key',    v_item.key,
      'gift_name',   v_item.name,
      'emoji',       v_item.emoji,
      'effect',      v_item.effect,
      'amount',      p_amount
    )
  );

  RETURN jsonb_build_object(
    'ok', true, 'duplicate', false,
    'gift_id', v_gift_id, 'gem_tx_id', v_tx_id, 'event_id', v_event_id,
    'receiver_id', p_receiver_id, 'gift_key', v_item.key,
    'gift_name', v_item.name, 'emoji', v_item.emoji, 'effect', v_item.effect,
    'amount', p_amount, 'new_balance', v_sender_bal
  );
END $$;

REVOKE ALL ON FUNCTION public.gift_send_v4(uuid, text, bigint, text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.gift_send_v4(uuid, text, bigint, text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 5) RPC chuyển Gem trực tiếp — cùng tiêu chuẩn (atomic + idempotent)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.gem_transfer_v4(uuid, bigint, text, text);
CREATE OR REPLACE FUNCTION public.gem_transfer_v4(
  p_receiver_id     uuid,
  p_amount          bigint,
  p_idempotency_key text,
  p_note            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sender     uuid := auth.uid();
  v_idem       text := public._gift_norm_idem(p_idempotency_key);
  v_sender_bal bigint;
  v_recv_bal   bigint;
  v_tx_id      uuid;
  v_event_id   uuid;
  v_dup        public.gem_transactions;
BEGIN
  IF v_sender IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED',
                              'message', 'Bạn cần đăng nhập.');
  END IF;
  IF v_idem IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'IDEMPOTENCY_REQUIRED',
                              'message', 'Thiếu idempotency key.');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT',
                              'message', 'Số xu không hợp lệ.');
  END IF;
  IF p_receiver_id IS NULL OR p_receiver_id = v_sender THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_INVALID',
                              'message', 'Người nhận không hợp lệ.');
  END IF;

  SELECT * INTO v_dup FROM public.gem_transactions WHERE client_request_id = v_idem;
  IF v_dup.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true,
      'gem_tx_id', v_dup.id, 'event_id', v_dup.event_id, 'amount', v_dup.amount,
      'new_balance', v_dup.sender_balance_after);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_receiver_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RECEIVER_NOT_FOUND',
                              'message', 'Không tìm thấy người nhận.');
  END IF;

  PERFORM set_config('app.allow_gem_change', '1', true);

  PERFORM 1 FROM public.profiles
   WHERE id IN (v_sender, p_receiver_id) ORDER BY id FOR UPDATE;

  SELECT COALESCE(gem_balance, 0) INTO v_sender_bal
    FROM public.profiles WHERE id = v_sender;
  IF v_sender_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_GEM',
             'message', 'Bạn không đủ xu.', 'balance', v_sender_bal);
  END IF;

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) - p_amount, updated_at = now()
   WHERE id = v_sender RETURNING gem_balance INTO v_sender_bal;
  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + p_amount, updated_at = now()
   WHERE id = p_receiver_id RETURNING gem_balance INTO v_recv_bal;

  IF v_sender_bal IS NULL OR v_recv_bal IS NULL OR v_sender_bal < 0 THEN
    RAISE EXCEPTION 'GEM_TRANSFER_UPDATE_FAILED';
  END IF;

  v_event_id := gen_random_uuid();

  INSERT INTO public.gem_transactions(
    client_request_id, event_id, sender_id, receiver_id, amount, kind,
    sender_balance_after, receiver_balance_after
  )
  VALUES (v_idem, v_event_id, v_sender, p_receiver_id, p_amount, 'transfer',
          v_sender_bal, v_recv_bal)
  RETURNING id INTO v_tx_id;

  INSERT INTO public.gift_outbox(event_type, idempotency_key, aggregate_id, payload)
  VALUES ('gift_notification_pending', v_idem, v_tx_id,
    jsonb_build_object(
      'event_id', v_event_id, 'gem_tx_id', v_tx_id, 'kind', 'gem_transfer',
      'sender_id', v_sender, 'receiver_id', p_receiver_id,
      'amount', p_amount, 'note', NULLIF(btrim(COALESCE(p_note, '')), '')
    ));

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'gem_tx_id', v_tx_id,
    'event_id', v_event_id, 'amount', p_amount, 'new_balance', v_sender_bal);
END $$;

REVOKE ALL ON FUNCTION public.gem_transfer_v4(uuid, bigint, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.gem_transfer_v4(uuid, bigint, text, text) TO authenticated;

-- ---------------------------------------------------------------------
-- 6) OUTBOX WORKER API — chỉ service_role (Edge Function/backend)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gift_outbox_claim(p_limit int DEFAULT 25)
RETURNS SETOF public.gift_outbox
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.gift_outbox o
     SET status = 'processing', locked_at = now(), attempts = o.attempts + 1
   WHERE o.id IN (
     SELECT id FROM public.gift_outbox
      WHERE status IN ('pending', 'processing')
        AND next_attempt_at <= now()
      ORDER BY created_at
      LIMIT GREATEST(COALESCE(p_limit, 25), 1)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING o.*;
$$;

CREATE OR REPLACE FUNCTION public.gift_outbox_mark_sent(p_id uuid, p_notification_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.gift_outbox
     SET status = 'sent', sent_at = now(), last_error = NULL, locked_at = NULL,
         payload = payload || jsonb_build_object('notification_id', p_notification_id)
   WHERE id = p_id;
$$;

-- Retry với backoff luỹ tiến: 30s, 2m, 8m, 32m, ... tối đa 6h.
CREATE OR REPLACE FUNCTION public.gift_outbox_mark_failed(p_id uuid, p_error text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.gift_outbox
     SET status = 'pending',            -- LUÔN giữ pending để retry
         last_error = left(COALESCE(p_error, 'unknown'), 2000),
         locked_at = NULL,
         next_attempt_at = now()
           + make_interval(secs => LEAST(21600, 30 * power(4, LEAST(attempts, 6))::int))
   WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.gift_outbox_claim(int) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.gift_outbox_mark_sent(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.gift_outbox_mark_failed(uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gift_outbox_claim(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_outbox_mark_sent(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.gift_outbox_mark_failed(uuid, text) TO service_role;

COMMIT;

-- =====================================================================
-- 7) PHASE 2 — DỌN FLOW CŨ.
--    CHỈ chạy SAU KHI frontend đã cutover 100% sang gift_send_v4 /
--    gem_transfer_v4 (nếu chạy sớm, các nút tặng quà cũ sẽ lỗi ngay).
-- =====================================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.send_post_gift(uuid, text, bigint);
-- DROP FUNCTION IF EXISTS public.send_post_gift_v2(uuid, uuid, text, bigint);
-- DROP FUNCTION IF EXISTS public.gift_gem_to_post_v3(uuid, uuid, bigint, text);
-- DROP FUNCTION IF EXISTS public.gift_gem_to_post(uuid, bigint, text);
-- DROP FUNCTION IF EXISTS public.claim_post_gift(uuid);
-- DROP FUNCTION IF EXISTS public.claim_gift_v2(uuid);
-- DROP FUNCTION IF EXISTS public.claim_gift_v3(uuid);
-- DROP FUNCTION IF EXISTS public.secure_gem_transfer(uuid, bigint, text);
-- COMMIT;
