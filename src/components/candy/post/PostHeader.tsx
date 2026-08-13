import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { acquirePopup, releasePopup } from "@/lib/single-popup";
import { UserRound, Heart } from "lucide-react";
import { PostAvatar } from "./PostAvatar";
import { PostMeta } from "./PostMeta";
import { PostMenu } from "./PostMenu";
import { usePostCard } from "./post-card-context";

const POPUP_CSS = `
.pc-author-popup {
  position: fixed;
  z-index: var(--z-popup, 2000);
  min-width: 248px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-radius: 20px;
  border: 1px solid rgba(0,0,0,.05);
  background-color: #ffffff;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  opacity: 1;
  backdrop-filter: none;
  box-shadow: 0 18px 60px rgba(0,0,0,.25);
  transform-origin: top left;
  animation: pcap-in 140ms cubic-bezier(.2,.8,.2,1) both;
}
.pc-author-popup[data-closing="true"] { animation: pcap-out 130ms ease-in both; }
@keyframes pcap-in { from { opacity: 0; transform: scale(.92); } to { opacity: 1; transform: scale(1); } }
@keyframes pcap-out { from { opacity: 1; transform: scale(1); } to { opacity: 0; transform: scale(.92); } }
.pc-author-popup button {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 12px 12px; border: 0; border-radius: 14px;
  background: transparent; color: inherit; cursor: pointer;
  font-size: 15px; font-weight: 600; text-align: left;
  transition: background-color 120ms ease, transform 120ms ease;
  -webkit-tap-highlight-color: transparent;
}
.pc-author-popup button svg { flex: 0 0 20px; }
@media (hover: hover) {
  .pc-author-popup button:hover { background: rgba(0,0,0,.05); }
}
.pc-author-popup button:active { background: rgba(0,0,0,.08); transform: scale(.98); }
`;

/**
 * PostHeader — top row of the card. Bấm avatar hoặc tên sẽ mở popup nhỏ
 * (kiểu Threads): "Theo dõi" và "Truy cập trang cá nhân". Bấm ra ngoài để đóng.
 * Popup render qua portal + position: fixed nên luôn nổi trên ảnh/video/sticky.
 */
export function PostHeader() {
  const { onViewProfile, post, isAnonymous, following, meId, quickFollow } = usePostCard();
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, 130);
  }, []);

  const place = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 248;
    const left = Math.min(Math.max(8, r.left + 8), window.innerWidth - width - 8);
    setPos({ top: r.bottom + 6, left });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    // Scroll → đóng popup (không reposition) theo yêu cầu UX.
    const onScroll = () => close();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
    };
  }, [open, close, place]);

  // Chỉ cho phép tồn tại 1 popup avatar trên toàn app: mở cái mới → cái cũ đóng.
  useEffect(() => {
    if (!open) { releasePopup(close); return; }
    acquirePopup(close);
    return () => releasePopup(close);
  }, [open, close]);

  const canFollow = Boolean(meId && meId !== post.user_id && !isAnonymous);

  const popup =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popupRef}
            className="pc-author-popup"
            role="menu"
            data-closing={closing ? "true" : "false"}
            style={{ top: pos.top, left: pos.left }}
          >
            <style>{POPUP_CSS}</style>
            {canFollow ? (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => { quickFollow(e as any); close(); }}
              >
                <Heart size={20} fill={following ? "currentColor" : "none"} />
                {following ? "Bỏ theo dõi" : "Theo dõi"}
              </button>
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={() => { close(); onViewProfile(post.user_id); }}
            >
              <UserRound size={20} />
              Truy cập trang cá nhân
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="pc-header" style={{ overflow: "visible" }}>
      <div
        className="pc-header-author-wrap"
        ref={wrapRef}
        style={{ position: "relative", flex: 1, minWidth: 0, overflow: "visible" }}
      >
        <button
          type="button"
          className="pc-header-author"
          onClick={() => { if (isAnonymous) return; open ? close() : (acquirePopup(close), setOpen(true)); }}
          disabled={isAnonymous}
          style={isAnonymous ? { cursor: "default" } : undefined}
        >
          <PostAvatar />
          <PostMeta />
        </button>
        {popup}
      </div>
      <PostMenu />
    </div>
  );
}
