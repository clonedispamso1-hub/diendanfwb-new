import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useState } from "react";
import { Search, Loader2, Coins, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ProfileLite = {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar: string | null;
  public_id: string | null;
  reputation_score: number | null;
  gem_balance?: number | null;
  created_at?: string | null;
};

/**
 * Hỗ trợ Thành viên — read-only user directory cho Admin 2.
 * Chỉ search + xem thông tin cơ bản (không có nút hành động).
 */
export function MemberSupportDirectory() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ProfileLite[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ProfileLite | null>(null);

  async function search(term: string) {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from("profiles")
        .select("id, username, full_name, avatar, public_id, reputation_score, gem_balance, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      const t = term.trim();
      if (t) {
        query = query.or(`username.ilike.%${t}%,full_name.ilike.%${t}%,public_id.ilike.%${t}%`);
      }
      const { data } = await query;
      setRows((data as ProfileLite[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    search("");
  }, []);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="adm-module" style={{ display: "grid", gap: 10 }}>
        <div>
          <h3 className="adm-module-title">Hỗ trợ Thành viên</h3>
          <p className="adm-module-subtitle">Tra cứu thông tin user · chỉ xem, không thao tác</p>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); search(q); }}
          style={{ display: "flex", gap: 8 }}
        >
          <div style={{ position: "relative", flex: 1 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: 12, opacity: 0.5 }} />
            <input
              className="adm-input"
              style={{ paddingLeft: 34 }}
              placeholder="Username / Họ tên / Public ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button type="submit" className="adm-btn-primary" disabled={loading}>
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Tìm
          </button>
        </form>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="adm-module" style={{ display: "grid", gap: 10 }}>
          <div className="adm-section-title">Kết quả ({rows.length})</div>
          {loading ? (
            <div className="adm-empty">Đang tải…</div>
          ) : rows.length === 0 ? (
            <div className="adm-empty">Không có kết quả.</div>
          ) : (
            <div className="adm-list" style={{ maxHeight: "60vh", overflow: "auto" }}>
              {rows.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  className="adm-row"
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    borderColor: selected?.id === p.id ? "var(--adm-neon)" : undefined,
                  }}
                >
                  <div className="adm-row-icon" style={{ overflow: "hidden" }}>
                    {p.avatar ? <img loading="lazy" decoding="async" src={avatarSrc(p.avatar, 64)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (p.username?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="adm-row-main">
                    <div className="adm-row-title">{p.full_name || p.username || "—"}</div>
                    <div className="adm-row-meta">
                      <span>@{p.username ?? "?"}</span>
                      {p.public_id ? <span>· #{p.public_id}</span> : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="adm-module" style={{ display: "grid", gap: 10 }}>
          <div className="adm-section-title">Chi tiết</div>
          {!selected ? (
            <div className="adm-empty">Chọn 1 thành viên để xem chi tiết.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div className="adm-row-icon" style={{ width: 52, height: 52, overflow: "hidden" }}>
                  {selected.avatar ? <img loading="lazy" decoding="async" src={avatarSrc(selected.avatar, 64)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (selected.username?.[0] ?? "?").toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: "#fff" }}>{selected.full_name || selected.username}</div>
                  <div style={{ fontSize: ".75rem", opacity: 0.7 }}>@{selected.username} {selected.public_id ? `· #${selected.public_id}` : ""}</div>
                </div>
              </div>
              <div className="adm-stat-grid" style={{ gridTemplateColumns: "1fr" }}>
                <div className="adm-stat adm-stat-good">
                  <div className="adm-stat-label"><Coins size={11} style={{ verticalAlign: -1 }} /> Gem</div>
                  <div className="adm-stat-value">{selected.gem_balance ?? 0}</div>
                </div>
              </div>
              <div className="adm-note">
                Admin 2 chỉ có quyền xem để hỗ trợ. Mọi hành động (khoá, cộng gem, cảnh cáo)
                phải báo lên Admin.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
