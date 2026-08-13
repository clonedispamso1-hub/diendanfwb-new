import { avatarSrc } from "@/lib/image-cdn";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Search, RefreshCw, Ban, Unlock, Activity, Users, ShieldAlert, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import {
  memberIntel, FLAG_LABELS, riskTone,
  type IntelFlag, type MemberIntelRow, type IdentityCluster,
} from "@/lib/member-intel";
import { IntelStyles } from "./intel-styles";
import { RiskBadge } from "./RiskBadge";
import { ClusterDialog } from "./ClusterDialog";
import { BanLevelDialog } from "./BanLevelDialog";
import { ActivityLogDialog } from "./ActivityLogDialog";

type TabKey = "members" | "suspicious" | "clusters";
const PAGE = 30;
const FLAGS = Object.keys(FLAG_LABELS) as IntelFlag[];

const fmt = (v?: string | null) => (v ? new Date(v).toLocaleString("vi-VN") : "—");
const short = (v?: string | null, n = 14) =>
  !v ? "—" : v.length > n ? v.slice(0, n) + "…" : v;

export function MemberIntelPanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("members");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [flags, setFlags] = useState<IntelFlag[]>([]);
  const [limit, setLimit] = useState(PAGE);
  const [clusterScope, setClusterScope] = useState<"device" | "ip">("device");
  const [openCluster, setOpenCluster] = useState<{ scope: "ip" | "device"; key: string } | null>(null);
  const [banTarget, setBanTarget] = useState<MemberIntelRow | null>(null);
  const [logTarget, setLogTarget] = useState<MemberIntelRow | null>(null);

  const effFlags = useMemo<IntelFlag[]>(
    () => (tab === "suspicious" ? Array.from(new Set([...flags])) : flags),
    [flags, tab],
  );
  const minRisk = tab === "suspicious" ? 31 : 0;

  const membersQ = useQuery({
    queryKey: ["member-intel", term, effFlags, minRisk, limit, tab],
    queryFn: () => memberIntel.list({ q: term, flags: effFlags, minRisk, sort: "risk", limit, offset: 0 }),
    enabled: tab !== "clusters",
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const clustersQ = useQuery({
    queryKey: ["identity-clusters", clusterScope, limit],
    queryFn: () => memberIntel.clusters({ scope: clusterScope, minAccounts: 2, limit }),
    enabled: tab === "clusters",
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["member-intel"] });
    void qc.invalidateQueries({ queryKey: ["identity-clusters"] });
  };

  const toggleFlag = (f: IntelFlag) => {
    setLimit(PAGE);
    setFlags((s) => (s.includes(f) ? s.filter((x) => x !== f) : [...s, f]));
  };

  const unban = async (m: MemberIntelRow) => {
    try {
      await memberIntel.unban(m.id);
      toast.success("Đã mở khóa (kể cả Device/IP)");
      refresh();
    } catch (e: any) { toast.error(e?.message || String(e)); }
  };

  const rows = membersQ.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const clusters = clustersQ.data ?? [];
  const clusterTotal = clusters[0]?.total_count ?? 0;
  const errorMsg = (membersQ.error as any)?.message || (clustersQ.error as any)?.message;

  return (
    <div className="mi-wrap">
      <IntelStyles />

      <div className="mi-tabs">
        <button className={`mi-tab ${tab === "members" ? "is-active" : ""}`}
          onClick={() => { setTab("members"); setLimit(PAGE); }}>
          <Users size={13} style={{ verticalAlign: -2 }} /> Thành viên
        </button>
        <button className={`mi-tab ${tab === "suspicious" ? "is-active" : ""}`}
          onClick={() => { setTab("suspicious"); setLimit(PAGE); }}>
          <ShieldAlert size={13} style={{ verticalAlign: -2 }} /> Tài khoản nghi vấn
        </button>
        <button className={`mi-tab ${tab === "clusters" ? "is-active" : ""}`}
          onClick={() => { setTab("clusters"); setLimit(PAGE); }}>
          <LayoutGrid size={13} style={{ verticalAlign: -2 }} /> Cụm danh tính
        </button>
      </div>

      {tab !== "clusters" ? (
        <>
          <div className="mi-bar">
            <div className="mi-search">
              <Search size={14} />
              <input placeholder="Tìm Username / Tên / SĐT…" value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { setLimit(PAGE); setTerm(q); } }} />
            </div>
            <button className="mi-btn primary" onClick={() => { setLimit(PAGE); setTerm(q); }}>Tìm</button>
            <button className="mi-btn" onClick={refresh}><RefreshCw size={13} /> Làm mới</button>
          </div>
          <div className="mi-chips">
            {FLAGS.map((f) => (
              <button key={f} className={`mi-chip ${flags.includes(f) ? "is-active" : ""}`}
                onClick={() => toggleFlag(f)}>{FLAG_LABELS[f]}</button>
            ))}
          </div>
        </>
      ) : (
        <div className="mi-bar">
          <button className={`mi-chip ${clusterScope === "device" ? "is-active" : ""}`}
            onClick={() => { setClusterScope("device"); setLimit(PAGE); }}>Theo Device</button>
          <button className={`mi-chip ${clusterScope === "ip" ? "is-active" : ""}`}
            onClick={() => { setClusterScope("ip"); setLimit(PAGE); }}>Theo IP</button>
          <button className="mi-btn" onClick={refresh}><RefreshCw size={13} /> Làm mới</button>
        </div>
      )}

      {errorMsg && (
        <div className="mi-empty" style={{ color: "#b91c1c" }}>
          Không tải được dữ liệu: {errorMsg}
          <div className="mi-mini" style={{ marginTop: 6 }}>
            Hãy chạy migration <b>RUN_NOW_2026-08-10_member_intel_v2.sql</b> trên Supabase.
          </div>
        </div>
      )}

      {tab !== "clusters" && !errorMsg && (
        <>
          <div className="mi-mini" style={{ marginBottom: 8 }}>
            {membersQ.isFetching ? "Đang tải…" : `${rows.length}/${total} tài khoản`}
          </div>
          <div className="mi-cards">
            {rows.map((m) => (
              <MemberCard key={m.id} m={m}
                onIp={(ip) => setOpenCluster({ scope: "ip", key: ip })}
                onDevice={(fp) => setOpenCluster({ scope: "device", key: fp })}
                onBan={() => setBanTarget(m)}
                onUnban={() => unban(m)}
                onLog={() => setLogTarget(m)} />
            ))}
            {!membersQ.isFetching && rows.length === 0 && (
              <div className="mi-empty">Không có tài khoản nào khớp bộ lọc.</div>
            )}
          </div>
          {rows.length < total && (
            <div className="mi-more">
              <button className="mi-btn" onClick={() => setLimit((l) => l + PAGE)}>Tải thêm</button>
            </div>
          )}
        </>
      )}

      {tab === "clusters" && !errorMsg && (
        <>
          <div className="mi-mini" style={{ marginBottom: 8 }}>
            {clustersQ.isFetching ? "Đang tải…" : `${clusters.length}/${clusterTotal} cụm`}
          </div>
          <div className="mi-cards">
            {clusters.map((c) => (
              <ClusterCard key={c.cluster_key} c={c} scope={clusterScope}
                onOpen={() => setOpenCluster({ scope: clusterScope, key: c.cluster_key })} />
            ))}
            {!clustersQ.isFetching && clusters.length === 0 && (
              <div className="mi-empty">Chưa phát hiện cụm nào có từ 2 tài khoản trở lên.</div>
            )}
          </div>
          {clusters.length < clusterTotal && (
            <div className="mi-more">
              <button className="mi-btn" onClick={() => setLimit((l) => l + PAGE)}>Tải thêm</button>
            </div>
          )}
        </>
      )}

      {openCluster && (
        <ClusterDialog scope={openCluster.scope} clusterKey={openCluster.key}
          onClose={() => setOpenCluster(null)} onChanged={refresh} />
      )}
      {banTarget && (
        <BanLevelDialog member={banTarget} onClose={() => setBanTarget(null)} onDone={refresh} />
      )}
      {logTarget && (
        <ActivityLogDialog userId={logTarget.id}
          name={logTarget.full_name || logTarget.username || "—"}
          onClose={() => setLogTarget(null)} />
      )}
    </div>
  );
}

