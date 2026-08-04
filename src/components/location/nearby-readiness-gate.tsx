/**
 * PHASE 3.2 — Màn hướng dẫn khi user CHƯA location_ready.
 *
 * location_ready = age>=18 ∧ phone hợp lệ ∧ has_location.
 * Hiển thị checklist 3 mục, nút action cho từng mục còn thiếu.
 */

import { CheckCircle2, Circle, MapPin, Phone, Cake, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useLocationReady } from "@/hooks/use-location-ready";
import { useAuth } from "@/components/candy/auth-provider";
import {
  hasAskedBefore,
  isGeolocationSupported,
  markAsked,
  requestCurrentPosition,
  saveLocation,
} from "@/lib/location/location-store";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  onCompleted?: () => void;
}

export function NearbyReadinessGate({ onCompleted }: Props) {
  const { me } = useAuth();
  const navigate = useNavigate();
  const state = useLocationReady();
  const [requesting, setRequesting] = useState(false);

  const requestLocation = async () => {
    if (!me?.id) return;
    if (!isGeolocationSupported()) {
      toast.error("Trình duyệt không hỗ trợ định vị.");
      return;
    }
    setRequesting(true);
    try {
      const pos = await requestCurrentPosition();
      await saveLocation(me.id, pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy ?? null);
      markAsked();
      toast.success("Đã lưu vị trí của bạn.");
      onCompleted?.();
    } catch {
      toast.error("Không lấy được vị trí. Hãy kiểm tra quyền truy cập.");
    } finally {
      setRequesting(false);
    }
  };

  const items: Array<{ done: boolean; icon: typeof Cake; title: string; desc: string; action?: { label: string; onClick: () => void } }> = [
    {
      done: state.hasAge,
      icon: Cake,
      title: "Xác nhận bạn đủ 18 tuổi",
      desc: "Tính năng Tìm quanh đây dành cho người dùng từ 18 tuổi trở lên.",
      action: state.hasAge ? undefined : { label: "Cập nhật tuổi", onClick: () => navigate("/profile") },
    },
    {
      done: state.hasPhone,
      icon: Phone,
      title: "Nhập số điện thoại",
      desc: "Số điện thoại giúp xác minh tài khoản và tăng độ tin cậy.",
      action: state.hasPhone ? undefined : { label: "Nhập SĐT", onClick: () => navigate("/profile") },
    },
    {
      done: state.hasLocation,
      icon: MapPin,
      title: "Bật vị trí",
      desc: "Chúng tôi chỉ hiển thị khoảng cách đã làm tròn, không bao giờ tiết lộ vị trí chính xác.",
      action: state.hasLocation
        ? undefined
        : { label: requesting ? "Đang xin quyền…" : (hasAskedBefore() ? "Bật lại vị trí" : "Bật vị trí"), onClick: () => void requestLocation() },
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6">
      <div className="rounded-3xl bg-gradient-to-br from-rose-500 via-fuchsia-500 to-violet-500 p-[1px]">
        <div className="rounded-[calc(1.5rem-1px)] bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500/15 text-rose-500">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Hoàn thiện hồ sơ để dùng Tìm quanh đây</h2>
              <p className="text-xs text-muted-foreground">Bảo vệ cộng đồng và mở khoá tính năng kết nối quanh bạn.</p>
            </div>
          </div>
        </div>
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((it, idx) => (
          <li
            key={idx}
            className="flex items-start gap-3 rounded-2xl border bg-card/60 p-4 shadow-sm"
          >
            <div className="mt-0.5">
              {it.done ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : (
                <Circle className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <it.icon className={`h-4 w-4 ${it.done ? "text-emerald-500" : "text-muted-foreground"}`} />
                <span className="font-semibold">{it.title}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{it.desc}</p>
              {it.action ? (
                <div className="mt-3">
                  <Button
                    size="sm"
                    onClick={it.action.onClick}
                    disabled={requesting && it.action.label.toLowerCase().includes("đang")}
                    className="h-8 rounded-full"
                  >
                    {requesting && it.icon === MapPin ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {it.action.label}
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {state.loading ? (
        <p className="text-center text-xs text-muted-foreground">Đang kiểm tra trạng thái…</p>
      ) : null}
    </div>
  );
}