import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Sparkles,
} from "lucide-react";
import coinIcon from "@/assets/brand/coin.png";
import { AuthProvider, useAuth } from "@/components/candy/auth-provider";
import { NotificationProvider } from "@/components/candy/notification-provider";
import { supabase } from "@/lib/supabase";
import { formatCandy } from "@/lib/format";
import { formatRelativeTime } from "@/lib/time-format";
import { TransferGemModal } from "@/components/candy/transfer-gem-modal";

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

// Coin credits from system RPCs (dragon ball exchange, summon, envelope, spin, etc.)
type CoinTx = {
  id: string;
  user_id: string;
  amount: number;
  transaction_type: string;
  created_at: string;
};

const COIN_TX_LABELS: Record<string, string> = {
  coin_spin_reward: "🎡 Vòng quay Coin",
  lucky_gem_drop: "🍀 Coin may mắn",
  post_reward: "🎁 Thưởng bài viết",
};

function labelForCoinTx(t: string): string {
  return COIN_TX_LABELS[t] || "🎁 Thưởng hệ thống";
}

type PeerMap = Record<
  string,
  { full_name: string | null; public_id: string | null; avatar: string | null }
>;

// Weekday-based history. Vietnam week starts Monday (1) … Sunday (7).
type WeekdayKey = 1 | 2 | 3 | 4 | 5 | 6 | 7;
const WEEKDAY_LABEL: Record<WeekdayKey, string> = {
  1: "Thứ 2",
  2: "Thứ 3",
  3: "Thứ 4",
  4: "Thứ 5",
  5: "Thứ 6",
  6: "Thứ 7",
  7: "Chủ nhật",
};
const WEEKDAY_ORDER: WeekdayKey[] = [1, 2, 3, 4, 5, 6, 7];

/** JS Date.getDay(): 0=Sun,1=Mon…6=Sat → convert to 1..7 (Mon..Sun). */
function toWeekdayKey(d: Date): WeekdayKey {
  const g = d.getDay();
  return (g === 0 ? 7 : g) as WeekdayKey;
}

/** Monday 00:00:00.000 of the week containing `now` (local time). */
function startOfWeekMonday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const wk = toWeekdayKey(d); // 1..7
  d.setDate(d.getDate() - (wk - 1));
  return d;
}

/** dd/MM/yyyy in local time. */
function formatDMY(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Return the Date for a given weekday key within the week starting Monday. */
function dateForWeekday(weekStart: Date, key: WeekdayKey): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + (key - 1));
  return d;
}


