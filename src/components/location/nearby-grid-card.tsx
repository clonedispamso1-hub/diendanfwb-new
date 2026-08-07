/**
 * 2-col grid card cho /nearby — phong cách Zalo Dating.
 * [Avatar lớn] · Tên · Tuổi · Khoảng cách.
 */
import { MapPin } from "lucide-react";
import type { NearbyUser } from "@/lib/location/nearby-store";
import { CloneVipNameMedia } from "@/components/vip/clone-vip-name-media";

interface Props {
  user: NearbyUser;
  onOpen: () => void;
}

export function NearbyGridCard({ user: u, onOpen }: Props) {
  const name = (u.full_name || "Người dùng").split(/\s+/).slice(-2).join(" ");
  const online = !!u.is_online;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex flex-col overflow-hidden rounded-3xl border bg-card text-left shadow-sm transition active:scale-[0.98] hover:shadow-xl hover:shadow-rose-500/15"
    >
      <div className="relative w-full overflow-hidden bg-muted" style={{ aspectRatio: "3 / 4" }}>
        <img
          src={u.avatar || "/placeholder.svg"}
          alt={name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,.72) 0%, rgba(0,0,0,.30) 30%, rgba(0,0,0,0) 55%)",
          }}
        />
        {online ? (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/95 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow shadow-emerald-500/40">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            Online
          </span>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-8 text-white">
          <div className="flex items-end gap-1.5">
            <h3 className="truncate text-base font-extrabold leading-tight drop-shadow">{name}<CloneVipNameMedia userId={u.id} /></h3>
            {typeof u.age === "number" ? (
              <span className="pb-0.5 text-sm font-bold text-white/90">{u.age}</span>
            ) : null}
          </div>
          <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
            <MapPin className="h-2.5 w-2.5" />
            <span className="truncate">{u.distance_label || u.city || u.province || "Gần bạn"}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default NearbyGridCard;
