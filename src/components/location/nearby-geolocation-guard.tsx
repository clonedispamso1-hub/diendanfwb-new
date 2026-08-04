/**
 * Strict geolocation guard cho /nearby.
 * Chặn toàn bộ trang đến khi user cấp quyền vị trí.
 * - "granted" → render children
 * - "prompt"  → modal yêu cầu, nút "Cho phép" trigger requestCurrentPosition
 * - "denied"  → modal hướng dẫn vào cài đặt trình duyệt mở quyền
 * - không hỗ trợ → modal báo lỗi thiết bị
 */

import { ReactNode, useCallback, useEffect, useState } from "react";
import { MapPin, ShieldAlert, RefreshCw, Settings, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/candy/auth-provider";
import {
  isGeolocationSupported,
  readPermissionStatus,
  requestCurrentPosition,
  saveLocation,
  markAsked,
} from "@/lib/location/location-store";

type GuardState = "checking" | "granted" | "prompt" | "denied" | "unsupported" | "requesting";

interface Props {
  children: ReactNode;
}

export function NearbyGeolocationGuard({ children }: Props) {
  const { me } = useAuth();
  const [state, setState] = useState<GuardState>("checking");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const check = useCallback(async () => {
    setErrMsg(null);
    if (!isGeolocationSupported()) {
      setState("unsupported");
      return;
    }
    const perm = await readPermissionStatus();
    if (perm === "granted") setState("granted");
    else if (perm === "denied") setState("denied");
    else if (perm === "unsupported") setState("unsupported");
    else setState("prompt");
  }, []);

  useEffect(() => { void check(); }, [check]);

  const handleAllow = useCallback(async () => {
    if (!isGeolocationSupported()) { setState("unsupported"); return; }
    setState("requesting");
    setErrMsg(null);
    try {
      const pos = await requestCurrentPosition();
      if (me?.id) {
        try {
          await saveLocation(me.id, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null);
        } catch { /* lưu fail không chặn quyền */ }
      }
      markAsked();
      setState("granted");
    } catch (err: any) {
      // GeolocationPositionError codes: 1 PERMISSION_DENIED, 2 POSITION_UNAVAILABLE, 3 TIMEOUT
      if (err && typeof err.code === "number") {
        if (err.code === 1) setState("denied");
        else { setErrMsg("Không lấy được vị trí. Vui lòng thử lại."); setState("prompt"); }
      } else {
        setErrMsg("Không lấy được vị trí. Vui lòng thử lại.");
        setState("prompt");
      }
    }
  }, [me?.id]);

  if (state === "granted") return <>{children}</>;

  // Modal full-screen chặn toàn bộ trang
  return (
    <div className="fixed inset-0 z-[110] grid place-items-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border bg-card shadow-2xl">
        <div
          className="px-6 pt-8 pb-6 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(236,72,153,.12), rgba(168,85,247,.10) 60%, transparent)",
          }}
        >
          <div
            className="mx-auto grid h-20 w-20 place-items-center rounded-full text-white shadow-xl"
            style={{
              background:
                state === "denied" || state === "unsupported"
                  ? "linear-gradient(135deg,#ef4444,#f97316)"
                  : "linear-gradient(135deg,#ec4899,#a855f7)",
              boxShadow: "0 18px 40px -10px rgba(236,72,153,.55)",
            }}
          >
            {state === "denied" || state === "unsupported" ? (
              <ShieldAlert className="h-9 w-9" />
            ) : state === "checking" || state === "requesting" ? (
              <Loader2 className="h-9 w-9 animate-spin" />
            ) : (
              <MapPin className="h-9 w-9" />
            )}
          </div>

          {state === "checking" ? (
            <>
              <h2 className="mt-5 text-lg font-extrabold">Đang kiểm tra quyền vị trí…</h2>
              <p className="mt-2 text-sm text-muted-foreground">Vui lòng chờ trong giây lát.</p>
            </>
          ) : state === "requesting" ? (
            <>
              <h2 className="mt-5 text-lg font-extrabold">Đang xin quyền vị trí…</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Hãy bấm <span className="font-bold">Cho phép</span> trên hộp thoại của trình duyệt.
              </p>
            </>
          ) : state === "prompt" ? (
            <>
              <h2 className="mt-5 text-lg font-extrabold">Bật vị trí để tiếp tục</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Tìm quanh đây</span> cần
                quyền truy cập vị trí để hiển thị thành viên gần bạn. Vị trí chính xác
                sẽ không bao giờ được công khai.
              </p>
              {errMsg ? (
                <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600">
                  {errMsg}
                </p>
              ) : null}
            </>
          ) : state === "denied" ? (
            <>
              <h2 className="mt-5 text-lg font-extrabold">Quyền vị trí đang bị chặn</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Bạn đã từ chối hoặc chặn quyền vị trí cho trang này. Hãy bật lại trong
                <span className="font-semibold text-foreground"> Cài đặt trình duyệt</span> rồi
                tải lại trang.
              </p>
              <div className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-left text-[11px] leading-relaxed text-muted-foreground">
                <div className="font-semibold text-foreground">Hướng dẫn nhanh:</div>
                Chrome / Edge: bấm biểu tượng 🔒 cạnh URL → <em>Site settings</em> → <em>Location</em> → <strong>Allow</strong>.<br />
                iOS Safari: <em>Settings → Safari → Location → Ask</em>, sau đó tải lại.
              </div>
            </>
          ) : (
            <>
              <h2 className="mt-5 text-lg font-extrabold">Thiết bị không hỗ trợ định vị</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Trình duyệt hoặc thiết bị của bạn không cung cấp API vị trí.
                Hãy thử mở bằng trình duyệt khác (Chrome / Safari mới nhất).
              </p>
            </>
          )}
        </div>

        <div className="space-y-2 border-t bg-background/60 p-4">
          {state === "prompt" || state === "checking" ? (
            <Button
              onClick={handleAllow}
              disabled={state === "checking"}
              className="h-12 w-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500 text-base font-bold text-white shadow-lg shadow-fuchsia-500/30 hover:opacity-95"
            >
              <MapPin className="mr-1 h-4 w-4" /> Cho phép truy cập vị trí
            </Button>
          ) : null}

          {state === "denied" ? (
            <>
              <Button
                onClick={() => window.location.reload()}
                className="h-12 w-full rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-violet-500 text-base font-bold text-white shadow-lg shadow-fuchsia-500/30"
              >
                <RefreshCw className="mr-1 h-4 w-4" /> Tải lại trang
              </Button>
              <Button onClick={() => void check()} variant="outline" className="h-11 w-full rounded-full">
                <Settings className="mr-1 h-4 w-4" /> Kiểm tra lại quyền
              </Button>
            </>
          ) : null}

          {state === "unsupported" ? (
            <Button onClick={() => window.history.back()} variant="outline" className="h-11 w-full rounded-full">
              Quay lại
            </Button>
          ) : null}

          {state === "requesting" ? (
            <Button disabled className="h-12 w-full rounded-full" variant="outline">
              <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Đang chờ phản hồi…
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default NearbyGeolocationGuard;
