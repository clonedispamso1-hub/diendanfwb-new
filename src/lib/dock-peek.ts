/**
 * dock-peek — thu gọn Floating Dock về mép phải khi người dùng cuộn.
 *
 * Thuần client, chỉ dùng scroll listener (passive) + setTimeout.
 * Không rAF loop, không animation liên tục.
 */
import { useEffect, useState } from "react";

/** true = dock đang thu gọn (chỉ lộ ~30%). */
export function useDockPeek(): boolean {
  const [peek, setPeek] = useState(false);

  useEffect(() => {
    let timer = 0;
    const onScroll = () => {
      setPeek((p) => (p ? p : true));
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setPeek(false), 600);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("scroll", onScroll, { capture: true } as EventListenerOptions);
    };
  }, []);

  return peek;
}
