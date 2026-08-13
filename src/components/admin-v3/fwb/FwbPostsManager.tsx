import { avatarSrc } from "@/lib/image-cdn";
import { useCallback, useEffect, useState } from "react";
import { Search, EyeOff, Eye, Trash2, Lock, Unlock, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ZaloPost = {
  id: string;
  user_id: string;
  content: string | null;
  image_urls: string[] | null;
  created_at: string | null;
  is_hidden?: boolean | null;
  status?: string | null;
  category?: string | null;
  profile?: {
    id: string;
    public_id: string | null;
    full_name: string | null;
    username: string | null;
    phone: string | null;
    avatar: string | null;
  } | null;
};

type SearchMode = "all" | "uid" | "name" | "phone";

export function FwbPostsManager() {
  const [rows, setRows] = useState<ZaloPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<SearchMode>("all");
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // profile filter first when tìm theo user info
      let profileIds: string[] | null = null;
      const term = q.trim();
      if (term && mode !== "all") {
        let pq: any = (supabase.from("profiles") as any).select("id").limit(200);
        if (mode === "uid") pq = pq.or(`id.eq.${/^[0-9a-f-]{8,}$/i.test(term) ? term : "00000000-0000-0000-0000-000000000000"},public_id.ilike.%${term}%`);
        else if (mode === "name") pq = pq.ilike("full_name", `%${term}%`);
        else if (mode === "phone") pq = pq.ilike("phone", `%${term}%`);
        const { data: prs } = await pq;
        profileIds = (prs ?? []).map((r: any) => r.id);
        if (profileIds && profileIds.length === 0) {
          setRows([]);
          return;
        }
      }

      let query: any = (supabase.from("posts") as any)
        .select("id, user_id, content, image_urls, created_at, is_hidden, status, category")
        .eq("category", "fwb")
        .order("created_at", { ascending: false })
        .limit(100);
      if (profileIds) query = query.in("user_id", profileIds);
      if (term && mode === "all") query = query.ilike("content", `%${term}%`);

      const { data: posts, error } = await query;
      if (error) throw error;

      const userIds = Array.from(new Set((posts ?? []).map((p: any) => p.user_id))) as string[];
      const { data: profs } = userIds.length
        ? await (supabase.from("profiles") as any)
            .select("id, public_id, full_name, username, phone, avatar")
            .in("id", userIds)
        : { data: [] as any[] };
      const pmap = new Map<string, any>();
      (profs ?? []).forEach((p: any) => pmap.set(p.id, p));

      setRows((posts ?? []).map((p: any) => ({ ...p, profile: pmap.get(p.user_id) ?? null })));
    } catch (e: any) {
      toast.error("Lỗi tải bài Tìm Zalo: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [q, mode]);

  useEffect(() => { void load(); }, [load]);

  const setHidden = async (p: ZaloPost, hidden: boolean) => {
    const { error } = await (supabase.from("posts") as any)
      .update({ is_hidden: hidden })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(hidden ? "Đã ẩn bài" : "Đã hiện bài");
    setRows((rs) => rs.map((r) => (r.id === p.id ? { ...r, is_hidden: hidden } : r)));
  };

  const remove = async (p: ZaloPost) => {
    if (!window.confirm("Xóa vĩnh viễn bài này?")) return;
    const { error } = await (supabase.from("posts") as any).delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Đã xóa");
    setRows((rs) => rs.filter((r) => r.id !== p.id));
  };

  const lockUserZalo = async (userId: string) => {
    const daysStr = window.prompt("Khóa đăng Tìm Zalo trong bao nhiêu ngày? (0 = vĩnh viễn)", "7");
    if (daysStr == null) return;
    const days = Math.max(0, Number(daysStr) || 0);
    const until = days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null;
    const { error } = await (supabase.from("profiles") as any)
      .update({ is_fwb_active: false, intent_locked_until: until })
      .eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success("Đã khóa quyền đăng Tìm Zalo");
  };

  return (
    <div className="admv3-page">
      <div className="admv3-page-head">
        <div>
          <h2 className="admv3-page-title">Quản lý Tìm Zalo</h2>
          <p className="admv3-page-sub">Ẩn / hiện / xóa bài, khóa quyền đăng theo tài khoản.</p>
        </div>
      </div>

      <div className="admv3-toolbar">
        <div className="admv3-filters">
          {(
            [
              ["all", "Toàn văn bản"],
              ["uid", "UID"],
              ["name", "Tên"],
              ["phone", "SĐT"],
            ] as [SearchMode, string][]
          ).map(([k, lbl]) => (
            <button key={k} className={`admv3-chip ${mode === k ? "is-active" : ""}`} onClick={() => setMode(k)}>{lbl}</button>
          ))}
        </div>
        <div className="admv3-search admv3-search-lg">
          <Search size={14} />
          <input
            placeholder="Tìm kiếm…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
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
                <th>Người đăng</th>
                <th>Nội dung</th>
                <th>Ảnh</th>
                <th>SĐT</th>
                <th>Tạo lúc</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="admv3-td-empty">Đang tải…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={7} className="admv3-td-empty">Không có bài</td></tr>}
              {rows.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="admv3-user-cell">
                      <div className="admv3-user-avatar">
                        {p.profile?.avatar ? <img loading="lazy" decoding="async" src={avatarSrc(p.profile.avatar, 64)} alt="" /> : <span>?</span>}
                      </div>
                      <div>
                        <div className="admv3-user-name-strong">{p.profile?.full_name || "—"}</div>
                        <div className="admv3-user-name-muted admv3-mono">
                          {p.profile?.public_id || p.user_id.slice(0, 8)}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="admv3-td-content">{p.content ?? "—"}</td>
                  <td>{p.image_urls?.length ?? 0}</td>
                  <td>{p.profile?.phone || "—"}</td>
                  <td>{p.created_at ? new Date(p.created_at).toLocaleString("vi-VN") : "—"}</td>
                  <td>
                    {p.is_hidden ? (
                      <span className="admv3-pill admv3-pill-danger">Đã ẩn</span>
                    ) : (
                      <span className="admv3-pill admv3-pill-ok">Hiển thị</span>
                    )}
                  </td>
                  <td>
                    <div className="admv3-row-actions">
                      <button className="admv3-icon-btn" title={p.is_hidden ? "Hiện lại" : "Ẩn"} onClick={() => setHidden(p, !p.is_hidden)}>
                        {p.is_hidden ? <Eye size={14} /> : <EyeOff size={14} />}
                      </button>
                      <button className="admv3-icon-btn" title="Khóa quyền đăng" onClick={() => lockUserZalo(p.user_id)}>
                        <Lock size={14} />
                      </button>
                      <button className="admv3-icon-btn admv3-icon-btn-danger" title="Xóa" onClick={() => remove(p)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
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
