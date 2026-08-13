import { avatarSrc } from "@/lib/image-cdn";
/**
 * PHASE 3.8 — Tab "Lướt nhanh" cho Nearby.
 * Một stack card đơn giản, swipe trái (bỏ qua) / phải (quan tâm).
 */
import { useState } from "react";
import { Heart, X, MapPin } from "lucide-react";
import UniversalBadge from "@/components/candy/universal-badge";
import { INTENT_LABELS, type NearbyProfileExtra } from "@/lib/location/nearby-enrich";
import type { NearbyUser } from "@/lib/location/nearby-store";

interface Props {
  users: NearbyUser[];
  extras: Record<string, NearbyProfileExtra>;
  onLike: (u: NearbyUser) => void;
  onSkip?: (u: NearbyUser) => void;
}

export function NearbySwipeDeck({ users, extras, onLike, onSkip }: Props) {
  const [idx, setIdx] = useState(0);

  if (!users.length || idx >= users.length) {
    return (
      <div className="mx-auto mt-6 max-w-sm rounded-3xl border bg-card p-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-rose-500/10 text-2xl">✨</div>
        <p className="mt-3 text-sm font-semibold">Hết người để lướt!</p>
        <p className="mt-1 text-xs text-muted-foreground">Đổi sang tab Khám phá hoặc làm mới sau.</p>
      </div>
    );
  }

  const u = users[idx];
  const ex = extras[u.id];
  const next = (vote: "like" | "skip") => {
    if (vote === "like") onLike(u);
    else onSkip?.(u);
    setIdx((i) => i + 1);
  };

  const intent = ex?.intent && INTENT_LABELS[ex.intent];
  const name = u.full_name || "Người dùng";

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 pt-2">
      <div className="relative w-full overflow-hidden rounded-3xl border bg-card shadow-xl">
        <div className="relative aspect-[3/4] w-full">
          <img loading="lazy" decoding="async" src={avatarSrc(u.avatar || "/placeholder.svg", 64)} alt={name} className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-4 text-white">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold">{name}{typeof u.age === "number" ? `, ${u.age}` : ""}</h3>
              <UniversalBadge
                profile={{
                  id: u.id,
                  is_virtual: true,
                  province: u.province ?? u.city ?? null,
                }}
              />
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs opacity-90">
              <MapPin className="h-3 w-3" /> {u.city || u.province || "Việt Nam"} · {u.distance_label}
            </div>
            {intent ? (
              <span className="mt-2 inline-block rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur">
                {intent.emoji} {intent.label}
              </span>
            ) : null}
            {ex?.bio ? <p className="mt-2 line-clamp-2 text-xs opacity-90">{ex.bio}</p> : null}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <button
          onClick={() => next("skip")}
          className="grid h-14 w-14 place-items-center rounded-full border-2 border-zinc-300 bg-card text-zinc-500 shadow-md transition active:scale-90"
          aria-label="Bỏ qua"
        >
          <X className="h-6 w-6" />
        </button>
        <button
          onClick={() => next("like")}
          className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-500 text-white shadow-lg shadow-rose-500/40 transition active:scale-90"
          aria-label="Quan tâm"
        >
          <Heart className="h-7 w-7 fill-current" />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {idx + 1} / {users.length}
      </p>
    </div>
  );
}
