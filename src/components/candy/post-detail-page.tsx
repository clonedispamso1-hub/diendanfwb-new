import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Heart,
  MessageCircle,
  Reply,
  Send,
  Smile,
  AtSign,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  X as XIcon,
  Mic,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useRealtime } from "@/lib/realtime-registry";
import { useAuth } from "@/components/candy/auth-provider";
import UniversalBadge from "@/components/candy/universal-badge";
import { GenderIcon } from "@/components/candy/gender-icon";
import { IdentityBadges } from "@/components/candy/identity-badges";
import { PostCard } from "@/components/candy/post-card";
import { getValidAvatarUrl } from "@/lib/avatar-utils";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { formatRelativeTime } from "@/lib/time-format";
import { formatCount } from "@/lib/format";
import { toUserMessage } from "@/lib/user-error";
import { toast } from "sonner";
import { guardAction } from "@/lib/rate-limit";
import { RichText, gifToken } from "@/lib/rich-content";
import { VoiceRecorder } from "@/components/candy/voice-recorder";
import { ZaloVipLockModal } from "@/components/candy/zalo-vip-lock-modal";
import { canSendVoice, uploadVoiceBlob, voiceToken, voiceVipLockMessage } from "@/lib/voice-chat";
import { GifPicker } from "@/components/candy/gif-picker";


import { read3 } from "@/lib/content-db";
import {
  fetchProfileById,
  fetchProfilesByIds,
  PROFILE_COMMENT_COLS,
  PROFILE_POST_COLS,
} from "@/lib/profile-cache";
import { syncToS3, syncRecentCommentsForPost } from "@/lib/content-sync";
import { resolveUserName, isLockedAccount } from "@/lib/user-name";
/* =========================================================================
 * Premium Post Detail Page
 * - Dedicated full screen (replaces the legacy popup comment modal)
 * - Threaded comments with "View more replies" collapsing
 * - Author detection + premium "Tác giả" badge (hides VIP)
 * - Modern composer with @mention autocomplete + inline emoji picker
 * - All-frontend logic; reuses existing tables (posts, comments, comment_likes)
 * ========================================================================= */

const QUICK_EMOJIS = ["😀", "😂", "❤️", "😍", "😢", "👍", "🔥", "🎉", "😘", "🥰", "😎", "🙏"];

const POST_COLUMNS =
  "id, user_id, content, image_url, likes_count, comments_count, created_at, image_urls, visibility, status, has_images, virtual_view_base, category, display_view_offset, is_anonymous, bot_likes, is_edited, post_code, pin_until, is_locked, comments_disabled, priority_new, bumped_at, is_pinned, is_hidden, priority_level, pinned_until, locked_at, locked_reason, priority_until, is_featured, featured_until, coin_pool_total, coin_pool_remaining, max_claimers, claimed_count, coin_per_person, reward_enabled, reward_mode, views_count, is_deleted, is_admin_post, admin_priority, is_popup, relationship_type, facebook_url, zalo_url, gif_url, pinned_at, deleted_at, deleted_by, delete_reason";
const COMMENT_COLUMNS = "id, post_id, user_id, parent_id, content, created_at";

type CommentRow = {
  id: string;
  post_id: string;
  user_id: string;
  parent_id: string | null;
  content: string;
  created_at: string;
  profiles?: {
    id: string;
    full_name?: string | null;
    username?: string | null;
    avatar?: string | null;
    vip_level?: number | null;
    title_gif_url?: string | null;
    is_admin?: boolean | null;
    role?: string | null;
    gender?: string | null;
  } | null;
  like_count?: number;
};

type ProfileLite = {
  id: string;
  full_name?: string | null;
  username?: string | null;
  avatar?: string | null;
  vip_level?: number | null;
  title_gif_url?: string | null;
  is_admin?: boolean | null;
  role?: string | null;
  gender?: string | null;
};

/* ------------------------------ Author Badge ------------------------------ */
const AuthorBadge = memo(function AuthorBadge() {
  return (
    <span
      className="pd-author-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 9px",
        borderRadius: 999,
        fontSize: "0.68rem",
        fontWeight: 800,
        letterSpacing: "0.02em",
        color: "#fff",
        background: "linear-gradient(135deg,#f43f5e,#ec4899 55%,#a855f7)",
        boxShadow: "0 4px 10px -2px rgba(236,72,153,.5)",
        textTransform: "uppercase",
      }}
    >
      ★ Tác giả
    </span>
  );
});

/* ----------------------------- Comment Like Btn --------------------------- */
const CommentLikeButton = memo(function CommentLikeButton({
  liked,
  count,
  onToggle,
}: {
  liked: boolean;
  count: number;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="pd-like-btn"
      aria-label="Thích bình luận"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        background: "transparent",
        border: 0,
        cursor: "pointer",
        padding: 4,
        color: liked ? "#ef4444" : "hsl(var(--muted-foreground))",
        transition: "transform .15s ease",
      }}
    >
      <Heart size={20} fill={liked ? "currentColor" : "none"} strokeWidth={2} />
      <span style={{ fontSize: "0.7rem", fontWeight: 600 }}>{count > 0 ? formatCount(count) : ""}</span>
    </button>
  );
});

