-- =====================================================================
-- RUN ON SUPABASE #3 (chat/logs — uaqsetfdciyzxpuhulux)
--
-- ✅ TRẠNG THÁI: ĐÃ CHẠY THÀNH CÔNG trên Supabase #3 ngày 2026-08-23.
--    File này được lưu trong repo chỉ để LƯU TRỮ/THAM KHẢO.
--    KHÔNG chạy lại, KHÔNG tạo thêm migration trùng cho các đối tượng này.
--
-- Đã tạo trên SB3:
--   • public.messages.deleted_by_users (uuid[])
--   • index phục vụ lọc deleted_by_users
--   • RPC hide_message_for_me(p_message_id uuid)
--   • RPC hide_conversation_for_me(p_partner_id uuid)
--
-- Nội dung: hoàn thiện "Xoá tin nhắn phía tôi" (deleted_by_users) —
-- idempotent, có index, có RLS policy, KHÔNG xoá dữ liệu, không đổi key/URL.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='messages') THEN
    RAISE EXCEPTION 'public.messages không tồn tại trên instance này — chạy sai Supabase, dừng lại (không thay đổi gì).';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Cột "xoá phía tôi" (mảng uuid của những người đã ẩn tin này)
-- ---------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS deleted_by_users uuid[] NOT NULL DEFAULT '{}';

-- Cột legacy (giữ lại để tương thích client cũ; không bắt buộc dùng).
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_deleted_at   timestamptz;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS receiver_deleted_at timestamptz;

-- Chuẩn hoá NULL → mảng rỗng (an toàn nếu cột từng nullable).
UPDATE public.messages SET deleted_by_users = '{}'
 WHERE deleted_by_users IS NULL;

-- Backfill: tin đã ẩn bằng cột legacy → đưa vào deleted_by_users.
UPDATE public.messages
   SET deleted_by_users = array(SELECT DISTINCT unnest(deleted_by_users || ARRAY[sender_id]))
 WHERE sender_deleted_at IS NOT NULL
   AND sender_id IS NOT NULL
   AND NOT (sender_id = ANY (deleted_by_users));

UPDATE public.messages
   SET deleted_by_users = array(SELECT DISTINCT unnest(deleted_by_users || ARRAY[receiver_id]))
 WHERE receiver_deleted_at IS NOT NULL
   AND receiver_id IS NOT NULL
   AND NOT (receiver_id = ANY (deleted_by_users));

-- ---------------------------------------------------------------------
-- 2. Index — lọc deleted_by_users và dựng danh sách chat nhanh
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS messages_deleted_by_users_idx
  ON public.messages USING gin (deleted_by_users);

CREATE INDEX IF NOT EXISTS messages_sender_created_idx
  ON public.messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_receiver_created_idx
  ON public.messages (receiver_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 3. RLS — chỉ 2 người trong hội thoại được cập nhật cột này
-- ---------------------------------------------------------------------
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_delete_for_me" ON public.messages;
CREATE POLICY "messages_delete_for_me"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);

GRANT SELECT, INSERT, UPDATE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

-- ---------------------------------------------------------------------
-- 4. Hàm tiện ích: ẩn 1 tin / cả hội thoại cho riêng người gọi.
--    App có thể gọi qua RPC; client hiện tại vẫn dùng UPDATE trực tiếp nên
--    hai hàm này là tuỳ chọn, không bắt buộc.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hide_message_for_me(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  UPDATE public.messages
     SET deleted_by_users = array(SELECT DISTINCT unnest(deleted_by_users || ARRAY[v_uid]))
   WHERE id = p_message_id
     AND (sender_id = v_uid OR receiver_id = v_uid);
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.hide_conversation_for_me(p_partner_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid(); v_count integer := 0;
BEGIN
  IF v_uid IS NULL THEN RETURN 0; END IF;
  UPDATE public.messages
     SET deleted_by_users = array(SELECT DISTINCT unnest(deleted_by_users || ARRAY[v_uid]))
   WHERE ((sender_id = v_uid AND receiver_id = p_partner_id)
       OR (sender_id = p_partner_id AND receiver_id = v_uid))
     AND NOT (v_uid = ANY (deleted_by_users));
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.hide_message_for_me(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hide_conversation_for_me(uuid) TO authenticated;

-- Tin nhắn mới (created_at sau thời điểm xoá) KHÔNG bị ảnh hưởng: chúng là
-- row mới với deleted_by_users = '{}'.
