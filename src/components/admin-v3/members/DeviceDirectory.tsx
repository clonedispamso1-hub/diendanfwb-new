import { useCallback, useEffect, useMemo, useState } from "react";
import { avatarSrc } from "@/lib/image-cdn";
import { Fingerprint, Wifi, Search, RefreshCw, X, Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import {
  fetchActivityLog, buildIpGroups, buildFingerprintGroups, fetchGroupAccounts, parseUA,
  type ActivityRow, type IpAccount, type IpSort,
} from "@/lib/device-intel";

type GroupBy = "fingerprint" | "ip";

const PAGE_SIZE = 50;

export { parseUA };

function fmt(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("vi-VN", { hour12: false }); } catch { return iso; }
}

export function DeviceDirectory() {
  const [group, setGroup] = useState<GroupBy>("ip");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<IpSort>("accounts");
  const [onlyMulti, setOnlyMulti] = useState(false);
  const [log, setLog] = useState<ActivityRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{ group: GroupBy; value: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLog(await fetchActivityLog());
    } catch (e: any) {
      toast.error("Không tải được địa chỉ máy: " + (e?.message || e));
      setLog([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const opts = { q: term, minAccounts: onlyMulti ? 2 : 1, sort };
    return group === "ip"
      ? buildIpGroups(log, opts).map((g) => ({ ...g, key_value: g.ip }))
      : buildFingerprintGroups(log, opts).map((g) => ({ ...g, key_value: g.fingerprint }));
  }, [log, group, term, onlyMulti, sort]);

  const total = groups.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = groups.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      <div className="admv3-toolbar">
        <div className="admv3-search admv3-search-lg">
          <Search size={14} />
          <input
            placeholder={group === "ip" ? "Tìm theo IP…" : "Tìm theo Fingerprint…"}
            value={q}
            onChange={(e) => { setQ(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(0); setTerm(q); } }}
          />
        </div>
        <div className="admv3-filters">
          <button className={`admv3-chip ${group === "ip" ? "is-active" : ""}`}
            onClick={() => { setGroup("ip"); setPage(0); }}>
            <Wifi size={12} /> IP
          </button>
          <button className={`admv3-chip ${group === "fingerprint" ? "is-active" : ""}`}
            onClick={() => { setGroup("fingerprint"); setPage(0); }}>
            <Fingerprint size={12} /> Fingerprint
          </button>
          <button className={`admv3-chip ${onlyMulti ? "is-active" : ""}`}
            title="Chỉ hiện nhóm có từ 2 tài khoản trở lên"
            onClick={() => { setOnlyMulti((v) => !v); setPage(0); }}>
            ≥ 2 tài khoản
          </button>
          <button className={`admv3-chip ${sort === "accounts" ? "is-active" : ""}`}
            onClick={() => { setSort("accounts"); setPage(0); }}>Nhiều tài khoản</button>
          <button className={`admv3-chip ${sort === "recent" ? "is-active" : ""}`}
            onClick={() => { setSort("recent"); setPage(0); }}>Mới nhất</button>
          <button className={`admv3-chip ${sort === "ip" ? "is-active" : ""}`}
            onClick={() => { setSort("ip"); setPage(0); }}>
            {group === "ip" ? "Theo IP" : "Theo FP"}
          </button>
        </div>
        <div className="admv3-toolbar-right">
          <button className="admv3-btn admv3-btn-ghost" onClick={() => { setPage(0); setTerm(q); void load(); }} disabled={loading}>
            <RefreshCw size={13} /> Tải lại
          </button>
        </div>
      </div>

      <div className="admv3-card admv3-table-card">
        <div className="admv3-table-wrap">
          <table className="admv3-table">
            <thead>
              <tr>
                <th>{group === "ip" ? "IP" : "Fingerprint"}</th>
                <th>Fingerprint gần nhất</th>
                <th>Browser</th>
                <th>Device</th>
                <th>OS</th>
                <th>Số tài khoản trùng</th>
                <th>Lượt đăng ký</th>
                <th>Hoạt động</th>
                <th>Lần cuối</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="admv3-td-empty">Đang tải…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="admv3-td-empty">Không có dữ liệu</td></tr>
              )}
              {rows.map((r) => {
                const ua = parseUA(r.last_user_agent);
                return (
                  <tr key={r.key_value}>
                    <td>
                      <button className="admv3-linkish admv3-mono"
                        onClick={() => setPopup({ group, value: r.key_value })}>
                        {r.key_value}
                      </button>
                    </td>
                    <td className="admv3-mono">{(r.last_fingerprint || "—").slice(0, 18)}</td>
                    <td>{ua.browser}</td>
                    <td>
                      {ua.device === "Desktop" ? <Monitor size={12} /> : <Smartphone size={12} />} {ua.device}
                    </td>
                    <td>{ua.os}</td>
                    <td>
                      <span className={`admv3-pill ${r.accounts_count > 2 ? "admv3-pill-danger" : "admv3-pill-ok"}`}>
                        {r.accounts_count}
                      </span>
                    </td>
                    <td>{r.registrations_count}</td>
                    <td>{r.events_count}</td>
                    <td>{fmt(r.last_seen_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="admv3-pager">
          <span>Trang {page + 1} / {totalPages} · {total} mục</span>
          <div>
            <button className="admv3-btn admv3-btn-ghost" disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}>‹ Trước</button>
            <button className="admv3-btn admv3-btn-ghost" disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}>Sau ›</button>
          </div>
        </div>
      </div>

      {popup && (
        <DeviceAccountsModal
          group={popup.group}
          value={popup.value}
          onClose={() => setPopup(null)}
        />
      )}
    </>
  );
}

function DeviceAccountsModal({ group, value, onClose }: { group: GroupBy; value: string; onClose: () => void }) {
  const [rows, setRows] = useState<IpAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchGroupAccounts(group, value);
        if (alive) setRows(list);
      } catch (e: any) {
        toast.error(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [group, value]);

  return (
    <div className="admv3-modal-backdrop admdev-backdrop" onClick={onClose}>
      <div className="admv3-modal admdev-modal" onClick={(e) => e.stopPropagation()}>
        <div className="admv3-modal-head admdev-head">
          <h3>
            {group === "ip" ? "Địa chỉ máy · IP" : "Địa chỉ máy · Fingerprint"}
            <span className="admdev-key">{value}</span>
            {!loading && <span className="admdev-count">{rows.length} tài khoản</span>}
          </h3>
          <button className="admv3-icon-btn admdev-close" onClick={onClose} aria-label="Đóng"><X size={16} /></button>
        </div>
        <div className="admv3-modal-body admdev-body">
          <table className="admdev-table">
            <thead>
              <tr>
                <th className="c-av">Avatar</th>
                <th className="c-name">Tên</th>
                <th className="c-uid">UID</th>
                <th className="c-phone">SĐT</th>
                <th className="c-ip">IP</th>
                <th className="c-time">Lần cuối</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="admdev-empty">Đang tải…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="admdev-empty">Không có tài khoản</td></tr>
              )}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="c-av">
                    {a.avatar
                      ? <img loading="lazy" decoding="async" src={avatarSrc(a.avatar, 48)} alt=""
                          className="admdev-avatar" />
                      : <div className="admdev-avatar admdev-avatar-empty">
                          {(a.full_name || a.username || "?")[0]?.toUpperCase()}
                        </div>}
                  </td>
                  <td className="c-name">
                    <div className="admdev-name">{a.full_name || a.username || "—"}</div>
                    <div className="admdev-sub">@{a.username || "—"}</div>
                  </td>
                  <td className="c-uid admdev-mono">{a.public_id || a.id.slice(0, 8)}</td>
                  <td className="c-phone">{a.phone || "—"}</td>
                  <td className="c-ip admdev-mono">{a.ip || "—"}</td>
                  <td className="c-time">{fmt(a.last_seen_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