function MemberCard({ m, onIp, onDevice, onBan, onUnban, onLog }: {
  m: MemberIntelRow;
  onIp: (ip: string) => void;
  onDevice: (fp: string) => void;
  onBan: () => void;
  onUnban: () => void;
  onLog: () => void;
}) {
  const online = m.last_seen ? Date.now() - new Date(m.last_seen).getTime() < 5 * 60_000 : false;
  const tone = riskTone(m.risk_score).tone;

  return (
    <div className="mi-card">
      <div className="mi-card-top">
        {m.avatar ? <img loading="lazy" decoding="async" className="mi-ava" src={avatarSrc(m.avatar, 64)} alt={m.username ?? ""} />
                  : <div className="mi-ava" />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="mi-name">{m.full_name || m.username || "—"}</div>
          <div className="mi-uname">@{m.username || "—"} · {m.phone || "chưa có SĐT"}</div>
          <div className="mi-badges">
            <span className={`mi-badge ${online ? "ok" : "muted"}`}>{online ? "🟢 Online" : "⚪ Offline"}</span>
            {m.is_banned && <span className="mi-badge danger">🔒 Đã khóa</span>}
            {m.is_admin && <span className="mi-badge link">Admin</span>}
            {m.ip_account_count > 1 && (
              <span className="mi-badge danger" title="Số tài khoản dùng chung IP này"
                onClick={() => m.ip && onIp(m.ip)} style={{ cursor: "pointer" }}>
                🔴 {m.ip_account_count} tài khoản cùng IP
              </span>
            )}
            {m.device_account_count > 1 && (
              <span className="mi-badge high" title="Số tài khoản dùng chung Device này"
                onClick={() => m.fingerprint && onDevice(m.fingerprint)} style={{ cursor: "pointer" }}>
                🟠 {m.device_account_count} tài khoản cùng Device
              </span>
            )}
            {m.cookie_account_count > 1 && (
              <span className="mi-badge warn" title="Số tài khoản dùng chung Cookie">
                🍪 {m.cookie_account_count} cùng Cookie
              </span>
            )}
            {tone !== "ok" && (
              <span className={`mi-badge ${tone}`} title={(m.risk_reasons ?? []).join(" · ")}>
                Risk {m.risk_score}
              </span>
            )}
          </div>
        </div>
        <RiskBadge score={m.risk_score} reasons={m.risk_reasons} />
      </div>

      <div className="mi-grid">
        <div className="mi-cell" title={m.ip ?? "Chưa ghi nhận IP"}>🌐 IP hiện tại
          <b className={m.ip ? "mi-linkv" : ""} onClick={() => m.ip && onIp(m.ip)}>{m.ip || "—"}</b></div>
        <div className="mi-cell" title={m.fingerprint ?? "Chưa ghi nhận Device"}>📱 Device ID
          <b className={m.fingerprint ? "mi-linkv" : ""} onClick={() => m.fingerprint && onDevice(m.fingerprint)}>
            {short(m.fingerprint)}</b></div>
        <div className="mi-cell" title={m.device_type ?? ""}>💻 Loại thiết bị<b>{m.device_type || "—"}</b></div>
        <div className="mi-cell" title={m.os ?? ""}>🖥 Hệ điều hành<b>{m.os || "—"}</b></div>
        <div className="mi-cell" title={m.country ?? ""}>🌍 Quốc gia<b>{m.country || "—"}</b></div>
        <div className="mi-cell" title={m.isp ?? ""}>📶 Nhà mạng<b>{m.isp || "—"}</b></div>
        <div className="mi-cell" title={m.browser ?? ""}>🌐 Trình duyệt<b>{m.browser || "—"}</b></div>
        <div className="mi-cell" title={fmt(m.last_seen)}>🕒 Online cuối<b>{fmt(m.last_seen)}</b></div>
        <div className="mi-cell" title={fmt(m.created_at)}>📅 Ngày tạo<b>{fmt(m.created_at)}</b></div>
      </div>

      <div className="mi-actions">
        {m.is_banned
          ? <button className="mi-btn" onClick={onUnban}><Unlock size={13} /> Mở khóa</button>
          : <button className="mi-btn danger" onClick={onBan}><Ban size={13} /> Khóa…</button>}
        <button className="mi-btn" onClick={onLog}><Activity size={13} /> Nhật ký</button>
        {m.fingerprint && (
          <button className="mi-btn" onClick={() => onDevice(m.fingerprint!)}>Xem cụm Device</button>
        )}
        {m.ip && <button className="mi-btn" onClick={() => onIp(m.ip!)}>Xem cụm IP</button>}
      </div>
    </div>
  );
}

function ClusterCard({ c, scope, onOpen }: {
  c: IdentityCluster; scope: "device" | "ip"; onOpen: () => void;
}) {
  const tone = riskTone(c.risk_score).tone;
  const names = (c.usernames ?? []).filter(Boolean);
  return (
    <div className="mi-card">
      <div className="mi-card-top">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="mi-name" style={{ fontFamily: "ui-monospace, monospace" }}>
            {scope === "device" ? "📱 Device: " : "🌐 IP: "}{c.cluster_key}
          </div>
          <div className="mi-badges">
            <span className="mi-badge danger">{c.account_count} tài khoản</span>
            <span className="mi-badge muted">{c.ip_count} IP</span>
            {c.banned_count > 0 && <span className="mi-badge warn">{c.banned_count} đã khóa</span>}
            <span className={`mi-badge ${tone}`}>Risk {c.risk_score}</span>
          </div>
          <div className="mi-mini" style={{ marginTop: 6 }}>
            {names.slice(0, 6).map((n) => "• " + n).join("  ")}
            {names.length > 6 ? `  … +${names.length - 6}` : ""}
          </div>
        </div>
        <RiskBadge score={c.risk_score} />
      </div>
      <div className="mi-actions">
        <button className="mi-btn primary" onClick={onOpen}>Mở cụm & xử lý</button>
        <span className="mi-mini" style={{ alignSelf: "center" }}>
          Online cuối: {fmt(c.last_seen)}
        </span>
      </div>
    </div>
  );
}
