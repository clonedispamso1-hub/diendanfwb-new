-- FIX: get_nearby_users — "structure of query does not match function result type"
-- Nguyên nhân: profiles.age là smallint, RETURNS TABLE khai báo age int → PostgreSQL chặn.
-- Cách sửa: giữ nguyên signature (age int) và CAST pr.age::int trong CTE base.
-- Toàn bộ body khác giữ NGUYÊN 100% so với 20260613_get_nearby_users_phase3_2.sql.
--
-- Cách chạy: paste toàn bộ file này vào Supabase SQL Editor → Run.

DROP FUNCTION IF EXISTS public.get_nearby_users(double precision, text, int);

CREATE OR REPLACE FUNCTION public.get_nearby_users(
  p_radius_km double precision DEFAULT NULL,
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
  distance_km       double precision,
  distance_bucket   text,
  distance_label    text
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
      pr.age::int AS age,
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
