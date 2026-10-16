import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showPostSuccessPopup } from "@/components/candy/post-success-popup";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { Portal } from "@/components/candy/portal";
import { SOCIAL_DEFS, SocialGlyph } from "@/components/candy/profile-uid-badge";
import { CommonLockedPopup } from "@/components/candy/common-locked-popup";
import { acquirePopup, closeActivePopup, releasePopup } from "@/lib/single-popup";
import { usePostCard } from "./post-card-context";
import { PostReplyReference } from "./PostReplyReference";
import { resolvePostImages, createMessageCompat } from "@/lib/db-compat";
import { encodePostReply, type PostReplyContext } from "@/lib/post-reply-message";
import { computeRequestState, PENDING_LOCKED_TEXT } from "@/lib/message-requests";
import { fetchLatestPage } from "@/lib/chat-cache";
import { ensureClearsMap } from "@/lib/chat-clears";
import { supabase } from "@/lib/supabase";
import { sendVirtualMessage } from "@/lib/virtual-profiles";
import "@/styles/profile-uid-badge.css";


export function PostContactActions() {
  const { post, authorName, meId, likes, botLikes, isAnonymous } = usePostCard();
  const [open, setOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  useBodyScrollLock(composeOpen);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const [sendError, setSendError] = useState("");
  const [vipFeature, setVipFeature] = useState<string | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const postContext: PostReplyContext = {
    postId: post.id,
    authorId: post.user_id,
    authorName,
    preview: (post.content ?? "").replace(/<[^>]*>/g, "").trim().slice(0, 240) || "Bài viết có ảnh",
    post: {
      content: post.content ?? "",
      avatar: isAnonymous ? null : post.profiles?.avatar ?? null,
      createdAt: post.created_at,
      media: resolvePostImages(post),
      likes: likes + botLikes,
    },
  };

  useEffect(() => {
    if (!composeOpen) return;
    const previousModal = document.body.getAttribute("data-modal-open");
    document.body.setAttribute("data-modal-open", "true");
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !sendingRef.current) setComposeOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (previousModal === null) document.body.removeAttribute("data-modal-open");
      else document.body.setAttribute("data-modal-open", previousModal);
    };
  }, [composeOpen]);

  const sendPostMessage = async () => {
    const text = draft.trim();
    if (!text || !meId || !post.user_id || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setSendError("");
    try {
      const { ensureAllowed } = await import("@/lib/restriction-guard");
      if (!(await ensureAllowed("message"))) return;
      const { data: blockRows, error: blockError } = await supabase.from("user_blocks" as any)
        .select("blocker_id, target_id")
        .or(`and(blocker_id.eq.${meId},target_id.eq.${post.user_id}),and(blocker_id.eq.${post.user_id},target_id.eq.${meId})`);
      if (blockError) throw blockError;
      if (blockRows?.length) {
        setSendError((blockRows as { blocker_id: string }[]).some((row) => row.blocker_id === meId)
          ? "Bạn đã chặn người này. Hãy gỡ chặn để gửi tin." : "Không thể gửi tin nhắn đến người dùng này.");
        return;
      }
      const clears = await ensureClearsMap(meId);
      const clearedAt = clears[post.user_id] ?? 0;
      const { rows } = await fetchLatestPage(meId, post.user_id, clearedAt);
      if (computeRequestState(rows, meId, post.user_id).locked) {
        setSendError(PENDING_LOCKED_TEXT);
        return;
      }
      const content = encodePostReply(postContext, text);
      // Both paths use the same private-message writers as the chat composer.
      if ((post.profiles as { is_virtual?: boolean } | null)?.is_virtual) {
        await sendVirtualMessage(post.user_id, meId, content);
      } else {
        await createMessageCompat(meId, post.user_id, content);
      }
      setComposeOpen(false);
      setDraft("");
      showPostSuccessPopup("Đã Gửi Tin nhắn", { variant: "message", duration: 1500 });
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Không gửi được tin nhắn, vui lòng thử lại.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };


  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = menu.current?.offsetWidth ?? 246;
      const height = menu.current?.offsetHeight ?? 250;
      const nav = document.querySelector("nav.ios-dock, nav.ln, [data-bottom-nav], .bottom-nav")?.getBoundingClientRect();
      const bottom = Math.min(window.innerHeight - 8, nav?.top ?? window.innerHeight - 8);
      const top = anchor.top - height - 7 >= 8
        ? anchor.top - height - 7
        : Math.max(8, Math.min(anchor.bottom + 7, bottom - height));
      const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
      setPosition({ top, left });
    };
    place();
    const raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    acquirePopup(close);
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !menu.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      releasePopup(close);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, close]);

  return (
    <div className="pc-contact-actions">
      <Button ref={trigger} type="button" variant="secondary" size="icon" className="pc-contact-trigger pg-social-btn pg-social-btn--facebook"
        aria-label="Liên hệ tác giả qua mạng xã hội" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((wasOpen) => !wasOpen)}>
        <SocialGlyph k="facebook" />
      </Button>
      <Button type="button" className="pc-message-button" onClick={() => {
        if (!meId || !post.user_id || meId === post.user_id) return;
        close();
        closeActivePopup();
        setSendError("");
        setComposeOpen(true);
      }} disabled={!meId || !post.user_id || meId === post.user_id}>
        <MessageCircle aria-hidden="true" /><span>Nhắn tin</span>
      </Button>
      {composeOpen ? <Portal>
        <div className="pc-compose-overlay" onPointerDown={(event) => {
          if (event.target === event.currentTarget && !sending) setComposeOpen(false);
        }}>
          <div className="pc-compose-dialog" role="dialog" aria-modal="true" aria-label="Nhắn tin về bài viết">
            <div className="pc-compose-head">
              <span className="pc-compose-title">Trả lời bài viết</span>
              <Button variant="ghost" size="icon" type="button" aria-label="Đóng" onClick={() => setComposeOpen(false)} disabled={sending}><X aria-hidden="true" /></Button>
            </div>
            <div className="pc-compose-body">
              <PostReplyReference context={postContext} />
              <textarea aria-label="Tin nhắn riêng" placeholder="Nhập tin nhắn..." value={draft} onChange={(event) => setDraft(event.target.value)} disabled={sending} />
              {sendError ? <p role="alert" className="pc-compose-error">{sendError}</p> : null}
            </div>
            <div className="pc-compose-foot"><Button type="button" disabled={!draft.trim() || sending} onClick={() => void sendPostMessage()}>{sending ? "Đang gửi…" : "Gửi"}</Button></div>
          </div>
        </div>
      </Portal> : null}
      {open ? <Portal>
        <div ref={menu} role="menu" aria-label="Liên hệ tác giả" className="pc-contact-menu"
          style={position ?? { top: -9999, left: -9999 }}>
          {(["facebook", "zalo", "telegram", "instagram", "x"] as const).map((key) => {
            const def = SOCIAL_DEFS.find((item) => item.key === key);
            if (!def) return null;
            const label = `${key === "instagram" || key === "x" ? "Theo dõi" : "Kết Bạn"} ${def.label}`;
            return <Button key={key} type="button" role="menuitem" variant="ghost"
              className={`pc-contact-menu-item pg-social-btn--${key}`}
              onClick={() => { close(); setVipFeature(label); }}>
              <span className={`pc-contact-social-icon pg-social-btn pg-social-btn--${key}`}><SocialGlyph k={key} /></span><span>{label}</span>
            </Button>;
          })}
        </div>
      </Portal> : null}
      {/* Mọi lựa chọn mạng xã hội đều đi qua popup VIP duy nhất của hệ thống. */}
      <CommonLockedPopup open={vipFeature !== null} onClose={() => setVipFeature(null)} featureName={vipFeature ?? undefined} />
    </div>
  );
}