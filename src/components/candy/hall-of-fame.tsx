import { useEffect, useState } from "react";
import { Crown, Gem, Heart, Trophy, Medal, Star, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Props {
  userId: string;
  isOwn: boolean;
}

interface Achievement {
  key: string;
  category: "gem" | "follow" | "post" | "vip";
  rank: number | null;    // 1..N globally, hoặc null nếu không xếp hạng được
  label: string;
  metric: string;
  monthLabel: string;
}

const CATEGORY_META: Record<Achievement["category"], { icon: typeof Crown; accent: string; title: string }> = {
  gem:    { icon: Gem,   accent: "text-amber-500",   title: "Top Gem" },
  follow: { icon: Heart, accent: "text-rose-500",    title: "Top Follow" },
  post:   { icon: Star,  accent: "text-indigo-500",  title: "Top Bài Viết" },
  vip:    { icon: Crown, accent: "text-yellow-500",  title: "VIP" },
};

function rankBadge(rank: number | null) {
  if (rank === 1) return { Icon: Crown,    label: "#1",     cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" };
  if (rank === 2) return { Icon: Medal,    label: "#2",     cls: "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300" };
  if (rank === 3) return { Icon: Medal,    label: "#3",     cls: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" };
  if (rank && rank <= 100) return { Icon: Trophy,   label: `TOP ${rank}`, cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" };
  return { Icon: Sparkles, label: "TÍCH CỰC", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" };
}

export function HallOfFame({ userId, isOwn }: Props) {
  const [items, setItems] = useState<Achievement[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const monthStart = new Date();
        monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const monthIso = monthStart.toISOString();
        const monthLabel = `Tháng ${monthStart.getMonth() + 1}/${monthStart.getFullYear()}`;

        // 1) Snapshot hồ sơ (xem được công khai cho các trường thống kê)
        const { data: prof } = await supabase
          .from("profiles" as any)
          .select("id, gem_balance, vip_level, followers_count")
          .eq("id", userId)
          .maybeSingle();
        const candy = Number((prof as any)?.candy || 0);
        const vip = Number((prof as any)?.vip_level || 0);
        const followers = Number((prof as any)?.followers_count || 0);

        // 2) Tổng Gem nhận trong tháng (RLS: chính chủ hoặc receiver được xem)
        let gemMonth = 0;
        try {
          const { data: gtx } = await supabase
            .from("gem_transactions" as any)
            .select("amount")
            .eq("to_id", userId)
            .gte("created_at", monthIso)
            .limit(2000);
          if (Array.isArray(gtx)) {
            gemMonth = gtx.reduce((s: number, r: any) => s + Math.max(0, Number(r.amount || 0)), 0);
          }
        } catch { /* table optional */ }

        // 3) Số bài viết tháng này (thử nhiều tên cột để tương thích DB cũ)
        let postsMonth = 0;
        for (const col of ["user_id", "author_id", "owner_id"]) {
          try {
            const { count, error } = await supabase
              .from("posts" as any)
              .select("*", { count: "exact", head: true })
              .eq(col, userId)
              .gte("created_at", monthIso);
            if (!error) { postsMonth = count || 0; break; }
          } catch { /* try next */ }
        }

        // 4) Xếp hạng toàn cục (count those strictly greater → rank = count + 1)
        const safeCount = async (q: any): Promise<number | null> => {
          try { const { count, error } = await q; return error ? null : (count ?? 0); }
          catch { return null; }
        };

        const candyHigher = candy > 0
          ? await safeCount(supabase.from("profiles" as any).select("*", { count: "exact", head: true }).gt("gem_balance", candy))
          : null;
        const candyRank = candyHigher == null ? null : candyHigher + 1;

        const followerHigher = followers > 0
          ? await safeCount(supabase.from("profiles" as any).select("*", { count: "exact", head: true }).gt("followers_count", followers))
          : null;
        const followerRank = followerHigher == null ? null : followerHigher + 1;

        const out: Achievement[] = [];

        // Top Gem — KHÔNG bao giờ hiển thị số dư tổng (gem_balance) trên hồ sơ
        // người khác. Chỉ hiển thị khi có Gem nhận trong tháng (số liệu công khai
        // của leaderboard). Nếu là chính chủ, vẫn có thể thấy hạng tổng tích lũy.
        if (gemMonth > 0) {
          out.push({
            key: "gem",
            category: "gem",
            rank: candyRank,
            label: "Top Gem",
            metric: `${gemMonth.toLocaleString("vi-VN")} Gem nhận trong tháng`,
            monthLabel,
          });
        } else if (isOwn && candyRank && candyRank <= 100) {
          out.push({
            key: "gem",
            category: "gem",
            rank: candyRank,
            label: "Top Gem",
            metric: `${candy.toLocaleString("vi-VN")} Gem tổng tích lũy`,
            monthLabel,
          });
        }

        // Top Follow — xếp hạng toàn cục theo followers_count
        if (followers > 0 && followerRank) {
          out.push({
            key: "follow",
            category: "follow",
            rank: followerRank,
            label: "Top Follow",
            metric: `${followers.toLocaleString("vi-VN")} người yêu thích`,
            monthLabel,
          });
        }

        // Top Bài viết — số bài tháng này (không kiểm được rank toàn cục từ client, chỉ ghi nhận hoạt động)
        if (postsMonth > 0) {
          out.push({
            key: "post",
            category: "post",
            rank: null,
            label: "Top Bài viết",
            metric: `${postsMonth.toLocaleString("vi-VN")} bài đăng trong tháng`,
            monthLabel,
          });
        }

        // VIP — chỉ ghi nhận từ VIP 2 trở lên
        if (vip >= 2) {
          out.push({
            key: "vip",
            category: "vip",
            rank: vip >= 10 ? 1 : vip >= 5 ? 2 : 3,
            label: `VIP ${vip}`,
            metric: "Thành viên Tinh Hoa",
            monthLabel,
          });
        }

        if (!cancelled) setItems(out);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, isOwn]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-border/60 bg-card px-4 py-6 text-center">
        <Trophy size={22} className="mx-auto mb-1.5 text-amber-500" />
        <h3 className="text-sm font-semibold text-foreground">Sảnh Vinh Danh</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {isOwn
            ? "Bạn chưa có thành tích nào tháng này."
            : "Người này chưa đạt thành tích TOP trong tháng."}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Trophy size={14} className="text-amber-500" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sảnh Vinh Danh
          </h3>
        </div>
        <span className="text-[10px] text-muted-foreground">{items[0]?.monthLabel}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {items.map((a) => {
          const meta = CATEGORY_META[a.category];
          const Icon = meta.icon;
          const rb = rankBadge(a.rank);
          return (
            <div
              key={a.key}
              className="relative rounded-xl border border-border/60 bg-card px-3 py-2.5 transition hover:border-indigo-400/60 hover:-translate-y-0.5"
            >
              <div className="flex items-center justify-between mb-1.5">
                <Icon size={16} className={meta.accent} />
                <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9px] font-bold tracking-wide ${rb.cls}`}>
                  {rb.label}
                </span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {meta.title}
              </div>
              <div className="text-sm font-bold text-foreground leading-tight mt-0.5 truncate">{a.label}</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate" title={a.metric}>
                {a.metric}
              </div>
              <div className="mt-1 text-[10px] font-medium text-amber-600/90 dark:text-amber-400/90 truncate">
                {a.monthLabel}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
