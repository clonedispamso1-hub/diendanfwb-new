/**
 * Cấu hình R2 TẠM THỜI cho phiên test.
 *
 * Chỉ nằm trong RAM của tab đang mở (biến module). KHÔNG localStorage,
 * KHÔNG sessionStorage, KHÔNG database, KHÔNG ghi ra file/bundle.
 * Tải lại trang là mất.
 */

export interface R2SessionConfig {
  endpoint: string;
  bucket: string;
  publicDomain: string;
  accessKeyId: string;
  secretAccessKey: string;
}

let current: R2SessionConfig | null = null;

export function setR2SessionConfig(cfg: R2SessionConfig | null) {
  current = cfg;
  try {
    window.dispatchEvent(new CustomEvent("app:r2-session-config", { detail: { active: !!cfg } }));
  } catch {
    /* ignore */
  }
}

export function getR2SessionConfig(): R2SessionConfig | null {
  return current;
}

export function hasR2SessionConfig(): boolean {
  return !!current;
}
