import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { usePostCard } from "./post-card-context";
import {
  addComment, buildCommentThreads, COMMENT_MAX_LENGTH, fetchProfilesByIds, hideComment,
  listComments, validateComment, type CommentRow,
} from "@/lib/post-comments";
import { resolveUserName } from "@/lib/user-name";
import { formatRelativeTime } from "@/lib/time-format";

const PREVIEW = 3;

/** Khu vực bình luận + trả lời ngay dưới mỗi bài viết. */
export function PostComments() {
  const { post, meId, isLocked, onViewProfile } = usePostCard() as any;
  const disabled = Boolean((post as any).comments_disabled);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<CommentRow | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Chỉ tải khi khu vực bình luận gần màn hình (tiết kiệm băng thông).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const io = new IntersectionObserver((e) => {
      if (e.some((x) => x.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "300px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const loadProfiles = useCallback(async (ids: string[]) => {
    try {
      const m = await fetchProfilesByIds(ids);
      setProfiles((prev) => { const n = new Map(prev); m.forEach((v, k) => n.set(k, v)); return n; });
    } catch { /* tên mặc định */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setLoadError(false);
    try {
      const data = await listComments(post.id);
      setRows(data);
      void loadProfiles([...data.map((r) => r.user_id), meId].filter(Boolean));
    } catch (e) {
      console.error("[comments] load", e); setLoadError(true);
    } finally { setLoading(false); }
  }, [post.id, meId, loadProfiles]);

  useEffect(() => { if (visible && !disabled) void load(); }, [visible, disabled, load]);

  useEffect(() => {
    if (!meId) { setIsAdmin(false); return; }
    void fetchProfilesByIds([meId]).then((m) => {
      const p = m.get(meId);
      setIsAdmin(Boolean(p?.is_admin || p?.role === "admin"));
    }).catch(() => {});
  }, [meId]);

  const threads = useMemo(() => buildCommentThreads(rows), [rows]);
  const shown = expanded ? threads : threads.slice(-PREVIEW);
  const hiddenCount = threads.length - shown.length;

  const nameOf = (uid: string) => resolveUserName(profiles.get(uid) ?? null, "Thành viên");

  const startReply = (c: CommentRow) => {
    if (!meId) { toast.error("Bạn cần đăng nhập để trả lời."); return; }
    setReplyTo(c); setSendError(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const submit = async () => {
    if (sending) return;
    if (!meId) { toast.error("Bạn cần đăng nhập để bình luận."); return; }
    if (isLocked) { toast.error("Bài viết đã bị khóa."); return; }
    const err = validateComment(text);
    if (err) { setSendError(err); return; }
    setSending(true); setSendError(null);
    try {
      const { ensureAllowed } = await import("@/lib/restriction-guard");
      if (!(await ensureAllowed("post"))) return;
      const { guardAction } = await import("@/lib/rate-limit");
      if (!(await guardAction("comment"))) return;
      try {
        const { assertContentAllowed } = await import("@/lib/keyword-filter");
        await assertContentAllowed(text, "post");
      } catch (e: any) { setSendError(e?.message || "Nội dung không phù hợp."); return; }
      const created = await addComment({ postId: post.id, userId: meId, content: text, parentId: replyTo?.id });
      setRows((r) => [...r, created]);
      setText(""); setReplyTo(null); setExpanded(true);
      toast.success(replyTo ? "Đã gửi trả lời" : "Đã gửi bình luận");
    } catch (e: any) {
      console.error("[comments] send", e);
      const { handleRestrictionError } = await import("@/lib/restriction-guard");
      if (await handleRestrictionError(e)) return;
      setSendError("Gửi thất bại. Vui lòng kiểm tra mạng và thử lại.");
      toast.error("Gửi bình luận thất bại");
    } finally { setSending(false); }
  };

  const remove = async (c: CommentRow) => {
    if (!window.confirm("Xóa bình luận này?")) return;
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== c.id && x.parent_id !== c.id));
    try { await hideComment(c.id); } catch { setRows(prev); toast.error("Xóa thất bại, thử lại sau."); }
  };

  const renderItem = (c: CommentRow, isReply: boolean) => {
    const p = profiles.get(c.user_id);
    const canRemove = meId && (meId === c.user_id || isAdmin);
    return (
      <li key={c.id} className={`pcm-item ${isReply ? "pcm-item--reply" : ""}`}>
        <button type="button" className="pcm-avatar" onClick={() => onViewProfile?.(c.user_id)} aria-label={nameOf(c.user_id)}>
          {p?.avatar ? <img src={p.avatar} alt="" loading="lazy" /> : <span>{nameOf(c.user_id).slice(0, 1).toUpperCase()}</span>}
        </button>
        <div className="pcm-main">
          <div className="pcm-bubble">
            <button type="button" className="pcm-name" onClick={() => onViewProfile?.(c.user_id)}>{nameOf(c.user_id)}</button>
            <p className="pcm-text">{c.content}</p>
          </div>
          <div className="pcm-meta">
            <time dateTime={c.created_at}>{formatRelativeTime(c.created_at)}</time>
            {!isLocked ? <button type="button" onClick={() => startReply(c)}>Trả lời</button> : null}
            {canRemove ? (
              <button type="button" className="pcm-del" onClick={() => remove(c)} aria-label="Xóa bình luận"><Trash2 size={13} /></button>
            ) : null}
          </div>
        </div>
      </li>
    );
  };

  if (disabled) return <div className="pcm-root pcm-note">Bình luận đã bị tắt cho bài viết này.</div>;

  return (
    <div ref={rootRef} className="pcm-root" aria-label="Bình luận">
      <div className="pcm-head"><MessageCircle size={15} /> <span>Bình luận{rows.length ? ` (${rows.length})` : ""}</span></div>

      {loading && rows.length === 0 ? <p className="pcm-note"><Loader2 size={14} className="pcm-spin" /> Đang tải bình luận…</p> : null}
      {loadError ? <p className="pcm-note">Không tải được bình luận. <button type="button" className="pcm-link" onClick={load}>Thử lại</button></p> : null}

      {hiddenCount > 0 ? (
        <button type="button" className="pcm-link pcm-more" onClick={() => setExpanded(true)}>Xem thêm {hiddenCount} bình luận</button>
      ) : null}

      {shown.length > 0 ? (
        <ul className="pcm-list">
          {shown.map((t) => (
            <li key={t.id} className="pcm-thread">
              <ul className="pcm-list">{renderItem(t, false)}</ul>
              {t.replies.length > 0 ? <ul className="pcm-list pcm-replies">{t.replies.map((r) => renderItem(r, true))}</ul> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {isLocked ? null : meId ? (
        <form className="pcm-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {replyTo ? (
            <div className="pcm-replying">
              <span>Đang trả lời <b>{nameOf(replyTo.user_id)}</b></span>
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Hủy trả lời"><X size={14} /></button>
            </div>
          ) : null}
          <div className="pcm-input-row">
            <textarea
              ref={inputRef}
              className="pcm-input"
              rows={1}
              value={text}
              maxLength={COMMENT_MAX_LENGTH}
              placeholder={replyTo ? "Viết câu trả lời…" : "Viết bình luận…"}
              onChange={(e) => { setText(e.target.value); if (sendError) setSendError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void submit(); } }}
              disabled={sending}
            />
            <button type="submit" className="pcm-send" disabled={sending || !text.trim()} aria-label="Gửi">
              {sending ? <Loader2 size={18} className="pcm-spin" /> : <Send size={18} />}
            </button>
          </div>
          {sending ? <p className="pcm-status">Đang gửi…</p> : null}
          {sendError ? <p className="pcm-error" role="alert">{sendError}</p> : null}
        </form>
      ) : (
        <p className="pcm-note">Đăng nhập để bình luận.</p>
      )}
    </div>
  );
}
