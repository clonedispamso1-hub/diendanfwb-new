import { useEffect } from "react";

/**
 * Bulletproof scroll lock for modals / popups / bottom sheets.
 *
 * Combines:
 *  - position:fixed on <body> with the saved scrollY → freezes layout
 *    and prevents the background feed from moving, even on iOS Safari
 *    where `overflow:hidden` alone is not enough.
 *  - Restores window.scrollTo(0, scrollY) on unlock so the user lands
 *    exactly where they were when they opened the modal.
 *  - Global `touchmove` listener with `{ passive: false }` that calls
 *    `e.preventDefault()` for any gesture started outside an element
 *    marked with `data-scroll-lock-ignore` (set this attribute on the
 *    scrollable region inside the modal so its own scrolling still works).
 *  - Reference counted: supports multiple stacked modals safely.
 */

let lockCount = 0;
let savedScrollY = 0;
let savedStyles: {
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyTouchAction: string;
  bodyOverscroll: string;
  htmlOverscroll: string;
} | null = null;

const preventTouchMove = (e: TouchEvent) => {
  const target = e.target as Element | null;
  // Allow native scrolling inside any element (or its ancestors) opted-in
  // via [data-scroll-lock-ignore]. Modal bodies can add this attribute.
  if (target && typeof target.closest === "function" && target.closest("[data-scroll-lock-ignore]")) {
    return;
  }
  if (e.cancelable) e.preventDefault();
};

function applyLock() {
  if (typeof document === "undefined" || lockCount !== 1) return;
  const body = document.body;
  const html = document.documentElement;
  savedScrollY = window.scrollY || window.pageYOffset || 0;
  savedStyles = {
    bodyOverflow: body.style.overflow,
    bodyPosition: body.style.position,
    bodyTop: body.style.top,
    bodyLeft: body.style.left,
    bodyRight: body.style.right,
    bodyWidth: body.style.width,
    bodyTouchAction: body.style.touchAction,
    bodyOverscroll: body.style.overscrollBehavior,
    htmlOverscroll: html.style.overscrollBehavior,
  };
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
  body.style.touchAction = "none";
  body.style.overscrollBehavior = "none";
  html.style.overscrollBehavior = "none";
  body.classList.add("modal-open");
  html.classList.add("modal-open");
  document.addEventListener("touchmove", preventTouchMove, { passive: false });
}

function releaseLock() {
  if (typeof document === "undefined" || lockCount !== 0 || !savedStyles) return;
  const body = document.body;
  const html = document.documentElement;
  // CRITICAL: kill `scroll-behavior: smooth` (from legacy-index.css) for the
  // restoration so the page does NOT animate from 0 → savedScrollY when the
  // modal closes — that animation is what users perceive as the "jump to top
  // then scroll back" jank.
  const prevHtmlScrollBehavior = html.style.scrollBehavior;
  html.style.scrollBehavior = "auto";
  body.style.position = savedStyles.bodyPosition;
  body.style.top = savedStyles.bodyTop;
  body.style.left = savedStyles.bodyLeft;
  body.style.right = savedStyles.bodyRight;
  body.style.width = savedStyles.bodyWidth;
  body.style.overflow = savedStyles.bodyOverflow;
  body.style.touchAction = savedStyles.bodyTouchAction;
  body.style.overscrollBehavior = savedStyles.bodyOverscroll;
  html.style.overscrollBehavior = savedStyles.htmlOverscroll;
  body.classList.remove("modal-open");
  html.classList.remove("modal-open");
  document.removeEventListener("touchmove", preventTouchMove);
  // Restore scroll position synchronously with `instant` behavior.
  try {
    window.scrollTo({ top: savedScrollY, left: 0, behavior: "instant" as ScrollBehavior });
  } catch {
    window.scrollTo(0, savedScrollY);
  }
  // Restore previous scroll-behavior on the next frame so app-level smooth
  // scrolling continues to work after the modal closes.
  requestAnimationFrame(() => {
    html.style.scrollBehavior = prevHtmlScrollBehavior;
  });
  savedStyles = null;
}

export function useBodyScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    lockCount += 1;
    applyLock();
    return () => {
      lockCount = Math.max(0, lockCount - 1);
      releaseLock();
    };
  }, [active]);
}
