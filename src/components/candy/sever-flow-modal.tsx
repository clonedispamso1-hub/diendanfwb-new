import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBlocker } from "@tanstack/react-router";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import "@/styles/sever-flow.css";

/** One native top-layer modal for the entire timed flow, without gaps. */
export function SeverFlowModal({ children }: { children: (target: HTMLElement) => ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const historyAnchor = useRef<{ index: number } | null>(null);
  const lifecycle = useRef(0);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useBodyScrollLock();
  useBlocker({ shouldBlockFn: () => true, enableBeforeUnload: false });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const generation = ++lifecycle.current;
    dialog.showModal();
    setTarget(dialog);
    // Same-URL buffer catches Back even when Feed is the first app entry.
    const originalState = window.history.state;
    // Native history avoids notifying/remounting either application router.
    if (!historyAnchor.current) {
      const index = (originalState?.__TSR_index ?? 0) + 1;
      History.prototype.pushState.call(window.history,
        { ...originalState, __TSR_index: index }, "", window.location.href);
      historyAnchor.current = { index };
    }
    const anchor = window.history.state;
    const anchorUrl = window.location.href;
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const blockTraversal = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    navigation?.addEventListener("navigate", blockTraversal);
    let retiring = false;
    const holdBack = (event: PopStateEvent) => {
      // Legacy RouteMemory also listens on window: it must never see this pop.
      event.stopImmediatePropagation();
      if (retiring) {
        window.removeEventListener("popstate", holdBack, true);
        return;
      }
      const currentIndex = event.state?.__TSR_index;
      const anchorIndex = anchor?.__TSR_index;
      if (typeof currentIndex === "number" && typeof anchorIndex === "number") {
        const delta = anchorIndex - currentIndex;
        if (delta) History.prototype.pushState.call(window.history, anchor, "", anchorUrl);
      } else {
        History.prototype.pushState.call(window.history, anchor, "", anchorUrl);
      }
    };
    window.addEventListener("popstate", holdBack, true);
    const stopGesture = (event: Event) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    };
    dialog.addEventListener("touchmove", stopGesture, { passive: false });
    dialog.addEventListener("wheel", stopGesture, { passive: false });
    return () => {
      dialog.removeEventListener("touchmove", stopGesture);
      dialog.removeEventListener("wheel", stopGesture);
      dialog.close();
      navigation?.removeEventListener("navigate", blockTraversal);
      window.removeEventListener("popstate", holdBack, true);
      // StrictMode replays effects: never traverse history during that replay.
      queueMicrotask(() => {
        if (lifecycle.current !== generation) return;
        retiring = true;
        if (window.history.state?.__TSR_index === anchor?.__TSR_index) {
          window.addEventListener("popstate", holdBack, true);
          window.history.back();
        }
        historyAnchor.current = null;
      });
    };
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog ref={ref} className="sever-flow-modal" data-state="open" role="dialog"
      aria-label="Chuyển Sever" aria-modal="true"
      onCancel={(event) => event.preventDefault()}
      onKeyDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}>
      {target ? children(target) : null}
    </dialog>, document.body,
  );
}