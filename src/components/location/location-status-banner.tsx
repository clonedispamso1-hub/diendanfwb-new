/**
 * PHASE 3 — Banner trạng thái vị trí + nút bật lại nếu user từ chối.
 * Hiển thị: 📍 <city>  •  Cập nhật: 5 phút trước.
 */

import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime, type LocationRecord } from "@/lib/location/location-store";

interface Props {
  status: "off" | "denied" | "on" | "loading";
  record: LocationRecord | null;
  onEnable: () => void;
}

export function LocationStatusBanner({ status, record, onEnable }: Props) {
  if (status === "loading") {
    return (
      <div className="mx-3 mb-2 flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 animate-pulse" aria-hidden />
        <span>Đang cập nhật vị trí…</span>
      </div>
    );
  }

  if (status === "off" || status === "denied") {
    return (
      <div className="mx-3 mb-2 flex items-center justify-between gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-xs">
        <span className="text-muted-foreground">Bạn chưa bật vị trí</span>
        <Button size="sm" variant="secondary" onClick={onEnable} className="h-7 gap-1 rounded-full text-xs">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          Bật vị trí
        </Button>
      </div>
    );
  }

  // status === "on"
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-full border bg-primary/5 px-3 py-1.5 text-xs">
      <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden />
      <span className="font-medium text-foreground">
        {record?.city ?? "Vị trí đã cập nhật"}
      </span>
      <span className="text-muted-foreground">
        • Cập nhật {formatRelativeTime(record?.updated_at)}
      </span>
    </div>
  );
}