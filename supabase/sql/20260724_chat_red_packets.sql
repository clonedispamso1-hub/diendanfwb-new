-- =====================================================================
-- 2026-07-24  Chat Red Packets (Bao Lì Xì WeChat-style)
--
-- Run in Supabase SQL Editor. Idempotent.
--
-- Cấu trúc:
--   * chat_red_packets   — mỗi bao lì xì gửi trong DM
--   * RPC send_chat_red_packet(receiver, amount, wish)
--       - Kiểm tra số dư người gửi, trừ gem_balance NGAY LẬP TỨC.
--       - Chèn message có content = '[[HONGBAO:<packet_id>]]' vào bảng messages
--         → tận dụng hạ tầng chat sẵn có (realtime, danh sách chat, RLS).
--       - Trả về packet_id, message_id, new_balance.
--   * RPC open_chat_red_packet(packet_id)
--       - LOCK dòng packet, kiểm tra trạng thái. Nếu đã 'opened' → chỉ trả
--         thông tin, KHÔNG cộng tiền lần hai.
--       - Nếu 'waiting' → cập nhật 'opened', cộng gem_balance người nhận,
--         tất cả trong 1 transaction. Chống race / double-click.
--   * RPC get_chat_red_packet(packet_id) — đọc trạng thái (RLS: chỉ 2 bên).
--
-- Guard trigger `app.allow_gem_change` (đang tồn tại) được bypass bằng
-- set_config transaction-local, y hệt các RPC gem khác.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.chat_red_packets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount       bigint NOT NULL CHECK (amount >= 1000),
  wish         text,
  status       text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','opened','expired')),
  message_id   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  opened_at    timestamptz
);
CREATE INDEX IF NOT EXISTS chat_red_packets_sender_idx   ON public.chat_red_packets(sender_id);
CREATE INDEX IF NOT EXISTS chat_red_packets_receiver_idx ON public.chat_red_packets(receiver_id);

GRANT SELECT ON public.chat_red_packets TO authenticated;
GRANT ALL    ON public.chat_red_packets TO service_role;

ALTER TABLE public.chat_red_packets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_red_packets_select_own ON public.chat_red_packets;
CREATE POLICY chat_red_packets_select_own
  ON public.chat_red_packets
  FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- =====================================================================
-- send_chat_red_packet
-- =====================================================================
CREATE OR REPLACE FUNCTION public.send_chat_red_packet(
  p_receiver_id uuid,
  p_amount      bigint,
  p_wish        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_bal    bigint;
  v_new    bigint;
  v_pid    uuid;
  v_mid    uuid;
  v_wish   text;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED', 'message', 'Chưa đăng nhập');
  END IF;
  IF p_receiver_id IS NULL OR p_receiver_id = v_me THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_RECEIVER', 'message', 'Không thể tự gửi cho mình');
  END IF;
  IF p_amount IS NULL OR p_amount < 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT', 'message', 'Số Xu tối thiểu là 1.000');
  END IF;

  v_wish := NULLIF(btrim(COALESCE(p_wish, '')), '');
  IF v_wish IS NOT NULL AND char_length(v_wish) > 100 THEN
    v_wish := left(v_wish, 100);
  END IF;

  PERFORM set_config('app.allow_gem_change',  '1', true);
  PERFORM set_config('app.allow_candy_change','1', true);

  SELECT COALESCE(gem_balance, 0) INTO v_bal
    FROM public.profiles WHERE id = v_me FOR UPDATE;
  IF v_bal < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'message', 'Số dư không đủ');
  END IF;

  UPDATE public.profiles
     SET gem_balance = v_bal - p_amount
   WHERE id = v_me
   RETURNING gem_balance INTO v_new;

  INSERT INTO public.chat_red_packets(sender_id, receiver_id, amount, wish, status)
    VALUES (v_me, p_receiver_id, p_amount, v_wish, 'waiting')
    RETURNING id INTO v_pid;

  -- Chèn message với marker để chat UI render card
  INSERT INTO public.messages(sender_id, receiver_id, content, is_read, created_at)
    VALUES (v_me, p_receiver_id, '[[HONGBAO:' || v_pid::text || ']]', false, now())
    RETURNING id INTO v_mid;

  UPDATE public.chat_red_packets SET message_id = v_mid WHERE id = v_pid;

  RETURN jsonb_build_object(
    'ok', true,
    'packet_id', v_pid,
    'message_id', v_mid,
    'amount', p_amount,
    'wish', v_wish,
    'new_balance', v_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.send_chat_red_packet(uuid, bigint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.send_chat_red_packet(uuid, bigint, text) TO authenticated;

-- =====================================================================
-- open_chat_red_packet — ATOMIC, chống double-open/race
-- =====================================================================
CREATE OR REPLACE FUNCTION public.open_chat_red_packet(
  p_packet_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_pkt  public.chat_red_packets%rowtype;
  v_new  bigint;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;

  SELECT * INTO v_pkt
    FROM public.chat_red_packets
   WHERE id = p_packet_id
   FOR UPDATE;

  IF v_pkt.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Bao lì xì không tồn tại');
  END IF;
  IF v_pkt.receiver_id <> v_me THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Bạn không phải người nhận');
  END IF;

  -- Đã mở → chỉ trả thông tin, tuyệt đối KHÔNG cộng tiền lần hai.
  IF v_pkt.status = 'opened' THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_opened', true,
      'amount', v_pkt.amount,
      'wish', v_pkt.wish,
      'opened_at', v_pkt.opened_at
    );
  END IF;
  IF v_pkt.status <> 'waiting' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Bao lì xì không khả dụng');
  END IF;

  -- Cập nhật trạng thái TRƯỚC khi cộng tiền — nếu 2 request đồng thời, chỉ 1
  -- thắng row-lock, request còn lại sẽ đọc status='opened' và rơi vào nhánh
  -- already_opened ở trên.
  UPDATE public.chat_red_packets
     SET status = 'opened',
         opened_at = now()
   WHERE id = p_packet_id AND status = 'waiting';

  IF NOT FOUND THEN
    -- Ai đó đã mở giữa chừng — trả về trạng thái mới.
    SELECT * INTO v_pkt FROM public.chat_red_packets WHERE id = p_packet_id;
    RETURN jsonb_build_object(
      'ok', true,
      'already_opened', true,
      'amount', v_pkt.amount,
      'wish', v_pkt.wish,
      'opened_at', v_pkt.opened_at
    );
  END IF;

  PERFORM set_config('app.allow_gem_change',  '1', true);
  PERFORM set_config('app.allow_candy_change','1', true);

  UPDATE public.profiles
     SET gem_balance = COALESCE(gem_balance, 0) + v_pkt.amount
   WHERE id = v_me
   RETURNING gem_balance INTO v_new;

  -- Notification cho người gửi (best-effort)
  BEGIN
    INSERT INTO public.notifications(user_id, type, title, message, data, is_read, created_at)
    VALUES (
      v_pkt.sender_id,
      'red_packet_opened',
      '🎉 Bao lì xì đã được mở',
      'Người nhận đã mở bao lì xì ' || v_pkt.amount::text || ' Xu của bạn.',
      jsonb_build_object(
        'packet_id', v_pkt.id,
        'amount', v_pkt.amount,
        'receiver_id', v_me
      ),
      false,
      now()
    );
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'already_opened', false,
    'amount', v_pkt.amount,
    'wish', v_pkt.wish,
    'new_balance', v_new
  );
END;
$$;

REVOKE ALL ON FUNCTION public.open_chat_red_packet(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.open_chat_red_packet(uuid) TO authenticated;
