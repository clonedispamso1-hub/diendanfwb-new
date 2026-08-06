-- ============================================================
-- ❤️ KẾT NỐI BÍ MẬT V2 — KHO CLONE RIÊNG
-- Chạy 1 lần trong Supabase SQL Editor. Idempotent.
-- KHÔNG drop bảng cũ, KHÔNG xoá dữ liệu, KHÔNG đổi auth.
-- ============================================================

-- Kho clone RIÊNG của Kết Nối Bí Mật.
-- account_id trỏ tới tài khoản thật (auth.users / public.profiles) được tạo
-- từ Admin → Kết Nối Bí Mật. Tài khoản vẫn xuất hiện ở "Tài khoản thứ hai"
-- để đăng bài / comment / nhắn tin / live như bình thường.
CREATE TABLE IF NOT EXISTS public.secret_connect_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    UUID NOT NULL UNIQUE,
  username      TEXT,
  name          TEXT,
  avatar        TEXT,
  region        TEXT,
  age           INT,
  gender        TEXT,
  intent        TEXT,
  batch_week    DATE NOT NULL DEFAULT (date_trunc('week', now())::date),
  in_pool       BOOLEAN NOT NULL DEFAULT TRUE,   -- còn nằm trong danh sách ghép đôi tuần này
  used          BOOLEAN NOT NULL DEFAULT FALSE,
  matched       BOOLEAN NOT NULL DEFAULT FALSE,
  shuffle_order INT NOT NULL DEFAULT (random() * 100000)::int,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sca_pick_idx
  ON public.secret_connect_accounts (in_pool, used, matched, shuffle_order);
CREATE INDEX IF NOT EXISTS sca_batch_idx
  ON public.secret_connect_accounts (batch_week DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.secret_connect_accounts TO authenticated;
GRANT SELECT ON public.secret_connect_accounts TO anon;
GRANT ALL    ON public.secret_connect_accounts TO service_role;
ALTER TABLE public.secret_connect_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sca_read ON public.secret_connect_accounts;
CREATE POLICY sca_read ON public.secret_connect_accounts FOR SELECT USING (TRUE);
DROP POLICY IF EXISTS sca_write ON public.secret_connect_accounts;
CREATE POLICY sca_write ON public.secret_connect_accounts FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

-- "Làm mới tuần": gỡ toàn bộ clone khỏi danh sách ghép đôi.
-- KHÔNG xoá tài khoản — chúng vẫn dùng được ở Tài khoản thứ hai.
CREATE OR REPLACE FUNCTION public.secret_connect_release_week()
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n INT;
BEGIN
  UPDATE public.secret_connect_accounts
     SET in_pool = FALSE, updated_at = now()
   WHERE in_pool = TRUE;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.secret_connect_release_week() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.secret_connect_release_week() TO authenticated;

-- Shuffle lại thứ tự ghép đôi trong tuần hiện tại.
CREATE OR REPLACE FUNCTION public.secret_connect_shuffle_pool()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.secret_connect_accounts
     SET shuffle_order = (random() * 100000)::int, updated_at = now()
   WHERE in_pool = TRUE;
$$;

REVOKE ALL ON FUNCTION public.secret_connect_shuffle_pool() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.secret_connect_shuffle_pool() TO authenticated;
