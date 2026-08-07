/**
 * PHASE 4.0 — Card thành viên Nearby (redesign Tinder/Bumble/Litmatch).
 *
 * Bố cục:
 *  - Ảnh lớn chiếm gần toàn bộ card (aspect 3/4)
 *  - Gradient overlay đen → trong suốt từ dưới lên
 *  - Tên + tuổi + thành phố + distance NỔI TRÊN ảnh (góc dưới)
 *  - Badge Online (góc trên trái), Verified + VIP + Trust (góc trên phải)
 *  - Match score ribbon (góc trên phải, ưu tiên hiển thị)
 *  - 2 nút Quan tâm / Nhắn tin: pill nổi, gradient cho nút Quan tâm
 *  - Tim bay lên khi like, button pop, avatar shake
 */
import { Heart, MessageCircle, MapPin, ShieldCheck, Crown } from "lucide-react";
import { useRef, useState } from "react";

import { INTENT_LABELS, type NearbyProfileExtra } from "@/lib/location/nearby-enrich";
import type { NearbyUser } from "@/lib/location/nearby-store";
import { CloneVipNameMedia } from "@/components/vip/clone-vip-name-media";

interface Props {
  user: NearbyUser;
  extra?: NearbyProfileExtra;
  liked: boolean;
  matchScore?: number;
  onOpenProfile: () => void;
  onToggleInterest: () => void;
  onChat: () => void;
}

function lastSeen(iso: string | null) {
  if (!iso) return "Offline";
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "Vừa xong";
  if (m < 60) return `${m}p trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h trước`;
  return `${Math.round(h / 24)}n trước`;
}

export function NearbyUserCard({
  user: u, extra, liked, matchScore, onOpenProfile, onToggleInterest, onChat,
}: Props) {
  const name = u.full_name || "Người dùng";
  const city = u.city || u.province || "Việt Nam";
  const intent = extra?.intent && INTENT_LABELS[extra.intent];
  const isVip = (extra?.vip_level ?? 0) > 0;
  const isVerified = !!extra?.verified;

  const [flyKey, setFlyKey] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [popping, setPopping] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const willLike = !liked;
    setPopping(true); window.setTimeout(() => setPopping(false), 350);
    if (willLike) {
      setFlyKey((k) => k + 1);
      setShaking(true); window.setTimeout(() => setShaking(false), 500);
    }
    onToggleInterest();
  };

  return (
    <article
      ref={cardRef}
      className={`group relative overflow-hidden rounded-3xl border bg-card shadow-md transition duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-rose-500/20 ${shaking ? "nearby-shake" : ""}`}
    >
      {/* Photo */}
      <button
        type="button"
        onClick={onOpenProfile}
        aria-label={`Hồ sơ ${name}`}
        className="relative block w-full text-left"
      >
        <div className="relative w-full overflow-hidden bg-muted" style={{ aspectRatio: "3 / 4" }}>
          <img
            src={u.avatar || "/placeholder.svg"}
            alt={name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          {/* Gradient overlay */}
          <div className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(to top, rgba(0,0,0,.78) 0%, rgba(0,0,0,.45) 28%, rgba(0,0,0,0) 55%)",
            }}
          />

          {/* TOP-LEFT: Online badge */}
          <div className="absolute left-3 top-3 flex items-center gap-1.5">
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide backdrop-blur ${
                u.is_online
                  ? "bg-emerald-500/90 text-white shadow shadow-emerald-500/40"
                  : "bg-black/45 text-white/90"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full bg-white ${u.is_online ? "animate-pulse" : ""}`} />
              {u.is_online ? "Online" : lastSeen(u.last_seen)}
            </span>
          </div>

          {/* TOP-RIGHT: Match score / Verified / Trust (VIP bloat removed for compactness) */}
          <div className="absolute right-3 top-3 flex flex-col items-end gap-1.5">
            {typeof matchScore === "number" && matchScore >= 50 ? (
              <span className="rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-md shadow-rose-500/40">
                💖 {matchScore}%
              </span>
            ) : null}
            {isVerified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/95 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow">
                <ShieldCheck className="h-3 w-3" /> Verified
              </span>
            ) : null}
          </div>

          {/* BOTTOM: Name + age + city + distance */}
          <div className="absolute inset-x-0 bottom-0 px-4 pb-4 pt-10 text-white">
            <div className="flex items-end gap-2">
              <h3 className="truncate text-xl font-extrabold leading-tight drop-shadow-sm">
                {name}
                <CloneVipNameMedia userId={u.id} />
              </h3>
              {typeof u.age === "number" ? (
                <span className="pb-0.5 text-lg font-bold text-white/90">{u.age}</span>
              ) : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-white/90">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{city}</span>
              </span>
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                📍 {u.distance_label}
              </span>
              {intent ? (
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold backdrop-blur">
                  {intent.emoji} {intent.label}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </button>

      {/* Actions */}
      <div className="flex gap-2 p-3">
        <button
          type="button"
          onClick={handleLikeClick}
          className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold transition active:scale-95 ${
            popping ? "nearby-pop" : ""
          } ${
            liked
              ? "bg-gradient-to-r from-rose-500 to-fuchsia-500 text-white shadow-md shadow-rose-500/40"
              : "border-2 border-rose-200 bg-white text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:bg-card dark:text-rose-300 dark:hover:bg-rose-950/30"
          }`}
        >
          <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
          {liked ? "Đã quan tâm" : "Quan tâm"}
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onChat(); }}
          className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-foreground/90 text-sm font-bold text-background transition hover:bg-foreground active:scale-95"
        >
          <MessageCircle className="h-4 w-4" />
          Nhắn tin
        </button>
      </div>

      {/* Heart-fly burst */}
      {flyKey > 0 ? (
        <span key={flyKey} className="nearby-heart-fly" aria-hidden="true">💖</span>
      ) : null}
    </article>
  );
}
