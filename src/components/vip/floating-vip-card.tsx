/**
 * <FloatingVipCard /> — thẻ nổi nhỏ hiện khi bấm vào GIF VIP sau tên.
 *
 * Chỉ hiển thị: "⭐ Thành viên VIP Zalo" + một dòng phụ.
 * Không modal, không làm mờ nền, không khóa màn hình. Click ra ngoài tự tắt.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const CARD_WIDTH = 216;

export function FloatingVipCard({
  anchor,
  onClose,
}: {
  anchor: HTMLElement | null;
  onClose: () => void;
  /** Giữ prop cũ để không phải sửa call-site — không còn hiển thị. */
  durationText?: string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; arrow: number; below: boolean } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!anchor) return;
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const h = cardRef.current?.offsetHeight ?? 92;
      const centerX = r.left + r.width / 2;
      let left = centerX - CARD_WIDTH / 2;
      left = Math.max(10, Math.min(left, window.innerWidth - CARD_WIDTH - 10));
      const below = r.top - h - 14 < 8;
      const top = below ? r.bottom + 12 : r.top - h - 12;
      setPos({ top, left, arrow: Math.max(16, Math.min(centerX - left, CARD_WIDTH - 16)), below });
    };
    place();
    const opts = { passive: true } as AddEventListenerOptions;
    window.addEventListener("scroll", place, opts);
    window.addEventListener("resize", place, opts);
    return () => {
      window.removeEventListener("scroll", place, opts);
      window.removeEventListener("resize", place, opts);
    };
  }, [anchor]);

  useEffect(() => {
    const onDown = (e: Event) => {
      const t = e.target as Node;
      if (cardRef.current?.contains(t) || anchor?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        ref={cardRef}
        className="vipcard"
        role="dialog"
        aria-label="Thành viên VIP Zalo"
        style={{
          top: pos?.top ?? -9999,
          left: pos?.left ?? -9999,
          width: CARD_WIDTH,
          visibility: pos ? "visible" : "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="vipcard__head">
          <span className="vipcard__crown" aria-hidden="true">
            👑
          </span>
          <span className="vipcard__title">⭐ Thành viên VIP Zalo</span>
        </div>
        <div className="vipcard__sub">Đã tham gia cộng đồng VIP.</div>
        <span
          className={`vipcard__arrow ${pos?.below ? "is-up" : ""}`}
          style={{ left: pos?.arrow ?? CARD_WIDTH / 2 }}
          aria-hidden="true"
        />
      </div>
      <style>{VIP_CARD_CSS}</style>
    </>,
    document.body,
  );
}

const VIP_CARD_CSS = `
.vipcard{position:fixed;z-index:99999;border-radius:16px;padding:11px 13px 12px;
  color:#3a2606;background:linear-gradient(155deg,#fff8e6,#ffe9b3 60%,#ffd980);
  border:1px solid rgba(180,120,10,.32);
  box-shadow:0 20px 40px -18px rgba(60,40,0,.5),0 4px 12px -6px rgba(0,0,0,.22);
  transform-origin:bottom center;animation:vipcard-in .18s cubic-bezier(.2,.8,.3,1) both;
  font-size:13px;line-height:1.45;}
.vipcard__head{display:flex;align-items:center;gap:7px;}
.vipcard__crown{font-size:16px;line-height:1;}
.vipcard__title{font-weight:900;letter-spacing:.01em;font-size:13.5px;}
.vipcard__sub{margin-top:3px;font-size:12.5px;font-weight:600;opacity:.82;}
.vipcard__arrow{position:absolute;bottom:-7px;height:14px;width:14px;margin-left:-7px;
  background:linear-gradient(135deg,#ffe6a8,#ffd980);transform:rotate(45deg);
  border-right:1px solid rgba(180,120,10,.32);border-bottom:1px solid rgba(180,120,10,.32);
  border-radius:2px;}
.vipcard__arrow.is-up{bottom:auto;top:-7px;transform:rotate(225deg);}
@keyframes vipcard-in{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.vipcard{animation:none;opacity:1}}
`;

export default FloatingVipCard;
