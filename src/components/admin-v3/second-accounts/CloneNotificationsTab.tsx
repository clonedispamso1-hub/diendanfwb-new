import { avatarSrc } from "@/lib/image-cdn";
// Thông báo riêng cho từng clone: badge đỏ, danh sách thông báo, mở đúng bình luận.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, RefreshCw, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRealtime } from "@/lib/realtime-registry";
import type { AccountLite } from "./InternalTools";
import { PostViewerModal } from "./PostViewerModal";
import { ChatReplyModal } from "./ChatReplyModal";
import {
  clearInternalNotifications,
  getNotifClearedAt,
  setNotifClearedAt,
  isNotifVisible,
} from "@/lib/admin/internal-cleanup";

const sb = supabase as any;

// 2026-08: clone nhận TOÀN BỘ thông báo (follow, tim, bình luận, tin nhắn,
// lời mời, hệ thống…) — không lọc theo type nữa.

type Notif = {
  id: string; type: string | null; title: string | null; message: string | null;
  data: any; is_read: boolean; created_at: string | null;
};

export function CloneNotificationsTab({ accounts }: { accounts: AccountLite[] }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<AccountLite | null>(null);
  const [loading, setLoading] = useState(false);

  const loadCounts = useCallback(async () => {
    setLoading(true);
    try {
      const ids = accounts.map((a) => a.id);
      const map: Record<string, number> = {};
      const clearedAt = getNotifClearedAt(null);

      if (clearedAt) {
        // Đã "xoá tất cả": chỉ đếm thông báo MỚI hơn mốc xoá.
        if (ids.length) {
          const { data } = await sb
            .from("notifications")
            .select("user_id, created_at")
            .in("user_id", ids)
            .eq("is_read", false)
            .gt("created_at", new Date(clearedAt).toISOString())
            .limit(5000);
          (data ?? []).forEach((r: any) => {
            map[r.user_id] = (map[r.user_id] ?? 0) + 1;
          });
        }
        setCounts(map);
        return;
      }

      // Ưu tiên RPC SECURITY DEFINER (RLS chặn admin đọc trực tiếp bảng notifications).
      const rpc = await sb.rpc("admin_internal_notif_counts");
      if (!rpc.error) {
        (rpc.data ?? []).forEach((r: any) => {
          map[r.account_id] = Number(r.unread ?? 0);
        });
      } else if (ids.length) {
        const { data, error } = await sb
          .from("notifications")
          .select("user_id, is_read")
          .in("user_id", ids)
          .eq("is_read", false)
          .limit(5000);
        if (error) throw error;
        (data ?? []).forEach((r: any) => {
          map[r.user_id] = (map[r.user_id] ?? 0) + 1;
        });
      }
      setCounts(map);
    } catch (e: any) {
      // RLS có thể chặn đọc trực tiếp → không làm ồn UI, chỉ log.
      console.warn("[clone-notifs] count failed:", e?.message || e);
      setCounts({});
    } finally { setLoading(false); }
  }, [accounts]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const clearAll = useCallback(async () => {
    try {
      // Ghi mốc xoá TRƯỚC (UI cập nhật ngay, không cần F5),
      // sau đó cố gắng xoá dưới DB. Không đụng tin nhắn/lịch sử chat.
      setNotifClearedAt(null);
      setCounts({});
      try {
        await clearInternalNotifications(null);
      } catch {
        /* RLS có thể chặn — watermark vẫn đảm bảo Admin Panel trống. */
      }
      toast.success("Đã xoá tất cả thông báo");
      loadCounts();
    } catch (e: any) {
      toast.error(e?.message || "Không xoá được thông báo, vui lòng thử lại.");
    }
  }, [loadCounts]);

  useRealtime(
    "admin-clone-notifs",
    [{ table: "notifications", event: "*" }],
    useCallback(() => loadCounts(), [loadCounts]),
  );

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const arr = accounts.map((a) => ({ ...a, unread: counts[a.id] ?? 0 }));
    const f = term
      ? arr.filter((a) => a.username.toLowerCase().includes(term) || (a.full_name || "").toLowerCase().includes(term))
      : arr;
    return f.sort((a, b) => (b.unread ?? 0) - (a.unread ?? 0));
  }, [accounts, counts, q]);

  return (
    <div className="admv3-card p-3">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input className="admv3-input w-64" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Lọc tài khoản…" />
        <button className="admv3-btn admv3-btn-ghost" onClick={loadCounts} disabled={loading}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Tải lại
        </button>
        <button className="admv3-btn admv3-btn-ghost" onClick={clearAll} title="Xoá toàn bộ thông báo của clone">
          <X size={14} /> Xóa tất cả thông báo
        </button>
        <span className="text-xs text-muted-foreground ml-auto">
          {list.reduce((s, a) => s + (a.unread ?? 0), 0)} thông báo chưa đọc
        </span>
      </div>

      <div className="border rounded-lg divide-y max-h-[560px] overflow-auto">
        {list.map((a) => (
          <button key={a.id} onClick={() => setOpen(a)}
            className="w-full text-left px-3 py-2 hover:bg-muted/40 flex items-center gap-2">
            {a.avatar
              ? <img loading="lazy" decoding="async" src={avatarSrc(a.avatar, 64)} alt="" className="w-9 h-9 rounded-full object-cover" />
              : <div className="w-9 h-9 rounded-full bg-muted grid place-items-center text-xs">
                  {a.username?.[0]?.toUpperCase()}
                </div>}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{a.full_name || a.username}</div>
              <div className="text-xs text-muted-foreground truncate">@{a.username} <span className="text-emerald-500">• 🟢 Online</span></div>
            </div>
            {!!a.unread && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white">{a.unread}</span>
            )}
            <Bell size={14} className="opacity-50" />
          </button>
        ))}
        {!list.length && <div className="p-4 text-xs text-muted-foreground">Chưa có tài khoản.</div>}
      </div>

      {open && (
        <NotifPopup account={open} onClose={() => { setOpen(null); loadCounts(); }} />
      )}
    </div>
  );
}