/* ------------------------------ Single Comment ---------------------------- */
const CommentItem = memo(function CommentItem({
  c,
  isAuthor,
  liked,
  likeCount,
  onLike,
  onReply,
  onViewProfile,
  isReply = false,
  meId,
  onEdit,
  onDelete,
}: {
  c: CommentRow;
  isAuthor: boolean;
  liked: boolean;
  likeCount: number;
  onLike: () => void;
  onReply: () => void;
  onViewProfile: () => void;
  isReply?: boolean;
  meId?: string;
  onEdit?: (id: string, newText: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
}) {
  const name = resolveUserName(c.profiles as any, "Người dùng");
  // Anti Clone: bình luận CŨ vẫn giữ nguyên, nhưng tác giả bị khóa thì hiển thị
  // "Tài khoản bị khóa" và KHÔNG mở được hồ sơ.
  const authorLocked = isLockedAccount(c.profiles as any);
  const openAuthor = authorLocked ? undefined : onViewProfile;
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.content);
  const isOwner = !!meId && meId === c.user_id;
  // GIF-only? presence of gif token AND no other text
  const stripped = c.content.replace(/\[\[gif:[^\]\s]+\]\]/g, "").trim();
  const isGifOnly = /\[\[gif:[^\]\s]+\]\]/.test(c.content) && stripped.length === 0;

  const content = useMemo(
    () => <RichText text={c.content} renderText={(chunk) => renderMentions(chunk)} gifContext="comment" />,
    [c.content],
  );

  return (
    <div
      id={`comment-${c.id}`}
      className="pd-comment"
      data-reply={isReply ? "1" : "0"}
      style={{
        display: "flex",
        gap: 10,
        padding: isReply ? "8px 0 8px 44px" : "10px 0",
        alignItems: "flex-start",
      }}
    >
      <button
        onClick={openAuthor}
        disabled={authorLocked}
        style={{ border: 0, padding: 0, background: "transparent", cursor: authorLocked ? "default" : "pointer", flexShrink: 0 }}
        aria-label={authorLocked ? name : `Xem hồ sơ ${name}`}
      >
        <AvatarGlow
          avatar={c.profiles?.avatar ?? null}
          userId={c.user_id}
          size={isReply ? 36 : 45}
          alt={name}
        />
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <button
                onClick={openAuthor}
                disabled={authorLocked}
                style={{
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  cursor: authorLocked ? "default" : "pointer",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  color: "hsl(var(--foreground))",
                  lineHeight: 1.25,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 0,
                }}
              >
                {name}
                {/* HỆ THỐNG 2: Media VIP dán ngay sát tên, không cách khoảng. */}
                
              </button>

              <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 0 }}>
                <GenderIcon gender={c.profiles?.gender} />
              </span>
              <IdentityBadges profile={c.profiles as any} size={14} gap={3} />
              {isAuthor ? <AuthorBadge /> : null}
            </div>

            {editing ? (
              <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: 12,
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--background))",
                    color: "hsl(var(--foreground))",
                    fontSize: "0.9rem",
                  }}
                />
                <button
                  onClick={async () => {
                    const t = draft.trim();
                    if (!t) return;
                    await onEdit?.(c.id, t);
                    setEditing(false);
                  }}
                  style={{ border: 0, background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))", padding: "6px 12px", borderRadius: 12, fontSize: "0.8rem", fontWeight: 700, cursor: "pointer" }}
                >
                  Lưu
                </button>
                <button
                  onClick={() => { setEditing(false); setDraft(c.content); }}
                  aria-label="Huỷ"
                  style={{ border: 0, background: "transparent", padding: 4, cursor: "pointer", color: "hsl(var(--muted-foreground))" }}
                >
                  <XIcon size={16} />
                </button>
              </div>
            ) : (
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "0.92rem",
                  lineHeight: 1.55,
                  color: "hsl(var(--foreground))",
                  wordBreak: "break-word",
                  whiteSpace: "pre-wrap",
                }}
              >
                {content}
              </p>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginTop: 6,
                fontSize: "0.72rem",
                color: "hsl(var(--muted-foreground))",
              }}
            >
              <span>{formatRelativeTime(c.created_at)}</span>
              <button
                onClick={onReply}
                style={{
                  border: 0,
                  background: "transparent",
                  padding: 0,
                  cursor: "pointer",
                  color: "hsl(var(--muted-foreground))",
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Reply size={12} /> Trả lời
              </button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <CommentLikeButton liked={liked} count={likeCount} onToggle={onLike} />
            {isOwner ? (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Tuỳ chọn bình luận"
                  style={{ border: 0, background: "transparent", padding: 4, cursor: "pointer", color: "hsl(var(--muted-foreground))", display: "inline-flex" }}
                >
                  <MoreHorizontal size={16} />
                </button>
                {menuOpen ? (
                  <>
                    <div
                      onClick={() => setMenuOpen(false)}
                      style={{ position: "fixed", inset: 0, zIndex: 40 }}
                    />
                    <div
                      role="menu"
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "100%",
                        marginTop: 4,
                        background: "hsl(var(--popover))",
                        color: "hsl(var(--popover-foreground))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 12,
                        boxShadow: "0 6px 24px -8px rgba(0,0,0,.3)",
                        minWidth: 140,
                        zIndex: 41,
                        overflow: "hidden",
                      }}
                    >
                      {!isGifOnly ? (
                        <button
                          role="menuitem"
                          onClick={() => { setMenuOpen(false); setEditing(true); }}
                          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: 0, background: "transparent", cursor: "pointer", fontSize: "0.85rem" }}
                        >
                          <Pencil size={14} /> Chỉnh sửa
                        </button>
                      ) : null}
                      <button
                        role="menuitem"
                        onClick={async () => { setMenuOpen(false); await onDelete?.(c.id); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 12px", border: 0, background: "transparent", cursor: "pointer", fontSize: "0.85rem", color: "hsl(var(--destructive))" }}
                      >
                        <Trash2 size={14} /> Xoá
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});

/* ------------------------- Mentions / Emoji helpers ----------------------- */
function renderMentions(text: string) {
  // Split text by @mentions and wrap them
  const parts = text.split(/(@[\w._\u00C0-\u1EF9]+)/g);
  return parts.map((p, i) =>
    p.startsWith("@") ? (
      <span
        key={i}
        style={{
          color: "hsl(var(--primary))",
          fontWeight: 600,
        }}
      >
        {p}
      </span>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

/* -------------------------------- Composer -------------------------------- */
function CommentComposer({
  meId,
  replyTo,
  onCancelReply,
  onSend,
  disabled,
}: {
  meId?: string;
  replyTo: { id: string; name: string } | null;
  onCancelReply: () => void;
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [voiceLocked, setVoiceLocked] = useState(false);
  const { me: voiceMe } = useAuth();
  const gifBtnRef = useRef<HTMLButtonElement>(null);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<ProfileLite[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo && inputRef.current) {
      inputRef.current.focus();
      const prefix = `@${replyTo.name.split(" ").join("_")} `;
      setText((cur) => (cur.startsWith("@") ? cur : prefix + cur));
    }
  }, [replyTo]);

  // Listen for external "focus composer" requests (from PostCard's comment
  // button when rendered inside PostDetailPage).
  useEffect(() => {
    const onFocus = () => {
      const el = inputRef.current;
      if (!el) return;
      try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch { /* noop */ }
      window.setTimeout(() => el.focus(), 120);
    };
    window.addEventListener("pd-focus-composer", onFocus as EventListener);
    return () => window.removeEventListener("pd-focus-composer", onFocus as EventListener);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [text]);

  // Detect @mention typing
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? text.length;
    const upto = text.slice(0, pos);
    const m = upto.match(/@([\w._\u00C0-\u1EF9]{1,30})$/);
    setMentionQuery(m ? m[1] : null);
  }, [text]);

  // Query profiles for mentions
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionResults([]);
      return;
    }
    let cancelled = false;
    const q = mentionQuery.trim();
    const run = async () => {
      const query = supabase
        .from("profiles")
        .select("id, full_name, username, avatar, vip_level")
        .limit(6);
      const res = q
        ? await query.or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
        : await query.order("full_name", { ascending: true });
      if (cancelled) return;
      setMentionResults((res.data as ProfileLite[]) || []);
    };
    const t = setTimeout(() => void run(), 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mentionQuery]);

  const insertMention = (p: ProfileLite) => {
    const el = inputRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? text.length;
    const upto = text.slice(0, pos);
    const after = text.slice(pos);
    const handle = (p.username || resolveUserName(p as any, "user")).replace(/\s+/g, "_");
    const replaced = upto.replace(/@([\w._\u00C0-\u1EF9]{0,30})$/, `@${handle} `);
    const next = replaced + after;
    setText(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      const caret = replaced.length;
      el.setSelectionRange(caret, caret);
    });
  };

  const insertEmoji = (emo: string) => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? text.length;
    const next = text.slice(0, pos) + emo + text.slice(pos);
    setText(next);
    setShowEmoji(false);
    requestAnimationFrame(() => {
      el?.focus();
      const caret = pos + emo.length;
      el?.setSelectionRange(caret, caret);
    });
  };

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await onSend(t);
      setText("");
      setShowEmoji(false);
    } finally {
      setBusy(false);
    }
  };

  // Comments: a GIF/sticker sends immediately, no caption required.
  /** Gửi voice comment — VIP chỉ kiểm tra khi bấm Gửi. */
  const sendVoice = async (blob: Blob, duration: number) => {
    if (!voiceMe || busy) return;
    if (!canSendVoice(voiceMe)) {
      setRecording(false);
      setVoiceLocked(true);
      return;
    }
    setVoiceUploading(true);
    try {
      const path = await uploadVoiceBlob(voiceMe.id, blob);
      const token = voiceToken(path, duration);
      await onSend(text.trim() ? `${text.trim()} ${token}` : token);
      setText("");
      setRecording(false);
    } catch (e: any) {
      toast.error(toUserMessage(e));
    } finally {
      setVoiceUploading(false);
    }
  };

  const sendGif = async (url: string) => {
    if (busy) return;
    setShowGif(false);
    setBusy(true);
    try {
      const payload = text.trim() ? `${text.trim()} ${gifToken(url)}` : gifToken(url);
      await onSend(payload);
      setText("");
    } finally {
      setBusy(false);
    }
  };


  if (disabled) {
    return (
      <div
        style={{
          padding: "14px 16px",
          textAlign: "center",
          color: "hsl(var(--muted-foreground))",
          fontSize: "0.85rem",
          borderTop: "1px solid hsl(var(--border))",
          background: "hsl(var(--card))",
        }}
      >
        Bài viết này đã khóa bình luận.
      </div>
    );
  }

  if (!meId) {
    return (
      <div
        style={{
          padding: "14px 16px",
          textAlign: "center",
          color: "hsl(var(--muted-foreground))",
          fontSize: "0.85rem",
          borderTop: "1px solid hsl(var(--border))",
          background: "hsl(var(--card))",
        }}
      >
        Vui lòng đăng nhập để bình luận.
      </div>
    );
  }

  return (
    <div
      className="pd-composer"
      style={{
        position: "sticky",
        bottom: 0,
        left: 0,
        right: 0,
        background: "hsl(var(--card))",
        borderTop: "1px solid hsl(var(--border))",
        padding: "10px 12px max(10px, env(safe-area-inset-bottom))",
        zIndex: 5,
      }}
    >
      {replyTo ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 10px",
            marginBottom: 6,
            background: "hsl(var(--muted))",
            borderRadius: 8,
            fontSize: "0.78rem",
            color: "hsl(var(--muted-foreground))",
          }}
        >
          <span>
            Đang trả lời <strong>{replyTo.name}</strong>
          </span>
          <button
            onClick={onCancelReply}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: 0,
              cursor: "pointer",
              color: "hsl(var(--muted-foreground))",
            }}
          >
            ✕
          </button>
        </div>
      ) : null}

      {/* Mention autocomplete */}
      {mentionQuery !== null && mentionResults.length > 0 ? (
        <div
          style={{
            position: "absolute",
            bottom: "100%",
            left: 12,
            right: 12,
            marginBottom: 6,
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 12,
            boxShadow: "0 10px 30px -10px rgba(0,0,0,.35)",
            overflow: "hidden",
            zIndex: 10,
            maxHeight: 240,
            overflowY: "auto",
          }}
        >
          {mentionResults.map((p) => (
            <button
              key={p.id}
              onClick={() => insertMention(p)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                padding: "8px 12px",
                border: 0,
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <AvatarGlow
                avatar={p.avatar ?? null}
                userId={p.id}
                size={28}
                alt={resolveUserName(p as any, "")}
              />
              <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "hsl(var(--foreground))" }}>
                  {p.full_name}
                </span>
                {null}

              </div>
            </button>
          ))}
        </div>
      ) : null}

      {/* Emoji quick picker */}
      {showEmoji ? (
        <div
          style={{
            display: "flex",
            gap: 6,
            padding: "8px 4px",
            overflowX: "auto",
            marginBottom: 6,
          }}
        >
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => insertEmoji(e)}
              style={{
                fontSize: 22,
                border: 0,
                background: "transparent",
                cursor: "pointer",
                padding: 4,
                lineHeight: 1,
              }}
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}

      <GifPicker open={showGif} onClose={() => setShowGif(false)} onPick={(u) => void sendGif(u)} anchorRef={gifBtnRef} />

      {recording ? (
        <div style={{ marginBottom: 8 }}>
          <VoiceRecorder
            compact
            sending={voiceUploading}
            onCancel={() => setRecording(false)}
            onSend={(blob, duration) => void sendVoice(blob, duration)}
          />
        </div>
      ) : null}

      <ZaloVipLockModal
        open={voiceLocked}
        title="Bình luận thoại dành cho thành viên VIP"
        message={voiceVipLockMessage(voiceMe)}
        onClose={() => setVoiceLocked(false)}
      />

      <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={() => setRecording((r) => !r)}
          aria-label="Bình luận thoại"
          title="Bình luận thoại"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            border: 0,
            background: recording ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted))",
            color: recording ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Mic size={20} />
        </button>
        <button
          ref={gifBtnRef}
          type="button"
          className={`gif-trigger${showGif ? " is-active" : ""}`}
          onClick={() => setShowGif((s) => !s)}
          aria-label="GIF"
        >
          GIF
        </button>

        <button
          type="button"
          onClick={() => setShowEmoji((s) => !s)}
          aria-label="Emoji"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            border: 0,
            background: showEmoji ? "hsl(var(--primary) / 0.15)" : "hsl(var(--muted))",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            color: showEmoji ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
            flexShrink: 0,
          }}
        >
          <Smile size={20} />
        </button>
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={replyTo ? `Trả lời ${replyTo.name}...` : "Viết bình luận... (gõ @ để nhắc ai đó)"}
          rows={1}
          style={{
            flex: 1,
            resize: "none",
            background: "hsl(var(--muted))",
            border: "1px solid transparent",
            borderRadius: 20,
            padding: "10px 14px",
            fontSize: "0.92rem",
            lineHeight: 1.4,
            color: "hsl(var(--foreground))",
            outline: "none",
            maxHeight: 140,
            fontFamily: "inherit",
          }}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !text.trim()}
          aria-label="Gửi"
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: 0,
            cursor: busy || !text.trim() ? "not-allowed" : "pointer",
            background: text.trim()
              ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.75))"
              : "hsl(var(--muted))",
            color: text.trim() ? "white" : "hsl(var(--muted-foreground))",
            display: "grid",
            placeItems: "center",
            transition: "all .15s ease",
            flexShrink: 0,
          }}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------- Reply Thread ------------------------------- */
