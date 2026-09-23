/**
 * multiplier-total — kho lưu "Tổng Nhân" của lượt quét hiện tại.
 *
 * Badge ở đầu trang và HUD bản đồ nằm ở 2 cây component khác nhau nên dùng
 * store nhỏ (module scope) để chia sẻ số cộng dồn + vị trí badge (điểm đến của
 * icon xN bay lên).
 */

let total = 0;
const listeners = new Set<(v: number) => void>();
let badgeEl: HTMLElement | null = null;

export function getMultiplierTotal(): number {
  return total;
}

export function subscribeMultiplierTotal(fn: (v: number) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  listeners.forEach((fn) => fn(total));
}

/** Cộng dồn hệ số nhân vừa nhặt được (x2 + x5 = x7). */
export function addMultiplierTotal(value: number): number {
  const v = Number(value) || 0;
  if (v <= 0) return total;
  total += v;
  emit();
  return total;
}

/** Đặt lại về 0 — gọi khi bắt đầu lượt quét mới. */
export function resetMultiplierTotal() {
  if (total === 0) return;
  total = 0;
  emit();
}

/** Badge tự đăng ký node của mình để icon xN biết bay tới đâu. */
export function registerMultiplierBadge(el: HTMLElement | null) {
  badgeEl = el;
}

/** Tâm badge theo toạ độ viewport (dùng cho hiệu ứng bay). */
export function getMultiplierBadgePoint(): { x: number; y: number } | null {
  if (!badgeEl) return null;
  const r = badgeEl.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
