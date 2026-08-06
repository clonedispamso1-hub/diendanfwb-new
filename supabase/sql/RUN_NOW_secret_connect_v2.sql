-- ============================================================
-- ❤️ KẾT NỐI BÍ MẬT — v2 (logic mới)
-- Chạy 1 lần trong Supabase SQL Editor. Idempotent.
-- KHÔNG đổi URL / API Key. Không sửa dữ liệu trực tiếp.
-- ============================================================

-- 1) Cấu hình thêm: 1 lần thành công sau N lần thất bại (Admin cấu hình)
ALTER TABLE public.secret_connect_settings
  ADD COLUMN IF NOT EXISTS success_after_min INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS success_after_max INT NOT NULL DEFAULT 6;

-- 2) Clone đã dùng / đã ghép theo TỪNG người dùng, theo tuần
CREATE TABLE IF NOT EXISTS public.secret_connect_clone_uses (
  user_id    UUID NOT NULL,
  clone_id   UUID NOT NULL,
  week_start DATE NOT NULL,
  matched    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, clone_id, week_start)
);

CREATE INDEX IF NOT EXISTS sccu_user_week_idx
  ON public.secret_connect_clone_uses (user_id, week_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.secret_connect_clone_uses TO authenticated;
GRANT ALL ON public.secret_connect_clone_uses TO service_role;
ALTER TABLE public.secret_connect_clone_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sccu_own ON public.secret_connect_clone_uses;
CREATE POLICY sccu_own ON public.secret_connect_clone_uses FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Reset tuần: xoá dấu clone đã dùng của tuần trước + shuffle lại
CREATE OR REPLACE FUNCTION public.secret_connect_weekly_reset()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.secret_connect_clones
     SET used = FALSE,
         matched = FALSE,
         shuffle_order = (random() * 100000)::int,
         updated_at = now();

  DELETE FROM public.secret_connect_clone_uses
   WHERE week_start < date_trunc('week', now())::date;
END;
$$;

REVOKE ALL ON FUNCTION public.secret_connect_weekly_reset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.secret_connect_weekly_reset() TO authenticated;
