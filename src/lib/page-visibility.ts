/**
 * page-visibility — MỘT nơi duy nhất quyết định "trang có đang được nhìn không".
 *
 * Mục tiêu: cắt triệt để mọi tiến trình chạy ngầm (setInterval, polling,
 * realtime) khi người dùng chuyển tab / thu nhỏ trình duyệt / rời trang.
 * Chỉ khi `document.visibilityState === "visible"` mới cho phép gọi API lại.
 */

export function isPageVisible(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible";
}

type Cb = () => void;
const visibleCbs = new Set<Cb>();
const hiddenCbs = new Set<Cb>();

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const set = isPageVisible() ? visibleCbs : hiddenCbs;
    set.forEach((cb) => {
      try {
        cb();
      } catch {
        /* noop */
      }
    });
  });
}

/** Chạy `cb` mỗi khi tab hiện trở lại. Trả về hàm gỡ. */
export function onPageVisible(cb: Cb): () => void {
  visibleCbs.add(cb);
  return () => visibleCbs.delete(cb);
}

/** Chạy `cb` mỗi khi tab bị ẩn. Trả về hàm gỡ. */
export function onPageHidden(cb: Cb): () => void {
  hiddenCbs.add(cb);
  return () => hiddenCbs.delete(cb);
}

export interface VisibleIntervalOptions {
  /** Gọi ngay khi khởi tạo (nếu tab đang hiện). Mặc định false. */
  immediate?: boolean;
  /**
   * Gọi lại ngay khi tab hiện trở lại nếu đã quá hạn một chu kỳ.
   * Mặc định true — tránh dữ liệu cũ mà vẫn không spam.
   */
  runOnVisible?: boolean;
}

/**
 * setInterval "có ý thức": timer bị **clear hoàn toàn** khi tab ẩn và chỉ được
 * tạo lại khi tab hiện. Không có tick nào chạy ngầm.
 *
 * Trả về hàm dừng (idempotent).
 */
export function visibleInterval(
  fn: () => void | Promise<void>,
  ms: number,
  { immediate = false, runOnVisible = true }: VisibleIntervalOptions = {},
): () => void {
  if (typeof window === "undefined") return () => {};

  let timer: ReturnType<typeof setInterval> | null = null;
  let lastRun = 0;
  let stopped = false;

  const run = () => {
    if (stopped || !isPageVisible()) return;
    lastRun = Date.now();
    void fn();
  };

  const start = () => {
    if (stopped || timer !== null) return;
    timer = setInterval(run, ms);
  };
  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const offVisible = onPageVisible(() => {
    if (runOnVisible && Date.now() - lastRun >= ms) run();
    start();
  });
  const offHidden = onPageHidden(stopTimer);

  if (isPageVisible()) {
    if (immediate) run();
    start();
  }

  return () => {
    stopped = true;
    stopTimer();
    offVisible();
    offHidden();
  };
}

/**
 * Bọc một hàm gọi API: bỏ qua hoàn toàn khi tab đang ẩn.
 */
export function whenVisible<T extends (...args: never[]) => unknown>(fn: T) {
  return ((...args: Parameters<T>) => {
    if (!isPageVisible()) return undefined;
    return fn(...args);
  }) as (...args: Parameters<T>) => ReturnType<T> | undefined;
}
