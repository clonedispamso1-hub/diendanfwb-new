import { resolveUserName } from "@/lib/user-name";
import { avatarSrc } from "@/lib/image-cdn";
// PHASE 3.4 + 3.8 — Hồ sơ NHANH (bottom sheet) khi bấm avatar Nearby.
import { useEffect, useState } from "react";
import { Heart, MessageCircle, X, MapPin, Ruler, Weight, Camera, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import UniversalBadge from "@/components/candy/universal-badge";

import { INTENT_LABELS } from "@/lib/location/nearby-enrich";
import { ZaloVipLockModal } from "@/components/candy/zalo-vip-lock-modal";

const VIRTUAL_TABLE = "nicktuongtac";

const sb = supabase as unknown as any;

function missingColumnName(error: any): string | null {
  const msg = error?.message || "";
  return msg.match(/column "?([a-zA-Z_]+)"? .* does not exist/i)?.[1]
    || msg.match(/Could not find the '([a-zA-Z_]+)' column/i)?.[1]
    || null;
}

async function loadVirtualMiniProfile(userId: string): Promise<any | null> {
  let cols = [
    "id", "username", "display_name", "full_name", "avatar", "avatar_url", "age",
    "province", "location", "bio", "vip_level", "trust_score", "intent",
  ];
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await sb
      .from(VIRTUAL_TABLE)
      .select(cols.join(", "))
      .eq("id", userId)
      .maybeSingle();
    if (!error) return data;
    const missing = missingColumnName(error);
    if (missing && cols.includes(missing)) {
      cols = cols.filter((c) => c !== missing);
      continue;
    }
    return null;
  }
  return null;
}

// Deterministic helpers — give every clone a stable fake UID / trust score / followers
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h >>> 0;
}
function makeShortUid(id: string): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  let h = hashId(id), s = "";
  for (let i = 0; i < 6; i++) { s += A[h % A.length]; h = Math.floor(h / A.length) + 7; }
  return s;
}
function makeTrustScore(id: string): number { return 95 + (hashId(id) % 5); }
function makeFollowersCount(id: string): number { return 1 + (hashId(id + "f") % 5000); }

export interface MiniProfileData {
  id: string;
  full_name: string | null;
  username: string | null;
  avatar: string | null;
  age: number | null;
  province: string | null;
  city: string | null;
  bio?: string | null;
  photos?: string[] | null;
  height?: number | null;
  weight?: number | null;
  verified?: boolean | null;
  trust_score?: number | null;
  vip_level?: number | null;
  intent?: string | null;
  interests?: string[] | null;
}

export interface NearbyMiniProfileProps {
  userId: string | null;
  fallback?: MiniProfileData | null;
  /** Đánh dấu nick ảo do admin tạo — khoá Story/Bài đăng sau Zalo VIP. */
  isClone?: boolean;
  interested: boolean;
  onClose: () => void;
  onToggleInterest: () => void;
  onOpenChat: () => void;
}

