/**
 * ADMIN — Quản lý Feedback (thêm / sửa / xoá / ẩn-hiện + buff tim/view/rating).
 * Buff chỉ lưu MỤC TIÊU + THỜI GIAN CHẠY, không lưu từng lượt.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Heart, Pencil, Plus, RefreshCw, Trash2, Star } from "lucide-react";
import { supabase } from "@/lib/supabase";
import {
  DURATION_PRESETS,
  RATING_PRESETS,
  fetchFeedbackAll,
  formatCount,
  likeCountOf,
  viewCountOf,
  type FeedbackPost,
} from "@/lib/feedback";
import { uploadFeedbackImage } from "@/lib/feedback-media";

type Draft = {
  id?: string;
  title: string;
  author_name: string;
  location: string;
  short_content: string;
  content: string;
  image_url: string | null;
  target_likes: number;
  likes_duration: number;
  target_views: number;
  views_duration: number;
  rating: number;
  is_hidden: boolean;
};

const emptyDraft = (): Draft => ({
  title: "",
  author_name: "",
  location: "",
  short_content: "",
  content: "",
  image_url: null,
  target_likes: 1000,
  likes_duration: 2 * 86400,
  target_views: 10000,
  views_duration: 7 * 86400,
  rating: 4.8,
  is_hidden: false,
});

export function FeedbackManager() {
  const [rows, setRows] = useState<FeedbackPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchFeedbackAll());
    } catch (e: any) {
      toast.error(e?.message || "Không tải được danh sách Feedback.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (p: FeedbackPost) =>
    setDraft({
      id: p.id,
      title: p.title,
      author_name: p.author_name,
      location: p.location,
      short_content: p.short_content,
      content: p.content,
      image_url: p.image_url,
      target_likes: p.target_likes,
      likes_duration: p.likes_duration,
      target_views: p.target_views,
      views_duration: p.views_duration,
      rating: Number(p.rating) || 5,
      is_hidden: p.is_hidden,
    });

  const onPickImage = async (file?: File | null) => {
    if (!file || !draft) return;
    setUploading(true);
    try {
      const { imageUrl, thumbUrl } = await uploadFeedbackImage(file);
      setDraft({ ...draft, image_url: imageUrl || thumbUrl });
      toast.success("Đã nén WebP (< 50KB) và tải lên bucket media (Supabase #2).");
    } catch (e: any) {
      toast.error(e?.message || "Upload ảnh thất bại.");
    }
    setUploading(false);
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast.error("Nhập tiêu đề.");
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {
      title: draft.title.trim(),
      author_name: draft.author_name.trim(),
      location: draft.location.trim(),
      short_content: draft.short_content.trim(),
      content: draft.content.trim(),
      image_url: draft.image_url,
      target_likes: Number(draft.target_likes) || 0,
      likes_duration: Number(draft.likes_duration) || 0,
      target_views: Number(draft.target_views) || 0,
      views_duration: Number(draft.views_duration) || 0,
      rating: Number(draft.rating) || 5,
      is_hidden: draft.is_hidden,
      updated_at: new Date().toISOString(),
    };
    let error;
    if (draft.id) {
      ({ error } = await (supabase.from("feedback_posts") as any)
        .update(payload)
        .eq("id", draft.id));
    } else {
      ({ error } = await (supabase.from("feedback_posts") as any).insert(payload));
    }
    setSaving(false);
    if (error) {
      console.error("[feedback] save failed", error);
      toast.error(error.message || "Không thể lưu bài Feedback.");
      return;
    }
    toast.success("Đã lưu thành công");
    setDraft(null);
    await load();
  };

  const toggleHidden = async (p: FeedbackPost) => {
    const { error } = await (supabase.from("feedback_posts") as any)
      .update({ is_hidden: !p.is_hidden })
      .eq("id", p.id);
    if (error) toast.error(error.message);
    else void load();
  };

  const remove = async (p: FeedbackPost) => {
    if (!window.confirm(`Xoá "${p.title}"?`)) return;
    const { error } = await (supabase.from("feedback_posts") as any).delete().eq("id", p.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Đã xoá.");
      void load();
    }
  };

  return (
    <div className="stack-md">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h3 style={{ margin: 0 }}>⭐ Quản lý Feedback</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="choice-chip" disabled={loading} onClick={() => void load()}>
            <RefreshCw size={14} /> Tải lại
          </button>
          <button className="choice-chip" onClick={() => setDraft(emptyDraft())}>
            <Plus size={14} /> Thêm Feedback
          </button>
        </div>
      </div>

      {draft ? (
        <div className="stack-sm" style={{ border: "1px solid rgba(128,128,128,.3)", borderRadius: 14, padding: 12 }}>
          <input className="app-input" placeholder="Tiêu đề" value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="app-input" style={{ flex: 1, minWidth: 140 }} placeholder="Tên"
              value={draft.author_name} onChange={(e) => setDraft({ ...draft, author_name: e.target.value })} />
            <input className="app-input" style={{ flex: 1, minWidth: 140 }} placeholder="Khu vực"
              value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          </div>
          <input className="app-input" placeholder="Nội dung ngắn (hiển thị ở danh sách)"
            value={draft.short_content} onChange={(e) => setDraft({ ...draft, short_content: e.target.value })} />
          <textarea className="app-input" rows={5} placeholder="Nội dung đầy đủ"
            value={draft.content} onChange={(e) => setDraft({ ...draft, content: e.target.value })} />

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <label className="choice-chip" style={{ cursor: "pointer" }}>
              {uploading ? "Đang tải ảnh…" : "Chọn ảnh"}
              <input type="file" accept="image/*" hidden
                onChange={(e) => void onPickImage(e.target.files?.[0])} />
            </label>
            {draft.image_url ? (
              <img loading="lazy" decoding="async" src={draft.image_url} alt="" style={{ width: 72, height: 48, objectFit: "cover", borderRadius: 8 }} />
            ) : null}
            <span style={{ fontSize: ".75rem", opacity: .7 }}>WebP • 480px + 720px • &lt; 50KB • bucket media (Supabase #2)</span>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Heart size={14} /> Target tim:
              <input className="app-input" type="number" style={{ width: 120 }} value={draft.target_likes}
                onChange={(e) => setDraft({ ...draft, target_likes: Number(e.target.value) || 0 })} />
              {DURATION_PRESETS.map((d) => (
                <button key={d.seconds}
                  className={`choice-chip ${draft.likes_duration === d.seconds ? "is-active" : ""}`}
                  onClick={() => setDraft({ ...draft, likes_duration: d.seconds })}>{d.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Eye size={14} /> Target view:
              <input className="app-input" type="number" style={{ width: 120 }} value={draft.target_views}
                onChange={(e) => setDraft({ ...draft, target_views: Number(e.target.value) || 0 })} />
              {DURATION_PRESETS.map((d) => (
                <button key={d.seconds}
                  className={`choice-chip ${draft.views_duration === d.seconds ? "is-active" : ""}`}
                  onClick={() => setDraft({ ...draft, views_duration: d.seconds })}>{d.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Star size={14} /> Rating:
              {RATING_PRESETS.map((r) => (
                <button key={r} className={`choice-chip ${draft.rating === r ? "is-active" : ""}`}
                  onClick={() => setDraft({ ...draft, rating: r })}>⭐ {r.toFixed(1)}</button>
              ))}
            </div>
          </div>

          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: ".85rem" }}>
            <input type="checkbox" checked={draft.is_hidden}
              onChange={(e) => setDraft({ ...draft, is_hidden: e.target.checked })} /> Ẩn bài này
          </label>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="choice-chip is-active" disabled={saving} onClick={() => void save()}>
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
            <button className="choice-chip" onClick={() => setDraft(null)}>Huỷ</button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p style={{ opacity: .6 }}>Đang tải…</p>
      ) : rows.length === 0 ? (
        <p style={{ opacity: .6 }}>Chưa có Feedback nào.</p>
      ) : (
        <div className="stack-sm">
          {rows.map((p) => (
            <div key={p.id} style={{
              display: "flex", gap: 10, alignItems: "center", padding: 10,
              border: "1px solid rgba(128,128,128,.25)", borderRadius: 12,
              opacity: p.is_hidden ? 0.55 : 1,
            }}>
              {p.image_url ? (
                <img decoding="async" src={p.image_url} alt="" loading="lazy"
                  style={{ width: 56, height: 42, objectFit: "cover", borderRadius: 8 }} />
              ) : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: ".92rem" }}>{p.title}</div>
                <div style={{ fontSize: ".75rem", opacity: .7 }}>
                  {p.author_name} · {p.location} · ❤️ {formatCount(likeCountOf(p))}/{formatCount(p.target_likes)} · 👁 {formatCount(viewCountOf(p))}/{formatCount(p.target_views)} · ⭐ {Number(p.rating).toFixed(1)}
                </div>
              </div>
              <button className="choice-chip" onClick={() => startEdit(p)} aria-label="Sửa"><Pencil size={14} /></button>
              <button className="choice-chip" onClick={() => void toggleHidden(p)} aria-label="Ẩn/Hiện">
                {p.is_hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button className="choice-chip" onClick={() => void remove(p)} aria-label="Xoá"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default FeedbackManager;
