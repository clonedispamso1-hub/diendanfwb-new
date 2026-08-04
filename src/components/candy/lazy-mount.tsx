import { useEffect, useRef, useState, type ReactNode } from "react";

interface LazyMountProps {
  /**
   * Approximate height used to reserve space before the child mounts.
   * Helps the browser keep scroll position stable.
   */
  minHeight?: number;
  /** Root margin used by IntersectionObserver. */
  rootMargin?: string;
  /** Children rendered only after the placeholder scrolls into view. */
  children: ReactNode;
}

/**
 * Mount `children` only when the wrapper first enters the viewport.
 * Once mounted, stays mounted (preserves scroll/state). Pairs nicely with
 * `content-visibility: auto` on long lists.
 *
 * Falls back to immediate mount when IntersectionObserver is unavailable.
 */
export function LazyMount({ minHeight = 320, rootMargin = "600px 0px", children }: LazyMountProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (mounted) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setMounted(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted, rootMargin]);

  return (
    <div ref={ref} className="cv-auto" style={mounted ? undefined : { minHeight }}>
      {mounted ? children : null}
    </div>
  );
}
