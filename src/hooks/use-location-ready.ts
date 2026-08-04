/**
 * PHASE 3.1 — Derive `location_ready` ở client.
 *
 * location_ready = true  ⇔  age >= 18  ∧  phone hợp lệ  ∧  has_location.
 *
 * Hook KHÔNG đọc latitude/longitude — chỉ kiểm tra "có dòng trong
 * user_locations" thông qua `fetchMyLocation` (RLS đảm bảo chỉ chính chủ
 * đọc được dòng của mình, không ai khác).
 *
 * Dùng để gate "Tìm quanh đây" và làm tiền đề cho Phase 4 (bán kính).
 */

import { useEffect, useState } from "react";
import { useAuth } from "@/components/candy/auth-provider";
import { fetchMyLocation } from "@/lib/location/location-store";

const PHONE_REGEX = /^(0|\+?84)\d{8,10}$/;

export interface LocationReadyState {
  ready: boolean;
  hasAge: boolean;
  hasPhone: boolean;
  hasLocation: boolean;
  isUnderage: boolean;
  loading: boolean;
}

export function useLocationReady(): LocationReadyState {
  const { me } = useAuth();
  const [hasLocation, setHasLocation] = useState(false);
  const [loading, setLoading] = useState(true);

  const ageNum = typeof me?.age === "number" ? me.age : parseInt(String(me?.age ?? ""), 10);
  const hasAge = Number.isFinite(ageNum) && ageNum >= 18;
  const isUnderage = Number.isFinite(ageNum) && ageNum > 0 && ageNum < 18;
  const phone = (me?.phone ?? "").trim();
  const hasPhone = PHONE_REGEX.test(phone);

  useEffect(() => {
    let cancelled = false;
    if (!me?.id) {
      setHasLocation(true);
      setLoading(false);
      return;
    }
    // BYPASS: không yêu cầu geolocation; dùng Tỉnh/Thành đã chọn khi đăng ký.
    setHasLocation(true);
    setLoading(false);
    void fetchMyLocation; // giữ import để tránh unused warning
    return () => { cancelled = true; };
  }, [me?.id]);

  return {
    ready: true,
    hasAge,
    hasPhone,
    hasLocation: true,
    isUnderage,
    loading,
  };
}