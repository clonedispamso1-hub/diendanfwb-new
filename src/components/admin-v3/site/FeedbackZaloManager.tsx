/** Admin Panel → Quản lý Feedback Zalo. Ghi qua RPC admin, không upload file. */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteFeedbackZalo,
  fetchFeedbackZalo,
  safeHttpUrl,
  upsertFeedbackZalo,
  validateDraft,
  type DraftErrors,
  type FeedbackZaloDraft,
  type FeedbackZaloPost,
} from "@/lib/feedback-zalo-store";
import { FeedbackMedia } from "@/components/candy/feedback-zalo-media";

const EMPTY: FeedbackZaloDraft = {
  author_name: "", avatar_url: "", title: "", cover_url: "", content_url: "", content_type: "image", description: "",
};

const field: React.CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10,
  border: "1px solid rgba(120,120,140,0.3)", background: "transparent", color: "inherit",
};
const err: React.CSSProperties = { color: "#ef4444", fontSize: 12 };

export function FeedbackZaloManager() {
  const [items, setItems] = useState<FeedbackZaloPost[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [editing, setEditing] = useState<{ id?: string; draft: FeedbackZaloDraft } | null>(null);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchFeedbackZalo(true).then(
      (list) => { if (alive) { setItems(list); setState("ready"); } },
      () => { if (alive) setState("error"); },
    );
    return () => { alive = false; };
  }, []);

  const set = (k: keyof FeedbackZaloDraft, v: string) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  const save = async () => {
    if (!editing) return;
    const v = validateDraft(editing.draft);
    setErrors(v);
    if (Object.keys(v).length) { toast.error("Vui lòng sửa các trường bị lỗi."); return; }
    setSaving(true);
    try {
      setItems(await upsertFeedbackZalo(editing.draft, editing.id));
      toast.success(editing.id ? "Đã cập nhật feedback." : "Đã thêm feedback.");
      setEditing(null);
    } catch (e) {
      toast.error("Lưu thất bại: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: FeedbackZaloPost) => {
    if (!window.confirm(`Xóa feedback "${p.title}"?`)) return;
    try {
      setItems(await deleteFeedbackZalo(p.id));
      toast.success("Đã xóa feedback.");
    } catch (e) {
      toast.error("Xóa thất bại: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const d = editing?.draft;
  const input = (k: keyof FeedbackZaloDraft, label: string, placeholder = "") => (
    <label style={{ display: "grid", gap: 5, fontSize: 13 }}>
      {label}
      <input style={field} placeholder={placeholder} value={d![k]} onChange={(e) => set(k, e.target.value)} />
      {errors[k] ? <span style={err}>{errors[k]}</span> : null}
    </label>
  );

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>💬 Quản lý Feedback Zalo</h2>
        {!editing ? (
          <button type="button" onClick={() => { setErrors({}); setEditing({ draft: { ...EMPTY } }); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: 0, background: "linear-gradient(135deg,#a855f7,#ec4899)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
            <Plus size={16} /> Thêm feedback
          </button>
        ) : null}
      </div>

      {editing && d ? (
        <div style={{ display: "grid", gap: 12, padding: 16, borderRadius: 14, border: "1px solid rgba(168,85,247,0.3)", marginBottom: 20 }}>
          {input("author_name", "Tên người đăng *", "Minh Anh")}
          {input("avatar_url", "URL ảnh đại diện *", "https://...")}
          {safeHttpUrl(d.avatar_url) ? <img src={d.avatar_url} alt="" style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }} /> : null}
          {input("title", "Tiêu đề bài viết *", "Đã vào VIP Hà Nội và hẹn hò thành công")}
          {input("cover_url", "URL ảnh bìa *", "https://...")}
          {safeHttpUrl(d.cover_url) ? <img src={d.cover_url} alt="" style={{ maxWidth: 240, maxHeight: 140, borderRadius: 10, objectFit: "cover" }} /> : null}
          {input("content_url", "URL nội dung *", "https://... (.jpg / .mp4 / link)")}
          <label style={{ display: "grid", gap: 5, fontSize: 13 }}>
            Loại nội dung *
            <select style={field} value={d.content_type} onChange={(e) => set("content_type", e.target.value)}>
              <option value="image">Ảnh</option>
              <option value="video">Video</option>
              <option value="link">Liên kết khác</option>
            </select>
          </label>
          {safeHttpUrl(d.content_url) ? (
            <div style={{ maxWidth: 360 }}>
              <FeedbackMedia url={d.content_url} type={d.content_type} poster={safeHttpUrl(d.cover_url) ?? undefined} />
            </div>
          ) : null}
          <label style={{ display: "grid", gap: 5, fontSize: 13 }}>
            Mô tả bổ sung
            <textarea style={{ ...field, minHeight: 80 }} value={d.description} onChange={(e) => set("description", e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" disabled={saving} onClick={save}
              style={{ padding: "9px 16px", borderRadius: 10, border: 0, background: "#a855f7", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
            <button type="button" disabled={saving} onClick={() => setEditing(null)}
              style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid rgba(120,120,140,0.3)", background: "transparent", color: "inherit", cursor: "pointer" }}>
              Hủy
            </button>
          </div>
        </div>
      ) : null}

      {state === "loading" ? <div style={{ opacity: 0.7 }}>Đang tải…</div> : null}
      {state === "error" ? <div style={err}>Không tải được danh sách feedback.</div> : null}
      {state === "ready" && items.length === 0 ? <div style={{ opacity: 0.7 }}>Chưa có feedback nào.</div> : null}
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 10, borderRadius: 12, border: "1px solid rgba(120,120,140,0.25)" }}>
            <img src={p.cover_url || p.avatar_url} alt="" style={{ width: 64, height: 48, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{p.author_name} · {p.content_type}</div>
            </div>
            <button type="button" aria-label="Sửa" onClick={() => { setErrors({}); const { id, created_at: _c, ...draft } = p; setEditing({ id, draft }); }}
              style={{ padding: 8, borderRadius: 8, border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}><Pencil size={16} /></button>
            <button type="button" aria-label="Xóa" onClick={() => remove(p)}
              style={{ padding: 8, borderRadius: 8, border: 0, background: "transparent", color: "#ef4444", cursor: "pointer" }}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
