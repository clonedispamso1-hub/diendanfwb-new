import { useEffect, useState, memo } from "react";
import { Heart, MessageCircle, Send, Reply, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchProfilesByIds } from "@/lib/profile-cache";

const VIDEO_COMMENT_PROFILE_COLS =
  "id, full_name, username, avatar, vip_level, title_gif_url, badge_id, is_admin, role, is_virtual, is_seed_account, is_clone, province";

import { guardAction } from "@/lib/rate-limit";
import UniversalBadge from "@/components/candy/universal-badge";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { Portal } from "@/components/candy/portal";
import { isMissingRelationError } from "@/lib/db-compat";
import { useAuth } from "@/components/candy/auth-provider";
import { formatCount } from "@/lib/format";
import { VipGiftSheet } from "@/components/candy/vip-gift/vip-gift-sheet";
import { GiftHistoryModal } from "@/components/candy/gift-history-modal";
import { useRealtime, pickRow } from "@/lib/realtime-registry";
import { resolveUserName } from "@/lib/user-name";

interface Props {
  videoId: string;
  ownerId: string;
  meId?: string;
  createdAt?: string | null;
  recipientName?: string;
  onViewProfile?: (userId: string) => void;
}

function VideoInteractionsImpl({ videoId, ownerId, meId, createdAt, recipientName, onViewProfile }: Props) {
  const { refreshMe } = useAuth();
  const [likes, setLikes] = useState(0);
  const [liked, setLiked] = useState(false);
  const [likeBurst, setLikeBurst] = useState(0);
  const [commentBurst, setCommentBurst] = useState(0);
  const [comments, setComments] = useState(0);
  const [commentList, setCommentList] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [openComments, setOpenComments] = useState(false);
  const [giftMenuOpen, setGiftMenuOpen] = useState(false);
  const [totalGifted, setTotalGifted] = useState(0);
  const [showGiftBurst, setShowGiftBurst] = useState(false);
  const [giftHistoryOpen, setGiftHistoryOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [likeCount, commentCount, myLike, gifts] = await Promise.all([
        supabase.from("video_likes" as any).select("id", { count: "exact", head: true }).eq("video_id", videoId),
        supabase.from("video_comments" as any).select("id", { count: "exact", head: true }).eq("video_id", videoId),
        meId
          ? supabase.from("video_likes" as any).select("id").eq("video_id", videoId).eq("user_id", meId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("video_gifts" as any).select("amount").eq("video_id", videoId),
      ]);
      if (cancelled) return;
      if (likeCount.error && isMissingRelationError(likeCount.error)) {
        setLikes(0); setComments(0); setLiked(false); setTotalGifted(0); return;
      }
      setLikes(likeCount.count || 0);
      setComments(commentCount.count || 0);
      setLiked(Boolean((myLike as any).data));
      const sum = ((gifts.data as any[]) || []).reduce((acc, r) => acc + (r.amount || 0), 0);
      setTotalGifted(sum);
    };
    void load();
    return () => { cancelled = true; };
  }, [videoId, meId]);

  // Một channel duy nhất (registry) cho cả likes/comments/gifts của video này — có filter server-side.
  useRealtime(
    videoId ? `video-int-${videoId}` : null,
    [
      { table: "video_likes", filter: `video_id=eq.${videoId}` },
      { table: "video_comments", filter: `video_id=eq.${videoId}` },
      { table: "video_gifts", event: "INSERT", filter: `video_id=eq.${videoId}` },
    ],
    (payload, topicIndex) => {
      if (topicIndex === 0) {
        supabase.from("video_likes" as any).select("id", { count: "exact", head: true }).eq("video_id", videoId)
          .then(({ count }) => setLikes(count || 0));
      } else if (topicIndex === 1) {
        supabase.from("video_comments" as any).select("id", { count: "exact", head: true }).eq("video_id", videoId)
          .then(({ count }) => setComments(count || 0));
        setOpenComments((open) => { if (open) void loadComments(); return open; });
      } else if (topicIndex === 2) {
        const row = pickRow(payload);
        setTotalGifted((v) => v + ((row?.amount as number) || 0));
      }
    },
  );

  const loadComments = async () => {
    const { data, error } = await supabase
      .from("video_comments" as any)
      .select("id, video_id, user_id, content, parent_id, created_at")
      .eq("video_id", videoId)
      .order("created_at", { ascending: true }).limit(20);
    if (error) {
      if (!isMissingRelationError(error)) console.error("[video_comments] load:", error);
      setCommentList([]);
      return;
    }
    const rows = (data as any[]) || [];
    setComments(rows.length);
    const userIds = Array.from(new Set(rows.map((c) => c.user_id).filter(Boolean)));
    // Egress: 1 request gộp + cache 5 phút (profile-cache).
    const pmap = await fetchProfilesByIds(userIds, VIDEO_COMMENT_PROFILE_COLS);
    setCommentList(rows.map((c) => ({ ...c, profiles: pmap.get(c.user_id) || null })));
  };

  const toggleLike = async () => {
    if (!meId) return alert("Vui lòng đăng nhập.");
    // Restriction gate — like actions may be blocked by admin.
    {
      const { ensureAllowed } = await import("@/lib/restriction-guard");
      if (!(await ensureAllowed("like"))) return;
    }
    if (!(await guardAction("like"))) return;

    setLikeBurst((n) => n + 1);
    const { data: existing, error: checkErr } = await supabase
      .from("video_likes" as any)
      .select("id")
      .eq("video_id", videoId)
      .eq("user_id", meId)
      .maybeSingle();
    if (checkErr) { alert(checkErr.message); return; }
    const wasLiked = !!existing;
    setLiked(!wasLiked);
    setLikes((v) => Math.max(0, v + (wasLiked ? -1 : 1)));
    if (wasLiked) {
      const { error } = await supabase.from("video_likes" as any).delete()
        .eq("video_id", videoId).eq("user_id", meId);
      if (error) { setLiked(true); setLikes((v) => v + 1); alert(error.message); }
    } else {
      const { error } = await supabase.from("video_likes" as any)
        .upsert([{ video_id: videoId, user_id: meId }], {
          onConflict: "video_id,user_id",
          ignoreDuplicates: true,
        });
      if (error) { setLiked(false); setLikes((v) => Math.max(0, v - 1)); alert(error.message); }
    }
  };

  const sendComment = async () => {
    if (!meId || !commentText.trim()) return;
    // Restriction gate — commenting may be blocked by admin.
    const { ensureAllowed, handleRestrictionError } = await import("@/lib/restriction-guard");
    if (!(await ensureAllowed("comment"))) return;
    if (!(await guardAction("comment"))) return;
    const payload: any = {
      video_id: videoId,
      user_id: meId,
      content: commentText.trim(),
      ...(replyTo ? { parent_id: replyTo.id } : {}),
    };
    const { error } = await supabase.from("video_comments" as any).insert([payload]);
    if (error) {
      if (await handleRestrictionError(error)) return;
      return alert(error.message);
    }

    setCommentText("");
    setReplyTo(null);
    await loadComments();
  };

  const topComments = commentList.filter((c: any) => !c.parent_id);
  const replies = commentList.filter((c: any) => c.parent_id);
  const displayedLikes = likes;

  return (
    <>
      <div className="post-actions reaction-bar" style={{ position: "relative" }}>
        <button
          className={`post-action reaction-btn reaction-like ${liked ? "is-active" : ""} ${likeBurst > 0 ? "reaction-press" : ""}`}
          key={`vlike-${likeBurst}`}
          onClick={() => void toggleLike()}
        >
          <Heart size={18} fill={liked ? "currentColor" : "none"} />
          <span className="reaction-label">Thích</span>
          <span className="reaction-count">{formatCount(displayedLikes)}</span>
          {likeBurst > 0 ? (
            <>
              <span className="like-floater lf-1" aria-hidden="true"><Heart size={12} fill="currentColor" /></span>
              <span className="like-floater lf-2" aria-hidden="true"><Heart size={14} fill="currentColor" /></span>
              <span className="like-floater lf-3" aria-hidden="true"><Heart size={12} fill="currentColor" /></span>
              <span className="like-plus-one" aria-hidden="true">+1</span>
            </>
          ) : null}
        </button>
        <button
          className={`post-action reaction-btn reaction-comment ${commentBurst > 0 ? "comment-pop" : ""}`}
          key={`vcmt-${commentBurst}`}
          data-action="open-comments"
          onClick={() => {
            setCommentBurst((n) => n + 1);
            setOpenComments(true);
            void loadComments();
          }}
        >
          <MessageCircle size={18} />
          <span className="reaction-label">Bình luận</span>
          <span className="reaction-count">{comments}</span>
          {commentBurst > 0 ? <span className="comment-ripple" aria-hidden="true" /> : null}
        </button>
        <button
          className="post-action reaction-btn reaction-gift vip-gift-cta"
          onClick={() => {
            if (!videoId || !ownerId) {
              alert("Video chưa sẵn sàng để tặng quà. Vui lòng thử lại sau.");
              return;
            }
            setGiftMenuOpen(true);
          }}
          title="Tặng quà VIP"
        >
          <span className="vip-gift-icon" aria-hidden>🎁</span>
          <span className="reaction-label">Tặng quà</span>
        </button>
        {showGiftBurst ? <div className="gem-success-burst">💎</div> : null}
      </div>

      <VipGiftSheet
        open={giftMenuOpen && Boolean(videoId) && Boolean(ownerId)}
        onClose={() => setGiftMenuOpen(false)}
        postId={videoId ?? ""}
        recipientId={ownerId ?? ""}
        recipientName={recipientName || "Tác giả video"}
        kind="video"
        onSent={(g) => {
          setTotalGifted((v) => v + g.gem);
          setShowGiftBurst(true);
          window.setTimeout(() => setShowGiftBurst(false), 700);
        }}
      />

      {totalGifted > 0 ? (
        <button
          type="button"
          className="post-gift-summary"
          onClick={() => setGiftHistoryOpen(true)}
          title="Xem lịch sử tặng quà"
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            fontSize: "0.85rem",
            color: "hsl(var(--primary))",
            fontWeight: 500,
            padding: "4px 0",
            background: "none",
            border: "none",
            cursor: "pointer",
          }}
        >
          💎 Video này nhận được {totalGifted.toLocaleString()} Gem
        </button>
      ) : null}

      {giftHistoryOpen ? (
        <GiftHistoryModal
          kind="video"
          videoId={videoId}
          totalGifted={totalGifted}
          onClose={() => setGiftHistoryOpen(false)}
          onViewProfile={(uid) => { setGiftHistoryOpen(false); onViewProfile?.(uid); }}
        />
      ) : null}

      {/* Comment Modal Popup — y hệt post-card */}
      {openComments ? (
        <Portal>
          <div className="modal-backdrop" onClick={() => setOpenComments(false)} style={{ zIndex: 10010 }}>
            <div
              className="comment-modal"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              style={{ position: "relative" }}
            >
              <div className="comment-modal-header" style={{ paddingRight: 56 }}>
                <h3>Bình luận ({comments})</h3>
                <button
                  type="button"
                  className="popup-close-x"
                  onClick={() => setOpenComments(false)}
                  aria-label="Đóng"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="comment-modal-body">
                {commentList.length === 0 ? (
                  <p className="muted-copy" style={{ textAlign: "center", padding: "32px 0" }}>
                    Chưa có bình luận nào. Hãy là người đầu tiên!
                  </p>
                ) : null}
                {topComments.map((comment: any) => {
                  const commentReplies = replies.filter((r: any) => r.parent_id === comment.id);
                  const cName = resolveUserName(comment.profiles as any, "Người dùng");
                  const cAvatar = comment.profiles?.avatar || "/placeholder.svg";
                  return (
                    <div key={comment.id}>
                      <div className="comment-row">
                        <AvatarGlow
                          avatar={comment.profiles?.avatar ?? null}
                          userId={comment.user_id}
                          size={28}
                          alt={cName}
                          imgClassName="avatar-sm"
                        />
                        <div className="comment-bubble">
                          <div className="inline-flex items-center gap-2 flex-wrap">
                            <button
                              className="ghost-link row-title"
                              style={{ fontSize: "0.85rem" }}
                              onClick={() => onViewProfile?.(comment.user_id)}
                            >
                              {cName}
                            </button>
                            <UniversalBadge profile={comment.profiles as any} />
                          </div>
                          <p>{comment.content}</p>
                          <div className="comment-actions-row">
                            <button
                              className="comment-action-btn"
                              onClick={() => setReplyTo({ id: comment.id, name: cName })}
                            >
                              <Reply size={12} /> Trả lời
                            </button>
                          </div>
                        </div>
                      </div>
                      {commentReplies.map((r: any) => {
                        const rName = resolveUserName(r.profiles as any, "Người dùng");
                        const rAvatar = r.profiles?.avatar || "/placeholder.svg";
                        return (
                          <div key={r.id} className="comment-row comment-reply">
                            <AvatarGlow
                              avatar={r.profiles?.avatar ?? null}
                              userId={r.user_id}
                              size={24}
                              alt={rName}
                              imgClassName="avatar-sm"
                            />
                            <div className="comment-bubble">
                              <div className="inline-flex items-center gap-2 flex-wrap">
                                <button
                                  className="ghost-link row-title"
                                  style={{ fontSize: "0.85rem" }}
                                  onClick={() => onViewProfile?.(r.user_id)}
                                >
                                  {rName}
                                </button>
                                <UniversalBadge profile={r.profiles as any} />
                              </div>
                              <p>{r.content}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              <div className="comment-modal-footer">
                {replyTo && (
                  <div
                    style={{
                      fontSize: "0.78rem",
                      color: "var(--muted-foreground)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "0 4px 4px",
                    }}
                  >
                    Trả lời {replyTo.name}
                    <button
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--muted-foreground)",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                      }}
                      onClick={() => setReplyTo(null)}
                    >
                      ✕
                    </button>
                  </div>
                )}
                <div className="composer-row">
                  <input
                    className="app-input"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder={replyTo ? `Trả lời ${replyTo.name}...` : "Viết bình luận..."}
                    onKeyDown={(e) => e.key === "Enter" && void sendComment()}
                    autoFocus
                  />
                  <button className="icon-button primary-icon" onClick={() => void sendComment()}>
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      ) : null}
    </>
  );
}

export const VideoInteractions = memo(VideoInteractionsImpl);
