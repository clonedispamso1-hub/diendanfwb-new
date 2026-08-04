/**
 * /nearby — Tìm quanh đây (Zalo Dating style — persistent daily picks).
 *
 * - 20 clone picks/ngày được lock vào localStorage cho mỗi user; điều hướng đi
 *   đâu rồi quay lại đều thấy cùng 20 hồ sơ. Chỉ rotate khi user "tiêu thụ"
 *   (nhắn tin/quan tâm/follow) hoặc khi sang ngày mới.
 * - "Đang hoạt động" hiển thị clones mà user đã tương tác (interacted set).
 * - Bấm card → điều hướng thẳng tới /profile/:id (không còn mini-profile popup).
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, RefreshCw, Sparkles, Eye, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/candy/auth-provider";
import { fetchNearbyUsers, type NearbyUser } from "@/lib/location/nearby-store";
import {
  hydrateNearbyInterests, subscribeInterest, getInterestSet, getInterestSetServer,
} from "@/lib/nearby-interest-store";
import { NearbyGridCard } from "@/components/location/nearby-grid-card";
import { NearbyDailyLimitModal } from "@/components/location/nearby-daily-limit-modal";
import { NearbyGeolocationGuard } from "@/components/location/nearby-geolocation-guard";
import {
  bumpNearbyViews,
  getNearbyViewsToday,
} from "@/components/location/nearby-daily-limit";
import {
  ensureDailyPicks,
  loadInteracted,
  markInteracted,
  rotateOutPick,
  subscribeInteracted,
} from "@/lib/nearby-daily-cache";

const DAILY_VIEW_LIMIT = 20;
const DAILY_CLONE_QUOTA = 20;

function useInterestSet(): Set<string> {
  return useSyncExternalStore(subscribeInterest, getInterestSet, getInterestSetServer);
}
function useInteractedSet(uid: string | undefined | null): string[] {
  return useSyncExternalStore(
    subscribeInteracted,
    () => (uid ? loadInteracted(uid).join(",") : ""),
    () => "",
  ).split(",").filter(Boolean);
}

// Deterministic per-day shuffle so the "candidate pool order" is stable.
function ymdKey() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function dailyShuffle<T>(arr: T[], uid: string): T[] {
  const rnd = mulberry32(hashStr(`${uid}:${ymdKey()}`));
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isFemaleClone(u: NearbyUser & { gender?: string | null }): boolean {
  if (!u.is_clone) return false;
  const g = ((u as any).gender ?? "").toString().toLowerCase();
  return !g || g === "female" || g === "f" || g === "nu" || g === "nữ";
}

function NearbyUsersPageInner() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const interestSet = useInterestSet();
  const interactedIds = useInteractedSet(me?.id);

  const [users, setUsers] = useState<NearbyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewsToday, setViewsToday] = useState<number>(0);
  const [isVipUser, setIsVipUser] = useState<boolean>(false);
  const [showLimitModal, setShowLimitModal] = useState(false);

  useEffect(() => {
    if (!me?.id) return;
    setViewsToday(getNearbyViewsToday(me.id));
    setIsVipUser(Boolean((me as any)?.vip_level && (me as any).vip_level > 0));
  }, [me?.id]);

  useEffect(() => { void hydrateNearbyInterests(); }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const { data, error: err } = await fetchNearbyUsers({
      radiusKm: null,
      sort: "online",
      limit: 200,
    });
    if (err) { setError(err); setUsers([]); setLoading(false); return; }
    // Clones luôn online theo UX.
    const normalized = data.map((u) =>
      u.is_clone ? ({ ...u, is_online: true }) : u
    );
    setUsers(normalized);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Candidate pool: clones nữ, đã sort deterministic theo (uid, ymd).
  const candidatePool = useMemo(() => {
    if (!me?.id) return [] as NearbyUser[];
    const female = users.filter((u) => isFemaleClone(u as any));
    return dailyShuffle(female, me.id);
  }, [users, me?.id]);

  // 20 picks bị "lock" trong localStorage cho hôm nay.
  const dailyPickIds = useMemo(() => {
    if (!me?.id || candidatePool.length === 0) return [] as string[];
    return ensureDailyPicks(me.id, candidatePool.map((u) => u.id)).slice(0, DAILY_CLONE_QUOTA);
  }, [candidatePool, me?.id]);

  const dailyGrid = useMemo(() => {
    if (dailyPickIds.length === 0) return [] as NearbyUser[];
    const byId = new Map(users.map((u) => [u.id, u]));
    return dailyPickIds.map((id) => byId.get(id)).filter(Boolean) as NearbyUser[];
  }, [dailyPickIds, users]);

  // ===== "Đang hoạt động" — chỉ những clone mà user đã tương tác =====
  const activeNowRow = useMemo(() => {
    if (interactedIds.length === 0) return [] as NearbyUser[];
    const byId = new Map(users.map((u) => [u.id, u]));
    return interactedIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((u) => ({ ...(u as NearbyUser), is_online: true }))
      .slice(0, 14) as NearbyUser[];
  }, [interactedIds, users]);

  const handleOpenProfile = useCallback((u: NearbyUser) => {
    // Cap views/day for non-VIP on clones.
    if (!isVipUser && u.is_clone) {
      const current = me?.id ? getNearbyViewsToday(me.id) : 0;
      if (current >= DAILY_VIEW_LIMIT) {
        setShowLimitModal(true);
        return;
      }
      if (me?.id) {
        const n = bumpNearbyViews(me.id, 1);
        setViewsToday(n);
      }
    }
    navigate(`/profile/${u.id}`);
  }, [isVipUser, me?.id, navigate]);

  const handleOpenChat = useCallback((u: NearbyUser) => {
    if (me?.id) {
      markInteracted(me.id, u.id);
      // Rotate the consumed pick.
      rotateOutPick(me.id, u.id, candidatePool.map((c) => c.id));
    }
    navigate(`/chat/${u.id}`);
  }, [me?.id, candidatePool, navigate]);

  void interestSet;

  const remaining = Math.max(0, DAILY_VIEW_LIMIT - viewsToday);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-3 pb-8 pt-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold leading-tight">Tìm quanh đây</h1>
          <p className="text-[11px] text-muted-foreground">
            {isVipUser
              ? "VIP · không giới hạn lượt xem"
              : `Còn ${remaining}/${DAILY_VIEW_LIMIT} lượt xem hôm nay`}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void load()}
          disabled={loading}
          className="h-9 gap-1 rounded-full px-3 text-xs"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      {/* ===== Đang hoạt động — clones user đã tương tác ===== */}
      {activeNowRow.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Đang hoạt động
            </h3>
            <span className="text-[10px] text-muted-foreground">{activeNowRow.length}</span>
          </div>
          <div className="-mx-3 flex gap-3 overflow-x-auto px-3 pb-1">
            {activeNowRow.map((u) => {
              const name = (u.full_name || u.username || "—").split(/\s+/).pop();
              return (
                <button
                  key={u.id}
                  onClick={() => navigate(`/profile/${u.id}`)}
                  className="group flex w-[68px] shrink-0 flex-col items-center gap-1"
                >
                  <div className="relative">
                    <div className="h-16 w-16 overflow-hidden rounded-full ring-2 ring-emerald-500 ring-offset-2 ring-offset-card">
                      <img
                        src={u.avatar || "/placeholder.svg"}
                        alt=""
                        loading="lazy"
                        className="h-full w-full rounded-full object-cover"
                      />
                    </div>
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 animate-pulse rounded-full bg-emerald-500 ring-2 ring-card" />
                  </div>
                  <span className="w-full truncate text-center text-[11px] font-medium">
                    {name}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Không tải được: {error}
        </div>
      ) : null}

      {loading && users.length === 0 ? (
        <div className="grid place-items-center py-16">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải thành viên gần bạn…
          </div>
        </div>
      ) : null}

      {!loading && dailyGrid.length > 0 ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">
              <Sparkles className="h-3.5 w-3.5 text-rose-500" />
              Gợi ý hôm nay
            </h3>
            <span className="text-[10px] text-muted-foreground">{dailyGrid.length} người</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {dailyGrid.map((u) => (
              <div key={u.id} className="flex flex-col gap-2">
                <NearbyGridCard user={u} onOpen={() => handleOpenProfile(u)} />
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleOpenProfile(u)}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-full border bg-card text-[11px] font-semibold hover:bg-muted"
                  >
                    <Eye className="h-3 w-3" /> Xem hồ sơ
                  </button>
                  <button
                    onClick={() => handleOpenChat(u)}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-full bg-rose-500 text-[11px] font-semibold text-white hover:bg-rose-600"
                  >
                    <MessageCircle className="h-3 w-3" /> Nhắn tin
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!isVipUser ? (
            <button
              onClick={() => setShowLimitModal(true)}
              className="mt-2 w-full rounded-2xl border border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/10 px-4 py-3 text-center text-xs font-semibold text-amber-700 dark:text-amber-200 hover:bg-amber-50/80"
            >
              ✨ Muốn xem thêm? Tham gia nhóm Zalo VIP để mở khóa không giới hạn
            </button>
          ) : null}
        </section>
      ) : null}

      {!loading && dailyGrid.length === 0 && !error ? (
        <div className="mt-6 rounded-3xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Chưa có gợi ý hôm nay. Hãy thử <button className="underline" onClick={() => void load()}>làm mới</button>.
        </div>
      ) : null}

      <NearbyDailyLimitModal
        open={showLimitModal}
        onClose={() => setShowLimitModal(false)}
      />
    </div>
  );
}

export function NearbyUsersPage() {
  return (
    <NearbyGeolocationGuard>
      <NearbyUsersPageInner />
    </NearbyGeolocationGuard>
  );
}

export default NearbyUsersPage;
