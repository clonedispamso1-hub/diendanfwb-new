/**
 * withTimeout — bọc mọi Promise của flow đăng nhập.
 *
 * Nguyên tắc: KHÔNG bao giờ chờ vô hạn. Nếu Database / RPC không phản hồi
 * trong `ms`, promise sẽ reject với TimeoutError để UI hiển thị lỗi thay vì
 * treo mãi ở "Đang đăng nhập…".
 */
export class TimeoutError extends Error {
  constructor(public step: string, public ms: number) {
    super(`Hết thời gian chờ ở bước "${step}" (${ms}ms). Máy chủ không phản hồi.`);
    this.name = "TimeoutError";
  }
}

export function withTimeout<T>(step: string, promise: PromiseLike<T>, ms = 12_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn(`[login] TIMEOUT tại bước: ${step} sau ${ms}ms`);
      reject(new TimeoutError(step, ms));
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Đo thời gian + timeout + catch cho một bước login. Không bao giờ throw. */
export async function timedStep<T>(
  step: string,
  run: () => PromiseLike<T>,
  ms = 12_000,
): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  const label = `[login] ${step}`;
  console.time(label);
  try {
    const value = await withTimeout(step, run(), ms);
    return { ok: true, value };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`${label} FAILED:`, err.message);
    return { ok: false, error: err };
  } finally {
    console.timeEnd(label);
  }
}