function WalletInner() {
  const { me, ready } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"received" | "sent">("received");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeekMonday(new Date()));
  const [activeDay, setActiveDay] = useState<WeekdayKey>(() => toWeekdayKey(new Date()));
  const [rows, setRows] = useState<GemTx[]>([]);
  const [coinRows, setCoinRows] = useState<CoinTx[]>([]);
  const [peers, setPeers] = useState<PeerMap>({});
  const [loading, setLoading] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);

  // Reset khi qua tuần mới (kiểm tra mỗi phút): tuần cũ biến mất hoàn toàn,
  // default tab quay lại đúng "hôm nay" của tuần mới.
  useEffect(() => {
    const tick = () => {
      const nowStart = startOfWeekMonday(new Date());
      if (nowStart.getTime() !== weekStart.getTime()) {
        setWeekStart(nowStart);
        setActiveDay(toWeekdayKey(new Date()));
      }
    };
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [weekStart]);

  useEffect(() => {
    if (!ready) return;
    if (!me?.id) {
      navigate("/", { replace: true });
      return;
    }
    let alive = true;

    const load = async () => {
      setLoading(true);
      const nextWeek = new Date(weekStart);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const [{ data }, { data: coinData }] = await Promise.all([
        supabase
          .from("gem_transactions")
          .select("*")
          .or(`from_id.eq.${me.id},to_id.eq.${me.id}`)
          .gte("created_at", weekStart.toISOString())
          .lt("created_at", nextWeek.toISOString())
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("coin_transactions" as any)
          .select("id,user_id,amount,transaction_type,created_at")
          .eq("user_id", me.id)
          .gt("amount", 0)
          .gte("created_at", weekStart.toISOString())
          .lt("created_at", nextWeek.toISOString())
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      if (!alive) return;
      const list = (data as GemTx[]) ?? [];
      setRows(list);
      setCoinRows(((coinData as any[]) ?? []) as CoinTx[]);

      const ids = Array.from(
        new Set(
          list
            .flatMap((r) => [r.from_id, r.to_id])
            .filter((x): x is string => !!x && x !== me.id),
        ),
      );
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, public_id, avatar")
          .in("id", ids);
        const map: PeerMap = {};
        (profs ?? []).forEach((p: any) => {
          map[p.id] = {
            full_name: p.full_name,
            public_id: p.public_id,
            avatar: p.avatar,
          };
        });
        if (alive) setPeers(map);
      }
      if (alive) setLoading(false);
    };

    void load();

    const ch = supabase
      .channel(`wallet-tx-${me.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gem_transactions" },
        (payload) => {
          const row = payload.new as GemTx;
          if (row.from_id !== me.id && row.to_id !== me.id) return;
          // Chỉ nhận nếu thuộc tuần hiện tại (tuần cũ đã reset, không hiển thị).
          const ts = new Date(row.created_at).getTime();
          const wkEnd = new Date(weekStart);
          wkEnd.setDate(wkEnd.getDate() + 7);
          if (ts < weekStart.getTime() || ts >= wkEnd.getTime()) return;
          setRows((prev) => [row, ...prev].slice(0, 500));
        },
      )
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [me?.id, ready, navigate, weekStart]);


  // Bucket giao dịch theo thứ trong tuần hiện tại.
  const byDay = useMemo(() => {
    const buckets: Record<WeekdayKey, { rec: GemTx[]; snt: GemTx[]; in: number; out: number }> = {
      1: { rec: [], snt: [], in: 0, out: 0 },
      2: { rec: [], snt: [], in: 0, out: 0 },
      3: { rec: [], snt: [], in: 0, out: 0 },
      4: { rec: [], snt: [], in: 0, out: 0 },
      5: { rec: [], snt: [], in: 0, out: 0 },
      6: { rec: [], snt: [], in: 0, out: 0 },
      7: { rec: [], snt: [], in: 0, out: 0 },
    };
    for (const r of rows) {
      const k = toWeekdayKey(new Date(r.created_at));
      if (r.to_id === me?.id && r.from_id !== me?.id) {
        if (r.amount <= 0) continue;
        buckets[k].rec.push(r);
        buckets[k].in += r.amount;
      } else if (r.from_id === me?.id && r.to_id !== me?.id) {
        // Người gửi vẫn thấy khoản đã trừ (họ thực sự đã mất Coin để mua Ngọc).
        buckets[k].snt.push(r);
        buckets[k].out += r.amount;
      }
    }
    // Bổ sung Coin từ hệ thống (đổi Ngọc Rồng, mở Bao Lì Xì, thưởng vòng quay…)
    for (const c of coinRows) {
      if (!c.amount || c.amount <= 0) continue;
      const k = toWeekdayKey(new Date(c.created_at));
      const synthetic: GemTx = {
        id: `coin-${c.id}`,
        from_id: null,
        to_id: me?.id ?? "",
        amount: c.amount,
        note: labelForCoinTx(c.transaction_type),
        action_type: c.transaction_type,
        created_at: c.created_at,
      } as GemTx;
      buckets[k].rec.push(synthetic);
      buckets[k].in += c.amount;
    }
    // Sắp xếp lại rec theo thời gian giảm dần sau khi merge.
    (Object.keys(buckets) as unknown as WeekdayKey[]).forEach((k) => {
      buckets[k].rec.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    });
    return buckets;
  }, [rows, coinRows, me?.id]);

  const dayBucket = byDay[activeDay];
  const received = dayBucket.rec;
  const sent = dayBucket.snt;
  const totalIn = dayBucket.in;
  const totalOut = dayBucket.out;
  const list = tab === "received" ? received : sent;


  const peerLabel = (id: string | null) => {
    if (!id) return { name: "Hệ thống", pid: "", avatar: null as string | null };
    if (id === me?.id) return { name: "Bạn", pid: "", avatar: me?.avatar || null };
    const p = peers[id];
    return {
      name: p?.full_name || "Người dùng",
      pid: p?.public_id || id.slice(0, 8),
      avatar: p?.avatar || null,
    };
  };

  return (
    <main className="wallet-page">
      <header className="wallet-page__topbar">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="wallet-icon-btn"
          aria-label="Quay lại"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="wallet-page__title">Ví của tôi</h1>
        <span aria-hidden style={{ width: 40 }} />
      </header>

      <div className="wallet-page__content">
        {/* Balance card */}
        <section className="wallet-balance">
          <div className="wallet-balance__glow" aria-hidden />
          <div className="wallet-balance__label">
            <Sparkles size={14} /> Số dư khả dụng
          </div>
          <div className="wallet-balance__value">
            <span>{formatCandy(me?.gem_balance || 0)}</span>
            <img loading="lazy" decoding="async" src={coinIcon} alt="coin" className="wallet-coin wallet-coin--lg" />
          </div>
          <div className="wallet-balance__meta">
            {me?.public_id ? <span>ID: {me.public_id}</span> : null}
          </div>

          <div className="wallet-balance__actions">
            <button
              type="button"
              className="wallet-cta wallet-cta--primary"
              onClick={() => setTransferOpen(true)}
            >
              <img loading="lazy" decoding="async" src={coinIcon} alt="" className="wallet-coin wallet-coin--sm" /> Chuyển
            </button>
            {/* Nút "Lịch sử đầy đủ" đã bị gỡ theo yêu cầu — chỉ dùng bộ lọc 24h/7d/30d bên dưới. */}
          </div>
        </section>

        {/* Weekday tabs — chỉ hiển thị dữ liệu tuần này, đầu tuần mới sẽ reset. */}
        <div className="wallet-range" role="tablist" aria-label="Chọn thứ trong tuần">
          {WEEKDAY_ORDER.map((k) => {
            const total = byDay[k].rec.length + byDay[k].snt.length;
            const dateStr = formatDMY(dateForWeekday(weekStart, k));
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={activeDay === k}
                className={`wallet-chip${activeDay === k ? " is-active" : ""}`}
                onClick={() => setActiveDay(k)}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, lineHeight: 1.15 }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {WEEKDAY_LABEL[k]}
                  {total > 0 ? <span className="wallet-chip__dot" aria-hidden /> : null}
                </span>
                <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 500 }}>{dateStr}</span>
              </button>
            );
          })}
        </div>

        {/* Tabs: nhận / gửi */}
        <div className="wallet-tabs" role="tablist" aria-label="Loại giao dịch">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "received"}
            className={`wallet-tab${tab === "received" ? " is-active" : ""}`}
            onClick={() => setTab("received")}
          >
            <ArrowDownLeft size={16} className="text-emerald-500" />
            Đã nhận
            <span className="wallet-tab__count">{received.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sent"}
            className={`wallet-tab${tab === "sent" ? " is-active" : ""}`}
            onClick={() => setTab("sent")}
          >
            <ArrowUpRight size={16} className="text-rose-500" />
            Đã gửi
            <span className="wallet-tab__count">{sent.length}</span>
          </button>
        </div>

        {/* Summary */}
        <p className="wallet-summary">
          <span>
            {tab === "received"
              ? `Tổng nhận ${WEEKDAY_LABEL[activeDay]}: +${formatCandy(totalIn)} `
              : `Tổng gửi ${WEEKDAY_LABEL[activeDay]}: −${formatCandy(totalOut)} `}
          </span>
          <img loading="lazy" decoding="async" src={coinIcon} alt="coin" className="wallet-coin wallet-coin--sm" />
        </p>


        {/* List */}
        {loading ? (
          <div className="wallet-empty">Đang tải…</div>
        ) : list.length === 0 ? (
          <div className="wallet-empty">Chưa có giao dịch trong ngày này.</div>

        ) : (
          <ul className="wallet-list">
            {list.map((r) => {
              const incoming = tab === "received";
              const other = incoming ? r.from_id : r.to_id;
              const info = peerLabel(other);
              return (
                <li key={r.id} className="wallet-row">
                  <div className={`wallet-row__avatar${incoming ? " in" : " out"}`}>
                    {info.avatar ? (
                      <img loading="lazy" decoding="async" src={info.avatar} alt="" />
                    ) : (
                      <span>{(info.name || "?").slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className="wallet-row__badge">
                      {incoming ? (
                        <ArrowDownLeft size={12} />
                      ) : (
                        <ArrowUpRight size={12} />
                      )}
                    </span>
                  </div>
                  <div className="wallet-row__body">
                    <div className="wallet-row__title">
                      <span className="wallet-row__name">{info.name}</span>
                      {info.pid ? (
                        <span className="wallet-row__pid">#{info.pid}</span>
                      ) : null}
                    </div>
                    {r.note ? (
                      <p className="wallet-row__note">"{r.note}"</p>
                    ) : null}
                    <p className="wallet-row__time">
                      {formatRelativeTime(r.created_at)}
                    </p>
                  </div>
                  <div
                    className={`wallet-row__amount${incoming ? " in" : " out"}`}
                  >
                    {incoming ? "+" : "−"}
                    {formatCandy(r.amount)}
                    <img loading="lazy" decoding="async" src={coinIcon} alt="coin" className="wallet-coin wallet-coin--sm" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {transferOpen ? (
        <TransferGemModal onClose={() => setTransferOpen(false)} />
      ) : null}
    </main>
  );
}

export default function WalletPage() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <WalletInner />
      </NotificationProvider>
    </AuthProvider>
  );
}
