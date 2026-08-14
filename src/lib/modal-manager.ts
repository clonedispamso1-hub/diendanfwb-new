import { useEffect } from "react";

/**
 * Modal manager thống nhất cho toàn bộ website.
 *
 * Quy tắc: KHÔNG bao giờ để một popup mới nằm DƯỚI popup đang mở.
 * Cách xử lý mặc định: đóng toàn bộ popup đang mở TRƯỚC, rồi mới mở popup mới
 * (ví dụ: bấm avatar trong popup Bình luận → đóng Bình luận → mở Hồ sơ).
 *
 * Các popup tự viết (portal thủ công) đăng ký bằng `useOverlayAutoClose`.
 * Các popup dùng Radix (Dialog/Sheet/Drawer/AlertDialog) được đóng qua phím
 * Escape tổng hợp mà Radix vốn đã lắng nghe.
 */

export const OVERLAY_CLOSE_EVENT = "app:close-overlays";

/** Thang z-index thống nhất — dùng chung cho mọi lớp phủ. */
export const Z_LAYERS = {
  overlay: 1000,
  modal: 2000,
  alert: 3000,
  tooltip: 3500,
  toast: 4000,
  sheet: 9990,
  top: 100000,
} as const;

type CloseOptions = {
  /** Không đóng popup có id này (dùng khi popup tự mở popup con). */
  except?: string;
  /** Bỏ qua bước gửi Escape cho Radix. */
  skipRadix?: boolean;
};

/**
 * Đóng mọi popup/modal/sheet đang mở.
 * Gọi ngay TRƯỚC khi mở một popup mới thuộc lớp khác (vd: Hồ sơ).
 */
export function closeAllOverlays(options: CloseOptions = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(OVERLAY_CLOSE_EVENT, { detail: { except: options.except ?? null } }),
  );
  if (!options.skipRadix) {
    // Radix (Dialog/Sheet/Drawer/AlertDialog/Popover) đóng khi nhận Escape.
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
    );
  }
}

/**
 * Đăng ký một popup tự viết vào modal manager.
 * Khi có popup khác yêu cầu "đóng hết", popup này sẽ tự đóng.
 */
export function useOverlayAutoClose(open: boolean, onClose: () => void, id?: string) {
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const handler = (e: Event) => {
      const except = (e as CustomEvent).detail?.except as string | null | undefined;
      if (id && except && except === id) return;
      onClose();
    };
    window.addEventListener(OVERLAY_CLOSE_EVENT, handler as EventListener);
    return () => window.removeEventListener(OVERLAY_CLOSE_EVENT, handler as EventListener);
  }, [open, onClose, id]);
}

/**
 * Bọc một hành động "mở popup khác" để luôn đóng popup hiện tại trước.
 */
export function openAfterClosing<T extends unknown[]>(
  closeCurrent: (() => void) | undefined,
  openNext: ((...args: T) => void) | undefined,
) {
  return (...args: T) => {
    closeCurrent?.();
    closeAllOverlays({ skipRadix: true });
    // Chờ 1 frame để popup cũ unmount xong rồi mới mở popup mới.
    if (typeof window === "undefined") {
      openNext?.(...args);
      return;
    }
    window.requestAnimationFrame(() => openNext?.(...args));
  };
}
