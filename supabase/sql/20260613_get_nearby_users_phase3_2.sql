-- PHASE 3.2 — RPC "Tìm quanh đây".
--
-- KHÔNG sửa bảng cũ. Chỉ tạo function SECURITY DEFINER để:
--   * Đọc user_locations của tất cả user (server-side) và tính khoảng cách
--     Haversine ngay trong SQL.
--   * KHÔNG trả về latitude / longitude cho client.
--   * Chỉ trả khoảng cách đã làm tròn theo bucket (500m / 2km / 5km / 10km / 25km / 50km / 100km+).
--   * Yêu cầu caller phải location_ready = true (gate Phase 3.1).
--
-- Idempotent: chạy nhiều lần đều an toàn.

-- 1) Helper haversine (km) — IMMUTABLE, không truy cập bảng.
CREATE OR REPLACE FUNCTION public.haversine_km(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) RETURNS double precision
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  r   constant double precision := 6371.0;
  dLat double precision;
  dLon double precision;
  a    double precision;
BEGIN
  IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
    RETURN NULL;
  END IF;
  dLat := radians(lat2 - lat1);
  dLon := radians(lon2 - lon1);
  a := sin(dLat / 2) ^ 2
     + cos(radians(lat1)) * cos(radians(lat2)) * sin(dLon / 2) ^ 2;
  RETURN r * 2 * atan2(sqrt(a), sqrt(1 - a));
END;
$$;

REVOKE ALL ON FUNCTION public.haversine_km(double precision,double precision,double precision,double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.haversine_km(double precision,double precision,double precision,double precision) TO authenticated;

-- 2) RPC chính: get_nearby_users.
--    Trả về cột AN TOÀN — KHÔNG có lat/lng.
--    Sort:
--      'online'   → online trước, rồi last_seen mới nhất
--      'updated'  → vị trí cập nhật mới nhất
--      'distance' → gần nhất trước (fallback nếu cùng city)
CREATE OR REPLACE FUNCTION public.get_nearby_users(
  p_radius_km double precision DEFAULT NULL, -- NULL = toàn quốc
  p_sort      text             DEFAULT 'distance',
  p_limit     int              DEFAULT 60
) RETURNS TABLE (
  id                uuid,
  full_name         text,
  username          text,
  avatar            text,
  age               int,
  province          text,
  city              text,
  is_online         boolean,
  last_seen         timestamptz,
  location_updated  timestamptz,
  distance_km       double precision,   -- ĐÃ LÀM TRÒN (1 chữ số)
  distance_bucket   text,               -- '0_5','5_2','2_5','5_10','10_25','25_50','50p','same_city','far'
  distance_label    text                -- Chuỗi hiển thị tiếng Việt
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_lat       double precision;
  v_lng       double precision;
  v_city      text;
  v_ready     boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Gate: bản thân phải location_ready.
  SELECT COALESCE(p.location_ready, false) INTO v_ready
    FROM public.profiles p WHERE p.id = v_uid;
  IF NOT COALESCE(v_ready, false) THEN
    RAISE EXCEPTION 'not_location_ready';
  END IF;

  SELECT ul.latitude, ul.longitude, ul.city
    INTO v_lat, v_lng, v_city
    FROM public.user_locations ul
   WHERE ul.user_id = v_uid;

  p_limit := COALESCE(LEAST(GREATEST(p_limit, 1), 200), 60);

  RETURN QUERY
  WITH base AS (
    SELECT
      pr.id,
      pr.full_name,
      pr.username,
      pr.avatar,
      pr.age,
      pr.province,
      ul.city,
      COALESCE(pr.is_online, false) AS is_online,
      pr.last_seen,
      ul.updated_at AS location_updated,
      CASE
        WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
          AND ul.latitude IS NOT NULL AND ul.longitude IS NOT NULL
        THEN public.haversine_km(v_lat, v_lng, ul.latitude, ul.longitude)
        ELSE NULL
      END AS raw_km,
      -- Fallback bucket khi không có GPS bên kia: cùng city → ~3km, cùng province → ~15km, khác → 100km+
      CASE
        WHEN ul.city IS NOT NULL AND v_city IS NOT NULL AND ul.city = v_city THEN 3.0
        WHEN pr.province IS NOT NULL AND pr.province = (
               SELECT p2.province FROM public.profiles p2 WHERE p2.id = v_uid
             ) THEN 15.0
        ELSE NULL
      END AS fallback_km
    FROM public.profiles pr
    LEFT JOIN public.user_locations ul ON ul.user_id = pr.id
    WHERE pr.id <> v_uid
      AND COALESCE(pr.location_ready, false) = true
      AND COALESCE(pr.status, 'active') = 'active'
  ), enriched AS (
    SELECT
      b.*,
      COALESCE(b.raw_km, b.fallback_km) AS eff_km
    FROM base b
  )
  SELECT
    e.id,
    e.full_name,
    e.username,
    e.avatar,
    e.age,
    e.province,
    e.city,
    e.is_online,
    e.last_seen,
    e.location_updated,
    -- Làm tròn 1 chữ số; KHÔNG bao giờ lộ < 100m chính xác.
    CASE WHEN e.eff_km IS NULL THEN NULL
         ELSE round(GREATEST(e.eff_km, 0.1)::numeric, 1)::double precision END AS distance_km,
    CASE
      WHEN e.eff_km IS NULL                  THEN 'far'
      WHEN e.eff_km < 0.5                    THEN '0_5'
      WHEN e.eff_km < 2                      THEN '500_2k'
      WHEN e.eff_km < 5                      THEN '2_5'
      WHEN e.eff_km < 10                     THEN '5_10'
      WHEN e.eff_km < 25                     THEN '10_25'
      WHEN e.eff_km < 50                     THEN '25_50'
      ELSE '50p'
    END AS distance_bucket,
    CASE
      WHEN e.eff_km IS NULL                  THEN 'Cùng Việt Nam'
      WHEN e.eff_km < 0.5                    THEN 'Cách bạn dưới 500m'
      WHEN e.eff_km < 2                      THEN 'Cách bạn ~' || round(e.eff_km::numeric, 1)::text || 'km'
      WHEN e.eff_km < 5                      THEN 'Cách bạn ~' || round(e.eff_km::numeric, 1)::text || 'km'
      WHEN e.eff_km < 10                     THEN 'Cách bạn ~' || round(e.eff_km::numeric, 0)::text || 'km'
      WHEN e.eff_km < 50                     THEN 'Cách bạn ~' || round(e.eff_km::numeric, 0)::text || 'km'
      ELSE 'Cách bạn 50km+'
    END AS distance_label
  FROM enriched e
  WHERE
    -- Lọc theo bán kính nếu được truyền vào (NULL = toàn quốc).
    p_radius_km IS NULL
    OR (e.eff_km IS NOT NULL AND e.eff_km <= p_radius_km)
  ORDER BY
    CASE WHEN p_sort = 'online'   AND e.is_online                  THEN 0 ELSE 1 END,
    CASE WHEN p_sort = 'online'   THEN e.last_seen        END DESC NULLS LAST,
    CASE WHEN p_sort = 'updated'  THEN e.location_updated END DESC NULLS LAST,
    CASE WHEN p_sort = 'distance' THEN e.eff_km           END ASC  NULLS LAST,
    e.last_seen DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_nearby_users(double precision, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_nearby_users(double precision, text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_users(double precision, text, int) TO authenticated;