-- ============================================================
-- ❤️ KẾT NỐI BÍ MẬT v3 — Pool clone snapshot
-- Chạy 1 lần trong Supabase SQL Editor. Idempotent.
-- KHÔNG đổi URL/API Key. Không sửa dữ liệu người dùng.
--
-- Mục đích: Secret Connect CHỈ đọc pool clone trong bảng
-- secret_connect_clones (do Admin tick chọn ở "Tài khoản thứ hai").
-- Vì vậy bảng này lưu luôn snapshot hiển thị, không cần đọc profiles.
-- ============================================================

ALTER TABLE public.secret_connect_clones
  ADD COLUMN IF NOT EXISTS name   TEXT,
  ADD COLUMN IF NOT EXISTS avatar TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS age    INT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS intent TEXT;

CREATE INDEX IF NOT EXISTS scc_region_idx
  ON public.secret_connect_clones (region)
  WHERE enabled = TRUE;

-- Clone đã hiện / đã ghép theo từng người dùng trong tuần.
CREATE TABLE IF NOT EXISTS public.secret_connect_clone_uses (
  user_id    UUID NOT NULL,
  clone_id   UUID NOT NULL,
  week_start DATE NOT NULL,
  matched    BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, clone_id, week_start)
);

GRANT SELECT, INSERT, UPDATE ON public.secret_connect_clone_uses TO authenticated;
GRANT ALL ON public.secret_connect_clone_uses TO service_role;
ALTER TABLE public.secret_connect_clone_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sccu_own ON public.secret_connect_clone_uses;
CREATE POLICY sccu_own ON public.secret_connect_clone_uses FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Cấu hình "thành công sau N lần thất bại".
ALTER TABLE public.secret_connect_settings
  ADD COLUMN IF NOT EXISTS success_after_min INT NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS success_after_max INT NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS show_area_before     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_real_area_after BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS show_district        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS flip_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS flip_ms              INT NOT NULL DEFAULT 2000;

-- Reset thứ Hai 00:00: bỏ used/matched + shuffle lại + xoá lịch sử tuần cũ.
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
