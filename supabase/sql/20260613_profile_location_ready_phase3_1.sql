-- PHASE 3.1 — Cờ location_ready cho profile.
-- Idempotent. KHÔNG sửa cấu trúc cũ — chỉ ADD COLUMN + trigger phụ trợ.
--
-- location_ready = true KHI VÀ CHỈ KHI:
--   * profiles.age   >= 18
--   * profiles.phone IS NOT NULL và khác rỗng
--   * Tồn tại 1 dòng public.user_locations có lat/lng hợp lệ
--
-- Không khóa tài khoản nếu user từ chối vị trí; cờ này chỉ dùng để gate
-- tính năng "Tìm quanh đây" (Phase 4 dùng để mở bán kính).

-- 1) Thêm cột (an toàn nếu đã tồn tại).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS location_ready boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_location_ready_idx
  ON public.profiles (location_ready);

-- 2) Hàm tính cờ cho 1 user (SECURITY DEFINER để đọc user_locations
--    mà KHÔNG cấp quyền SELECT toạ độ cho client).
CREATE OR REPLACE FUNCTION public.compute_location_ready(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _age      int;
  _phone    text;
  _has_loc  boolean;
BEGIN
  SELECT p.age, p.phone INTO _age, _phone
    FROM public.profiles p WHERE p.id = _user_id;

  IF _age IS NULL OR _age < 18 THEN RETURN false; END IF;
  IF _phone IS NULL OR length(btrim(_phone)) = 0 THEN RETURN false; END IF;

  SELECT (ul.latitude IS NOT NULL AND ul.longitude IS NOT NULL)
    INTO _has_loc
    FROM public.user_locations ul WHERE ul.user_id = _user_id;

  RETURN COALESCE(_has_loc, false);
END;
$$;

REVOKE ALL ON FUNCTION public.compute_location_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_location_ready(uuid) TO authenticated;

-- 3) Hàm refresh cờ cho 1 user (idempotent, dùng trong trigger).
CREATE OR REPLACE FUNCTION public.refresh_location_ready(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
     SET location_ready = public.compute_location_ready(_user_id)
   WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_location_ready(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_location_ready(uuid) TO authenticated;

-- 4) Trigger: khi profiles.age / profiles.phone thay đổi → tự refresh cờ.
CREATE OR REPLACE FUNCTION public.profiles_refresh_location_ready_tg()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.location_ready := public.compute_location_ready(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_refresh_location_ready ON public.profiles;
CREATE TRIGGER profiles_refresh_location_ready
  BEFORE INSERT OR UPDATE OF age, phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_refresh_location_ready_tg();

-- 5) Trigger: khi user_locations thay đổi → đồng bộ ngược vào profiles.
CREATE OR REPLACE FUNCTION public.user_locations_sync_ready_tg()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  _uid := COALESCE(NEW.user_id, OLD.user_id);
  PERFORM public.refresh_location_ready(_uid);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS user_locations_sync_ready ON public.user_locations;
CREATE TRIGGER user_locations_sync_ready
  AFTER INSERT OR UPDATE OR DELETE ON public.user_locations
  FOR EACH ROW EXECUTE FUNCTION public.user_locations_sync_ready_tg();

-- 6) Backfill 1 lần cho dữ liệu cũ.
UPDATE public.profiles p
   SET location_ready = public.compute_location_ready(p.id)
 WHERE p.location_ready IS DISTINCT FROM public.compute_location_ready(p.id);