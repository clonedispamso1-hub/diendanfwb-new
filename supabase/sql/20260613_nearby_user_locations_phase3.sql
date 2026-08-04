-- PHASE 3 — Tìm quanh đây: bảng vị trí thành viên.
-- Idempotent: chạy nhiều lần đều an toàn.
--
-- Bảo mật (theo yêu cầu Phase 3 v2):
--   * Thành viên chỉ đọc / ghi dòng của chính mình (latitude, longitude).
--   * ADMIN KHÔNG ĐƯỢC ĐỌC latitude / longitude của bất kỳ ai khác.
--   * Admin chỉ xem metadata an toàn (city, updated_at, has_location)
--     thông qua view public.user_locations_admin_overview.
--   * Không có endpoint public trả về toạ độ.

-- 1. Bảng (idempotent — không đụng bảng cũ nếu đã tồn tại).
CREATE TABLE IF NOT EXISTS public.user_locations (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

-- 2. Bổ sung các cột còn thiếu (an toàn nếu cột đã tồn tại).
ALTER TABLE public.user_locations
  ADD COLUMN IF NOT EXISTS latitude   double precision,
  ADD COLUMN IF NOT EXISTS longitude  double precision,
  ADD COLUMN IF NOT EXISTS city       text,
  ADD COLUMN IF NOT EXISTS accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 3. CHECK constraints (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_locations_lat_chk') THEN
    ALTER TABLE public.user_locations
      ADD CONSTRAINT user_locations_lat_chk
      CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_locations_lng_chk') THEN
    ALTER TABLE public.user_locations
      ADD CONSTRAINT user_locations_lng_chk
      CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180));
  END IF;
END $$;

-- 4. Index.
CREATE INDEX IF NOT EXISTS user_locations_updated_at_idx
  ON public.user_locations (updated_at DESC);
CREATE INDEX IF NOT EXISTS user_locations_city_idx
  ON public.user_locations (city);

-- 5. Trigger giữ updated_at đồng bộ.
CREATE OR REPLACE FUNCTION public.user_locations_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_locations_touch_updated_at ON public.user_locations;
CREATE TRIGGER user_locations_touch_updated_at
  BEFORE UPDATE ON public.user_locations
  FOR EACH ROW EXECUTE FUNCTION public.user_locations_touch_updated_at();

-- 6. Grants (Data API).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_locations TO authenticated;
GRANT ALL ON public.user_locations TO service_role;

-- 7. RLS — bật và chỉ cấp quyền cho chính chủ.
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- Xoá mọi policy cũ liên quan (kể cả policy admin lỡ tạo ở phiên bản trước).
DROP POLICY IF EXISTS "user_locations_admin_select"  ON public.user_locations;
DROP POLICY IF EXISTS "user_locations_self_select"   ON public.user_locations;
DROP POLICY IF EXISTS "user_locations_self_insert"   ON public.user_locations;
DROP POLICY IF EXISTS "user_locations_self_update"   ON public.user_locations;
DROP POLICY IF EXISTS "user_locations_self_delete"   ON public.user_locations;

CREATE POLICY "user_locations_self_select"
  ON public.user_locations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_locations_self_insert"
  ON public.user_locations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_locations_self_update"
  ON public.user_locations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_locations_self_delete"
  ON public.user_locations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 8. View an toàn cho admin — KHÔNG chứa latitude / longitude.
--    Dùng security_invoker để policy của bảng vẫn áp dụng,
--    nhưng view chỉ phơi ra cột không nhạy cảm.
DROP VIEW IF EXISTS public.user_locations_admin_overview;
CREATE VIEW public.user_locations_admin_overview
  WITH (security_invoker = true)
  AS
  SELECT
    ul.user_id,
    ul.city,
    ul.updated_at,
    (ul.latitude IS NOT NULL AND ul.longitude IS NOT NULL) AS has_location
  FROM public.user_locations ul;

REVOKE ALL ON public.user_locations_admin_overview FROM PUBLIC;
REVOKE ALL ON public.user_locations_admin_overview FROM anon;
GRANT  SELECT ON public.user_locations_admin_overview TO authenticated;

-- Lưu ý: view security_invoker chạy dưới quyền của caller. Để admin xem được
-- toàn bộ metadata qua view này, cần một policy riêng trên bảng cho phép admin
-- SELECT các cột này. Vì policy ở Postgres áp dụng theo dòng (không theo cột),
-- và ta KHÔNG muốn admin đọc lat/lng, ta KHÔNG cấp SELECT toàn bảng cho admin.
-- Thay vào đó dùng hàm SECURITY DEFINER dưới đây để trả về metadata an toàn.

-- 9. Hàm admin lấy metadata vị trí (không lộ lat/lng).
CREATE OR REPLACE FUNCTION public.admin_list_user_locations()
RETURNS TABLE (
  user_id       uuid,
  city          text,
  updated_at    timestamptz,
  has_location  boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_admin = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    ul.user_id,
    ul.city,
    ul.updated_at,
    (ul.latitude IS NOT NULL AND ul.longitude IS NOT NULL) AS has_location
  FROM public.user_locations ul
  ORDER BY ul.updated_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_user_locations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_user_locations() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_user_locations() TO authenticated;