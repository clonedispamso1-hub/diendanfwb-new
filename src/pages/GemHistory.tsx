import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Coins } from "lucide-react";
import { AuthProvider, useAuth } from "@/components/candy/auth-provider";
import { NotificationProvider } from "@/components/candy/notification-provider";
import { supabase } from "@/lib/supabase";
import { formatCandy } from "@/lib/format";
import { formatRelativeTime } from "@/lib/time-format";
import { useRealtime, pickNew } from "@/lib/realtime-registry";

type GemTx = {
  id: string;
  from_id: string | null;
  to_id: string | null;
  amount: number;
  note: string | null;
  action_type: string;
  post_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
};

type PeerMap = Record<string, { full_name: string | null; public_id: string | null }>;

function Inner() {
  const { me, ready } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<GemTx[]>([]);
  const [peers, setPeers] = useState<PeerMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!me?.id) { navigate("/", { replace: true }); return; }
    const sinceISO = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    let alive = true;

    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("gem_transactions")
        .select("id, from_id, to_id, amount, note, action_type, post_id, metadata, created_at")
        .or(`from_id.eq.${me.id},to_id.eq.${me.id}`)
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(300);
      if (!alive) return;
      const list = (data as GemTx[]) ?? [];
      setRows(list);

      const ids = Array.from(new Set(list.flatMap((r) => [r.from_id, r.to_id]).filter((x): x is string => !!x && x !== me.id)));
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, public_id")
          .in("id", ids);
        const map: PeerMap = {};
        (profs ?? []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, public_id: p.public_id }; });
        if (alive) setPeers(map);
      }
      if (alive) setLoading(false);
    };

    void load();

    return () => { alive = false; };
  }, [me?.id, ready, navigate]);

  // Realtime dùng channel dùng chung (registry), filter server-side theo user.
  useRealtime(
    me?.id ? `gem-tx-${me.id}` : null,
    me?.id
      ? [
          { table: "gem_transactions", event: "INSERT", filter: `to_id=eq.${me.id}` },
          { table: "gem_transactions", event: "INSERT", filter: `from_id=eq.${me.id}` },
        ]
      : [],
    (payload) => {
      if (!me?.id) return;
      const row = pickNew(payload) as unknown as GemTx | undefined;
      if (!row) return;
      if (row.from_id === me.id || row.to_id === me.id) {
        setRows((prev) => (prev.some((r) => r.id === row.id) ? prev : [row, ...prev].slice(0, 300)));
      }
    },
  );

  const summary = useMemo(() => {
    let inc = 0, out = 0;
    for (const r of rows) {
      if (r.to_id === me?.id) inc += r.amount;
      else if (r.from_id === me?.id) out += r.amount;
    }
    return { inc, out };
  }, [rows, me?.id]);

  const { postTx, menuTx } = useMemo(() => {
    const post: GemTx[] = [];
    const menu: GemTx[] = [];
    for (const r of rows) {
      if (r.post_id) post.push(r);
      else menu.push(r);
    }
    return { postTx: post, menuTx: menu };
  }, [rows]);

  const peerLabel = (id: string | null) => {
    if (!id) return "Hệ thống";
    if (id === me?.id) return "Bạn";
    const p = peers[id];
    return p?.full_name || p?.public_id || id.slice(0, 6);
  };

  const renderRow = (r: GemTx) => {
    const incoming = r.to_id === me?.id;
    const other = incoming ? r.from_id : r.to_id;
    const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
    const tone = incoming ? "text-emerald-500" : "text-rose-500";
    const sign = incoming ? "+" : "−";
    const shortPostId = r.post_id ? r.post_id.replace(/-/g, "").slice(0, 8).toUpperCase() : null;
    return (
      <li
        key={r.id}
        className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-3 py-3 shadow-sm"
      >
        <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted ${tone}`}>
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-sm font-medium leading-snug break-words">
              {incoming ? "Nhận từ " : "Chuyển cho "}
              <span className="text-foreground/90">{peerLabel(other)}</span>
            </p>
            <span className={`shrink-0 text-sm font-semibold tabular-nums ${tone}`}>
              {sign} 💎 {formatCandy(r.amount)}
            </span>
          </div>
          {shortPostId ? (
            <p className="mt-1 text-[11px] text-indigo-500 font-mono">Bài viết #{shortPostId}</p>
          ) : null}
          {r.note ? (
            <p className="mt-1 text-xs text-muted-foreground break-words">“{r.note}”</p>
          ) : null}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatRelativeTime(r.created_at)} · {new Date(r.created_at).toLocaleString("vi-VN")}
          </p>
        </div>
      </li>
    );
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Quay lại"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-semibold leading-none">Lịch sử số dư Gem</h1>
      </header>

      <div className="mx-auto w-full max-w-screen-sm px-4 py-4 pb-24">
        <section className="mb-4 grid grid-cols-2 gap-2">
          <SummaryCard label="Nhận" value={summary.inc} tone="text-emerald-500" />
          <SummaryCard label="Chuyển" value={summary.out} tone="text-rose-500" />
        </section>

        <p className="mb-3 text-xs text-muted-foreground">Hiển thị giao dịch trong 5 ngày gần nhất.</p>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Đang tải…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 p-8 text-center text-sm text-muted-foreground">
            Chưa có giao dịch Gem nào trong 5 ngày qua.
          </div>
        ) : (
          <div className="space-y-5">
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tặng / Nhận Gem tại Bài viết
                <span className="ml-2 text-foreground/70 font-mono">({postTx.length})</span>
              </h2>
              {postTx.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-1">Không có giao dịch tại bài viết.</p>
              ) : (
                <ul className="space-y-2">{postTx.map(renderRow)}</ul>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Chuyển / Nhận Gem qua Menu
                <span className="ml-2 text-foreground/70 font-mono">({menuTx.length})</span>
              </h2>
              {menuTx.length === 0 ? (
                <p className="text-xs text-muted-foreground italic px-1">Không có giao dịch qua menu.</p>
              ) : (
                <ul className="space-y-2">{menuTx.map(renderRow)}</ul>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}

function SummaryCard({ label, value, tone, signed }: { label: string; value: number; tone: string; signed?: boolean }) {
  const prefix = signed ? (value >= 0 ? "+" : "−") : "";
  const abs = Math.abs(value);
  return (
    <div className="rounded-xl border border-border/60 bg-card p-3 text-center shadow-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 inline-flex items-center justify-center gap-1 text-sm font-semibold tabular-nums ${tone}`}>
        <Coins size={14} /> {prefix}{formatCandy(abs)}
      </p>
    </div>
  );
}

export default function GemHistoryPage() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Inner />
      </NotificationProvider>
    </AuthProvider>
  );
}
