import { avatarSrc } from "@/lib/image-cdn";
// Popup xem bài viết + bình luận ngay trong Admin (dùng RPC admin_internal_*).
// Clone có thể trả lời trực tiếp bằng text / emoji / GIF mà không cần vào website.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { X, RefreshCw, Send, Sticker, Smile, CornerDownRight, Crown } from "lucide-react";
import { fetchPostCommentsSb3, replyCommentSb3 } from "@/lib/admin/second-account-sb3";
import { useRealtime } from "@/lib/realtime-registry";
import { GifPicker } from "@/components/candy/gif-picker";
import { VipGifPicker } from "@/components/admin-v3/vip/VipGifPicker";
import type { AccountLite } from "./InternalTools";

const GIF_TOKEN_G = /\[\[gif:([^\]\s]+)\]\]/g;
const QUICK_EMOJIS = ["😀", "😂", "😍", "🥰", "🔥", "👏", "❤️", "👍", "😮", "✨"];

type Cmt = {
  id: string; content: string | null; created_at: string | null;
  author_id: string | null; author_username: string | null;
  author_name: string | null; author_avatar: string | null;
  parent_id?: string | null;
};

function RichText({ text }: { text: string | null }) {
  const raw = text || "";
  const gifs = Array.from(raw.matchAll(GIF_TOKEN_G)).map((m) => m[1]);
  const plain = raw.replace(GIF_TOKEN_G, "").trim();
  return (
    <div className="space-y-1">
      {plain && <div className="whitespace-pre-wrap break-words text-sm">{plain}</div>}
      {gifs.map((u) => <img loading="lazy" decoding="async" key={u} src={u} alt="" className="max-h-40 rounded-lg border" />)}
    </div>
  );
}

