-- =====================================================================
-- 🔔 NOTIFICATIONS QUÀ — CHẠY TRÊN SUPABASE #3 (logs/notifications)
--
-- Notification chỉ tồn tại ở SB3. Client cập nhật trạng thái đã nhận tại đây
-- sau khi RPC trên SB1 cộng xu thành công.
-- =====================================================================

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_claimed       boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_pending_claim boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS status           text;

-- Badge đếm theo quà chưa nhận → index cho truy vấn badge.
CREATE INDEX IF NOT EXISTS notifications_user_pending_claim_idx
  ON public.notifications(user_id, is_pending_claim)
  WHERE is_pending_claim = true;

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications(user_id, is_read, created_at DESC);

-- Đồng bộ dữ liệu cũ: quà đang chờ nhận -> is_pending_claim = true.
UPDATE public.notifications
   SET is_pending_claim = true, is_claimed = false, status = COALESCE(status, 'pending')
 WHERE COALESCE(data->>'kind', type) IN ('gift_v1', 'gift_post')
   AND COALESCE(data->>'status', 'pending') <> 'claimed'
   AND COALESCE((data->>'claimed')::boolean, false) = false
   AND COALESCE(is_claimed, false) = false;

-- Quà đã nhận -> dọn cờ pending.
UPDATE public.notifications
   SET is_pending_claim = false, is_claimed = true, status = 'claimed'
 WHERE COALESCE(data->>'kind', type) IN ('gift_v1', 'gift_post')
   AND (COALESCE(data->>'status', '') = 'claimed'
        OR COALESCE((data->>'claimed')::boolean, false) = true);

ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
