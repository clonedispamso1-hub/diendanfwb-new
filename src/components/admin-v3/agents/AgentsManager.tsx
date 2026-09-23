/**
 * Admin Panel → Đại Lý.
 *
 * Chọn đại lý TỪ danh sách "Tài khoản thứ hai" đã có sẵn (không tạo tài khoản
 * mới), thêm/bỏ khỏi danh sách, nhập "Mức giao dịch" cho từng đại lý và nội
 * dung "Hướng dẫn rút tiền" hiển thị cho thành viên.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { avatarSrc } from "@/lib/image-cdn";
import { deriveUid } from "@/lib/user-uid";
import { fetchCloneList, type CloneListRow } from "@/lib/admin/clone-list-cache";
import {
  DEFAULT_AGENTS_CONFIG,
  fetchAgentsConfig,
  invalidateAgentsConfig,
  saveAgentsConfig,
  type AgentEntry,
  type AgentsConfig,
} from "@/lib/agents";

const field: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)",
  background: "transparent",
  color: "inherit",
  fontSize: 14,
};

function rowName(r: CloneListRow): string {
  return (r.full_name as string) || (r.username as string) || "Đại lý";
}

export function AgentsManager() {
  const [cfg, setCfg] = useState<AgentsConfig>(DEFAULT_AGENTS_CONFIG);
  const [rows, setRows] = useState<CloneListRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    invalidateAgentsConfig();
    void (async () => {
      try {
        const [c, list] = await Promise.all([fetchAgentsConfig(), fetchCloneList({})]);
        if (!alive) return;
        setCfg(c);
        setRows(list);
      } catch (e: any) {
        if (alive) toast.error("Không tải được danh sách tài khoản thứ hai: " + (e?.message || ""));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const selectedIds = useMemo(() => new Set(cfg.agents.map((a) => a.id)), [cfg.agents]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => !selectedIds.has(r.id))
      .filter((r) =>
        !q
          ? true
          : rowName(r).toLowerCase().includes(q) ||
            String(r.username ?? "").toLowerCase().includes(q) ||
            deriveUid(r.id).toLowerCase().includes(q),
      )
      .slice(0, 40);
  }, [rows, selectedIds, search]);

  const addAgent = (r: CloneListRow) => {
    const entry: AgentEntry = {
      id: r.id,
      name: rowName(r),
      avatar: (r.avatar as string) ?? null,
      uid: (r.public_id as string) || deriveUid(r.id),
      level: "",
    };
    setCfg((c) => ({ ...c, agents: [...c.agents, entry] }));
  };

  const removeAgent = (id: string) =>
    setCfg((c) => ({ ...c, agents: c.agents.filter((a) => a.id !== id) }));

  const setLevel = (id: string, level: string) =>
    setCfg((c) => ({
      ...c,
      agents: c.agents.map((a) => (a.id === id ? { ...a, level } : a)),
    }));

  const save = async () => {
    setSaving(true);
    try {
      await saveAgentsConfig(cfg);
      toast.success("Đã lưu — danh sách đại lý đã cập nhật cho thành viên.");
    } catch (e: any) {
      toast.error("Lưu thất bại: " + (e?.message || "lỗi không xác định"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 16, opacity: 0.7 }}>Đang tải Đại Lý…</div>;

  return (
    <div style={{ maxWidth: 860 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800 }}>🤝 Đại Lý</h2>
      <p style={{ margin: "0 0 18px", fontSize: 13, opacity: 0.72 }}>
        Chọn đại lý từ danh sách <b>Tài khoản thứ hai</b> có sẵn. Không tạo tài khoản mới.
      </p>

      {/* ĐANG LÀ ĐẠI LÝ */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>
          Danh sách đại lý ({cfg.agents.length})
        </h3>
        {cfg.agents.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.66 }}>Chưa có đại lý nào.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {cfg.agents.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(120,120,140,0.25)",
                }}
              >
                <img
                  src={avatarSrc(a.avatar || "", 64)}
                  alt={a.name}
                  loading="lazy"
                  style={{ width: 42, height: 42, borderRadius: 999, objectFit: "cover" }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>{a.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>UID: {a.uid || deriveUid(a.id)}</div>
                </div>
                <input
                  style={{ ...field, maxWidth: 260 }}
                  placeholder="Mức giao dịch (VD: 50.000 – 5.000.000 xu)"
                  value={a.level}
                  onChange={(e) => setLevel(a.id, e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => removeAgent(a.id)}
                  style={{
                    border: "1px solid rgba(220,38,38,.35)",
                    background: "rgba(220,38,38,.1)",
                    color: "#dc2626",
                    borderRadius: 10,
                    padding: "9px 12px",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Bỏ
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* CHỌN THÊM */}
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>
          Thêm đại lý từ tài khoản thứ hai
        </h3>
        <input
          style={{ ...field, maxWidth: 360, marginBottom: 12 }}
          placeholder="Tìm theo tên / username / UID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {candidates.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.66 }}>Không có tài khoản phù hợp.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {candidates.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 10,
                  borderRadius: 12,
                  border: "1px solid rgba(120,120,140,0.2)",
                }}
              >
                <img
                  src={avatarSrc((r.avatar as string) || "", 64)}
                  alt={rowName(r)}
                  loading="lazy"
                  style={{ width: 36, height: 36, borderRadius: 999, objectFit: "cover" }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{rowName(r)}</div>
                  <div style={{ fontSize: 12, opacity: 0.66 }}>
                    @{r.username} · UID: {deriveUid(r.id)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => addAgent(r)}
                  style={{
                    border: "none",
                    background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
                    color: "#fff",
                    borderRadius: 10,
                    padding: "9px 14px",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Thêm
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* HƯỚNG DẪN RÚT TIỀN */}
      <section style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15, fontWeight: 800 }}>Hướng dẫn rút tiền</h3>
        <textarea
          style={{ ...field, minHeight: 160, lineHeight: 1.6, resize: "vertical" }}
          placeholder="Nhập nội dung hướng dẫn rút tiền hiển thị cho thành viên…"
          value={cfg.guide}
          onChange={(e) => setCfg({ ...cfg, guide: e.target.value })}
        />
      </section>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        style={{
          border: "none",
          background: "linear-gradient(135deg,#8b5cf6,#ec4899)",
          color: "#fff",
          borderRadius: 12,
          padding: "12px 22px",
          fontWeight: 800,
          fontSize: 15,
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Đang lưu…" : "Lưu thay đổi"}
      </button>
    </div>
  );
}
