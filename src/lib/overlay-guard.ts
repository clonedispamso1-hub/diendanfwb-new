/**
 * Overlay guard — dọn "lớp phủ mồ côi".
 *
 * Bối cảnh: trên iOS Safari, animation exit của Radix/vaul đôi khi không bắn
 * `animationend` (tab bị treo, bfcache, low-power mode...). Node overlay vì thế
 * kẹt lại trong DOM với data-state="closed" → cả trang bị phủ một lớp mờ,
 * trong khi nội dung phía dưới vẫn bấm được (overlay đã mất pointer-events
 * hoặc nằm dưới content).
 *
 * Guard này KHÔNG đổi UI: nó chỉ gỡ những overlay đã đóng nhưng chưa unmount,
 * và trả body/html về trạng thái sạch khi không còn popup nào mở.
 */

const OVERLAY_SELECTOR = [
  "[data-overlay]",
  "[data-radix-dialog-overlay]",
  "[data-vaul-overlay]",
  "[vaul-overlay]",
  "[data-slot='dialog-overlay']",
  "[data-slot='sheet-overlay']",
  "[data-slot='drawer-overlay']",
  "[data-slot='alert-dialog-overlay']",
  ".app-overlay",
  ".modal-backdrop",
].join(",");

const OPEN_SELECTOR = [
  "[data-state='open'][role='dialog']",
  "[data-state='open'][role='alertdialog']",
  "[data-state='open'][data-vaul-drawer]",
  "[data-state='open'][data-overlay]",
  "[data-state='open'][data-radix-dialog-overlay]",
  "[data-state='open'][data-vaul-overlay]",
  "[data-state='open'][vaul-overlay]",
].join(",");

const BODY_MODAL_CLASSES = ["modal-open", "dialog-open", "overflow-hidden"];
const STALE_MS = 700;

const closedSince = new WeakMap<Element, number>();

function isOverlayLike(el: Element): boolean {
  if (el.matches(OVERLAY_SELECTOR)) return true;
  // Overlay "thủ công": fixed + phủ toàn màn hình.
  const style = getComputedStyle(el);
  if (style.position !== "fixed") return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= window.innerWidth - 2 && rect.height >= window.innerHeight - 2;
}

function anyModalOpen(): boolean {
  return !!document.querySelector(OPEN_SELECTOR);
}

/** Gỡ mọi overlay đã đóng nhưng còn kẹt trong DOM. */
function sweepStaleOverlays(force = false) {
  const now = Date.now();
  const nodes = document.querySelectorAll<HTMLElement>(
    "[data-state='closed']," + OVERLAY_SELECTOR,
  );
  nodes.forEach((el) => {
    const state = el.getAttribute("data-state");
    // Chỉ coi là "mồ côi" khi: state=closed, hoặc (khi force) là overlay thật
    // (khớp OVERLAY_SELECTOR) mà không hề mở.
    const closed =
      state === "closed" || (force && state !== "open" && el.matches(OVERLAY_SELECTOR));
    if (!closed) {
      closedSince.delete(el);
      return;
    }
    if (!isOverlayLike(el)) return;
    const since = closedSince.get(el);
    if (since === undefined) {
      closedSince.set(el, now);
      return;
    }
    if (force || now - since > STALE_MS) {
      closedSince.delete(el);
      el.remove();
    }
  });
}

/** Trả body/html về trạng thái sạch khi không còn popup nào mở. */
function cleanBodyIfIdle(force = false) {
  if (!force && anyModalOpen()) return;
  const body = document.body;
  const html = document.documentElement;
  BODY_MODAL_CLASSES.forEach((c) => {
    body.classList.remove(c);
    html.classList.remove(c);
  });
  if (body.style.pointerEvents === "none") body.style.removeProperty("pointer-events");
  if (body.style.position === "fixed") {
    const top = parseInt(body.style.top || "0", 10);
    body.style.removeProperty("position");
    body.style.removeProperty("top");
    body.style.removeProperty("left");
    body.style.removeProperty("right");
    body.style.removeProperty("width");
    body.style.removeProperty("overflow");
    body.style.removeProperty("touch-action");
    body.style.removeProperty("overscroll-behavior");
    if (Number.isFinite(top) && top < 0) window.scrollTo(0, -top);
  }
  if (body.style.overflow === "hidden") body.style.removeProperty("overflow");
  if (body.style.touchAction === "none") body.style.removeProperty("touch-action");
  // vaul shouldScaleBackground để lại transform trên wrapper nếu exit bị treo.
  document
    .querySelectorAll<HTMLElement>("[data-vaul-drawer-wrapper],[vaul-drawer-wrapper]")
    .forEach((el) => {
      if (!anyModalOpen()) {
        el.style.removeProperty("transform");
        el.style.removeProperty("border-radius");
        el.style.removeProperty("overflow");
        el.style.removeProperty("transition-property");
      }
    });
}

export function runOverlaySweep(force = false) {
  if (typeof document === "undefined") return;
  sweepStaleOverlays(force);
  cleanBodyIfIdle(force);
}

/** Gọi khi đổi route: mọi overlay đang tồn tại đều là mồ côi. */
export function purgeOverlaysOnRouteChange() {
  if (typeof document === "undefined") return;
  runOverlaySweep(false);
  // Sau khi route đổi, chờ 1 nhịp rồi ép dọn phần còn kẹt.
  window.setTimeout(() => runOverlaySweep(!anyModalOpen()), 350);
}

export function installOverlayGuard(): () => void {
  if (typeof document === "undefined") return () => {};

  const tick = () => runOverlaySweep(false);
  const interval = window.setInterval(tick, 1000);

  const onVisibility = () => {
    if (document.visibilityState === "visible") {
      // Safari iOS: quay lại tab → animation exit đã chết, ép dọn.
      runOverlaySweep(!anyModalOpen());
    }
  };
  const onPageShow = () => runOverlaySweep(!anyModalOpen());

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pageshow", onPageShow);
  window.addEventListener("popstate", purgeOverlaysOnRouteChange);
  window.addEventListener("animationend", tick, true);
  window.addEventListener("transitionend", tick, true);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pageshow", onPageShow);
    window.removeEventListener("popstate", purgeOverlaysOnRouteChange);
    window.removeEventListener("animationend", tick, true);
    window.removeEventListener("transitionend", tick, true);
  };
}
