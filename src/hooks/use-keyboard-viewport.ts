import { useEffect } from "react";

/**
 * Mobile keyboard-aware viewport for the fullscreen chat.
 *
 * iOS Safari does NOT resize the layout viewport when the on-screen keyboard
 * opens, so a `position: fixed; inset: 0` chat shell keeps its full height and
 * the composer ends up hidden behind the keyboard. Android Chrome resizes but
 * the timing is unreliable.
 *
 * We therefore mirror `window.visualViewport` into CSS variables on <html>:
 *  --chat-vvh : usable visual viewport height (px)
 *  --chat-vvt : visualViewport.offsetTop (px) — iOS shifts the visual viewport
 * plus a `kb-open` class on <html> while the keyboard is visible.
 *
 * The mobile stylesheet sizes the whole chat ancestry and `.chat-fixed` from
 * these values, so header / message list / composer share one flex column in
 * exactly the visible area. Desktop is unaffected.
 *
 * Also keeps the message list pinned to the bottom while the keyboard animates,
 * but only when the user was already near the bottom (never yanks someone who
 * is reading older messages).
 */
export function useKeyboardViewport(
  active: boolean,
  scrollRef?: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const vv = window.visualViewport ?? null;
    const scrollEl = scrollRef?.current ?? null;
    let raf = 0;
    let keepPinned = false;

    const isComposerFocused = () => {
      const focused = document.activeElement;
      return focused instanceof HTMLElement && !!focused.closest(".chat-fixed-composer");
    };

    const readPinnedState = () => {
      if (!scrollEl) return;
      keepPinned = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 180;
    };

    // Chỉ ghi CSS variable khi giá trị thực sự đổi → tránh style recalc thừa
    // (mỗi lần ghi lại làm trình duyệt tính lại layout khung chat).
    let lastH = -1;
    let lastTop = -1;
    let lastOpen: boolean | null = null;

    const apply = () => {
      const layoutH = window.innerHeight || 0;
      const h = vv ? vv.height : layoutH;
      const offsetTop = vv ? vv.offsetTop : 0;
      // Keyboard state only controls safe-area padding. Positioning itself uses
      // the exact visual viewport geometry and never a device-specific offset.
      const keyboardOpen = isComposerFocused() && Boolean(vv) && h + offsetTop < layoutH;

      const roundedH = Math.round(h);
      const roundedTop = Math.round(offsetTop);
      if (roundedH !== lastH) {
        lastH = roundedH;
        root.style.setProperty("--chat-vvh", `${roundedH}px`);
      }
      if (roundedTop !== lastTop) {
        lastTop = roundedTop;
        root.style.setProperty("--chat-vvt", `${roundedTop}px`);
      }
      if (keyboardOpen !== lastOpen) {
        lastOpen = keyboardOpen;
        root.classList.toggle("kb-open", keyboardOpen);
      }

      const el = scrollRef?.current;
      if (el && (keepPinned || keyboardOpen)) el.scrollTop = el.scrollHeight;
    };

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };

    apply();

    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    scrollEl?.addEventListener("scroll", readPinnedState, { passive: true });
    // visualViewport emits resize/scroll throughout the native keyboard change.
    // Focus events only request an immediate first/last measurement.
    const onFocusIn = () => {
      readPinnedState();
      schedule();
    };
    const onFocusOut = () => {
      schedule();
    };
    window.addEventListener("focusin", onFocusIn);
    window.addEventListener("focusout", onFocusOut);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      scrollEl?.removeEventListener("scroll", readPinnedState);
      window.removeEventListener("focusin", onFocusIn);
      window.removeEventListener("focusout", onFocusOut);
      root.classList.remove("kb-open");
      root.style.removeProperty("--chat-vvh");
      root.style.removeProperty("--chat-vvt");
    };
  }, [active, scrollRef]);
}
