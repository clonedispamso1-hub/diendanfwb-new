/**
 * <PendingPostsManager /> — Admin duyệt bài viết có ảnh của thành viên thường.
 * Bài ở trạng thái `pending` chỉ hiển thị công khai sau khi Admin phê duyệt.
 */
import { useCallback, useEffect, useState } from "react";
import { Check, RefreshCw, Trash2, Clock } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { read3 } from "@/lib/content-db";

type PendingRow = {
  id: string;
  user_id: string;
  content: string | null;
  image_urls: string[] | null;
  image_url: string | null;
  created_at: string;
  profiles?: { username?: string | null; display_name?: string | null; avatar_url?: string | null } | null;
};

function timeAgo(iso: string) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} giờ trước`;
  return `${Math.floor(h / 24)} ngày trước`;
}

export function PendingPostsManager() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<PendingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // ĐỌC bài viết từ Supabase 3. #3 không có bảng `profiles` nên phải
    // lấy thông tin người đăng riêng từ Supabase 1 rồi ghép lại.
    const { data, error } = await (read3().from("posts") as any)
      .select("id,user_id,content,image_urls,image_url,created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    const list: PendingRow[] = ((data as PendingRow[]) || []).filter(Boolean);
    const ids = Array.from(new Set(list.map((p) => p.user_id).filter(Boolean)));
    if (ids.length) {
      const { data: profs } = await (supabase.from("profiles") as any)
        .select("id,username,display_name,avatar_url")
        .in("id", ids);
      const map = new Map<string, any>((profs || []).map((p: any) => [p.id, p]));
      list.forEach((p) => {
        p.profiles = map.get(p.user_id) ?? null;
      });
    }
    setRows(list);
    setLoading(false);
  }, []);


  useEffect(() => {
    void load();
  }, [load]);

  // Bảo mật: duyệt/xoá bài đều qua RPC SECURITY DEFINER, server verify quyền admin.
  const review = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    const { data, error } = await (supabase as any).rpc("admin_review_pending_post", {
      p_post_id: id,
      p_action: action,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    const res = (data || {}) as { ok?: boolean; message?: string; code?: string };
    if (res.ok === false) return toast.error(res.message || res.code || "Không có quyền thực hiện");
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (action === "approve") {
      toast.success("Đã duyệt bài viết");
      void qc.invalidateQueries({ queryKey: ["posts"] });
      void qc.invalidateQueries({ queryKey: ["feed"] });
    } else {
      toast.success("Đã từ chối và xóa bài viết");
    }
  };

  const approve = (id: string) => review(id, "approve");

  const reject = async (id: string) => {
    if (!window.confirm("Xóa bài viết này?")) return;
    await review(id, "reject");
  };


  return (
    <div className="ppm">
      <div className="ppm__head">
        <div className="ppm__title">
          <Clock size={15} /> Bài viết chờ duyệt
          <span className="ppm__count">{rows.length}</span>
        </div>
        <button className="ppm__refresh" onClick={() => void load()}>
          <RefreshCw size={14} /> Tải lại
        </button>
      </div>

      {loading ? (
        <div className="ppm__empty">Đang tải…</div>
      ) : rows.length === 0 ? (
        <div className="ppm__empty">Không có bài viết nào đang chờ duyệt.</div>
      ) : (
        <div className="ppm__list">
          {rows.map((r) => {
            const imgs = (r.image_urls && r.image_urls.length ? r.image_urls : r.image_url ? [r.image_url] : []).slice(0, 4);
            const name = r.profiles?.display_name || r.profiles?.username || "Thành viên";
            return (
              <div className="ppm__item" key={r.id}>
                <div className="ppm__meta">
                  <b>{name}</b>
                  <span>· {timeAgo(r.created_at)}</span>
                </div>
                {r.content && <div className="ppm__text">{r.content}</div>}
                {imgs.length > 0 && (
                  <div className="ppm__imgs">
                    {imgs.map((u) => (
                      <img decoding="async" key={u} src={u} alt="Ảnh bài viết chờ duyệt" loading="lazy" />
                    ))}
                  </div>
                )}
                <div className="ppm__actions">
                  <button
                    className="ppm__btn is-ok"
                    disabled={busy === r.id}
                    onClick={() => void approve(r.id)}
                  >
                    <Check size={14} /> Duyệt
                  </button>
                  <button
                    className="ppm__btn is-no"
                    disabled={busy === r.id}
                    onClick={() => void reject(r.id)}
                  >
                    <Trash2 size={14} /> Từ chối
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.ppm{display:flex;flex-direction:column;gap:12px;}
.ppm__head{display:flex;align-items:center;justify-content:space-between;gap:10px;}
.ppm__title{display:inline-flex;align-items:center;gap:7px;font-weight:800;font-size:14px;}
.ppm__count{background:rgba(244,114,182,.18);color:#f472b6;border-radius:999px;
  padding:1px 8px;font-size:12px;font-weight:800;}
.ppm__refresh{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(255,255,255,.14);
  background:transparent;color:inherit;border-radius:10px;padding:6px 10px;font-size:12px;
  font-weight:700;cursor:pointer;}
.ppm__empty{padding:26px 0;text-align:center;font-size:13px;opacity:.6;}
.ppm__list{display:flex;flex-direction:column;gap:10px;}
.ppm__item{border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:12px;
  background:rgba(255,255,255,.03);}
.ppm__meta{font-size:12.5px;opacity:.85;display:flex;gap:6px;}
.ppm__text{margin-top:6px;font-size:13.5px;line-height:1.5;white-space:pre-wrap;word-break:break-word;}
.ppm__imgs{margin-top:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;}
.ppm__imgs img{width:100%;height:120px;object-fit:cover;border-radius:10px;}
.ppm__actions{margin-top:10px;display:flex;gap:8px;}
.ppm__btn{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:10px;
  padding:7px 14px;font-size:12.5px;font-weight:800;cursor:pointer;}
.ppm__btn:disabled{opacity:.5;cursor:not-allowed;}
.ppm__btn.is-ok{background:rgba(34,197,94,.18);color:#22c55e;}
.ppm__btn.is-no{background:rgba(239,68,68,.16);color:#ef4444;}
`;

export default PendingPostsManager;
