-- ============================================================
-- user_reports: bảng tố cáo đơn lẻ.
-- Mỗi lượt gửi tố cáo tạo 1 bản ghi mới (ID UUID tự sinh).
-- Chỉ admin (profiles.is_admin = true) mới đọc/sửa toàn bộ.
-- profiles.is_fwb_active: cờ bật hồ sơ trong không gian Tìm FWB.
--
-- Cách áp dụng (DB ngoài đang dùng – zbuwddjcqdlyijcunwgd):
--   Vào Supabase SQL editor của dự án -> dán toàn bộ file này -> Run.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason        text NOT NULL,
  category      text,
  context_type  text,
  context_id    text,
  context_text  text,
  status        text NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_reports_target_idx     ON public.user_reports(target_id);
CREATE INDEX IF NOT EXISTS user_reports_reporter_idx   ON public.user_reports(reporter_id);
CREATE INDEX IF NOT EXISTS user_reports_status_idx     ON public.user_reports(status);
CREATE INDEX IF NOT EXISTS user_reports_created_idx    ON public.user_reports(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_reports TO authenticated;
GRANT ALL ON public.user_reports TO service_role;

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Tạo đơn: chỉ chính chủ.
DROP POLICY IF EXISTS "report: insert own" ON public.user_reports;
CREATE POLICY "report: insert own"
  ON public.user_reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- Xem đơn của chính mình.
DROP POLICY IF EXISTS "report: read own" ON public.user_reports;
CREATE POLICY "report: read own"
  ON public.user_reports FOR SELECT TO authenticated
  USING (auth.uid() = reporter_id);

-- Admin: đọc/sửa toàn bộ.
DROP POLICY IF EXISTS "report: admin all" ON public.user_reports;
CREATE POLICY "report: admin all"
  ON public.user_reports FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.is_admin = true
    )
  );

-- ============================================================
-- profiles.is_fwb_active
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_fwb_active boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_fwb_active_idx ON public.profiles(is_fwb_active);
