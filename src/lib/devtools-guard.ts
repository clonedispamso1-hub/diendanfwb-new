/**
 * DevTools Guard — bảo vệ nhẹ (deterrence), KHÔNG phải bảo mật thật.
 *
 * NGUYÊN TẮC:
 * - KHÔNG logout, KHÔNG ban, KHÔNG khóa IP/thiết bị, KHÔNG ghi/xóa dữ liệu.
 * - KHÔNG dùng `debugger`, KHÔNG vòng lặp nặng, KHÔNG chuyển about:blank.
 * - Phím tắt + chuột phải: chặn NGAY khi mount (tín hiệu chính, đồng bộ).
 * - Phát hiện DevTools: MỘT tín hiệu duy nhất, đo cẩn thận —
 *   chênh lệch kích thước cửa sổ đã CHUẨN HÓA theo mức phóng to (zoom),
 *   so với MỐC NỀN đo lúc tải trang, và phải ỔN ĐỊNH nhiều lần liên tiếp.
 *   → Zoom, đổi kích thước cửa sổ, thanh công cụ tiện ích, layout responsive
 *     KHÔNG bị coi là bằng chứng.
 *   → DevTools mở ở cửa sổ riêng (undocked) không phát hiện được: chấp nhận
 *     bỏ lọt còn hơn báo nhầm người dùng thật.
 * - Không chặn gõ phím thường, không chặn IME tiếng Việt, không chặn copy/paste.
 * - Trong ô nhập liệu (input/textarea/contenteditable) → không chặn chuột phải.
 * - Fail-open tuyệt đối: lỗi bất kỳ → không làm gì.
 */

/** Chênh lệch (px đã chuẩn hóa) so với mốc nền mới được coi là đáng ngờ. */
const GAP_DELTA_THRESHOLD = 160;
/** Số lần đo liên tiếp phải cùng kết luận "có" trước khi hành động. */
const REQUIRED_CONSECUTIVE = 2;
const DEBOUNCE_MS = 120;
const POLL_MS = 200;
/** Sau khi cửa sổ vừa thay đổi, chờ ổn định rồi mới tin kết quả đo. */
const SETTLE_MS = 250;


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


function isEditableTarget(el: EventTarget | null): boolean {
  try {
    const node = el as HTMLElement | null;
    if (!node || typeof node.closest !== "function") return false;
    return !!node.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
  } catch {
    return false;
  }
}

function isDevtoolsShortcut(e: KeyboardEvent): boolean {
  // Bỏ qua khi IME đang soạn (tiếng Việt) — không đụng vào luồng gõ.
  if (e.isComposing || e.keyCode === 229) return false;
  const key = (e.key || "").toLowerCase();
  if (key === "f12") return true;
  const ctrlLike = e.ctrlKey || e.metaKey;
  if (ctrlLike && e.shiftKey && (key === "i" || key === "j" || key === "c")) return true;
  // Ctrl+U = gạch chân trong ô soạn thảo → chỉ chặn ngoài ô nhập liệu.
  if (ctrlLike && !e.shiftKey && key === "u" && !isEditableTarget(e.target)) return true;
  return false;
}

type Sample = { gapW: number; gapH: number; outerW: number; outerH: number };

/**
 * Đo chênh lệch kích thước ngoài/trong, ĐÃ CHUẨN HÓA theo mức phóng to.
 * Khi người dùng zoom, innerWidth (px CSS) co lại nhưng devicePixelRatio tăng
 * tương ứng → nhân lại để số đo không đổi. Nhờ vậy zoom 100–200% không tạo
 * chênh lệch giả.
 */
function measure(baseDpr: number): Sample | null {
  try {
    if (!window.outerWidth || !window.outerHeight) return null;
    const dpr = window.devicePixelRatio || 1;
    const z = baseDpr > 0 ? dpr / baseDpr : 1;
    if (!Number.isFinite(z) || z <= 0) return null;
    return {
      gapW: window.outerWidth - window.innerWidth * z,
      gapH: window.outerHeight - window.innerHeight * z,
      outerW: window.outerWidth,
      outerH: window.outerHeight,
    };
  } catch {
    return null;
  }
}


