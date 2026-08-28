-- =====================================================================
-- SB3 — FIX: user không xoá được notification của chính mình
-- Chạy trong SQL Editor của Supabase #3 (logs/notifications).
-- KHÔNG drop bảng, KHÔNG xoá dữ liệu.
-- =====================================================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;
CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- Kiểm tra
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'notifications';
