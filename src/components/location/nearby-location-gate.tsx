/**
 * PHASE 3 — "Tìm quanh đây" location gate.
 *
 * Mount 1 lần ở app shell. Tự kích hoạt khi user vào /find-fwb hoặc /fwb.
 * - Lần đầu vào (chưa hỏi) → mở popup xin quyền.
 * - Đồng ý → lấy toạ độ, upsert user_locations, lưu city.
 * - Từ chối → không chặn, chỉ hiển thị banner "Bạn chưa bật vị trí".
 * - Đã đồng ý từ trước → âm thầm refresh nếu dữ liệu cũ hơn 30 phút.
 *
 * KHÔNG sửa nearby-fwb-page.tsx và các tính năng cũ. Banner trạng thái
 * được portal vào dưới top-bar của trang Tìm quanh đây bằng position: fixed
 * để không can thiệp layout sẵn có.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import {
  fetchMyLocation,
  hasAskedBefore,
  isGeolocationSupported,
  markAsked,
  readPermissionStatus,
  requestCurrentPosition,
  saveLocation,
  shouldPromptAgain,
  type LocationRecord,
} from "@/lib/location/location-store";
import { LocationPermissionDialog } from "./location-permission-dialog";
import { LocationStatusBanner } from "./location-status-banner";

const NEARBY_PATHS = ["/find-fwb", "/fwb"];
const STALE_MS = 1000 * 60 * 30; // 30 phút

function isNearbyPath(pathname: string): boolean {
  return NEARBY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function NearbyLocationGate() {
  const { me, ready } = useAuth();
  const { pathname } = useLocation();
  const onNearby = isNearbyPath(pathname);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"off" | "denied" | "on" | "loading">("off");
  const [record, setRecord] = useState<LocationRecord | null>(null);
  const initRef = useRef<string | null>(null);

  const captureLocation = useCallback(async (userId: string) => {
    if (!isGeolocationSupported()) {
      toast.error("Trình duyệt không hỗ trợ định vị.");
      setStatus("denied");
      return;
    }
    setLoading(true);
    setStatus("loading");
    try {
      const pos = await requestCurrentPosition();
      const { coords } = pos;
      await saveLocation(userId, coords.latitude, coords.longitude, coords.accuracy ?? null);
      const fresh = await fetchMyLocation(userId);
      setRecord(fresh);
      setStatus("on");
      markAsked();
    } catch (err) {
      const message = err instanceof GeolocationPositionError
        ? (err.code === err.PERMISSION_DENIED ? "Bạn đã từ chối quyền vị trí." : "Không lấy được vị trí.")
        : "Không lấy được vị trí.";
      toast.error(message);
      setStatus("denied");
      markAsked();
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAllow = useCallback(async () => {
    setDialogOpen(false);
    if (!me?.id) return;
    await captureLocation(me.id);
  }, [captureLocation, me?.id]);

  const handleLater = useCallback(() => {
    setDialogOpen(false);
    setStatus("off");
    markAsked();
  }, []);

  const handleEnable = useCallback(() => {
    if (!me?.id) return;
    if (!hasAskedBefore() || shouldPromptAgain()) {
      setDialogOpen(true);
    } else {
      void captureLocation(me.id);
    }
  }, [captureLocation, me?.id]);

  // Khởi tạo khi vào /find-fwb.
  useEffect(() => {
    if (!ready || !me?.id || !onNearby) return;
    if (initRef.current === me.id) return;
    initRef.current = me.id;

    let cancelled = false;
    (async () => {
      const existing = await fetchMyLocation(me.id);
      if (cancelled) return;
      const perm = await readPermissionStatus();
      if (cancelled) return;

      if (existing) setRecord(existing);

      if (perm === "granted") {
        const stale = !existing || Date.now() - new Date(existing.updated_at).getTime() > STALE_MS;
        if (stale) void captureLocation(me.id);
        else setStatus("on");
        return;
      }
      if (perm === "denied") {
        setStatus("denied");
        return;
      }
      // prompt / unknown / unsupported
      if (perm === "unsupported") {
        setStatus("denied");
        return;
      }
      if (existing) {
        setStatus("on");
        return;
      }
      if (!hasAskedBefore()) {
        setDialogOpen(true);
      } else {
        setStatus("off");
      }
    })();

    return () => { cancelled = true; };
  }, [captureLocation, me?.id, onNearby, ready]);

  const bannerStatus = useMemo(() => status, [status]);

  if (!onNearby || !me?.id) return null;

  return (
    <>
      <LocationPermissionDialog
        open={dialogOpen}
        onAllow={handleAllow}
        onLater={handleLater}
        loading={loading}
      />
      {/* Banner cố định phía dưới top-bar, không can thiệp layout cũ. */}
      <div className="pointer-events-none fixed inset-x-0 top-[56px] z-30 flex justify-center">
        <div className="pointer-events-auto w-full max-w-md">
          <LocationStatusBanner
            status={bannerStatus}
            record={record}
            onEnable={handleEnable}
          />
        </div>
      </div>
    </>
  );
}