function NotifPopup({ account, onClose }: { account: AccountLite; onClose: () => void }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(false);
  const [post, setPost] = useState<{ id: string; commentId?: string | null } | null>(null);
  const [chat, setChat] = useState<{ peerId: string; peerName?: string | null } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await sb.rpc("admin_internal_notifications", {
        p_account: account.id, p_limit: 150,
      });
      if (error) throw error;
      const rows = ((data ?? []) as Notif[]).filter((n) => isNotifVisible(n.created_at, account.id));
      setItems(rows);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được thông báo");
    } finally { setLoading(false); }
  }, [account.id]);

  useEffect(() => { load(); }, [load]);

  useRealtime(
    `admin-clone-notif-${account.id}`,
    useMemo(() => [{ table: "notifications" as const, event: "*" as const, filter: `user_id=eq.${account.id}` }], [account.id]),
    useCallback(() => load(), [load]),
  );

  async function markRead(id: string | null) {
    try {
      const { error } = await sb.rpc("admin_internal_notif_mark_read", {
        p_account: account.id, p_id: id,
      });
      if (error) throw error;
      load();
    } catch (e: any) { toast.error(e?.message || "Không đánh dấu được"); }
  }

  function openItem(n: Notif) {
    if (!n.is_read) markRead(n.id);
    const d = n.data || {};
    const type = String(n.type || "");
    const pid = d.post_id || d.postId || (type.startsWith("comment") ? d.entity_id : null);
    const actor = d.actor_id || d.sender_id || d.from_user_id || d.actorId;

    if (type.includes("message") || type.includes("chat")) {
      if (actor) { setChat({ peerId: String(actor), peerName: d.actor_name || d.actor_username || null }); return; }
    }
    if (pid) {
      setPost({
        id: String(pid),
        commentId: d.comment_id || d.parent_comment_id ? String(d.comment_id || d.parent_comment_id) : null,
      });
      return;
    }
    if (actor) setChat({ peerId: String(actor), peerName: d.actor_name || d.actor_username || null });
  }


  return (
    <div className="fixed inset-0 z-[85] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="text-sm font-semibold truncate">Thông báo của @{account.username}</div>
          <div className="flex items-center gap-1">
            <button className="admv3-btn admv3-btn-ghost" onClick={() => markRead(null)} title="Đọc tất cả">
              <Check size={14} />
            </button>
            <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={onClose}><X size={16} /></button>
          </div>
        </div>
        <div className="overflow-auto divide-y">
          {items.map((n) => (
            <button key={n.id} onClick={() => openItem(n)}
              className={`w-full text-left px-3 py-2 hover:bg-muted/40 ${n.is_read ? "" : "bg-primary/5"}`}>
              <div className="flex items-center gap-2">
                {!n.is_read && <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{n.title || n.type || "Thông báo"}</div>
                  <div className="text-xs text-muted-foreground line-clamp-2">{n.message}</div>
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {n.created_at ? new Date(n.created_at).toLocaleString("vi-VN") : ""}
                </span>
              </div>
            </button>
          ))}
          {!items.length && !loading && (
            <div className="p-4 text-xs text-muted-foreground">Chưa có thông báo.</div>
          )}
        </div>
      </div>

      {post && (
        <PostViewerModal
          postId={post.id}
          focusCommentId={post.commentId}
          accounts={[account]}
          defaultAccountId={account.id}
          onClose={() => setPost(null)}
        />
      )}

      {chat && (
        <ChatReplyModal
          account={account}
          peerId={chat.peerId}
          peerName={chat.peerName}
          onClose={() => setChat(null)}
        />
      )}

    </div>
  );
}