/**
 * Cài phần CHẶN PHÍM TẮT + CHUỘT PHẢI. Đồng bộ, không phụ thuộc mạng/DB.
 * Trả về hàm gỡ.
 */
export function installInputBlocking(): () => void {
  if (typeof window === "undefined") return () => {};

  const onKeyDown = (e: KeyboardEvent) => {
    if (!isDevtoolsShortcut(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onContextMenu = (e: MouseEvent) => {
    if (isEditableTarget(e.target)) return; // giữ menu dán/sửa trong ô nhập liệu
    e.preventDefault();
  };

  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("contextmenu", onContextMenu, true);

  return () => {
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("contextmenu", onContextMenu, true);
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
 * Cài phần PHÁT HIỆN DevTools.
 * Khi ĐỦ CHẮC CHẮN → gọi `onDetected()` (hiện màn hình cảnh báo trong ứng dụng).
 * Không bao giờ chuyển trang sang about:blank.
 *
 * Cách đo (một tín hiệu, nhiều lớp lọc):
 *  - Mốc nền = chênh lệch NHỎ NHẤT từng thấy (đã chuẩn hóa zoom). Viền cửa sổ,
 *    thanh công cụ trình duyệt, tiện ích mở rộng đều nằm trong mốc nền này.
 *  - Chỉ nghi ngờ khi chênh lệch VƯỢT mốc nền hơn GAP_DELTA_THRESHOLD px.
 *  - Bỏ qua mọi phép đo trong lúc cửa sổ còn đang thay đổi (kéo, zoom, responsive).
 *  - Phải nghi ngờ liên tiếp REQUIRED_CONSECUTIVE lần mới hành động;
 *    chỉ cần một lần bình thường là đếm lại từ đầu.
 */
export function installDevtoolsDetection(onDetected: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const baseDpr = window.devicePixelRatio || 1;
  let baselineW = Number.POSITIVE_INFINITY;
  let baselineH = Number.POSITIVE_INFINITY;
  let streak = 0;
  let fired = false;
  let lastOuterW = 0;
  let lastOuterH = 0;
  let lastChangeAt = Date.now();
  let debounce: number | null = null;

  const check = () => {
    if (fired) return;
    try {
      if (document.visibilityState !== "visible") return;
    } catch {
      return;
    }
    const s = measure(baseDpr);
    if (!s) return;

    // Cửa sổ vừa đổi kích thước → chờ ổn định, không kết luận gì.
    if (s.outerW !== lastOuterW || s.outerH !== lastOuterH) {
      lastOuterW = s.outerW;
      lastOuterH = s.outerH;
      lastChangeAt = Date.now();
      streak = 0;
      return;
    }
    if (Date.now() - lastChangeAt < SETTLE_MS) return;

    // Cập nhật mốc nền bằng giá trị nhỏ nhất quan sát được.
    if (s.gapW < baselineW) baselineW = s.gapW;
    if (s.gapH < baselineH) baselineH = s.gapH;

    const suspicious =
      s.gapW - baselineW > GAP_DELTA_THRESHOLD || s.gapH - baselineH > GAP_DELTA_THRESHOLD;

    if (!suspicious) {
      streak = 0;
      return;
    }
    streak += 1;
    if (streak >= REQUIRED_CONSECUTIVE) {
      fired = true;
      try {
        onDetected();
      } catch {
        /* ignore */
      }
    }
  };

  const onResize = () => {
    streak = 0;
    lastChangeAt = Date.now();
    if (debounce !== null) window.clearTimeout(debounce);
    debounce = window.setTimeout(check, DEBOUNCE_MS);
  };

  window.addEventListener("resize", onResize, { passive: true });
  const poll = window.setInterval(check, POLL_MS);
  const initialCheck = window.setTimeout(check, DEBOUNCE_MS);

  return () => {
    if (debounce !== null) window.clearTimeout(debounce);
    window.clearTimeout(initialCheck);
    window.clearInterval(poll);
    window.removeEventListener("resize", onResize);
  };
}

/** Tương thích ngược: cài cả hai phần (không hành động khi phát hiện). */
export function installDevtoolsGuard(onDetected: () => void = () => {}): () => void {
  const a = installInputBlocking();
  const b = installDevtoolsDetection(onDetected);
  return () => {
    a();
    b();
  };
}

