import { useEffect, useState } from "react";
import { Sparkles, RefreshCw, Trash2, Upload, X, Wand2, Users } from "lucide-react";
import {
  adminListFakeProfiles,
  adminBulkInsertFakeProfiles,
  adminDeleteFakeProfile,
  adminDeleteAllSeedAccounts,
  type FakeProfileRecord,
} from "@/lib/fake-profiles";
import { generateRandomSeedBatch, type RandomSeedDraft } from "@/lib/seed-random";

interface DraftWithId extends RandomSeedDraft {
  draft_id: string;
}

type StatusFilter = "all" | "active" | "inactive";

export function SeedAccountsModule() {
  const [published, setPublished] = useState<FakeProfileRecord[]>([]);
  const [drafts, setDrafts] = useState<DraftWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [bulkBusy, setBulkBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(10);

  // Filters
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<StatusFilter>("all");

  const loadPublished = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await adminListFakeProfiles(500);
      setPublished(list);
    } catch (e: any) {
      setError(e?.message || "Không tải được danh sách.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadPublished(); }, []);

  // Bulk insert ngay lập tức — không qua bước preview.
  const quickBulkCreate = async (n: number) => {
    setBulkBusy(n);
    setError(null);
    try {
      const batchId = `quick_${Date.now()}`;
      const batch = generateRandomSeedBatch(n);
      const rows = batch.map((d) => ({
        username: d.username,
        display_name: d.display_name,
        full_name: d.display_name,
        avatar_url: d.avatar_url,
        avatar: d.avatar_url,
        locale: "vi",
        vip_level: d.vip_level,
        province: d.province,
        bio: d.bio,
        is_active: true,
        is_published: true,
        created_by_admin: true,
        seed_batch_id: batchId,
        age: d.age,
        gender: d.gender,
        tag: d.tag,
      }));
      const inserted = await adminBulkInsertFakeProfiles(rows);
      await loadPublished();
      alert(`Đã tạo ${inserted} nick ảo và hiển thị ngoài Nearby ✨`);
    } catch (e: any) {
      setError(e?.message || "Không tạo được nick ảo hàng loạt.");
    } finally {
      setBulkBusy(null);
    }
  };

  const filtered = published.filter((p) => {
    if (filterStatus === "active" && p.is_active === false) return false;
    if (filterStatus === "inactive" && p.is_active !== false) return false;
    if (filterFrom) {
      const from = new Date(filterFrom).getTime();
      if (new Date(p.created_at).getTime() < from) return false;
    }
    if (filterTo) {
      const to = new Date(filterTo).getTime() + 24 * 60 * 60 * 1000;
      if (new Date(p.created_at).getTime() > to) return false;
    }
    return true;
  });

  const genBatch = () => {
    const batch = generateRandomSeedBatch(count).map((d, i) => ({
      ...d,
      draft_id: `draft-${Date.now()}-${i}`,
    }));
    setDrafts((prev) => [...batch, ...prev]);
  };

  const regenOne = (id: string) => {
    setDrafts((prev) => prev.map((d) =>
      d.draft_id === id
        ? { ...generateRandomSeedBatch(1)[0], draft_id: id }
        : d
    ));
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((d) => d.draft_id !== id));
  };

  const updateDraft = (id: string, patch: Partial<DraftWithId>) => {
    setDrafts((prev) => prev.map((d) => d.draft_id === id ? { ...d, ...patch } : d));
  };

  const publishAll = async () => {
    if (!drafts.length) return;
    setPublishing(true);
    setError(null);
    try {
      const batchId = `batch_${Date.now()}`;
      const rows = drafts.map((d) => ({
        username: d.username,
        display_name: d.display_name,
        full_name: d.display_name,
        avatar_url: d.avatar_url,
        avatar: d.avatar_url,
        locale: "vi",
        vip_level: d.vip_level,
        province: d.province,
        bio: d.bio,
        is_active: true,
        is_published: true,
        created_by_admin: true,
        seed_batch_id: batchId,
        age: d.age,
        gender: d.gender,
        tag: d.tag,
      }));
      const n = await adminBulkInsertFakeProfiles(rows);
      setDrafts([]);
      await loadPublished();
      alert(`Đã đăng ${n} nick ảo lên Nearby ✨`);
    } catch (e: any) {
      setError(e?.message || "Không đăng được. Kiểm tra migration mới nhất.");
    } finally {
      setPublishing(false);
    }
  };

  const deletePublished = async (id: string) => {
    if (!window.confirm("Xoá nick ảo này?")) return;
    try {
      await adminDeleteFakeProfile(id);
      setPublished((prev) => prev.filter((p) => p.id !== id));
    } catch (e: any) {
      alert("Lỗi: " + e.message);
    }
  };

  const deleteAll = async () => {
    if (!window.confirm(`Xoá TOÀN BỘ ${published.length} seed account?\n(KHÔNG ảnh hưởng user thật)`)) return;
    try {
      const n = await adminDeleteAllSeedAccounts();
      alert(`Đã xoá ${n} seed account.`);
      await loadPublished();
    } catch (e: any) {
      alert("Lỗi: " + e.message);
    }
  };

  return (
    <div className="seed-admin">
      <div className="seed-admin-head">
        <div>
          <h2 className="seed-admin-title">
            <Sparkles size={18} style={{ verticalAlign: "-3px", marginRight: 6 }} />
            FWB Seed Accounts
          </h2>
          <p className="seed-admin-sub">
            Random nick ảo · preview · publish · xoá hàng loạt. Seed account adapt khu vực theo viewer.
          </p>
        </div>
        <div className="seed-admin-actions">
          <input
            type="number"
            min={1} max={50}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
            className="seed-preview-input"
            style={{ width: 72 }}
            aria-label="Số lượng random"
          />
          <button className="seed-btn" onClick={genBatch}>
            <Wand2 size={14} /> Random {count} tài khoản
          </button>
          <button
            className="seed-btn danger"
            onClick={deleteAll}
            disabled={!published.length}
          >
            <Trash2 size={14} /> Xoá toàn bộ seed
          </button>
        </div>
      </div>

      {/* QUICK BULK CREATE — không cần preview, chèn thẳng vào DB */}
      <section className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/5 via-rose-400/5 to-fuchsia-400/5 p-3">
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          <strong style={{ fontSize: 13 }}>⚡ Tạo nhanh nick ảo (không cần preview)</strong>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[10, 50, 100].map((n) => (
              <button
                key={n}
                className="seed-btn"
                disabled={bulkBusy !== null}
                onClick={() => quickBulkCreate(n)}
              >
                <Sparkles size={14} />
                {bulkBusy === n ? `Đang tạo ${n}…` : `Tạo nhanh ${n} Nick Ảo`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error ? (
        <div style={{ padding: 10, borderRadius: 10, background: "rgba(220,38,38,0.1)", color: "#dc2626", fontSize: 12 }}>
          ⚠ {error}
        </div>
      ) : null}

      {/* DRAFTS — PREVIEW */}
      {drafts.length > 0 ? (
        <section>
          <div className="seed-admin-head" style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: 13 }}>
              📝 Bản nháp ({drafts.length}) — preview trước khi đăng
            </strong>
            <div className="seed-admin-actions">
              <button className="seed-btn ghost" onClick={() => setDrafts([])}>
                <X size={14} /> Bỏ tất cả
              </button>
              <button
                className="seed-btn success"
                onClick={publishAll}
                disabled={publishing}
              >
                <Upload size={14} /> {publishing ? "Đang đăng..." : `Đăng ${drafts.length} lên Nearby`}
              </button>
            </div>
          </div>
          <div className="seed-preview-grid">
            {drafts.map((d) => (
              <article key={d.draft_id} className="seed-preview-card">
                <div className="seed-preview-top">
                  <img loading="lazy" decoding="async" src={d.avatar_url} alt="" className="seed-preview-avatar" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input
                      className="seed-preview-input"
                      value={d.display_name}
                      onChange={(e) => updateDraft(d.draft_id, { display_name: e.target.value })}
                    />
                    <div className="seed-preview-meta" style={{ marginTop: 4 }}>
                      {d.age} tuổi · {d.province || "Adapt theo viewer"}
                    </div>
                  </div>
                </div>
                <input
                  className="seed-preview-input"
                  value={d.avatar_url}
                  onChange={(e) => updateDraft(d.draft_id, { avatar_url: e.target.value })}
                  placeholder="Avatar URL"
                />
                <textarea
                  className="seed-preview-input"
                  rows={2}
                  value={d.bio}
                  onChange={(e) => updateDraft(d.draft_id, { bio: e.target.value })}
                />
                <div className="seed-preview-row">
                  <span className="seed-preview-badge">{d.tag}</span>
                  {d.vip_level >= 2 ? (
                    <span className="seed-preview-badge vip">VIP {d.vip_level}</span>
                  ) : (
                    <button
                      type="button"
                      className="seed-preview-badge"
                      onClick={() => updateDraft(d.draft_id, { vip_level: 2 })}
                      style={{ cursor: "pointer" }}
                    >
                      + VIP
                    </button>
                  )}
                </div>
                <div className="seed-preview-row" style={{ justifyContent: "space-between" }}>
                  <button className="seed-btn ghost" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => regenOne(d.draft_id)}>
                    <RefreshCw size={12} /> Random lại
                  </button>
                  <button className="seed-btn danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => removeDraft(d.draft_id)}>
                    <X size={12} /> Xoá
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* PUBLISHED LIST */}
      <section>
        <div className="seed-admin-head" style={{ marginBottom: 8 }}>
          <strong style={{ fontSize: 13 }}>
            <Users size={14} style={{ verticalAlign: "-2px" }} /> Đã đăng ({filtered.length}/{published.length})
          </strong>
          <button className="seed-btn ghost" onClick={loadPublished}>
            <RefreshCw size={12} /> Làm mới
          </button>
        </div>

        {/* Filters */}
        <div
          style={{
            display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10,
            padding: 10, borderRadius: 12, background: "rgba(148,163,184,0.08)",
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            Từ:
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="seed-preview-input"
              style={{ width: 140 }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            Đến:
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="seed-preview-input"
              style={{ width: 140 }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            Trạng thái:
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as StatusFilter)}
              className="seed-preview-input"
              style={{ width: 140 }}
            >
              <option value="all">Tất cả</option>
              <option value="active">Đang hiện</option>
              <option value="inactive">Đã ẩn</option>
            </select>
          </label>
          {(filterFrom || filterTo || filterStatus !== "all") ? (
            <button
              className="seed-btn ghost"
              onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterStatus("all"); }}
            >
              <X size={12} /> Xoá lọc
            </button>
          ) : null}
        </div>

        {loading ? (
          <div style={{ padding: 16, textAlign: "center", opacity: 0.7, fontSize: 13 }}>Đang tải…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", opacity: 0.7, fontSize: 13 }}>
            {published.length === 0
              ? "Chưa có seed nào. Bấm “Tạo nhanh” phía trên để tạo hàng loạt."
              : "Không có nick nào khớp bộ lọc."}
          </div>
        ) : (
          <div className="seed-preview-grid">
            {filtered.map((p) => (
              <article key={p.id} className="seed-preview-card is-published">
                <div className="seed-preview-top">
                  <img loading="lazy" decoding="async" src={p.avatar_url || p.avatar || "/placeholder.svg"} alt="" className="seed-preview-avatar" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="seed-preview-name">
                      {p.display_name || p.full_name || p.username}
                    </div>
                    <div className="seed-preview-meta">
                      {(p as any).age ? `${(p as any).age} tuổi · ` : ""}
                      {p.province || "Adapt theo viewer"}
                    </div>
                    <div className="seed-preview-meta" style={{ opacity: 0.6 }}>
                      {new Date(p.created_at).toLocaleDateString("vi-VN")}
                    </div>
                  </div>
                </div>
                <div className="seed-preview-bio">{p.bio || <em>(không có bio)</em>}</div>
                <div className="seed-preview-row" style={{ justifyContent: "space-between" }}>
                  <span className={`seed-preview-badge ${p.is_active === false ? "" : "published"}`}>
                    {p.is_active === false ? "Đã ẩn" : "Đang hiện"}
                  </span>
                  <button className="seed-btn danger" style={{ padding: "4px 10px", fontSize: 11 }} onClick={() => deletePublished(p.id)}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
