/**
 * PHASE 3.9 — Giới hạn lượt xem mỗi ngày cho user thường.
 * KHÔNG sửa logic Match. Chỉ là gate UI ở client cho phần Nearby.
 */

import { useEffect, useState } from "react";
import { Crown, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

const KEY_PREFIX = "nearby_views_v1_";

function todayKey(uid: string) {
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${KEY_PREFIX}${uid}_${ymd}`;
}

export function getNearbyViewsToday(uid: string | null | undefined): number {
  if (!uid || typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(todayKey(uid));
  return raw ? Math.max(0, parseInt(raw, 10) || 0) : 0;
}

export function bumpNearbyViews(uid: string | null | undefined, by: number = 1): number {
  if (!uid || typeof window === "undefined") return 0;
  const next = getNearbyViewsToday(uid) + by;
  try { window.localStorage.setItem(todayKey(uid), String(next)); } catch { /* noop */ }
  return next;
}

/** First-visit-of-day marker for cảm-giác-đông-người banner. */
const FIRST_KEY_PREFIX = "nearby_first_v1_";
export function isFirstNearbyVisitToday(uid: string | null | undefined): boolean {
  if (!uid || typeof window === "undefined") return false;
  const d = new Date();
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const k = `${FIRST_KEY_PREFIX}${uid}`;
  const last = window.localStorage.getItem(k);
  if (last === ymd) return false;
  try { window.localStorage.setItem(k, ymd); } catch { /* noop */ }
  return true;
}

function nextResetIn(): string {
  const now = new Date();
  const next = new Date(now);
  next.setDate(now.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  const ms = next.getTime() - now.getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}p`;
}

export function NearbyDailyLimitGate({
  onUpgrade,
}: {
  onUpgrade?: () => void;
}) {
  const [resetIn, setResetIn] = useState<string>(nextResetIn());
  useEffect(() => {
    const t = window.setInterval(() => setResetIn(nextResetIn()), 60_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="mx-auto mt-6 max-w-sm overflow-hidden rounded-3xl border bg-card text-center shadow-xl">
      <div
        className="px-6 py-10"
        style={{
          background:
            "linear-gradient(135deg, rgba(236,72,153,.12), rgba(168,85,247,.10) 60%, rgba(255,255,255,0))",
        }}
      >
        <div
          className="mx-auto grid h-20 w-20 place-items-center rounded-full text-3xl shadow-lg"
          style={{
            background: "linear-gradient(135deg, #ec4899, #a855f7)",
            boxShadow: "0 18px 40px -10px rgba(236,72,153,.55)",
          }}
        >
          💫
        </div>
        <h3 className="mt-5 text-lg font-extrabold">Bạn đã xem hết thành viên hôm nay</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Hãy quay lại sau hoặc nâng cấp VIP để khám phá không giới hạn.
        </p>
      </div>

      <div className="space-y-2 p-5">
        <Button
          onClick={onUpgrade}
          className="h-11 w-full gap-2 rounded-full bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 text-white shadow-lg shadow-rose-500/30 hover:opacity-95"
        >
          <Crown className="h-4 w-4" />
          Nâng cấp VIP — mở khóa không giới hạn
        </Button>
        <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Quay lại sau {resetIn}
        </div>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/80">
          <Sparkles className="h-3 w-3" />
          Mỗi ngày bạn sẽ có thêm lượt xem mới
        </div>
      </div>
    </div>
  );
}

export default NearbyDailyLimitGate;
