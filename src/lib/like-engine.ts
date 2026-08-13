// src/lib/like-engine.ts
// Auto Like V5 — client-only, KHÔNG ghi DB, không polling, không websocket.
//
//  • Số tim ảo được tính theo TUỔI BÀI VIẾT (created_at) theo một đường cong
//    tăng dần tự nhiên:
//        0s → 0–3 · 30s → ~8 · 2p → ~25 · 5p → ~70 · 20p → ~180
//        1h → ~700 · 6h → ~2.2K · 24h → ~8K · sau đó gần như đứng yên.
//  • Mỗi bài có "hệ số" riêng (deterministic theo id) → tốc độ khác nhau.
//  • Trong lúc xem, số nhích lên từng nấc nhỏ (+1/+2/+3…) kèm tim bay lên,
//    không bao giờ nhảy vọt.
//  • Reload không reset: tiến độ lưu ở localStorage và số hiển thị chỉ tăng.
//  • Chỉ chạy khi bài trong viewport và tab đang hiện.

type Listener = (state: { count: number; pulseId: number; delta: number }) => void;

interface PostQueue {
  id: string;
  createdAt: number; // ms epoch
  factor: number; // hệ số riêng của bài
  base: number; // số tim thật/DB tối thiểu
  current: number; // tổng ảo đang hiển thị
  pulseId: number;
  delta: number;
  timer: number | null;
  listeners: Set<Listener>;
}

const queues = new Map<string, PostQueue>();
const STORE_KEY = "like-engine:v5";

