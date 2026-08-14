import { avatarSrc } from "@/lib/image-cdn";
/**
 * DeletedPostsManager — tab "🗑️ Bài viết đã xóa" trong Admin → Quản lý bài viết.
 * Bài viết bị admin xóa chỉ được đánh dấu deleted_at (soft delete) nên có thể
 * khôi phục lại; "Xóa vĩnh viễn" mới thực sự xóa khỏi database.
 */
import { useCallback, useEffect, useState } from "react";
import { Eye, RotateCcw, Trash2, RefreshCw, X, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type DeletedPostRow = {
  id: string;
  uuid: string;
  user_id: string;
  username: string;
  avatar: string | null;
  content: string;
  image_urls: string[];
  video_url: string | null;
  created_at: string;
  deleted_at: string | null;
  deleted_by_name: string;
  delete_reason: string | null;
};

function formatTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("vi-VN", { hour12: false });
}

async function fetchDeletedPosts(): Promise<DeletedPostRow[]> {
  const { data, error } = await (supabase.from("posts") as any)
    .select("id, post_code, user_id, content, image_urls, image_url, created_at, deleted_at, deleted_by, delete_reason")
    .not("deleted_at", "is", null)
    .order("deleted_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const list: any[] = data || [];
  if (!list.length) return [];

  const ids = Array.from(
    new Set(list.flatMap((p) => [p.user_id, p.deleted_by]).filter(Boolean)),
  );
  const profiles = new Map<string, any>();
  if (ids.length) {
    const { data: profs } = await (supabase.from("profiles") as any)
      .select("id, username, full_name, avatar, avatar_url")
      .in("id", ids);
    (profs || []).forEach((p: any) => profiles.set(p.id, p));
  }

  return list.map((p) => {
    const prof = profiles.get(p.user_id) || {};
    const admin = profiles.get(p.deleted_by) || {};
    return {
      id: (p.post_code as string) || (p.id as string),
      uuid: p.id,
      user_id: p.user_id || "",
      username: prof.username || prof.full_name || "Người dùng",
      avatar: prof.avatar_url || prof.avatar || null,
      content: p.content || "",
      image_urls: Array.isArray(p.image_urls) ? p.image_urls : p.image_url ? [p.image_url] : [],
      video_url: p.video_url || null,
      created_at: p.created_at,
      deleted_at: p.deleted_at || null,
      deleted_by_name: admin.username || admin.full_name || (p.deleted_by ? p.deleted_by : "Admin"),
      delete_reason: p.delete_reason || null,
    };
  });
}

export function DeletedPostsManager() {
  const [rows, setRows] = useState<DeletedPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DeletedPostRow | null>(null);
  const [confirmPurge, setConfirmPurge] = useState<DeletedPostRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await fetchDeletedPosts());
    } catch (e: any) {
      toast.error(e?.message || "Không tải được thùng rác bài viết.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const restore = async (r: DeletedPostRow) => {
    const { error } = await (supabase as any).rpc("admin_restore_post", { p_post_id: r.uuid });
    if (error) {
      const { error: e2 } = await (supabase.from("posts") as any)
        .update({ deleted_at: null, deleted_by: null, delete_reason: null })
        .eq("id", r.uuid);
      if (e2) {
        toast.error(e2.message || "Không thể khôi phục.");
        return;
      }
    }
    setRows((rs) => rs.filter((x) => x.uuid !== r.uuid));
    setDetail(null);
    toast.success(`Đã khôi phục bài ${r.id}.`);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("feed:refresh"));
  };

  const purge = async (r: DeletedPostRow) => {
    const { error } = await (supabase as any).rpc("admin_purge_post", { p_post_id: r.uuid });
    if (error) {
      const { error: e2 } = await supabase.from("posts").delete().eq("id", r.uuid);
      if (e2) {
        toast.error(e2.message || "Không thể xóa vĩnh viễn.");
        return;
      }
    }
    setRows((rs) => rs.filter((x) => x.uuid !== r.uuid));
    setConfirmPurge(null);
    setDetail(null);
    toast.success(`Đã xóa vĩnh viễn bài ${r.id}.`);
  };

  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.user_id.toLowerCase().includes(q) ||
          r.username.toLowerCase().includes(q) ||
          r.content.toLowerCase().includes(q),
      )
    : rows;

  return (
    <div className="adp-wrap">
      <div className="adp-toolbar">
        <div className="adp-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo POST ID, UID, tên hoặc nội dung…"
          />
          {query && (
            <button onClick={() => setQuery("")} className="adp-search-clear">
              <X size={14} />
            </button>
          )}
        </div>
        <button className="adp-refresh" onClick={() => void reload()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "spin" : ""} />
          <span>{loading ? "Đang tải…" : "Làm mới"}</span>
        </button>
      </div>

      <div className="adp-note">
        Bài viết bị xóa chỉ được chuyển sang trạng thái <b>deleted</b> — vẫn nằm trong database và
        có thể khôi phục bất cứ lúc nào.
      </div>

      <div className="adp-table-wrap">
        <table className="adp-table">
          <thead>
            <tr>
              <th className="col-id">POST ID</th>
              <th className="col-user">Người đăng</th>
              <th className="col-content">Nội dung</th>
              <th className="col-time">Đăng lúc</th>
              <th className="col-time">Xóa lúc</th>
              <th className="col-user">Admin xóa</th>
              <th className="col-content">Lý do</th>
              <th className="col-actions">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="adp-empty-row">Thùng rác trống.</td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.uuid} className="adp-row" onClick={() => setDetail(r)}>
                <td className="adp-id">{r.id}</td>
                <td>
                  <div className="adp-user">
                    <div className="adp-avatar">
                      {r.avatar ? <img loading="lazy" src={avatarSrc(r.avatar, 64)} alt={r.username} /> : <span>{r.username[0]?.toUpperCase()}</span>}
                    </div>
                    <div className="adp-user-meta">
                      <div className="adp-username">{r.username}</div>
                      <div className="adp-userid">{r.user_id}</div>
                    </div>
                  </div>
                </td>
                <td className="adp-content">
                  {r.content?.slice(0, 60) || "(không có nội dung)"}
                  {r.image_urls.length ? " 🖼️" : ""}
                  {r.video_url ? " 🎬" : ""}
                </td>
                <td className="adp-time">{formatTime(r.created_at)}</td>
                <td className="adp-time">{formatTime(r.deleted_at)}</td>
                <td className="adp-time">{r.deleted_by_name}</td>
                <td className="adp-content">{r.delete_reason || "—"}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="adp-actions">
                    <button className="adp-act" onClick={() => setDetail(r)}>
                      <Eye size={13} /> <span>Xem</span>
                    </button>
                    <button className="adp-act" onClick={() => void restore(r)}>
                      <RotateCcw size={13} /> <span>Khôi phục</span>
                    </button>
                    <button className="adp-act is-danger" onClick={() => setConfirmPurge(r)}>
                      <Trash2 size={13} /> <span>Xóa vĩnh viễn</span>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="adp-cards">
          {filtered.length === 0 && <div className="adp-empty-card">Thùng rác trống.</div>}
          {filtered.map((r) => (
            <div key={r.uuid} className="adp-card" onClick={() => setDetail(r)}>
              <div className="adp-card-head">
                <div className="adp-user">
                  <div className="adp-avatar">
                    {r.avatar ? <img loading="lazy" src={avatarSrc(r.avatar, 64)} alt={r.username} /> : <span>{r.username[0]?.toUpperCase()}</span>}
                  </div>
                  <div className="adp-user-meta">
                    <div className="adp-username">{r.username}</div>
                    <div className="adp-userid">{r.id} · xóa {formatTime(r.deleted_at)}</div>
                  </div>
                </div>
              </div>
              <div className="adp-card-content">{r.content?.slice(0, 120) || "(không có nội dung)"}</div>
              <div className="adp-card-actions" onClick={(e) => e.stopPropagation()}>
                <div className="adp-actions">
                  <button className="adp-act" onClick={() => void restore(r)}>
                    <RotateCcw size={13} /> <span>Khôi phục</span>
                  </button>
                  <button className="adp-act is-danger" onClick={() => setConfirmPurge(r)}>
                    <Trash2 size={13} /> <span>Xóa vĩnh viễn</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {detail && (
        <div className="adp-modal-backdrop" onClick={() => setDetail(null)}>
          <div className="adp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adp-modal-head">
              <div>
                <div className="adp-modal-id">{detail.id}</div>
                <div className="adp-modal-time">
                  Đăng: {formatTime(detail.created_at)} · Xóa: {formatTime(detail.deleted_at)} · bởi{" "}
                  {detail.deleted_by_name}
                </div>
              </div>
              <button className="adp-modal-close" onClick={() => setDetail(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="adp-modal-body">
              <div className="adp-modal-author">
                <div className="adp-avatar adp-avatar-lg">
                  {detail.avatar ? <img loading="lazy" decoding="async" src={avatarSrc(detail.avatar, 64)} alt={detail.username} /> : <span>{detail.username[0]?.toUpperCase()}</span>}
                </div>
                <div className="adp-user-meta">
                  <div className="adp-username">{detail.username}</div>
                  <div className="adp-userid">{detail.user_id}</div>
                </div>
              </div>
              <div className="adp-modal-content">{detail.content || "(không có nội dung)"}</div>
              {detail.image_urls.length > 0 && (
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))" }}>
                  {detail.image_urls.map((u) => (
                    <img loading="lazy" decoding="async" key={u} src={u} alt="" style={{ width: "100%", borderRadius: 10 }} />
                  ))}
                </div>
              )}
              {detail.video_url && (
                <video src={detail.video_url} controls style={{ width: "100%", borderRadius: 10 }} />
              )}
              <div className="adp-note">Lý do xóa: {detail.delete_reason || "(không ghi)"}</div>
              <div className="adp-actions">
                <button className="adp-act" onClick={() => void restore(detail)}>
                  <RotateCcw size={13} /> <span>Khôi phục bài viết</span>
                </button>
                <button className="adp-act is-danger" onClick={() => setConfirmPurge(detail)}>
                  <Trash2 size={13} /> <span>Xóa vĩnh viễn</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmPurge && (
        <div className="adp-modal-backdrop" onClick={() => setConfirmPurge(null)}>
          <div className="adp-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="adp-modal-head">
              <div className="adp-modal-id">Xóa vĩnh viễn {confirmPurge.id}?</div>
            </div>
            <div className="adp-modal-body">
              <p style={{ margin: 0 }}>
                Bài viết sẽ bị xóa khỏi database và <b>không thể khôi phục</b>.
              </p>
              <div className="adp-actions">
                <button className="adp-act" onClick={() => setConfirmPurge(null)}>Hủy</button>
                <button className="adp-act is-danger-on" onClick={() => void purge(confirmPurge)}>
                  Xóa vĩnh viễn
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DeletedPostsManager;
