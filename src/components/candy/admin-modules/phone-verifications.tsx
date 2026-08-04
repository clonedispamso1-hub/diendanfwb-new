import { useEffect, useMemo, useState } from "react";
import { Phone, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ModuleShell, EmptyHint } from "./module-shell";

type Row = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar: string | null;
  phone: string | null;
  phone_verified_at?: string | null;
  last_ip?: string | null;
  device?: string | null;
  browser?: string | null;
  created_at?: string | null;
};

type RangeKey = "all" | "today" | "7d" | "month";

function fmtDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function withinRange(iso: string | null | undefined, range: RangeKey): boolean {
  if (range === "all") return true;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const now = Date.now();
  if (range === "today") {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return t >= d.getTime();
  }
  if (range === "7d") return t >= now - 7 * 86400_000;
  if (range === "month") {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
    return t >= d.getTime();
  }
  return true;
}

export function PhoneVerifications() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<RangeKey>("all");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      // Prefer dedicated phone_verifications log (if the table exists)
      let merged: Row[] = [];
      try {
        const { data, error } = await supabase
          .from("phone_verifications")
          .select("user_id, phone, verified_at, device, browser, ip, profiles!inner(id, username, full_name, avatar, created_at, last_ip)")
          .order("verified_at", { ascending: false })
          .limit(500);
        if (!error && Array.isArray(data)) {
          merged = (data as any[]).map((r) => ({
            id: r.profiles?.id ?? r.user_id,
            username: r.profiles?.username ?? null,
            full_name: r.profiles?.full_name ?? null,
            avatar: r.profiles?.avatar ?? null,
            phone: r.phone ?? null,
            phone_verified_at: r.verified_at ?? null,
            last_ip: r.ip ?? r.profiles?.last_ip ?? null,
            device: r.device ?? null,
            browser: r.browser ?? null,
            created_at: r.profiles?.created_at ?? null,
          }));
        }
      } catch { /* table may not exist */ }

      // Fallback / augment: profiles.phone
      if (merged.length === 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id, username, full_name, avatar, phone, phone_verified_at, last_ip, created_at")
          .not("phone", "is", null)
          .order("phone_verified_at", { ascending: false, nullsFirst: false })
          .limit(500);
        merged = ((data as any[]) ?? []).map((r) => ({
          id: r.id,
          username: r.username,
          full_name: r.full_name,
          avatar: r.avatar,
          phone: r.phone,
          phone_verified_at: r.phone_verified_at ?? r.created_at ?? null,
          last_ip: r.last_ip,
          device: null,
          browser: null,
          created_at: r.created_at,
        }));
      }

      if (alive) { setRows(merged); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (!withinRange(r.phone_verified_at, range)) return false;
      if (!needle) return true;
      return (
        (r.id ?? "").toLowerCase().includes(needle) ||
        (r.username ?? "").toLowerCase().includes(needle) ||
        (r.full_name ?? "").toLowerCase().includes(needle) ||
        (r.phone ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, range]);

  return (
    <ModuleShell
      title="📱 Xác minh số điện thoại"
      subtitle="Danh sách người dùng đã cập nhật số điện thoại cho tính năng Tìm Zalo"
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo UID, username, số điện thoại..."
            style={{
              width: "100%", height: 36, borderRadius: 10, padding: "0 12px 0 32px",
              border: "1px solid rgba(148,163,184,0.35)", background: "rgba(15,23,42,0.35)",
              color: "#e2e8f0", fontSize: 13, outline: "none",
            }}
          />
        </div>
        <div style={{ display: "inline-flex", gap: 6 }}>
          {([
            ["all", "Tất cả"],
            ["today", "Hôm nay"],
            ["7d", "7 ngày"],
            ["month", "Tháng này"],
          ] as [RangeKey, string][]).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className="adm-tag"
              style={{
                cursor: "pointer",
                background: range === k ? "rgba(0,104,255,0.25)" : undefined,
                color: range === k ? "#93c5fd" : undefined,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <EmptyHint>Đang tải danh sách…</EmptyHint>
      ) : filtered.length === 0 ? (
        <EmptyHint>Chưa có bản ghi phù hợp.</EmptyHint>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(148,163,184,0.15)" }}>
          <table style={{ width: "100%", minWidth: 820, borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "rgba(15,23,42,0.45)", color: "#cbd5e1", textAlign: "left" }}>
                <th style={th}>UID</th>
                <th style={th}>Avatar</th>
                <th style={th}>Tên</th>
                <th style={th}>Username</th>
                <th style={th}>Số điện thoại</th>
                <th style={th}>Ngày cập nhật</th>
                <th style={th}>Thiết bị</th>
                <th style={th}>Trình duyệt</th>
                <th style={th}>IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ borderTop: "1px solid rgba(148,163,184,0.1)" }}>
                  <td style={td}><code style={{ fontSize: 11 }}>{r.id.slice(0, 8)}</code></td>
                  <td style={td}>
                    {r.avatar ? (
                      <img loading="lazy" decoding="async" src={r.avatar} alt="" width={32} height={32} style={{ borderRadius: 999, objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 32, height: 32, borderRadius: 999, background: "rgba(148,163,184,0.2)" }} />
                    )}
                  </td>
                  <td style={td}>{r.full_name ?? "—"}</td>
                  <td style={td}>{r.username ? `@${r.username}` : "—"}</td>
                  <td style={{ ...td, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Phone size={12} /> {r.phone ?? "—"}
                    </span>
                  </td>
                  <td style={td}>{fmtDate(r.phone_verified_at)}</td>
                  <td style={td}>{r.device ?? "—"}</td>
                  <td style={td}>{r.browser ?? "—"}</td>
                  <td style={td}>{r.last_ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModuleShell>
  );
}

const th: React.CSSProperties = { padding: "10px 12px", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "10px 12px", color: "#e2e8f0", whiteSpace: "nowrap" };

export default PhoneVerifications;