export function NearbyMiniProfile({
  userId, fallback, isClone, interested, onClose, onToggleInterest, onOpenChat,
}: NearbyMiniProfileProps) {
  const [data, setData] = useState<MiniProfileData | null>(fallback ?? null);
  const [vipLock, setVipLock] = useState<{ open: boolean; title?: string; message?: string }>({ open: false });

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data: p } = await sb
        .from("profiles")
        .select("id, full_name, username, avatar, age, province, city, bio, photos, height, weight, verified, trust_score, vip_level, intent, interests")
        .eq("id", userId)
        .maybeSingle();
      const fp = await loadVirtualMiniProfile(userId);
      if (!cancelled && fp) {
        setData({
          id: fp.id,
          full_name: resolveUserName(fp as any),
          username: fp.username ?? null,
          avatar: fp.avatar || fp.avatar_url || null,
          age: fp.age ?? null,
          province: fp.province ?? fp.location ?? null,
          city: null,
          bio: fp.bio ?? null,
          vip_level: fp.vip_level ?? 0,
          trust_score: fp.trust_score ?? makeTrustScore(fp.id),
          intent: fp.intent ?? null,
        });
        return;
      }
      if (!cancelled && p) setData(p as MiniProfileData);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [userId, onClose]);

  if (!userId) return null;
  const d = data ?? fallback;
  const name = d?.full_name || "Người dùng";
  const cityText = d?.city || d?.province || "Việt Nam";
  const photos = Array.isArray(d?.photos) ? d!.photos!.slice(0, 6) : [];
  const intent = d?.intent && INTENT_LABELS[d.intent as keyof typeof INTENT_LABELS];
  const isVip = (d?.vip_level ?? 0) > 0;
  const interests = (d?.interests ?? []).slice(0, 8);

  return (
    <div className="fixed inset-0 z-[95] grid place-items-end sm:place-items-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-background/80 backdrop-blur hover:bg-background"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Hero */}
        <div className="relative">
          <img loading="lazy" decoding="async"
            src={avatarSrc(d?.avatar || "/placeholder.svg", 64)}
            alt={name}
            className="h-72 w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-5 text-white">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold">
                {name}{typeof d?.age === "number" ? <span className="font-normal opacity-90">, {d.age}</span> : null}
              </h2>
              <UniversalBadge
                profile={{
                  id: d?.id ?? null,
                  is_virtual: true,
                  province: d?.province ?? d?.city ?? null,
                }}
              />
              {isVip ? (
                <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase shadow">
                  VIP
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm opacity-90">
              <MapPin className="h-3.5 w-3.5" /> {cityText}
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Badges row */}
          <div className="flex flex-wrap gap-2">
            {intent ? (
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${intent.tone}`}>
                {intent.emoji} {intent.label}
              </span>
            ) : null}
          </div>

          {/* Bio */}
          {d?.bio ? (
            <p className="rounded-2xl bg-muted/50 p-3 text-sm leading-relaxed">{d.bio}</p>
          ) : null}

          {/* Stats */}
          {(d?.height || d?.weight) ? (
            <div className="grid grid-cols-2 gap-2">
              {d?.height ? (
                <div className="flex items-center gap-2 rounded-2xl border bg-muted/30 p-3">
                  <Ruler className="h-4 w-4 text-rose-500" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Chiều cao</div>
                    <div className="text-sm font-bold">{d.height} cm</div>
                  </div>
                </div>
              ) : null}
              {d?.weight ? (
                <div className="flex items-center gap-2 rounded-2xl border bg-muted/30 p-3">
                  <Weight className="h-4 w-4 text-fuchsia-500" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cân nặng</div>
                    <div className="text-sm font-bold">{d.weight} kg</div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Interests */}
          {interests.length > 0 ? (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sở thích</div>
              <div className="flex flex-wrap gap-1.5">
                {interests.map((i) => (
                  <span key={i} className="rounded-full bg-muted px-2.5 py-1 text-xs">#{i}</span>
                ))}
              </div>
            </div>
          ) : null}

          {/* Photo grid */}
          {photos.length > 0 ? (
            <div>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Ảnh</div>
              <div className="grid grid-cols-3 gap-1.5">
                {photos.map((p, i) => (
                  <img decoding="async" key={i} src={p} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            </div>
          ) : null}

          {/* Clone metadata: UID · Followers */}
          {isClone ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border bg-muted/30 p-2 text-center">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">ID</div>
                <div className="text-xs font-bold tabular-nums">{makeShortUid(userId!)}</div>
              </div>
              <button
                type="button"
                onClick={() => alert(`Người yêu thích: ${makeFollowersCount(userId!).toLocaleString("vi-VN")}\n(Danh sách sẽ hiển thị các thành viên trong khu vực)`)}
                className="rounded-2xl border bg-muted/30 p-2 text-center hover:bg-muted/60"
              >
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Followers</div>
                <div className="text-xs font-bold text-rose-500">{makeFollowersCount(userId!).toLocaleString("vi-VN")}</div>
              </button>
            </div>
          ) : null}

          {/* Tabs Story / Bài đăng — clones bị chặn bằng modal Zalo VIP */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { if (isClone) setVipLock({ open: true }); }}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border bg-muted/30 text-sm font-medium hover:bg-muted/60"
            >
              <Camera className="h-4 w-4" /> Story {isClone ? "🔒" : ""}
            </button>
            <button
              onClick={() => { if (isClone) setVipLock({ open: true }); }}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border bg-muted/30 text-sm font-medium hover:bg-muted/60"
            >
              <FileText className="h-4 w-4" /> Bài đăng {isClone ? "🔒" : ""}
            </button>
          </div>

        </div>

        <div className="sticky bottom-0 flex gap-2 border-t bg-card/95 p-3 backdrop-blur">
          <Button
            onClick={onToggleInterest}
            className={`h-11 flex-1 rounded-full gap-2 ${interested ? "bg-rose-500 text-white hover:bg-rose-600" : ""}`}
            variant={interested ? "default" : "outline"}
          >
            <Heart className={`h-4 w-4 ${interested ? "fill-current" : ""}`} />
            {interested ? "Đã quan tâm" : "Quan tâm"}
          </Button>
          <Button onClick={onOpenChat} variant="secondary" className="h-11 flex-1 rounded-full gap-2">
            <MessageCircle className="h-4 w-4" /> Nhắn tin
          </Button>
        </div>
      </div>

      <ZaloVipLockModal
        open={vipLock.open}
        title={vipLock.title}
        message={vipLock.message}
        onClose={() => setVipLock({ open: false })}
      />
    </div>
  );
}

export default NearbyMiniProfile;
