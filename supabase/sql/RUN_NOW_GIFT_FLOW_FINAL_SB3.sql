-- =====================================================================
-- 🔔 GIFT NOTIFICATIONS — CHẠY NGUYÊN KHỐI TRÊN SUPABASE #3 (notifications)
-- An toàn khi chạy lại. Chỉ đụng notification của luồng quà.
--
-- • Notification quà = trạng thái pending do app tạo sau khi SB1 đã TRỪ Gem.
--   Notification KHÔNG bao giờ đụng số dư (số dư chỉ đổi bởi RPC ở SB1).
-- • Người nhận (và chỉ người nhận) được đọc/cập nhật notification của mình.
-- • Badge đỏ = số quà pending (is_pending_claim / data->>status = 'pending').
-- • Tự hết hạn sau 3 ngày.
-- =====================================================================

BEGIN;

-- 1) Cột trạng thái claim
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_claimed       boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS is_pending_claim boolean NOT NULL DEFAULT false;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS status           text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS kind             text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS last_actor_id    uuid;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS updated_at       timestamptz;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS expires_at       timestamptz;

-- Quà pending: đánh dấu để badge đếm đúng, và hết hạn sau 3 ngày.
CREATE OR REPLACE FUNCTION public._notif_gift_defaults()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.expires_at IS NULL THEN
    NEW.expires_at := COALESCE(NEW.created_at, now()) + interval '3 days';
  END IF;
  IF COALESCE(NEW.data->>'status', '') = 'pending'
     AND COALESCE(NEW.data->>'gift_id', '') <> '' THEN
    NEW.is_pending_claim := true;
    NEW.is_claimed := false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notif_gift_defaults ON public.notifications;
CREATE TRIGGER notif_gift_defaults
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public._notif_gift_defaults();

CREATE INDEX IF NOT EXISTS notifications_pending_claim_idx
  ON public.notifications (user_id) WHERE is_pending_claim = true;
CREATE INDEX IF NOT EXISTS notifications_expires_idx ON public.notifications (expires_at);

-- 2) RLS — chủ notification đọc/sửa/xoá được; người tặng chỉ được tạo cho người nhận.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Gỡ policy chặn cũ (bản V4 chặn hoàn toàn client tạo notification quà,
-- khiến người nhận không bao giờ thấy quà pending).
DROP POLICY IF EXISTS notif_no_client_gift_insert ON public.notifications;
DROP POLICY IF EXISTS notif_no_client_gift_update ON public.notifications;

DROP POLICY IF EXISTS notif_select_own ON public.notifications;
CREATE POLICY notif_select_own ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS notif_insert_any ON public.notifications;
CREATE POLICY notif_insert_any ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS notif_update_own ON public.notifications;
CREATE POLICY notif_update_own ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notif_delete_own ON public.notifications;
CREATE POLICY notif_delete_own ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- 3) Dọn notification quá 3 ngày (gọi từ pg_cron nếu có, hoặc thủ công).
CREATE OR REPLACE FUNCTION public.purge_expired_notifications()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  DELETE FROM public.notifications
   WHERE COALESCE(expires_at, created_at + interval '3 days') < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

GRANT EXECUTE ON FUNCTION public.purge_expired_notifications() TO service_role;

COMMIT;
