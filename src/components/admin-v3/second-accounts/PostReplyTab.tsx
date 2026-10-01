// Tab "Trả Lời Bài Viết" — hiển thị ngay bài viết mới của USER THẬT → chọn bài
// → chọn clone (Nam/Nữ) → gửi. Dùng lại: bảng posts (chỉ đọc, đúng cột hiện có —
// KHÔNG có video_url), bộ lọc user thật của Thống kê, fetchAdminUserIds,
// encodePostReply + adminSendMessage (cùng hệ thống tin nhắn). Không tạo dữ liệu mới.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Search, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { read3 } from "@/lib/content-db";
import { resolvePostImages } from "@/lib/db-compat";
import { encodePostReply, type PostReplyContext } from "@/lib/post-reply-message";
import { adminSendMessage } from "@/lib/admin/chat-admin-rpc";
import { fetchAdminUserIds } from "@/lib/admin/exclude-admins";
import { realAdminStatsUserFilter } from "@/components/admin-v3/stats/stats-queries";
import { PostReplyReference } from "@/components/candy/post/PostReplyReference";
import type { AccountLite } from "./InternalTools";

const sb = supabase as any;
const PAGE = 60;

type PostRow = {
  id: string; user_id: string; content: string | null; created_at: string | null;
  image_url?: string | null; image_urls?: unknown; likes_count?: number | null;
};
type Author = { id: string; username: string | null; full_name: string | null; avatar: string | null };

function toContext(p: PostRow, u: Author): PostReplyContext {
  return {
    postId: p.id,
    authorId: p.user_id,
    authorName: u.full_name || u.username || "Người dùng",
    preview: (p.content ?? "").replace(/<[^>]*>/g, "").trim().slice(0, 240) || "Bài viết có ảnh",
    post: {
      content: p.content ?? "",
      avatar: u.avatar ?? null,
      createdAt: p.created_at,
      media: resolvePostImages(p as any),
      likes: typeof p.likes_count === "number" ? p.likes_count : null,
    },
  };
}

export function PostReplyTab({ accounts }: { accounts: AccountLite[] }) {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [authors, setAuthors] = useState<Map<string, Author>>(new Map());
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [post, setPost] = useState<PostRow | null>(null);
  const [gender, setGender] = useState<"" | "male" | "female">("");
  const [cloneId, setCloneId] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const cloneOptions = useMemo(
    () => accounts.filter((a) => !gender || a.gender === gender),
    [accounts, gender],
  );
  const clone = useMemo(() => accounts.find((a) => a.id === cloneId) ?? null, [accounts, cloneId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await read3().from("posts")
        .select("id, user_id, content, image_url, image_urls, created_at, likes_count")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(PAGE * 2);
      if (error) throw error;
      const rows = (data ?? []) as PostRow[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
      const map = new Map<string, Author>();
      if (ids.length) {
        const [{ data: prof, error: pe }, adminIds] = await Promise.all([
          realAdminStatsUserFilter(sb.from("profiles").select("id, username, full_name, avatar")).in("id", ids),
          fetchAdminUserIds(),
        ]);
        if (pe) throw pe;
        const cloneIds = new Set(accounts.map((a) => a.id));
        for (const p of (prof ?? []) as Author[]) {
          if (!adminIds.has(p.id) && !cloneIds.has(p.id)) map.set(p.id, p);
        }
      }
      setAuthors(map);
      setPosts(rows.filter((r) => map.has(r.user_id)).slice(0, PAGE));
    } catch (e: any) {
      toast.error(e?.message || "Không tải được bài viết");
    } finally { setLoading(false); }
  }, [accounts]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return posts;
    return posts.filter((p) => {
      const a = authors.get(p.user_id);
      return [a?.full_name, a?.username, p.content].some((v) => (v ?? "").toLowerCase().includes(s));
    });
  }, [posts, authors, q]);

  const author = post ? authors.get(post.user_id) ?? null : null;

  async function send() {
    const body = text.trim();
    if (!post || !author) return toast.error("Chọn bài viết");
    if (!clone) return toast.error("Chọn tài khoản gửi");
    if (!body) return toast.error("Nhập nội dung trả lời");
    setSending(true);
    try {
      await adminSendMessage(clone.id, author.id, encodePostReply(toContext(post, author), body), null);
      toast.success(`Đã gửi trả lời bằng @${clone.username}`);
      setText("");
    } catch (e: any) {
      toast.error(e?.message || "Gửi thất bại");
    } finally { setSending(false); }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-3">
      <div className="admv3-card p-3 flex flex-col gap-2 min-w-0">
        <div className="text-xs text-muted-foreground">1. Bài viết mới của user thật</div>
        <div className="flex gap-1">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 opacity-50" />
            <input className="admv3-input w-full pl-7" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Lọc theo tên / nội dung…" />
          </div>
          <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={load} disabled={loading} aria-label="Tải lại">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        <div className="flex flex-col gap-2 max-h-[640px] overflow-auto">
          {loading && !posts.length && <div className="text-xs text-muted-foreground">Đang tải…</div>}
          {!loading && !shown.length && <div className="text-xs text-muted-foreground">Không có bài viết.</div>}
          {shown.map((p) => {
            const a = authors.get(p.user_id)!;
            return (
              <button key={p.id} type="button" onClick={() => setPost(p)}
                className={`text-left rounded-lg border p-1 ${post?.id === p.id ? "ring-2 ring-primary" : "hover:bg-muted/40"}`}>
                <div className="px-2 pt-1 text-xs text-muted-foreground truncate">@{a.username}</div>
                <PostReplyReference context={toContext(p, a)} />
              </button>
            );
          })}
        </div>
      </div>

      <div className="admv3-card p-3 flex flex-col gap-2 min-w-0 lg:sticky lg:top-3 self-start">
        <div className="text-xs text-muted-foreground">2. Bài viết đã chọn</div>
        {post && author ? (
          <div className="rounded-lg border p-1"><PostReplyReference context={toContext(post, author)} /></div>
        ) : (
          <div className="text-xs text-muted-foreground">Chưa chọn bài viết.</div>
        )}
        <div className="text-xs text-muted-foreground">3. Tài khoản gửi</div>
        <div className="flex gap-1">
          {([["", "Tất cả"], ["male", "Clone Nam"], ["female", "Clone Nữ"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => { setGender(v); setCloneId(""); }}
              className={`admv3-btn ${gender === v ? "" : "admv3-btn-ghost"} flex-1 text-xs`}>{l}</button>
          ))}
        </div>
        <select className="admv3-input w-full" value={cloneId} onChange={(e) => setCloneId(e.target.value)}>
          <option value="">-- Chọn tài khoản ({cloneOptions.length}) --</option>
          {cloneOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.gender === "male" ? "♂ " : a.gender === "female" ? "♀ " : ""}{a.full_name || a.username} (@{a.username})
            </option>
          ))}
        </select>
        <div className="text-xs text-muted-foreground">4. Nội dung trả lời</div>
        <textarea className="admv3-input" rows={4} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Nhập nội dung trả lời…" maxLength={2000} />
        <button className="admv3-btn" onClick={send} disabled={sending || !clone || !post || !text.trim()}>
          <Send size={14} /> {sending ? "Đang gửi…" : clone ? `Gửi bằng @${clone.username}` : "Gửi"}
        </button>
      </div>
    </div>
  );
}
