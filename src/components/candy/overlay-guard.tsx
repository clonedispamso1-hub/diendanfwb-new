import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { installOverlayGuard, purgeOverlaysOnRouteChange } from "@/lib/overlay-guard";

/**
 * Mount 1 lần ở root. Không render gì — chỉ dọn overlay kẹt (iOS Safari).
 */
export function OverlayGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => installOverlayGuard(), []);
  useEffect(() => {
    purgeOverlaysOnRouteChange();
  }, [pathname]);

  return null;
}

export default OverlayGuard;
