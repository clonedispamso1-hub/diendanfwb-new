/**
 * DevToolsGuard — mount 1 lần ở root.
 *
 * HAI TẦNG TÁCH RIÊNG:
 * 1) Chặn phím tắt + chuột phải: cài NGAY lập tức (đồng bộ), không chờ mạng/DB.
 *    Nếu sau đó xác nhận là admin → gỡ ngay.
 * 2) Phát hiện DevTools: chỉ cài khi CHẮC CHẮN không phải admin. Khi phát hiện
 *    → chuyển hướng NGAY sang about:blank, không cho tiếp tục dùng website,
 *    KHÔNG hiện màn hình cảnh báo/nút khôi phục.
 *
 * Route loại trừ (/blocked, /maintenance, /locked, khu quản trị, harness test) → bỏ qua.
 * Thiết bị cảm ứng (mobile/tablet, mobile Safari) → bỏ qua hoàn toàn.
 * Fail-open: mọi lỗi → không cài tầng phát hiện.
 */
import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { securityGate, isAdminTriState } from "@/lib/access-guard";
import {
  installInputBlocking,
  installDevtoolsDetection,
  installShortcutTrap,
  isExcludedPath,
  isMobileLike,
} from "@/lib/devtools-guard";

const MAX_ATTEMPTS = 4;
const RETRY_MS = 1500;

function redirectToBlank() {
  try {
    window.location.replace("about:blank");
  } catch {
    try {
      window.location.href = "about:blank";
    } catch {
      /* ignore */
    }
  }
}

export function DevToolsGuard() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isExcludedPath(pathname)) return;
    if (isMobileLike()) return;

    let cancelled = false;

    // TẦNG 1 — ngay lập tức, không phụ thuộc kết quả kiểm tra quyền.
    let uninstallInput: (() => void) | null = installInputBlocking();
    let uninstallDetect: (() => void) | null = null;
    let uninstallTrap: (() => void) | null = null;

    const releaseForAdmin = () => {
      uninstallInput?.();
      uninstallInput = null;
      uninstallTrap?.();
      uninstallTrap = null;
    };

    void (async () => {
      // Fast path: gate đã xác nhận admin (server-validated, có cache).
      try {
        const gate = await securityGate(false);
        if (gate.admin === true) {
          releaseForAdmin();
          return;
        }
      } catch {
        /* lỗi → tiếp tục, không kết luận */
      }
      if (cancelled) return;

      let verdict: boolean | null = null;
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;
        try {
          verdict = await isAdminTriState();
        } catch {
          verdict = null;
        }
        if (verdict !== null) break;
        await new Promise((r) => setTimeout(r, RETRY_MS));
      }
      if (cancelled) return;

      if (verdict === true) {
        releaseForAdmin();
        return;
      }

      // TẦNG 2 — chỉ khi kết luận chắc chắn KHÔNG phải admin.
      if (verdict === false) {
        // Phím tắt DevTools → chặn NGAY trong chính sự kiện bàn phím.
        uninstallTrap = installShortcutTrap(() => {
          if (!cancelled) redirectToBlank();
        });
        uninstallDetect = installDevtoolsDetection(() => {
          if (!cancelled) redirectToBlank();
        });
      }
    })();

    return () => {
      cancelled = true;
      uninstallInput?.();
      uninstallTrap?.();
      uninstallDetect?.();
    };
  }, [pathname]);

  return null;
}

export default DevToolsGuard;
