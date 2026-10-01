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
import { supabase } from "@/lib/db/router";
import {
  installInputBlocking,
  installDevtoolsDetection,
  installShortcutTrap,
  isExcludedPath,
  isMobileLike,
} from "@/lib/devtools-guard";

// securityGate (cache 5 phút) + isAdminTriState (cache 60s) đã cache sẵn,
// nên 1 lần thử là đủ — retry nhiều lần chỉ tạo request dư khi mạng lỗi.
const MAX_ATTEMPTS = 1;
const RETRY_MS = 1500;

/**
 * Kết luận admin đã chốt — GẮN THEO uid của phiên hiện tại (module-level).
 * Đổi pathname với CÙNG một uid → không gọi lại kiểm tra admin, chỉ áp dụng
 * lại hành vi. Logout / đổi tài khoản (uid khác) → verdict cũ KHÔNG được tái
 * sử dụng, phải tính lại cho identity mới. null = chưa kết luận cho uid này.
 */
let concludedVerdict: { uid: string | null; verdict: boolean } | null = null;

/** uid hiện tại (đọc session local, không gọi mạng). null = khách chưa đăng nhập. */
async function currentUid(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? null;
  } catch {
    return null;
  }
}

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

  // Auth đổi (logout / đổi tài khoản / token mới) → verdict cũ không được
  // tái sử dụng: xoá ngay để lần effect sau tính lại cho identity mới.
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      concludedVerdict = null;
    });
    return () => data.subscription.unsubscribe();
  }, []);

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

    const installTier2 = () => {
      // Phím tắt DevTools → chặn NGAY trong chính sự kiện bàn phím.
      uninstallTrap = installShortcutTrap(() => {
        if (!cancelled) redirectToBlank();
      });
      uninstallDetect = installDevtoolsDetection(() => {
        if (!cancelled) redirectToBlank();
      });
    };

    void (async () => {
      // Danh tính hiện tại — verdict chỉ hợp lệ nếu cùng uid.
      const uid = await currentUid();
      if (cancelled) return;

      // Đã kết luận cho ĐÚNG uid này từ lần mount trước → không gọi lại.
      if (concludedVerdict && concludedVerdict.uid === uid) {
        if (concludedVerdict.verdict === true) {
          releaseForAdmin();
        } else {
          installTier2();
        }
        return;
      }
      // uid khác (logout / đổi tài khoản) → verdict cũ bỏ, tính lại.
      concludedVerdict = null;

      // Fast path: gate đã xác nhận admin (server-validated, có cache).
      try {
        const gate = await securityGate(false);
        if (gate.admin === true) {
          concludedVerdict = { uid, verdict: true };
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
        concludedVerdict = { uid, verdict: true };
        releaseForAdmin();
        return;
      }

      // TẦNG 2 — chỉ khi kết luận chắc chắn KHÔNG phải admin.
      if (verdict === false) {
        concludedVerdict = { uid, verdict: false };
        installTier2();
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
