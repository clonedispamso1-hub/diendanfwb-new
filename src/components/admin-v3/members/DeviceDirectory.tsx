import { useCallback, useEffect, useState } from "react";
import { Fingerprint, Wifi, Search, RefreshCw, X, Monitor, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type GroupBy = "fingerprint" | "ip";

type DeviceRow = {
  key_value: string;
  accounts_count: number;
  registrations_count: number;
  last_user_agent: string | null;
  last_ip: string | null;
  last_fingerprint: string | null;
  last_seen_at: string | null;
};

type AccountRow = {
  id: string;
  public_id: string | null;
  username: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string | null;
  last_seen: string | null;
  is_banned: boolean;
  is_admin: boolean;
  first_seen_at: string | null;
};

const PAGE_SIZE = 50;

/** Parse Browser / OS / Device từ user agent thật (không hardcode). */
export function parseUA(ua: string | null | undefined) {
  const s = ua ?? "";
  if (!s) return { browser: "—", os: "—", device: "—" };
  const browser =
    /Edg\//.test(s) ? "Edge" :
    /OPR\/|Opera/.test(s) ? "Opera" :
    /Chrome\//.test(s) ? "Chrome" :
    /Firefox\//.test(s) ? "Firefox" :
    /Safari\//.test(s) ? "Safari" : "Khác";
  const os =
    /Windows NT 10/.test(s) ? "Windows 10/11" :
    /Windows/.test(s) ? "Windows" :
    /Android/.test(s) ? "Android" :
    /iPhone|iPad|iOS/.test(s) ? "iOS" :
    /Mac OS X/.test(s) ? "macOS" :
    /Linux/.test(s) ? "Linux" : "Khác";
  const device =
    /iPad|Tablet/.test(s) ? "Tablet" :
    /Mobi|Android|iPhone/.test(s) ? "Mobile" : "Desktop";
  return { browser, os, device };
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("vi-VN", { hour12: false }); } catch { return iso; }
}

export function DeviceDirectory() {
  const [group, setGroup] = useState<GroupBy>("fingerprint");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [popup, setPopup] = useState<{ group: GroupBy; value: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("admin_device_directory", {
        p_group: group,
        p_q: q.trim() || null,
        p_limit: PAGE_SIZE,
        p_offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      const list = (data ?? []) as any[];
      setRows(list.map((r) => ({
        key_value: r.key_value,
        accounts_count: Number(r.accounts_count ?? 0),
        registrations_count: Number(r.registrations_count ?? 0),
        last_user_agent: r.last_user_agent ?? null,
        last_ip: r.last_ip ?? null,
        last_fingerprint: r.last_fingerprint ?? null,
        last_seen_at: r.last_seen_at ?? null,
      })));
      setTotal(Number(list[0]?.total_count ?? 0));
    } catch (e: any) {
      toast.error("Không tải được địa chỉ máy: " + (e?.message || e));
      setRows([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [group, q, page]);

  useEffect(() => { void load(); }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="admv3-toolbar">
        <div className="admv3-search admv3-search-lg">
          <Search size={14} />
          <input
            placeholder={group === "ip" ? "Tìm theo IP…" : "Tìm theo Fingerprint…"}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (setPage(0), load())}
          />
        </div>
        <div className="admv3-filters">
          <button className={`admv3-chip ${group === "fingerprint" ? "is-active" : ""}`}
            onClick={() => { setGroup("fingerprint"); setPage(0); }}>
            <Fingerprint size={12} /> Fingerprint
          </button>
          <button className={`admv3-chip ${group === "ip" ? "is-active" : ""}`}
            onClick={() => { setGroup("ip"); setPage(0); }}>
            <Wifi size={12} /> IP
          </button>
        </div>
        <div className="admv3-toolbar-right">
          <button className="admv3-btn admv3-btn-ghost" onClick={() => load()} disabled={loading}>
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
                <th>IP gần nhất</th>
                <th>Fingerprint gần nhất</th>
                <th>Browser</th>
                <th>Device</th>
                <th>OS</th>
                <th>Số tài khoản</th>
                <th>Lượt đăng ký</th>
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
                    <td className="admv3-mono">{r.last_ip || "—"}</td>
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
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any).rpc("admin_device_accounts", {
        p_group: group, p_value: value,
      });
      if (error) toast.error(error.message);
      setRows((data ?? []) as AccountRow[]);
      setLoading(false);
    })();
  }, [group, value]);

  return (
    <div className="admv3-modal-backdrop" onClick={onClose}>
      <div className="admv3-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 880 }}>
        <div className="admv3-modal-head">
          <h3>
            {group === "ip" ? "IP" : "Fingerprint"}: <span className="admv3-mono">{value}</span>
          </h3>
          <button className="admv3-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="admv3-modal-body" style={{ maxHeight: "60vh", overflow: "auto" }}>
          <table className="admv3-table">
            <thead>
              <tr>
                <th>UID</th><th>Username</th><th>Tên</th><th>SĐT</th>
                <th>Ngày tạo</th><th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="admv3-td-empty">Đang tải…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={6} className="admv3-td-empty">Không có tài khoản</td></tr>
              )}
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className="admv3-mono">{a.public_id || a.id.slice(0, 8)}</td>
                  <td>@{a.username || "—"}</td>
                  <td>{a.full_name || "—"}</td>
                  <td>{a.phone || "—"}</td>
                  <td>{fmt(a.created_at)}</td>
                  <td>
                    {a.is_banned
                      ? <span className="admv3-pill admv3-pill-danger">Đã khóa</span>
                      : <span className="admv3-pill admv3-pill-ok">Hoạt động</span>}
                    {a.is_admin ? <span className="admv3-pill admv3-pill-admin" style={{ marginLeft: 4 }}>Admin</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
