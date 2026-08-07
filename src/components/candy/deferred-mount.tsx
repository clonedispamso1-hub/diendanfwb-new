import { useEffect, useState, type ReactNode } from "react";

/**
 * Mount children only after the browser is idle (post first paint).
 *
 * Dùng cho các overlay/popup host luôn "sống" trong cây React nhưng không
 * cần thiết cho lần vẽ đầu tiên. Giúp giảm thời gian tương tác (TTI) và
 * lượng JS phải chạy ngay khi mở web trên máy yếu.
 */
export function DeferredMount({
  children,
  timeout = 2000,
}: {
  children: ReactNode;
  timeout?: number;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) setReady(true);
    };

    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;

    if (ric) {
      const id = ric(run, { timeout });
      return () => {
        cancelled = true;
        (window as any).cancelIdleCallback?.(id);
      };
    }

    const id = window.setTimeout(run, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [timeout]);

  if (!ready) return null;
  return <>{children}</>;
}
