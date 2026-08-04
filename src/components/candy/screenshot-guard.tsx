/**
 * ScreenshotGuard — DISABLED (dev mode).
 *
 * The previous strict implementation blocked common shortcuts
 * (PrintScreen, Ctrl/Cmd+C, Ctrl/Cmd+S, F12, devtools…) and showed
 * a fullscreen system alert dialog that broke copy/paste of text & UID
 * codes and interrupted the UX. It has been "frozen/paused" per product
 * decision — copy text, selection and standard browser shortcuts are
 * now fully enabled across the entire application.
 *
 * Image-drag protection is handled in CSS (`img { -webkit-user-drag: none }`
 * already applied to media in component styles) — no JS listeners required.
 */
export function ScreenshotGuard() {
  return null;
}
