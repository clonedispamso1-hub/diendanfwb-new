-- =====================================================================
-- SUPABASE #4 (ybzdpxwbpbkeqkqwbscp) — dữ liệu MỚI của "Theo dõi – Seeding".
--
-- Chỉ 1 bảng log tối giản, KHÔNG nhân bản profiles/follows/notifications.
-- Dùng để admin biết clone nào đã theo dõi user nào (chống trùng, thống kê).
--
-- Chạy thủ công trong Supabase SQL Editor của project #4. Idempotent.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.seeding_follow_logs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clone_id       uuid NOT NULL,
  clone_username text,
  target_id      uuid NOT NULL,
  target_username text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clone_id, target_id)
);

CREATE INDEX IF NOT EXISTS seeding_follow_logs_target_idx
  ON public.seeding_follow_logs (target_id);
CREATE INDEX IF NOT EXISTS seeding_follow_logs_created_idx
  ON public.seeding_follow_logs (created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.seeding_follow_logs TO anon, authenticated;
GRANT ALL ON public.seeding_follow_logs TO service_role;

ALTER TABLE public.seeding_follow_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                  AND tablename='seeding_follow_logs' AND policyname='seeding_follow_logs_rw') THEN
    CREATE POLICY seeding_follow_logs_rw ON public.seeding_follow_logs
      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
