/**
 * GuidesManager — Admin UI to create / edit / delete / pin / reorder
 * knowledge-center articles rendered by the user-facing Hướng Dẫn page.
 *
 * Backed by `public.guides` (RLS: read = anyone, write = admins).
 */
import { useEffect, useMemo, useState } from "react";
import { Pin, Trash2, Save, Plus, RefreshCw, ArrowUp, ArrowDown, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { GuideRow } from "@/components/candy/guide-page";
import { DEFAULT_GUIDES } from "@/components/candy/guide-default-content";


type Draft = Partial<GuideRow> & { title: string };

const emptyDraft = (): Draft => ({
  title: "",
  category: "Cơ bản",
  slug: "",
  excerpt: "",
  body: "",
  cover_url: "",
  is_pinned: false,
  sort_order: 0,
});

export function GuidesManager() {
  const [rows, setRows] = useState<GuideRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.from("guides") as any)
        .select("id, slug, title, category, excerpt, body, cover_url, is_pinned, sort_order, created_at, updated_at")
        .order("is_pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setRows((data ?? []) as GuideRow[]);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const startCreate = () => setEditing(emptyDraft());
  const startEdit = (row: GuideRow) => setEditing({ ...row });

  const save = async () => {
    if (!editing) return;
    const title = (editing.title || "").trim();
    if (!title) return toast.error("Nhập tiêu đề");
    setSaving(true);
    try {
      const payload: any = {
        title,
        category: (editing.category || "Khác").trim(),
        slug: (editing.slug || "").trim() || null,
        excerpt: (editing.excerpt || "").trim() || null,
        body: editing.body || null,
        cover_url: (editing.cover_url || "").trim() || null,
        is_pinned: !!editing.is_pinned,
        sort_order: Number(editing.sort_order ?? 0) || 0,
      };
      if (editing.id) {
        const { error } = await (supabase.from("guides") as any)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Đã lưu");
      } else {
        const { error } = await (supabase.from("guides") as any).insert(payload);
        if (error) throw error;
        toast.success("Đã tạo bài hướng dẫn");
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Lỗi khi lưu");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: GuideRow) => {
    if (!window.confirm(`Xóa "${row.title}"?`)) return;
    const { error } = await (supabase.from("guides") as any).delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success("Đã xóa");
    await load();
  };

  const togglePin = async (row: GuideRow) => {
    const { error } = await (supabase.from("guides") as any)
      .update({ is_pinned: !row.is_pinned }).eq("id", row.id);
    if (error) return toast.error(error.message);
    await load();
  };

  const move = async (row: GuideRow, dir: -1 | 1) => {
    const next = Number(row.sort_order ?? 0) + dir;
    const { error } = await (supabase.from("guides") as any)
      .update({ sort_order: next }).eq("id", row.id);
    if (error) return toast.error(error.message);
    await load();
  };

  const grouped = useMemo(() => {
    const m = new Map<string, GuideRow[]>();
    for (const r of rows) {
      const k = (r.category?.trim() || "Khác");
      (m.get(k) ?? m.set(k, []).get(k)!).push(r);
    }
    return Array.from(m.entries());
  }, [rows]);

  return (
    <div className="admv3-page">
      <div className="admv3-page-head">
        <div>
          <h2 className="admv3-page-title">Quản lý Hướng dẫn</h2>
          <p className="admv3-page-sub">
            Tạo, chỉnh sửa, ghim và sắp xếp bài hướng dẫn hiển thị trong tab Hướng dẫn.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="admv3-btn admv3-btn-ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={13} /> Tải lại
          </button>
          <button
            className="admv3-btn admv3-btn-ghost"
            onClick={async () => {
              if (!window.confirm(`Nhập ${DEFAULT_GUIDES.length} bài hướng dẫn mặc định vào DB để có thể chỉnh sửa? (Bỏ qua bài trùng tiêu đề)`)) return;
              try {
                const { data: existing } = await (supabase.from("guides") as any).select("title");
                const have = new Set(((existing as any[]) || []).map((r) => String(r.title).trim().toLowerCase()));
                const payload = DEFAULT_GUIDES
                  .filter((g) => !have.has(g.title.trim().toLowerCase()))
                  .map((g) => ({
                    title: g.title,
                    category: g.category ?? "Khác",
                    excerpt: g.excerpt ?? null,
                    body: g.body ?? null,
                    is_pinned: !!g.is_pinned,
                    sort_order: g.sort_order ?? 100,
                  }));
                if (payload.length === 0) { toast.info("Không có bài mới để nhập."); return; }
                const { error } = await (supabase.from("guides") as any).insert(payload);
                if (error) throw error;
                toast.success(`Đã nhập ${payload.length} bài mặc định`);
                await load();
              } catch (e: any) {
                toast.error(e?.message || "Không nhập được");
              }
            }}
          >
            <Plus size={13} /> Nhập bộ mặc định
          </button>
          <button className="admv3-btn admv3-btn-primary" onClick={startCreate}>
            <Plus size={13} /> Bài mới
          </button>
        </div>

      </div>

      {editing ? (
        <div
          style={{
            border: "1px solid var(--border,#e5e7eb)", borderRadius: 14, padding: 16,
            marginBottom: 20, background: "var(--card,#fff)",
            display: "grid", gap: 10,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {editing.id ? "Sửa bài" : "Bài hướng dẫn mới"}
          </div>
          <Row>
            <Field label="Tiêu đề">
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </Field>
            <Field label="Danh mục">
              <input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} placeholder="VD: Cơ bản, An toàn, FAQ…" />
            </Field>
          </Row>
          <Row>
            <Field label="Slug (tùy chọn)">
              <input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} placeholder="fwb-la-gi" />
            </Field>
            <Field label="Thứ tự (nhỏ = lên trên)">
              <input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} />
            </Field>
          </Row>
          <Field label="Ảnh bìa (URL)">
            <input value={editing.cover_url ?? ""} onChange={(e) => setEditing({ ...editing, cover_url: e.target.value })} placeholder="https://…" />
          </Field>
          <Field label="Tóm tắt (excerpt)">
            <textarea rows={2} value={editing.excerpt ?? ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
          </Field>
          <Field label="Nội dung (HTML hoặc văn bản có ngắt dòng)">
            <textarea rows={12} value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={!!editing.is_pinned} onChange={(e) => setEditing({ ...editing, is_pinned: e.target.checked })} />
            Ghim lên đầu
          </label>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="admv3-btn admv3-btn-ghost" onClick={() => setEditing(null)}>Hủy</button>
            <button className="admv3-btn admv3-btn-primary" onClick={() => void save()} disabled={saving}>
              <Save size={13} /> {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </div>
        </div>
      ) : null}

      {grouped.length === 0 && !loading ? (
        <div style={{ padding: 30, textAlign: "center", opacity: 0.6 }}>Chưa có bài nào.</div>
      ) : null}

      {grouped.map(([cat, items]) => (
        <section key={cat} style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, opacity: 0.65, marginBottom: 8 }}>{cat}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {items.map((row) => (
              <div
                key={row.id}
                style={{
                  border: "1px solid var(--border,#e5e7eb)", borderRadius: 12, padding: "10px 12px",
                  display: "flex", alignItems: "center", gap: 12, background: "var(--card,#fff)",
                }}
              >
                {row.cover_url ? (
                  <img loading="lazy" decoding="async" src={row.cover_url} alt="" style={{ width: 56, height: 40, objectFit: "cover", borderRadius: 8 }} />
                ) : (
                  <div style={{ width: 56, height: 40, borderRadius: 8, background: "#fde68a" }} />
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {row.is_pinned ? <Pin size={12} style={{ color: "#f59e0b" }} /> : null}
                    <div style={{ fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.title}</div>
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>#{row.sort_order ?? 0} · {row.slug || row.id.slice(0, 6)}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="admv3-btn admv3-btn-ghost" onClick={() => void move(row, -1)} title="Lên"><ArrowUp size={13} /></button>
                  <button className="admv3-btn admv3-btn-ghost" onClick={() => void move(row, 1)} title="Xuống"><ArrowDown size={13} /></button>
                  <button className="admv3-btn admv3-btn-ghost" onClick={() => void togglePin(row)} title={row.is_pinned ? "Bỏ ghim" : "Ghim"}>
                    <Pin size={13} />
                  </button>
                  <button className="admv3-btn admv3-btn-ghost" onClick={() => startEdit(row)}><Edit3 size={13} /></button>
                  <button className="admv3-btn admv3-btn-danger" onClick={() => void remove(row)}><Trash2 size={13} /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
      <span style={{ opacity: 0.7 }}>{label}</span>
      <span
        style={{
          border: "1px solid var(--border,#e5e7eb)", borderRadius: 8, padding: "0 4px",
          background: "var(--muted,#f9fafb)", display: "flex", alignItems: "stretch",
        }}
      >
        {children}
      </span>
      <style>{`label span input, label span textarea { flex:1; border:0; background:transparent; padding:8px; font:inherit; outline:none; width:100%; resize:vertical; }`}</style>
    </label>
  );
}

export default GuidesManager;
