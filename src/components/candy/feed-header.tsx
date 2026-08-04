import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import "@/styles/favorites-page.css";

export type PrimaryTab = "community" | "foryou" | "admin";
// Note: "admin" (Quan Trọng) is kept in the type for backwards-compat with
// existing callers/state, but it is no longer rendered as a Home tab —
// Quan Trọng lives in the bottom navigation instead.
// Kept for backwards compatibility with callers that still pass a `secondary` prop.
// Topic separation has been removed — secondary tabs are ignored now.
export type SecondaryTab = "important" | "fwb" | "ons" | "dating";

interface FeedHeaderProps {
  primary: PrimaryTab;
  onPrimaryChange: (tab: PrimaryTab) => void;
  /** @deprecated */
  secondary?: SecondaryTab;
  /** @deprecated */
  onSecondaryChange?: (tab: SecondaryTab) => void;
  onSearch?: () => void;
  onNotifications?: () => void;
  notificationCount?: number;
  /** chấm đỏ nhỏ trên tab "Yêu thích" khi hôm nay có người mới xem hồ sơ */
  favoriteDot?: boolean;
}


const PRIMARY_TABS: { key: PrimaryTab; label: string; accent: string }[] = [
  { key: "community", label: "Vào Cộng Đồng", accent: "hsl(211 100% 50%)" },
  { key: "foryou", label: "Trang Chủ", accent: "hsl(211 100% 50%)" },
];

export function FeedHeader({
  primary,
  onPrimaryChange,
  favoriteDot,
}: FeedHeaderProps) {
  const [collapsed, setCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState<{ x: number; width: number; accent: string }>({
    x: 0,
    width: 0,
    accent: PRIMARY_TABS[1].accent,
  });

  // Position the sliding pill indicator behind the active tab.
  const measure = () => {
    const btn = tabRefs.current[primary];
    const container = containerRef.current;
    if (!btn || !container) return;
    const bRect = btn.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const x = bRect.left - cRect.left;
    const width = bRect.width;
    const accent = PRIMARY_TABS.find((t) => t.key === primary)?.accent ?? indicator.accent;
    setIndicator({ x, width, accent });
  };

  useLayoutEffect(() => {
    measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    // Re-measure after fonts settle
    const t = window.setTimeout(measure, 60);
    return () => {
      window.removeEventListener("resize", onResize);
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let ticking = false;
    const check = () => {
      ticking = false;
      const y =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.querySelector<HTMLElement>(".page-body")?.scrollTop ||
        0;
      setCollapsed(y > 60);
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(check);
      }
    };
    const pageBody = document.querySelector<HTMLElement>(".page-body");
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    pageBody?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      pageBody?.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div className={`feed-header${collapsed ? " is-collapsed" : ""}`}>
      <div className="feed-header__tier1">
        <div
          ref={containerRef}
          className="feed-tabs"
          role="tablist"
          aria-label="Bộ lọc feed"
        >
          {PRIMARY_TABS.map((t) => {
            const active = primary === t.key;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[t.key] = el;
                }}
                type="button"
                role="tab"
                aria-selected={active}
                className={`feed-tab${active ? " is-active" : ""}`}
                onClick={() => onPrimaryChange(t.key)}
              >
                <span className="feed-tab__label">{t.label}</span>
                {t.key === "community" && favoriteDot && (
                  <span className="feed-tab__dot" aria-hidden />
                )}
              </button>
            );
          })}
          <motion.span
            className="feed-tabs__indicator"
            aria-hidden
            animate={{ x: indicator.x, width: indicator.width }}
            transition={{ type: "tween", duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>
    </div>
  );
}
