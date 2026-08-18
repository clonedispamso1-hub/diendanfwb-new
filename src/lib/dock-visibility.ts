/**
 * dock-visibility — phát hiện "đang có overlay / đang thao tác" để ẩn Floating Dock.
 *
 * Thuần client, không query, không realtime: dùng MutationObserver trên <body>
 * + sự kiện focus để biết khi nào người dùng đang mở popup/modal/drawer/sheet,
 * đang chat, đang nhập bình luận / bài viết, đang xem ảnh - story - live…
 */
import { useEffect, useState } from "react";

/** Selector của mọi lớp phủ phổ biến trong app. */
const OVERLAY_SELECTORS = [
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[aria-modal="true"]',
  "[data-radix-popper-content-wrapper]",
  "[data-vaul-drawer]",
  "[data-state='open'][data-overlay]",
  ".pr-overlay",
  ".fdp__mask",
  ".cd-sheet",
  ".bottom-sheet",
  ".sheet-overlay",
  ".modal-overlay",
  ".overlay",
  ".lightbox",
  ".image-lightbox",
  ".story-viewer",
  ".emoji-picker",
  ".gif-picker",
  ".popup-mask",
  ".vip-modal",
].join(",");

/** Đường dẫn luôn ẩn dock (chat, live, feedback, story…). */
const HIDDEN_PATH_PARTS = [
  "/chat",
  "/message",
  "/messages",
  "/tin-nhan",
  "/live",
  "/feedback",
  "/story",
  "/stories",
];

function overlayVisible(): boolean {
  const nodes = document.querySelectorAll<HTMLElement>(OVERLAY_SELECTORS);
  for (const el of Array.from(nodes)) {
    if (el.getAttribute("aria-hidden") === "true") continue;
    if (el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    return true;
  }
  return false;
}

function scrollLocked(): boolean {
  const b = document.body;
  if (b.hasAttribute("data-scroll-locked")) return true;
  const ov = window.getComputedStyle(b).overflow;
  return ov === "hidden";
}

function typingNow(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    const t = (el as HTMLInputElement).type;
    return t !== "checkbox" && t !== "radio" && t !== "button" && t !== "submit";
  }
  return false;
}

function pathHidden(): boolean {
  const p = window.location.pathname.toLowerCase();
  return HIDDEN_PATH_PARTS.some((x) => p === x || p.startsWith(x));
}

function computeHidden(): boolean {
  return overlayVisible() || scrollLocked() || typingNow() || pathHidden();
}

/** true = phải ẩn dock. */
export function useDockHidden(): boolean {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setHidden((prev) => {
          const next = computeHidden();
          return next === prev ? prev : next;
        });
      });
    };

    update();
    const mo = new MutationObserver(update);
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden", "data-state", "data-scroll-locked"],
    });
    window.addEventListener("focusin", update);
    window.addEventListener("focusout", update);
    window.addEventListener("popstate", update);
    const iv = window.setInterval(update, 700);

    return () => {
      mo.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("focusin", update);
      window.removeEventListener("focusout", update);
      window.removeEventListener("popstate", update);
      window.clearInterval(iv);
    };
  }, []);

  return hidden;
}