/* ---------------- persistence ------- */
function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
function loadStore(): Record<string, number> {
  const s = storage();
  if (!s) return {};
  try {
    return JSON.parse(s.getItem(STORE_KEY) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
let store: Record<string, number> = loadStore();
let saveTimer: number | null = null;
function persist(id: string, value: number) {
  store[id] = value;
  const s = storage();
  if (!s) return;
  if (saveTimer !== null) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    try {
      s.setItem(STORE_KEY, JSON.stringify(store));
    } catch {
      /* quota — bỏ qua */
    }
  }, 1500);
}

/* ---------------- deterministic seed ---------------- */
function seedFromId(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}
function rand01(id: string, salt: string): number {
  return (seedFromId(id + ":" + salt) % 100000) / 100000;
}

/** Hệ số tăng trưởng riêng của mỗi bài (bài hot / bài nguội). */
function growthFactor(postId: string, isAdmin: boolean): number {
  const r = rand01(postId, isAdmin ? "adm" : "std");
  // 0.55 – 1.8 cho bài thường, 1.8 – 4.5 cho bài admin (hot hơn)
  return isAdmin ? 1.8 + r * 2.7 : 0.55 + r * 1.25;
}

/* ---------------- đường cong theo tuổi bài ---------------- */
// [tuổi (giây), số tim tham chiếu]
const CURVE: Array<[number, number]> = [
  [0, 1],
  [30, 8],
  [120, 25],
  [300, 70],
  [1200, 180],
  [3600, 700],
  [6 * 3600, 2200],
  [24 * 3600, 8000],
  [3 * 24 * 3600, 12000],
  [14 * 24 * 3600, 16000],
  [90 * 24 * 3600, 20000],
];

/** Số tim tham chiếu theo tuổi (nội suy mượt, không bậc thang). */
function curveAt(ageSec: number): number {
  if (ageSec <= 0) return CURVE[0][1];
  for (let i = 1; i < CURVE.length; i++) {
    const [t0, v0] = CURVE[i - 1];
    const [t1, v1] = CURVE[i];
    if (ageSec <= t1) {
      const p = (ageSec - t0) / (t1 - t0 || 1);
      // nội suy trong không gian log → tăng dần đều, mượt
      return Math.exp(Math.log(v0) + p * (Math.log(v1) - Math.log(v0)));
    }
  }
  const [tLast, vLast] = CURVE[CURVE.length - 1];
  return vLast * (1 + Math.log(1 + (ageSec - tLast) / (30 * 24 * 3600)) * 0.15);
}

/** Mục tiêu số tim ảo của bài tại thời điểm hiện tại. */
function targetFor(q: PostQueue, now = Date.now()): number {
  const ageSec = Math.max(0, (now - q.createdAt) / 1000);
  const v = curveAt(ageSec) * q.factor;
  return Math.max(q.base, Math.round(v));
}

/** Khoảng nghỉ (ms) trước nấc kế tiếp — theo tốc độ tăng của đường cong. */
function nextDelay(q: PostQueue): number {
  const now = Date.now();
  const perMin = Math.max(0, targetFor(q, now + 60_000) - targetFor(q, now));
  if (perMin <= 0) return 8000 + Math.random() * 7000; // bài cũ: gần như đứng yên
  // mỗi phút có perMin tim → chia thành các nấc 1–3 tim
  const ms = (60_000 / perMin) * (1 + Math.random());
  return Math.min(12_000, Math.max(1200, ms));
}

/* ---------------- queue ---------------- */
export interface AutoLikeOptions {
  createdAt?: string | number | Date | null;
  isAdmin?: boolean;
  base?: number;
}

function resolveCreatedAt(v: AutoLikeOptions["createdAt"]): number {
  if (v == null) return Date.now();
  const t = v instanceof Date ? v.getTime() : new Date(v as any).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function getQueue(postId: string, opts: AutoLikeOptions): PostQueue {
  const base = Math.max(0, Math.round(opts.base ?? 0) || 0);
  const existing = queues.get(postId);
  if (existing) {
    if (base > existing.base) {
      existing.base = base;
      if (existing.current < base) existing.current = base;
    }
    return existing;
  }

  const q: PostQueue = {
    id: postId,
    createdAt: resolveCreatedAt(opts.createdAt),
    factor: growthFactor(postId, Boolean(opts.isAdmin)),
    base,
    current: 0,
    pulseId: 0,
    delta: 0,
    timer: null,
    listeners: new Set(),
  };
  const target = targetFor(q);
  const saved = store[postId];
  q.current = Math.max(base, typeof saved === "number" ? saved : 0, Math.min(target, target));
  // Không bao giờ tụt: giữ số đã lưu nếu lớn hơn mục tiêu.
  if (typeof saved === "number" && saved > q.current) q.current = saved;
  queues.set(postId, q);
  return q;
}

function emit(q: PostQueue) {
  const snapshot = { count: q.current, pulseId: q.pulseId, delta: q.delta };
  q.listeners.forEach((l) => {
    try {
      l(snapshot);
    } catch {
      /* ignore */
    }
  });
}

function schedule(q: PostQueue) {
  if (q.timer !== null) return;
  if (q.listeners.size === 0) return;
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

  q.timer = window.setTimeout(() => {
    q.timer = null;
    if (q.listeners.size === 0) return;

    const target = targetFor(q);
    const gap = target - q.current;
    if (gap > 0) {
      // nấc nhỏ: 1–3 tim (bài hot có thể nhiều hơn chút), không bao giờ nhảy vọt
      const maxStep = Math.max(1, Math.min(8, Math.ceil(gap / 12)));
      const step = Math.min(gap, 1 + Math.floor(Math.random() * maxStep));
      q.current += step;
      q.delta = step;
      q.pulseId += 1;
      persist(q.id, q.current);
      emit(q);
    }
    schedule(q);
  }, nextDelay(q));
}

/** Đăng ký một bài viết (đang trong viewport) vào hàng đợi tim. */
export function subscribeAutoLikes(
  postId: string,
  opts: AutoLikeOptions,
  listener: Listener,
): { count: number; unsubscribe: () => void } {
  const q = getQueue(postId, opts);
  q.listeners.add(listener);
  schedule(q);
  return {
    count: q.current,
    unsubscribe: () => {
      q.listeners.delete(listener);
      if (q.listeners.size === 0 && q.timer !== null) {
        window.clearTimeout(q.timer);
        q.timer = null;
      }
    },
  };
}

/** Số tim ảo hiển thị hiện tại (không đăng ký timer). */
export function peekAutoLikes(postId: string, opts: AutoLikeOptions): number {
  return getQueue(postId, opts).current;
}

/**
 * Số tim ảo khởi điểm để hiển thị ngay khi render (theo tuổi bài viết).
 * `dbInitial` (bot_likes) chỉ dùng làm sàn tối thiểu.
 */
export function baseLikeCount(
  postId: string,
  dbInitial: number,
  isAdmin: boolean,
  createdAt?: string | number | Date | null,
): number {
  return peekAutoLikes(postId, {
    base: Math.max(0, Math.round(dbInitial) || 0),
    isAdmin,
    createdAt,
  });
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      queues.forEach((q) => {
        if (q.timer !== null) {
          window.clearTimeout(q.timer);
          q.timer = null;
        }
      });
    } else {
      queues.forEach((q) => {
        if (q.listeners.size > 0) schedule(q);
      });
    }
  });
}
