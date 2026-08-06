-- ============================================================
-- ❤️ KẾT NỐI BÍ MẬT (Secret Connect)
-- Chạy 1 lần trong Supabase SQL Editor. Idempotent.
-- KHÔNG đổi URL/API. Không sửa dữ liệu trực tiếp.
-- ============================================================

-- 1) Khu vực muốn kết nối — lưu RIÊNG, không dùng khu vực hồ sơ.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS connect_area TEXT;

-- 2) Cấu hình (singleton)
CREATE TABLE IF NOT EXISTS public.secret_connect_settings (
  id                 INT PRIMARY KEY DEFAULT 1,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  search_min_sec     INT     NOT NULL DEFAULT 5,
  search_max_sec     INT     NOT NULL DEFAULT 10,
  wait_min_sec       INT     NOT NULL DEFAULT 15,
  wait_max_sec       INT     NOT NULL DEFAULT 20,
  accept_rate        NUMERIC NOT NULL DEFAULT 0.20,
  weekly_clone_count INT     NOT NULL DEFAULT 30,
  free_weekly_limit  INT     NOT NULL DEFAULT 30,
  vip_unlimited      BOOLEAN NOT NULL DEFAULT TRUE,
  hearts_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  allow_profile_view BOOLEAN NOT NULL DEFAULT TRUE,
  allow_message      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT secret_connect_settings_single CHECK (id = 1)
);

GRANT SELECT ON public.secret_connect_settings TO anon, authenticated;
GRANT ALL    ON public.secret_connect_settings TO service_role;
ALTER TABLE public.secret_connect_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scs_read ON public.secret_connect_settings;
CREATE POLICY scs_read ON public.secret_connect_settings FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS scs_write ON public.secret_connect_settings;
CREATE POLICY scs_write ON public.secret_connect_settings FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

INSERT INTO public.secret_connect_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 3) Clone được phép dùng (tham chiếu fake_profiles)
CREATE TABLE IF NOT EXISTS public.secret_connect_clones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clone_id      UUID NOT NULL UNIQUE,
  enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  used          BOOLEAN NOT NULL DEFAULT FALSE,
  matched       BOOLEAN NOT NULL DEFAULT FALSE,
  shuffle_order INT     NOT NULL DEFAULT 0,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scc_pick_idx
  ON public.secret_connect_clones (enabled, used, matched, shuffle_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.secret_connect_clones TO authenticated;
GRANT SELECT ON public.secret_connect_clones TO anon;
GRANT ALL    ON public.secret_connect_clones TO service_role;
ALTER TABLE public.secret_connect_clones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scc_read ON public.secret_connect_clones;
CREATE POLICY scc_read ON public.secret_connect_clones FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS scc_write ON public.secret_connect_clones;
CREATE POLICY scc_write ON public.secret_connect_clones FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- 4) Nhật ký ghép đôi
CREATE TABLE IF NOT EXISTS public.secret_connect_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID,
  clone_id   UUID,
  area       TEXT,
  result     TEXT NOT NULL DEFAULT 'pending', -- matched | busy | left | declined | no_reply | skipped
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scl_created_idx ON public.secret_connect_logs (created_at DESC);

GRANT SELECT, INSERT ON public.secret_connect_logs TO authenticated;
GRANT ALL ON public.secret_connect_logs TO service_role;
ALTER TABLE public.secret_connect_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scl_read ON public.secret_connect_logs;
CREATE POLICY scl_read ON public.secret_connect_logs FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS scl_insert ON public.secret_connect_logs;
CREATE POLICY scl_insert ON public.secret_connect_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 5) Hạn mức lượt theo tuần
CREATE TABLE IF NOT EXISTS public.secret_connect_usage (
  user_id    UUID NOT NULL,
  week_start DATE NOT NULL,
  used_count INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, week_start)
);

GRANT SELECT, INSERT, UPDATE ON public.secret_connect_usage TO authenticated;
GRANT ALL ON public.secret_connect_usage TO service_role;
ALTER TABLE public.secret_connect_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scu_own ON public.secret_connect_usage;
CREATE POLICY scu_own ON public.secret_connect_usage FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 6) Tăng lượt đã dùng trong tuần (thứ Hai 00:00 là mốc reset)
CREATE OR REPLACE FUNCTION public.secret_connect_bump_usage()
RETURNS TABLE (used_count INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_week DATE := date_trunc('week', now())::date;
  v_new  INT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  INSERT INTO public.secret_connect_usage (user_id, week_start, used_count)
  VALUES (v_uid, v_week, 1)
  ON CONFLICT (user_id, week_start)
  DO UPDATE SET used_count = public.secret_connect_usage.used_count + 1
  RETURNING public.secret_connect_usage.used_count INTO v_new;
  used_count := v_new;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.secret_connect_bump_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.secret_connect_bump_usage() TO authenticated;

-- 7) Reset tuần + shuffle lại toàn bộ clone
CREATE OR REPLACE FUNCTION public.secret_connect_weekly_reset()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.secret_connect_clones
     SET used = FALSE,
         matched = FALSE,
         shuffle_order = (random() * 100000)::int,
         updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.secret_connect_weekly_reset() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.secret_connect_weekly_reset() TO authenticated;
