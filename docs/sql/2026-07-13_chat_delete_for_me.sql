-- =====================================================================
-- 2026-07-13  Chat: Delete-for-me (soft) + Recall (hard, <2 min)
--
-- Task #5.6 – Part A + B: xóa tin nhắn phải bền qua F5.
--   • sender_deleted_at / receiver_deleted_at  → ẩn phía một bên
--   • Recall (thu hồi) trong 2 phút            → dùng DELETE bình thường
--
-- Chạy MỘT LẦN trong Supabase SQL Editor. Idempotent.
-- KHÔNG động vào bảng/RLS/chỉ mục hiện có ngoài các thay đổi bên dưới.
-- =====================================================================

-- 1) Cột soft-delete phía người dùng.
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS sender_deleted_at   timestamptz,
  ADD COLUMN IF NOT EXISTS receiver_deleted_at timestamptz;

-- Index nhẹ để câu SELECT thêm điều kiện IS NULL không tệ đi.
CREATE INDEX IF NOT EXISTS idx_messages_sender_deleted_at
  ON public.messages (sender_id) WHERE sender_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_receiver_deleted_at
  ON public.messages (receiver_id) WHERE receiver_deleted_at IS NULL;

-- 2) RPC: xoá tin nhắn chỉ ở phía người gọi (không ảnh hưởng đối phương).
--    Bất kỳ ai là sender HOẶC receiver của tin đó đều gọi được.
CREATE OR REPLACE FUNCTION public.delete_message_for_me(p_message_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_msg public.messages%rowtype;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_AUTHENTICATED');
  END IF;

  SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
  IF v_msg.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;

  IF v_msg.sender_id = v_me THEN
    UPDATE public.messages
       SET sender_deleted_at = COALESCE(sender_deleted_at, now())
     WHERE id = p_message_id;
  ELSIF v_msg.receiver_id = v_me THEN
    UPDATE public.messages
       SET receiver_deleted_at = COALESCE(receiver_deleted_at, now())
     WHERE id = p_message_id;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_message_for_me(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.delete_message_for_me(uuid) TO authenticated;
