/**
 * Client-side DevTools / source protection, started once at app load for every
 * route, guest or signed-in. Layers:
 *  1. keyboard: DevTools shortcuts are cancelled and lock immediately;
 *     Ctrl/Cmd+U and Ctrl/Cmd+S are cancelled.
 *  2. context menu disabled everywhere (no Inspect / View Source entry).
 *  3. open-DevTools detection (debugger pause timing + docked-size ratio) shows
 *     a blocking overlay until DevTools closes. Best effort: a browser can
 *     always bypass client-side code (e.g. deactivated breakpoints + undocked).
 */
const EXCLUDED_PREFIXES = [
  "/blocked",
  "/maintenance",
  "/locked",
  "/bangchudeptraicukuku88819283hqwyegasgdasdihoiqwu",
  "/qa-explore",
  "/__test",
  "/api",
];

export function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Thiết bị cảm ứng thật (mobile/tablet, mobile Safari) → bỏ qua hoàn toàn.
 * LƯU Ý: KHÔNG dùng innerWidth ở đây — cửa sổ desktop hẹp (<1024px) trước đây
 * bị coi nhầm là mobile khiến toàn bộ bảo vệ bị tắt.
 */
export function isMobileLike(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)")?.matches === true;
    const noHover = window.matchMedia?.("(hover: none)")?.matches === true;
    const touch = (navigator.maxTouchPoints ?? 0) > 0;
    return (coarse && noHover) || (touch && coarse);
  } catch {
    return true;
  }
}


function isDevtoolsShortcut(e: KeyboardEvent): boolean {
  // Bỏ qua khi IME đang soạn (tiếng Việt) — không đụng vào luồng gõ.
  if (e.isComposing || e.keyCode === 229) return false;
  const key = (e.key || "").toLowerCase();
  // e.code = phím vật lý → bắt được cả macOS (Option làm đổi e.key thành ký tự lạ).
  const code = e.code || "";
  if (key === "f12" || code === "F12") return true;
  const ctrlLike = e.ctrlKey || e.metaKey;
  const is = (k: string) => key === k || code === `Key${k.toUpperCase()}`;
  // Chrome/Edge: Ctrl+Shift+I/J/C · Firefox: Ctrl+Shift+K/E/M
  if (ctrlLike && e.shiftKey && ["i", "j", "c", "k", "e", "m"].some(is)) return true;
  // macOS: Cmd+Option+I/J/C/U
  if (e.metaKey && e.altKey && ["i", "j", "c", "u"].some(is)) return true;
  return false;
}

export function installInputBlocking(): () => void {
  if (typeof window === "undefined") return () => {};

  const onKeyDown = (e: KeyboardEvent) => {
    const key = (e.key || "").toLowerCase();
    const sourceOrSave = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey
      && (key === "u" || key === "s");
    if (!isDevtoolsShortcut(e) && !sourceOrSave) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("contextmenu", onContextMenu, true);
  document.addEventListener("contextmenu", onContextMenu, true);

  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("contextmenu", onContextMenu, true);
    document.removeEventListener("contextmenu", onContextMenu, true);
  };
}

/**
 * Bẫy phím tắt DevTools: F12, Ctrl/Cmd+Shift+I/J/C, Ctrl+U.
 * Gọi `onDetected()` NGAY trong chính sự kiện keydown — không chờ, không đếm giờ.
 */
export function installShortcutTrap(onDetected: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  let fired = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (fired || !isDevtoolsShortcut(e)) return;
    e.preventDefault();
    e.stopPropagation();
    fired = true;
    try {
      onDetected();
    } catch {
      /* ignore */
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
  };
}

/**
 * Docked DevTools shrink only one axis of the viewport; browser zoom shrinks
 * both proportionally. Comparing the two ratios avoids zoom false positives.
 * Touch devices are skipped (resize / orientation / on-screen keyboard).
 */
export function isDockedDevtoolsSize(
  w: Pick<Window, "innerWidth" | "innerHeight" | "outerWidth" | "outerHeight"> = window,
): boolean {
  const { innerWidth: iw, innerHeight: ih, outerWidth: ow, outerHeight: oh } = w;
  if (!ow || !oh || !iw || !ih) return false;
  const rw = iw / ow;
  const rh = ih / oh;
  const right = ow - iw > 160 && rw < rh - 0.15;
  const bottom = oh - ih > 250 && rh < rw - 0.15;
  return right || bottom;
}