const REPLY_INITIAL_VISIBLE = 1;
const ReplyThread = memo(function ReplyThread({
  parent,
  replies,
  postOwnerId,
  meId,
  commentLikes,
  likeCounts,
  onLike,
  onReply,
  onViewProfile,
  onEdit,
  onDelete,
}: {
  parent: CommentRow;
  replies: CommentRow[];
  postOwnerId: string;
  meId?: string;
  commentLikes: Record<string, boolean>;
  likeCounts: Record<string, number>;
  onLike: (id: string) => void;
  onReply: (c: CommentRow) => void;
  onViewProfile: (id: string) => void;
  onEdit?: (id: string, text: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (replies.length === 0) return null;
  const visible = expanded ? replies : replies.slice(0, REPLY_INITIAL_VISIBLE);
  const hidden = replies.length - visible.length;

  return (
    <div>
      {visible.map((r) => (
        <CommentItem
          key={r.id}
          c={r}
          isReply
          isAuthor={r.user_id === postOwnerId}
          liked={!!commentLikes[r.id]}
          likeCount={likeCounts[r.id] || 0}
          onLike={() => onLike(r.id)}
          onReply={() =>
            onReply({ ...r, id: parent.id /* keep parent thread */ } as CommentRow)
          }
          onViewProfile={() => onViewProfile(r.user_id)}
          meId={meId}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
      {replies.length > REPLY_INITIAL_VISIBLE ? (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginLeft: 44,
            marginTop: 2,
            marginBottom: 8,
            background: "transparent",
            border: 0,
            cursor: "pointer",
            color: "hsl(var(--primary))",
            fontSize: "0.8rem",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 0",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 24,
              height: 1,
              background: "hsl(var(--border))",
            }}
          />
          {expanded
            ? "Ẩn bớt phản hồi"
            : `Xem thêm ${hidden} phản hồi`}
        </button>
      ) : null}
    </div>
  );
});

/* ============================ Main Detail Page =========================== */
export function PostDetailPage({
  postId,
  onViewProfile,
  embedded = false,
}: {
  postId: string;
  onViewProfile?: (id: string) => void;
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const handleBack = useCallback(() => {
    // Nếu route trước nằm trong app (react-router có "key" khác "default"), quay lại.
    if (location.key && location.key !== "default") {
      navigate(-1);
    } else if (typeof window !== "undefined" && window.history.length > 1 && document.referrer && document.referrer.includes(window.location.host)) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }, [location.key, navigate]);
  const { me } = useAuth();
  const params = useParams();
  const routePostId = (params as { postId?: string }).postId;
  const effectivePostId = postId || routePostId || "";

  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentLikes, setCommentLikes] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);

  const handleViewProfile = useCallback(
    (id: string) => {
      if (onViewProfile) onViewProfile(id);
      else navigate(`/profile/${id}`);
    },
    [navigate, onViewProfile],
  );

  /* ---- Fetch post + profile ---- */
  useEffect(() => {
    if (!effectivePostId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: p, error } = await read3()
        .from("posts")
        .select(POST_COLUMNS)
        .is("deleted_at", null)
        .eq("id", effectivePostId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !p) {
        setPost(null);
        setLoading(false);
        return;
      }
      // Egress: đi qua profile-cache (TTL 5 phút + gộp in-flight) thay vì
      // bắn 1 query profiles riêng cho mỗi lần mở bài viết.
      const profile: any = p.user_id ? await fetchProfileById(p.user_id, PROFILE_POST_COLS) : null;
      if (cancelled) return;
      setPost({ ...p, profiles: profile });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [effectivePostId]);

  /* ---- Fetch comments + author profiles ---- */
  const loadComments = useCallback(async () => {
    if (!effectivePostId) return;
    const { data, error } = await read3()
      .from("comments")
      .select(COMMENT_COLUMNS)
      .eq("post_id", effectivePostId)
      .order("created_at", { ascending: true })
      .limit(120); // Egress: trần bình luận 120 (trước 500)
    if (error) {
      console.error("[post-detail] load comments", error);
      return;
    }
    const rows = (data || []) as CommentRow[];
    // Egress: gom toàn bộ tác giả bình luận → 1 request duy nhất, có cache 5 phút.
    const profMap = await fetchProfilesByIds(
      rows.map((r) => r.user_id),
      PROFILE_COMMENT_COLS,
    );
    const enriched = rows.map((r) => ({
      ...r,
      profiles: ((r.user_id && profMap.get(r.user_id)) || null) as ProfileLite | null,
    }));
    setComments(enriched);

    // Counts + my likes (comment_likes table may be absent — best-effort)
    if (enriched.length) {
      const cIds = enriched.map((c) => c.id);
      try {
        const { data: allLikes } = await supabase
          .from("comment_likes")
          .select("comment_id, user_id")
          .in("comment_id", cIds);
        const counts: Record<string, number> = {};
        const mine: Record<string, boolean> = {};
        (allLikes || []).forEach((l: any) => {
          counts[l.comment_id] = (counts[l.comment_id] || 0) + 1;
          if (me?.id && l.user_id === me.id) mine[l.comment_id] = true;
        });
        setLikeCounts(counts);
        setCommentLikes(mine);
      } catch {
        /* table missing — silently ignore */
      }
    } else {
      setLikeCounts({});
      setCommentLikes({});
    }
  }, [effectivePostId, me?.id]);

  useEffect(() => {
    void loadComments();
  }, [loadComments]);

  // Task #1 — When arriving from a notification (?comment=<id>), scroll to
  // the target comment inside PostDetailPage. Do NOT open the comment popup.
  useEffect(() => {
    if (embedded) return;
    const search = new URLSearchParams(location.search);
    const targetId = search.get("comment") || search.get("commentId");
    if (!targetId || comments.length === 0) return;
    let cancelled = false;
    const scrollToComment = (tries = 0) => {
      if (cancelled) return;
      const el = document.getElementById(`comment-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("comment-flash-highlight");
        window.setTimeout(
          () => el.classList.remove("comment-flash-highlight"),
          3200,
        );
      } else if (tries < 40) {
        window.setTimeout(() => scrollToComment(tries + 1), 200);
      }
    };
    const t = window.setTimeout(() => scrollToComment(), 250);
    return () => { cancelled = true; window.clearTimeout(t); };
  }, [comments, embedded, location.search]);


  /* ---- Realtime updates: comments + comment_likes ----
     Dùng registry ref-count: mỗi bài viết CHỈ có đúng 1 channel dù mở nhiều
     nơi (feed + trang chi tiết). Tự huỷ khi subscriber cuối cùng unmount. */
  useRealtime(
    effectivePostId ? `post-detail:${effectivePostId}` : null,
    [
      { table: "comments", event: "*", filter: `post_id=eq.${effectivePostId}` },
      { table: "comment_likes", event: "*" },
    ],
    () => void loadComments(),
  );

  /* ---- Send comment ---- */
  const sendComment = useCallback(
    async (text: string) => {
      if (!me?.id || !effectivePostId) return;
      // Restriction gate — commenting may be blocked by admin.
      try {
        const { assertCanComment } = await import("@/services/restrictions.service");
        await assertCanComment();
      } catch { return; }
      if (!(await guardAction("comment"))) return;
      // Moderation gate CHUNG: chặn bình luận dính từ cấm.
      try {
        const { assertContentAllowed } = await import("@/lib/keyword-filter");
        await assertContentAllowed(text, "comment");
      } catch (err: any) {
        toast.error(toUserMessage(err, "Nội dung không phù hợp, vui lòng chỉnh sửa."));
        return;
      }
      let commentScreening: any = { flagged: false };
      try {
        const { screenContent } = await import("@/lib/keyword-filter");
        commentScreening = await screenContent(text, "comment");
      } catch { /* nuốt lỗi kỹ thuật */ }
      const payload: any = {
        post_id: effectivePostId,
        user_id: me.id,
        content: text,
      };
      if (replyTo) payload.parent_id = replyTo.id;
      const { data: inserted, error } = await supabase
        .from("comments").insert([payload]).select("id").single();
      if (!error) syncRecentCommentsForPost(effectivePostId);
      if (error) {
        // DB chặn cứng khi bài đã khóa bình luận (trigger enforce_comments_lock).
        if (/COMMENTS_LOCKED/i.test((error as any)?.message || "")) {
          toast.error("Bài viết này đã khóa bình luận.");
          return;
        }
        toast.error(toUserMessage(error, "Không gửi được bình luận"));
        return;
      }
      if (commentScreening?.flagged && (inserted as any)?.id) {
        try {
          const { flagContentRecord } = await import("@/lib/keyword-filter");
          await flagContentRecord("comments", (inserted as any).id, commentScreening);
        } catch { /* noop */ }
      }
      setReplyTo(null);
      // Broadcast so any parent card showing this post bumps its badge instantly,
      // even before the realtime echo arrives.
      try {
        window.dispatchEvent(new CustomEvent("post:comment-added", { detail: { postId: effectivePostId } }));
      } catch { /* noop */ }
      await loadComments();
    },
    [me?.id, effectivePostId, replyTo, loadComments],
  );

  const editComment = useCallback(async (id: string, text: string) => {
    try {
      const { assertContentAllowed } = await import("@/lib/keyword-filter");
      await assertContentAllowed(text, "comment");
    } catch (err: any) {
      toast.error(toUserMessage(err, "Nội dung không phù hợp, vui lòng chỉnh sửa."));
      return;
    }
    const { error } = await supabase.from("comments").update({ content: text }).eq("id", id);
    if (error) { toast.error(error.message || "Không sửa được"); return; }
    await loadComments();
  }, [loadComments]);

  const deleteComment = useCallback(async (id: string) => {
    if (!window.confirm("Xoá bình luận này?")) return;
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (!error) syncToS3("comments", { id }, "delete");
    if (error) { toast.error(error.message || "Không xoá được"); return; }
    try {
      window.dispatchEvent(new CustomEvent("post:comment-removed", { detail: { postId: effectivePostId } }));
    } catch { /* noop */ }
    await loadComments();
  }, [loadComments, effectivePostId]);

  /* ---- Toggle comment like ---- */
  const toggleLike = useCallback(
    async (id: string) => {
      if (!me?.id) return;
      const wasLiked = !!commentLikes[id];
      if (!(await guardAction("like"))) return;
      setCommentLikes((s) => ({ ...s, [id]: !wasLiked }));
      setLikeCounts((s) => ({ ...s, [id]: Math.max(0, (s[id] || 0) + (wasLiked ? -1 : 1)) }));
      try {
        if (wasLiked) {
          await supabase
            .from("comment_likes")
            .delete()
            .eq("comment_id", id)
            .eq("user_id", me.id);
        } else {
          await supabase
            .from("comment_likes")
            .upsert({ comment_id: id, user_id: me.id } as any, {
              onConflict: "comment_id,user_id",
              ignoreDuplicates: true,
            });
        }
      } catch {
        // revert
        setCommentLikes((s) => ({ ...s, [id]: wasLiked }));
        setLikeCounts((s) => ({
          ...s,
          [id]: Math.max(0, (s[id] || 0) + (wasLiked ? 1 : -1)),
        }));
      }
    },
    [me?.id, commentLikes],
  );

  /* ---- Threading ---- */
  const { topLevel, repliesByParent } = useMemo(() => {
    const top: CommentRow[] = [];
    const by: Record<string, CommentRow[]> = {};
    for (const c of comments) {
      if (c.parent_id) {
        by[c.parent_id] = by[c.parent_id] || [];
        by[c.parent_id].push(c);
      } else {
        top.push(c);
      }
    }
    return { topLevel: top, repliesByParent: by };
  }, [comments]);

  /* ---- Render ---- */
  const postOwnerId = post?.user_id || "";
  const commentsDisabled = !!post?.comments_disabled;

  // Hide the floating bottom nav while the detail page is mounted (non-embedded)
  // so the sticky composer sits flush at the bottom of the viewport.
  useEffect(() => {
    if (embedded) return;
    const prev = document.body.getAttribute("data-in-post-detail");
    document.body.setAttribute("data-in-post-detail", "true");
    return () => {
      if (prev) document.body.setAttribute("data-in-post-detail", prev);
      else document.body.removeAttribute("data-in-post-detail");
    };
  }, [embedded]);

  return (
    <div
      className="pd-page"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: embedded ? "100%" : undefined,
        background: "hsl(var(--background))",
      }}
    >
      {/* Top nav — hidden when embedded in a bottom sheet (sheet has its own header) */}
      {!embedded && (<div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 6,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "hsl(var(--card) / 0.92)",
          backdropFilter: "blur(14px) saturate(160%)",
          WebkitBackdropFilter: "blur(14px) saturate(160%)",
          borderBottom: "1px solid hsl(var(--border))",
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          aria-label="Quay lại"
          style={{
            width: 38,
            height: 38,
            borderRadius: 999,
            border: 0,
            background: "hsl(var(--muted))",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            color: "hsl(var(--foreground))",
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "hsl(var(--foreground))" }}>
          Chi tiết bài viết
        </h1>
      </div>)}

      <div
        data-scroll-lock-ignore
        style={
          embedded
            ? {
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                overflowX: "hidden",
                paddingBottom: 8,
                WebkitOverflowScrolling: "touch",
                overscrollBehavior: "contain",
                touchAction: "pan-y",
              }
            : { paddingBottom: 8 }
        }
      >
        {loading ? (
          <div style={{ padding: 60, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
            <Loader2 size={24} className="animate-spin" style={{ display: "inline-block" }} />
            <p style={{ marginTop: 12, fontSize: "0.9rem" }}>Đang tải bài viết...</p>
          </div>
        ) : !post ? (
          <div style={{ padding: 60, textAlign: "center", color: "hsl(var(--muted-foreground))" }}>
            <p style={{ fontSize: "0.95rem" }}>Bài viết không tồn tại hoặc đã bị xóa.</p>
            <button
              onClick={() => navigate("/")}
              style={{
                marginTop: 14,
                padding: "8px 18px",
                background: "hsl(var(--primary))",
                color: "white",
                border: 0,
                borderRadius: 999,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Về trang chủ
            </button>
          </div>
        ) : (
          <>
            {/* When embedded in the CommentSheet, we skip the duplicate PostCard
                and show only a compact reaction summary. The user has already
                seen the post in the feed — the sheet focuses on comments. */}
            {!embedded ? (
              <div className="feed-threads" style={{ padding: "12px 12px 4px" }}>
                <PostCard
                  meId={me?.id}
                  post={post}
                  onRefresh={() => {
                    if (!effectivePostId) return;
                    void read3()
                      .from("posts")
                      .select(POST_COLUMNS)
                      .eq("id", effectivePostId)
                      .maybeSingle()
                      .then(({ data: p }) => {
                        if (p) setPost((prev: any) => ({ ...(prev || {}), ...p }));
                      });
                  }}
                  onViewProfile={handleViewProfile}
                  canDelete={me?.id === post.user_id}
                  compactMedia
                />
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "10px 18px 12px",
                  borderBottom: "1px solid hsl(var(--border) / 0.5)",
                  fontSize: 13,
                  color: "hsl(var(--muted-foreground))",
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Heart size={14} style={{ color: "hsl(var(--destructive))" }} />
                  <span style={{ color: "hsl(var(--foreground))", fontWeight: 600 }}>
                    {formatCount((post as any).likes_count || (post as any).like_count || 0)}
                  </span>
                  lượt thích
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <MessageCircle size={14} />
                  <span style={{ color: "hsl(var(--foreground))", fontWeight: 600 }}>
                    {formatCount(comments.length)}
                  </span>
                  bình luận
                </span>
              </div>
            )}

            {/* Comments section header */}
            {!embedded && (
              <div
                style={{
                  padding: "16px 16px 6px",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "hsl(var(--muted-foreground))",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <MessageCircle size={14} />
                Bình luận · {comments.length}
              </div>
            )}


            {/* Comments list */}
            <div style={{ padding: "0 14px 20px", background: "hsl(var(--background))" }}>
              {topLevel.length === 0 ? (
                <div
                  style={{
                    padding: "32px 12px",
                    textAlign: "center",
                    color: "hsl(var(--muted-foreground))",
                    fontSize: "0.9rem",
                  }}
                >
                  Chưa có bình luận nào. Hãy là người đầu tiên!
                </div>
              ) : (
                topLevel.map((c) => (
                  <div key={c.id} style={{ borderBottom: "1px solid hsl(var(--border) / 0.5)" }}>
                    <CommentItem
                      c={c}
                      isAuthor={c.user_id === postOwnerId}
                      liked={!!commentLikes[c.id]}
                      likeCount={likeCounts[c.id] || 0}
                      onLike={() => void toggleLike(c.id)}
                      onReply={() =>
                        setReplyTo({
                          id: c.id,
                          name: resolveUserName(c.profiles as any, "bạn"),
                        })
                      }
                      onViewProfile={() => handleViewProfile(c.user_id)}
                      meId={me?.id}
                      onEdit={editComment}
                      onDelete={deleteComment}
                    />
                    <ReplyThread
                      parent={c}
                      replies={repliesByParent[c.id] || []}
                      postOwnerId={postOwnerId}
                      meId={me?.id}
                      commentLikes={commentLikes}
                      likeCounts={likeCounts}
                      onLike={(id) => void toggleLike(id)}
                      onReply={(r) =>
                        setReplyTo({
                          id: c.id,
                          name: resolveUserName(r.profiles as any, "bạn"),
                        })
                      }
                      onViewProfile={handleViewProfile}
                      onEdit={editComment}
                      onDelete={deleteComment}
                    />
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Composer */}
      {post ? (
        <CommentComposer
          meId={me?.id}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          onSend={sendComment}
          disabled={commentsDisabled}
        />
      ) : null}
    </div>
  );
}

export default PostDetailPage;
