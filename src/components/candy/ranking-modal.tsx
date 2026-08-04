import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, MapPin } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { IdentityBadges } from "@/components/candy/identity-badges";
import { formatCompact } from "@/lib/format";
import { Portal } from "@/components/candy/portal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";

/* ---------------- Types ---------------- */
export type RankingTab = "follow" | "posts" | "users" | "tuongtac" | "stars";

type GroupId = "stars" | "follow";

interface RowItem {
  id: string;
  user_id: string;
  name: string;
  avatar: string | null;
  score: number;
  location?: string | null;
  title_gif_url?: string | null;
  created_at?: string | null;
  vip_level?: number | null;
  is_admin?: boolean | null;
}

interface RankingModalProps {
  type?: RankingTab;
  onClose: () => void;
}

/* ---------------- Component ---------------- */

export function RankingModal({ onClose }: RankingModalProps) {
  // Chỉ còn duy nhất 1 bảng: TOP TƯƠNG TÁC TUẦN.
  const [items, setItems] = useState<RowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const reloadTimer = useRef<any>(null);

  useBodyScrollLock(true);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      setLoading(true);
      try {
        const { data: rows, error } = await supabase.rpc("leaderboard_active_stars_week");
        if (error) throw error;
        let data: RowItem[] = (rows || []).map(mapRow).slice(0, 10);

        const uids = data.map((r) => r.user_id).filter(Boolean);
        if (uids.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, province, region, location, title_gif_url, created_at, vip_level, is_admin, role")
            .in("id", uids);
          const map = new Map<string, any>();
          (profs || []).forEach((p: any) => map.set(p.id, p));
          data = data.map((r) => {
            const p = map.get(r.user_id);
            return {
              ...r,
              location: p ? (p.region || p.province || p.location || null) : null,
              title_gif_url: p?.title_gif_url || null,
              created_at: p?.created_at ?? null,
              vip_level: p?.vip_level ?? null,
              is_admin: p?.is_admin === true || p?.role === "admin",
            };
          });
        }

        if (!alive) return;
        setItems(data);
      } catch (err) {
        console.warn("[ranking-modal] load error", err);
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load();

    const scheduleReload = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => { if (alive) void load(); }, 900);
    };

    const ch = supabase.channel("rt-lb-week");
    ch.on("postgres_changes", { event: "*", schema: "public", table: "posts" }, scheduleReload);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "likes" }, scheduleReload);
    ch.on("postgres_changes", { event: "*", schema: "public", table: "comments" }, scheduleReload);
    ch.subscribe();

    return () => {
      alive = false;
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      void supabase.removeChannel(ch);
    };
  }, []);

  const title = "TOP TƯƠNG TÁC TUẦN";

  return (
    <Portal>
      <AnimatePresence>
        <motion.div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 9999 }}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          {/* iOS-style light backdrop */}
          <div
            className="absolute inset-0"
            style={{
              background: "rgba(15, 23, 42, 0.25)",
              backdropFilter: "blur(14px) saturate(140%)",
            }}
          />

          <motion.div
            className="relative w-full max-w-md max-h-[88vh] h-[88vh] sm:h-auto flex flex-col overflow-hidden"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            style={{
              borderRadius: 24,
              background: "#ffffff",
              border: "1px solid rgba(15,23,42,0.06)",
              boxShadow: "0 24px 60px -20px rgba(15,23,42,0.28)",
            }}
          >
            {/* Header */}
            <div className="relative flex items-center justify-between border-b border-slate-100 px-5 pt-5 pb-4">
              <div className="min-w-0 pr-3">
                <h3 className="truncate text-[16px] font-bold tracking-tight text-slate-900">
                  {title}
                </h3>
                <p className="mt-1 text-[12px] font-medium text-slate-500">
                  Cập nhật theo thời gian thực
                </p>
              </div>
              <button
                onClick={onClose}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 active:scale-95"
                aria-label="Đóng"
              >
                <X size={16} strokeWidth={2.5} />
              </button>
            </div>

            {/* Chỉ còn 1 bảng duy nhất — không còn tab. */}
            <div className="px-4 pt-3 pb-1">
              <div
                className="flex items-center justify-center py-1.5 text-[13px] font-semibold text-slate-900"
                style={{ borderRadius: 12, background: "#f1f5f9" }}
              >
                Top tương tác tuần
              </div>
            </div>

            {/* List */}
            <div
              data-scroll-lock-ignore
              className="relative flex-1 min-h-0 overflow-y-auto px-4 pb-6 pt-1"
              style={{
                scrollbarWidth: "thin",
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
              }}
            >
              {loading && (
                <p className="py-12 text-center text-sm text-slate-400">Đang tải…</p>
              )}
              {!loading && items.length === 0 && (
                <p className="py-12 text-center text-sm text-slate-400">
                  Chưa có ai tương tác trong tuần này.
                </p>
              )}

              <div className="flex flex-col gap-2.5">
                {items.map((item, index) => (
                  <LbCard
                    key={item.id}
                    item={item}
                    rank={index + 1}
                    index={index}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>

      <style>{`
        @keyframes lb-shine {
          0%   { transform: translateX(-120%) skewX(-20deg); }
          60%  { transform: translateX(220%)  skewX(-20deg); }
          100% { transform: translateX(220%)  skewX(-20deg); }
        }
      `}</style>
    </Portal>
  );
}

/* ---------------- Card ---------------- */

const RANK_STYLES: Record<number, { bg: string; ring: string; text: string; label: string }> = {
  1: { bg: "linear-gradient(135deg,#fbbf24,#f59e0b)", ring: "rgba(245,158,11,0.55)", text: "#7c2d12", label: "🥇 Top 1" },
  2: { bg: "linear-gradient(135deg,#e5e7eb,#9ca3af)", ring: "rgba(148,163,184,0.55)", text: "#1f2937", label: "🥈 Top 2" },
  3: { bg: "linear-gradient(135deg,#fdba74,#f97316)", ring: "rgba(249,115,22,0.5)",  text: "#7c2d12", label: "🥉 Top 3" },
};

function badgeStyle(rank: number) {
  if (RANK_STYLES[rank]) return RANK_STYLES[rank];
  return {
    bg: "linear-gradient(135deg,#c4b5fd,#f0abfc)",
    ring: "rgba(139,92,246,0.35)",
    text: "#4c1d95",
    label: `Top ${rank}`,
  };
}

function LbCard({
  item, rank, index,
}: { item: RowItem; rank: number; index: number }) {
  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "🏅";
  const rankColor =
    rank === 1 ? "#f59e0b" : rank === 2 ? "#64748b" : rank === 3 ? "#c2410c" : "#94a3b8";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: index * 0.04, ease: "easeOut" }}
      className="relative"
      style={{
        borderRadius: 16,
        padding: "10px 12px",
        background: "#ffffff",
        border: "1px solid rgba(15,23,42,0.06)",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <div className="relative flex items-center gap-3">
        {/* Rank medal + number */}
        <div
          className="flex flex-shrink-0 flex-col items-center justify-center"
          style={{ width: 36 }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }} aria-hidden>
            {medal}
          </span>
          <span
            className="mt-0.5 tabular-nums font-semibold"
            style={{ fontSize: 11, color: rankColor }}
          >
            #{rank}
          </span>
        </div>

        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <AvatarGlow
            avatar={item.avatar || null}
            userId={item.user_id}
            size={44}
            alt={item.name}
            style={{
              border: "1px solid rgba(15,23,42,0.08)",
              borderRadius: "50%",
            }}
          />
        </div>

        {/* Name + badges + location */}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold text-slate-900">
              {item.name}
            </span>
            <IdentityBadges
              profile={{
                id: item.user_id,
                created_at: item.created_at,
                vip_level: item.vip_level ?? undefined,
                is_admin: item.is_admin ?? undefined,
              }}
              isTopOverride
              size={14}
              gap={3}
            />
          </div>
          {item.location ? (
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
              <MapPin size={12} strokeWidth={2} />
              <span className="truncate">{item.location}</span>
            </div>
          ) : null}
        </div>

        {/* Score — number only, no label */}
        <div className="flex flex-shrink-0 items-center pl-2">
          <span
            className="tabular-nums font-bold text-slate-900"
            style={{ fontSize: 17 }}
          >
            {formatCompact(item.score || 0)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

/* ---------------- Helpers ---------------- */

function mapRow(r: any): RowItem {
  const uid: string = r.user_id || r.author_id;
  return {
    id: uid,
    user_id: uid,
    name: r.full_name || "Người dùng",
    avatar: r.avatar || null,
    score: Number(r.score ?? r.total_interactions ?? 0),
  };
}