/** A `debugger` statement only pauses while DevTools is open (docked or undocked). */
function debuggerPaused(): boolean {
  const t = performance.now();
  // eslint-disable-next-line no-debugger
  debugger;
  return performance.now() - t > 100;
}

/**
 * Reports DevTools open/closed. Runs immediately (catches DevTools opened
 * before load), then every second and on resize. Size must persist for two
 * samples; the debugger signal is direct evidence.
 */
export function installDevtoolsDetection(
  onChange: (open: boolean) => void,
  opts: { intervalMs?: number; checkDebugger?: () => boolean; checkSize?: () => boolean } = {},
): () => void {
  if (typeof window === "undefined") return () => {};
  const checkDebugger = opts.checkDebugger ?? debuggerPaused;
  const checkSize = opts.checkSize ?? (() => !isMobileLike() && isDockedDevtoolsSize());
  let sizeHits = 0;
  let open = false;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    let paused = false;
    try { paused = checkDebugger(); } catch { /* ignore */ }
    let sized = false;
    try { sized = checkSize(); } catch { /* ignore */ }
    sizeHits = sized ? sizeHits + 1 : 0;
    const next = paused || sizeHits >= 2;
    if (next !== open) {
      open = next;
      try { onChange(open); } catch { /* ignore */ }
    }
  };

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(tick, 250);
  };
  const id = setInterval(tick, opts.intervalMs ?? 1000);
  window.addEventListener("resize", onResize);
  tick();
  return () => {
    stopped = true;
    clearInterval(id);
    clearTimeout(resizeTimer);
    window.removeEventListener("resize", onResize);
  };
}

/**
 * DevTools detected → the page becomes a fully blank white document.
 * Every child of <html> (head + body, i.e. all site UI/styles) is detached and
 * replaced by an empty head/body; the detached nodes are kept in memory only so
 * the site can be restored when DevTools closes. No overlay, no text, no redirect.
 */
let savedNodes: Node[] | null = null;
let savedHtmlAttrs: { name: string; value: string }[] = [];

export function isBlanked(): boolean {
  return savedNodes !== null;
}

export function showDevtoolsLock(): void {
  if (typeof document === "undefined" || savedNodes) return;
  const html = document.documentElement;
  savedNodes = Array.from(html.childNodes);
  savedHtmlAttrs = Array.from(html.attributes).map((a) => ({ name: a.name, value: a.value }));
  for (const n of savedNodes) html.removeChild(n);
  for (const a of savedHtmlAttrs) html.removeAttribute(a.name);
  const head = document.createElement("head");
  const title = document.createElement("title");
  title.textContent = " ";
  head.appendChild(title);
  const body = document.createElement("body");
  body.style.cssText = "margin:0;background:#fff";
  html.style.cssText = "background:#fff";
  html.appendChild(head);
  html.appendChild(body);
}

export function hideDevtoolsLock(): void {
  if (typeof document === "undefined" || !savedNodes) return;
  const html = document.documentElement;
  while (html.firstChild) html.removeChild(html.firstChild);
  html.removeAttribute("style");
  for (const a of savedHtmlAttrs) html.setAttribute(a.name, a.value);
  for (const n of savedNodes) html.appendChild(n);
  savedNodes = null;
  savedHtmlAttrs = [];
}

/** Kept for API compatibility: now blanks the current page instead of navigating away. */
export function redirectToBlank(): void {
  showDevtoolsLock();
}

/** Console-formatting probes are unreliable in current browsers: kept as a no-op. */
export function installConsoleDetection(_onDetected: () => void): () => void {
  return () => {};
}

/** Combined API: input blocking + shortcut blanking + open-DevTools blanking. */
export function installDevtoolsGuard(onShortcut: () => void = showDevtoolsLock): () => void {
  const stopInput = installInputBlocking();
  const stopShortcut = installShortcutTrap(onShortcut);
  const stopDetect = installDevtoolsDetection((open) => (open ? showDevtoolsLock() : hideDevtoolsLock()));
  return () => { stopInput(); stopShortcut(); stopDetect(); hideDevtoolsLock(); };
}

const GLOBAL_KEY = "__devtoolsProtectionStop";

/** Idempotent app-wide start; survives route changes, login/logout and re-renders. */
export function startDevtoolsProtection(): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as unknown as Record<string, (() => void) | undefined>;
  const existing = w[GLOBAL_KEY];
  if (existing) return existing;
  const stopGuard = installDevtoolsGuard();
  const stop = () => { stopGuard(); w[GLOBAL_KEY] = undefined; };
  w[GLOBAL_KEY] = stop;
  return stop;
}
