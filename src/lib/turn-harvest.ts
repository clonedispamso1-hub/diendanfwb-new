/**
 * turn-harvest — kho lưu "tổng thu hoạch" của lượt quét hiện tại.
 *
 * Dùng chung cho HUD bản đồ (nơi phát sinh sự kiện nhặt) và bảng tổng thu hoạch
 * dạng icon nổi ở đầu màn hình (nơi hiển thị). Reset khi bắt đầu lượt quét mới.
 */

export type HarvestUser = {
  id: string;
  name: string;
  avatar: string;
  /** Khoảng cách hiển thị, ví dụ "12.4" (km). */
  distance?: string;
};

export type HarvestState = {
  /** Tổng xu tích luỹ trong lượt (chưa nhân hệ số). */
  coins: number;
  /** Số lượng Ngọc Rồng theo số sao: { 1: 2, 3: 1 } */
  balls: Record<number, number>;
  /** Số Jackpot nhặt được trong lượt. */
  jackpot: number;
  /** Người chơi xung quanh vừa quét trúng. */
  users: HarvestUser[];
};

/** Mốc thời gian pha nổ thưởng cuối lượt (ms). */
export const FINALE_CHARGE_MS = 700;
export const FINALE_EXPLODE_MS = 1100;
export const FINALE_FLY_MS = 700;

/** Pha "nổ thưởng" cuối lượt: base ✕ multiplier = total. */
export type HarvestFinale = { base: number; multiplier: number; total: number } | null;

let state: HarvestState = { coins: 0, balls: {}, jackpot: 0, users: [] };
const listeners = new Set<(s: HarvestState) => void>();
let coinAnchor: HTMLElement | null = null;

/** Trạng thái hiện/ẩn của dàn Floating HUD + pha nổ thưởng. */
let sessionActive = false;
let finale: HarvestFinale = null;
const sessionListeners = new Set<(v: { active: boolean; finale: HarvestFinale }) => void>();

function emitSession() {
  const snap = { active: sessionActive, finale };
  sessionListeners.forEach((fn) => fn(snap));
}

export function getHarvestSession() {
  return { active: sessionActive, finale };
}

export function subscribeHarvestSession(
  fn: (v: { active: boolean; finale: HarvestFinale }) => void,
): () => void {
  sessionListeners.add(fn);
  return () => {
    sessionListeners.delete(fn);
  };
}

/** Bắt đầu lượt quét: hiện HUD, xoá pha nổ thưởng cũ. */
export function startHarvestSession() {
  sessionActive = true;
  finale = null;
  emitSession();
}

/** Kết thúc lượt: kích hoạt animation tính tiền nổ thưởng trên HUD. */
export function finishHarvestSession(payload: { base: number; multiplier: number; total: number }) {
  finale = payload;
  sessionActive = true;
  emitSession();
}

/** Ẩn HUD + reset sạch mọi thông số cho lượt mới. */
export function endHarvestSession() {
  sessionActive = false;
  finale = null;
  emitSession();
}

export function getHarvest(): HarvestState {
  return state;
}

export function subscribeHarvest(fn: (s: HarvestState) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function emit() {
  state = { ...state, balls: { ...state.balls }, users: [...state.users] };
  listeners.forEach((fn) => fn(state));
}


/** Cộng xu vừa nhặt vào ô "tổng xu" nổi trên HUD. */
export function addHarvestCoins(amount: number) {
  const v = Number(amount) || 0;
  if (v <= 0) return;
  state.coins = +(state.coins + v).toFixed(2);
  emit();
}

/** Cộng 1 (hoặc n) viên Ngọc Rồng theo số sao. */
export function addHarvestBall(stars: number, qty = 1) {
  const s = Math.max(1, Math.min(7, Math.round(Number(stars) || 1)));
  state.balls[s] = (state.balls[s] || 0) + qty;
  emit();
}

/** Cộng số Jackpot nhặt được. */
export function addHarvestJackpot(qty = 1) {
  if (qty <= 0) return;
  state.jackpot += qty;
  emit();
}

/** Thêm avatar người chơi xung quanh vừa quét trúng (không trùng lặp). */
export function addHarvestUsers(users: HarvestUser[]) {
  if (!users.length) return;
  const seen = new Set(state.users.map((u) => u.id));
  const next = users.filter((u) => u.id && !seen.has(u.id));
  if (!next.length) return;
  state.users = [...state.users, ...next].slice(-12);
  emit();
}

/** Đặt lại toàn bộ bảng thu hoạch — gọi khi bắt đầu lượt quét mới. */
export function resetHarvest() {
  state = { coins: 0, balls: {}, jackpot: 0, users: [] };
  emit();
}

/** Icon xu nổi tự đăng ký node để hiệu ứng bay biết điểm đến. */
export function registerHarvestCoinAnchor(el: HTMLElement | null) {
  coinAnchor = el;
}

export function getHarvestCoinPoint(): { x: number; y: number } | null {
  if (!coinAnchor) return null;
  const r = coinAnchor.getBoundingClientRect();
  if (!r.width && !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
