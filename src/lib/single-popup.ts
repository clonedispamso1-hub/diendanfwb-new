/**
 * single-popup — đảm bảo CHỈ 1 popup nhỏ (avatar/menu nổi) tồn tại cùng lúc.
 *
 * Thuần client, không query, không realtime. Khi một popup mở, popup cũ được
 * gọi close() ngay lập tức.
 */

let activeClose: (() => void) | null = null;

/** Đăng ký popup vừa mở; popup đang mở trước đó sẽ tự đóng. */
export function acquirePopup(close: () => void) {
  if (activeClose && activeClose !== close) {
    const prev = activeClose;
    activeClose = null;
    try { prev(); } catch { /* noop */ }
  }
  activeClose = close;
}

/** Gỡ đăng ký khi popup đóng. */
export function releasePopup(close: () => void) {
  if (activeClose === close) activeClose = null;
}

/** Đóng popup đang mở (nếu có). */
export function closeActivePopup() {
  const prev = activeClose;
  activeClose = null;
  if (prev) { try { prev(); } catch { /* noop */ } }
}