export function PostViewerModal({
  postId, title, content, focusCommentId, accounts, defaultAccountId, onClose,
}: {
  postId: string;
  title?: string;
  content?: string | null;
  focusCommentId?: string | null;
  /** Danh sách clone có thể dùng để trả lời. Bỏ trống = chỉ xem. */
  accounts?: AccountLite[];
  defaultAccountId?: string | null;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Cmt[]>([]);
  const [loading, setLoading] = useState(false);
  const [asId, setAsId] = useState<string>(defaultAccountId || accounts?.[0]?.id || "");
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(focusCommentId ?? null);
  const [sending, setSending] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [showVipGif, setShowVipGif] = useState(false);
  const vipGifAnchor = useRef<HTMLButtonElement | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const gifAnchor = useRef<HTMLButtonElement | null>(null);

  const canReply = !!(accounts && accounts.length);
  const replyTarget = useMemo(
    () => comments.find((c) => c.id === replyTo) || null,
    [comments, replyTo],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchPostCommentsSb3(postId, 200);
      setComments(rows as unknown as Cmt[]);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được bình luận");
    } finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: bình luận mới trên bài này.
  useRealtime(
    `adm-post-${postId}`,
    useMemo(() => [{ table: "comments" as const, event: "*" as const, filter: `post_id=eq.${postId}` }], [postId]),
    useCallback(() => load(), [load]),
  );

  useEffect(() => {
    if (!focusCommentId || !comments.length) return;
    const el = document.getElementById(`adm-cmt-${focusCommentId}`);
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusCommentId, comments]);

  const sendRaw = useCallback(async (body: string) => {
    if (!canReply) return;
    if (!asId) { toast.error("Chưa chọn tài khoản clone"); return; }
    setSending(true);
    try {
      await replyCommentSb3(postId, asId, body, replyTo);
      setText("");
      await load();
      toast.success("Đã gửi");
    } catch (e: any) {
      toast.error(e?.message || "Gửi thất bại");
    } finally { setSending(false); }
  }, [asId, canReply, load, postId, replyTo]);

  return (
    <div className="fixed inset-0 z-[90] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="text-sm font-semibold truncate">{title || "Bài viết"}</div>
          <div className="flex items-center gap-1">
            <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        <div className="p-4 overflow-auto space-y-4 flex-1">
          {content !== undefined && (
            <div className="border rounded-lg p-3 bg-muted/30"><RichText text={content ?? ""} /></div>
          )}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">{comments.length} bình luận</div>
            {comments.map((c) => (
              <div key={c.id} id={`adm-cmt-${c.id}`}
                className={`flex items-start gap-2 rounded-lg p-2 ${c.parent_id ? "ml-7" : ""} ${
                  focusCommentId === c.id || replyTo === c.id ? "ring-2 ring-primary bg-primary/5" : ""}`}>
                {c.author_avatar
                  ? <img loading="lazy" decoding="async" src={avatarSrc(c.author_avatar, 64)} alt="" className="w-7 h-7 rounded-full object-cover" />
                  : <div className="w-7 h-7 rounded-full bg-muted grid place-items-center text-[10px]">
                      {(c.author_name || c.author_username || "?")[0]?.toUpperCase()}
                    </div>}
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">
                    {c.author_name || c.author_username} •{" "}
                    {c.created_at ? new Date(c.created_at).toLocaleString("vi-VN") : ""}
                  </div>
                  <RichText text={c.content} />
                </div>
                {canReply && (
                  <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Trả lời bình luận này"
                    onClick={() => setReplyTo(c.id)}>
                    <CornerDownRight size={14} />
                  </button>
                )}
              </div>
            ))}
            {!comments.length && !loading && (
              <div className="text-xs text-muted-foreground">Chưa có bình luận.</div>
            )}
          </div>
        </div>

        {canReply && (
          <div className="border-t p-3 space-y-2">
            {replyTarget && (
              <div className="flex items-center gap-2 text-xs bg-muted/50 rounded-lg px-2 py-1">
                <CornerDownRight size={12} />
                <span className="truncate flex-1">
                  Trả lời @{replyTarget.author_username}: {(replyTarget.content || "").slice(0, 60)}
                </span>
                <button onClick={() => setReplyTo(null)}><X size={12} /></button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Gửi với tư cách</span>
              <select className="admv3-input flex-1" value={asId} onChange={(e) => setAsId(e.target.value)}>
                {accounts!.map((a) => (
                  <option key={a.id} value={a.id}>{a.full_name || a.username} (@{a.username})</option>
                ))}
              </select>
            </div>
            {showEmoji && (
              <div className="flex flex-wrap gap-1">
                {QUICK_EMOJIS.map((e) => (
                  <button key={e} className="admv3-btn admv3-btn-ghost" disabled={sending}
                    onClick={() => sendRaw(e)}>{e}</button>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1">
              <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Emoji"
                onClick={() => setShowEmoji((v) => !v)}><Smile size={16} /></button>
              <div className="relative">
                <button ref={gifAnchor} className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="GIF"
                  onClick={() => setShowGif((v) => !v)}><Sticker size={16} /></button>
                <GifPicker open={showGif} onClose={() => setShowGif(false)} anchorRef={gifAnchor}
                  onPick={(u) => { setShowGif(false); sendRaw(`[[gif:${u}]]`); }} />
              </div>
              <div className="relative">
                <button ref={vipGifAnchor} className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="VIP GIF (Quản Lý Icon VIP)"
                  onClick={() => setShowVipGif((v) => !v)}><Crown size={16} /></button>
                <VipGifPicker open={showVipGif} onClose={() => setShowVipGif(false)} anchorRef={vipGifAnchor}
                  onPick={(u) => { setShowVipGif(false); sendRaw(`[[gif:${u}]]`); }} />
              </div>
              <textarea className="admv3-input flex-1" rows={1} value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (text.trim()) sendRaw(text.trim());
                  }
                }}
                placeholder="Nhập trả lời…" />
              <button className="admv3-btn" disabled={sending || !text.trim()}
                onClick={() => sendRaw(text.trim())}>
                <Send size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
