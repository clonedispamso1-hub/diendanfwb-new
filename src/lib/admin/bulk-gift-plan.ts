/**
 * ADMIN PANEL V5.1 — Bộ chia kế hoạch "Tặng quà hàng loạt".
 *
 * Thuần logic (không gọi network) để dễ kiểm thử:
 *  - 4 cách chia xu: chia đều / random / cố định / theo %
 *  - Phân phối nhiều clone lên nhiều bài viết, không để 1 clone spam hết
 *  - Không tặng trùng (clone × bài), không dồn 1 người / 1 bài
 */

export type SplitMode = "equal" | "random" | "fixed" | "percent";

export type PlanClone = {
  id: string;
  username: string;
  full_name: string | null;
  gem_balance: number;
};

export type PlanPost = {
  id: string;
  user_id: string;
  content?: string | null;
  author_name?: string | null;
  author_username?: string | null;
};

export type GiftTask = {
  cloneId: string;
  cloneLabel: string;
  postId: string;
  postLabel: string;
  receiverId: string;
  receiverLabel: string;
  amount: number;
};

export type BuildPlanInput = {
  clones: PlanClone[];
  posts: PlanPost[];
  /** Số lượt tặng mong muốn (thường = số người nhận). */
  maxGifts: number;
  mode: SplitMode;
  totalAmount: number;
  fixedAmount: number;
  minAmount: number;
  /** Cặp "cloneId:postId" đã tặng trước đó -> bỏ qua. */
  alreadyGifted?: Set<string>;
};

export type BuildPlanResult = {
  tasks: GiftTask[];
  skippedPosts: number;
  note: string[];
};

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function splitEqual(total: number, n: number, min: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const out = Array<number>(n).fill(base);
  let rest = total - base * n;
  for (let i = 0; rest > 0; i = (i + 1) % n, rest--) out[i] += 1;
  return out.map((v) => Math.max(v, min));
}

/** Random nhưng TỔNG luôn đúng bằng `total` (mỗi phần >= min). */
export function splitRandom(total: number, n: number, min: number): number[] {
  if (n <= 0) return [];
  if (total < min * n) return splitEqual(min * n, n, min);
  const pool = total - min * n;
  const w = Array.from({ length: n }, () => Math.random() + 0.05);
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const out = w.map((x) => min + Math.floor((x / sum) * pool));
  const used = out.reduce((a, b) => a + b, 0);
  out[0] += total - used;
  return out;
}

/** Chia theo % random (tỷ lệ làm tròn tới 1%), tổng vẫn bằng `total`. */
export function splitPercent(total: number, n: number, min: number): number[] {
  if (n <= 0) return [];
  const raw = Array.from({ length: n }, () => Math.floor(Math.random() * 20) + 1);
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  const out = raw.map((x) => Math.max(Math.floor((x / sum) * total), min));
  const used = out.reduce((a, b) => a + b, 0);
  out[0] += total - used;
  if (out[0] < min) return splitRandom(Math.max(total, min * n), n, min);
  return out;
}

export function percentOf(amounts: number[]): number[] {
  const total = amounts.reduce((a, b) => a + b, 0) || 1;
  return amounts.map((a) => Math.round((a / total) * 1000) / 10);
}

export function buildAmounts(
  n: number,
  mode: SplitMode,
  totalAmount: number,
  fixedAmount: number,
  minAmount: number,
): number[] {
  if (n <= 0) return [];
  if (mode === "fixed") return Array<number>(n).fill(Math.max(fixedAmount, minAmount));
  const total = Math.max(totalAmount, minAmount * n);
  if (mode === "random") return splitRandom(total, n, minAmount);
  if (mode === "percent") return splitPercent(total, n, minAmount);
  return splitEqual(total, n, minAmount);
}

const label = (c: { full_name: string | null; username: string }) => c.full_name || c.username;

/**
 * Xây danh sách lượt tặng: mỗi người nhận tối đa 1 quà / lượt chạy,
 * clone được rải luân phiên theo số dư, tránh trùng cặp clone × bài.
 */
export function buildPlan(input: BuildPlanInput): BuildPlanResult {
  const { clones, posts, mode, totalAmount, fixedAmount, minAmount } = input;
  const already = input.alreadyGifted ?? new Set<string>();
  const note: string[] = [];

  const usableClones = clones.filter((c) => Number(c.gem_balance ?? 0) >= minAmount);
  if (!usableClones.length || !posts.length) {
    return { tasks: [], skippedPosts: posts.length, note: ["Không có clone đủ xu hoặc không có bài viết."] };
  }

  // 1 bài / 1 người nhận để không dồn vào 1 người.
  const byReceiver = new Map<string, PlanPost>();
  for (const p of shuffle(posts)) if (!byReceiver.has(p.user_id)) byReceiver.set(p.user_id, p);
  let picked = shuffle([...byReceiver.values()]);
  const skippedPosts = posts.length - picked.length;

  // Số lượt tối đa theo cách chia xu.
  let limit = Math.min(input.maxGifts, picked.length);
  if (mode === "fixed") {
    const per = Math.max(fixedAmount, minAmount);
    const affordable = Math.floor(
      usableClones.reduce((s, c) => s + Number(c.gem_balance ?? 0), 0) / per,
    );
    if (affordable < limit) {
      note.push(`Tổng xu clone chỉ đủ ${affordable} lượt (mỗi lượt ${per.toLocaleString("vi-VN")} xu).`);
      limit = Math.max(affordable, 0);
    }
  }
  picked = picked.slice(0, limit);

  const amounts = buildAmounts(picked.length, mode, totalAmount, fixedAmount, minAmount);

  // Ví tạm để không cho 1 clone tiêu quá số dư.
  const wallet = new Map(usableClones.map((c) => [c.id, Number(c.gem_balance ?? 0)]));
  const order = shuffle(usableClones);
  const lastReceiver = new Map<string, string>();
  const tasks: GiftTask[] = [];
  let cursor = 0;

  for (let i = 0; i < picked.length; i++) {
    const post = picked[i];
    const amount = amounts[i] ?? minAmount;
    let chosen: PlanClone | null = null;

    for (let tries = 0; tries < order.length; tries++) {
      const c = order[(cursor + tries) % order.length];
      const bal = wallet.get(c.id) ?? 0;
      if (bal < amount) continue;
      if (c.id === post.user_id) continue; // không tự tặng mình
      if (already.has(`${c.id}:${post.id}`)) continue; // đã tặng bài này
      if (lastReceiver.get(c.id) === post.user_id) continue; // vừa tặng người này
      chosen = c;
      cursor = (cursor + tries + 1) % order.length;
      break;
    }

    if (!chosen) {
      note.push(`Bỏ qua bài #${post.id.slice(0, 8)} — không còn clone phù hợp/đủ xu.`);
      continue;
    }

    wallet.set(chosen.id, (wallet.get(chosen.id) ?? 0) - amount);
    lastReceiver.set(chosen.id, post.user_id);
    tasks.push({
      cloneId: chosen.id,
      cloneLabel: label(chosen),
      postId: post.id,
      postLabel: (post.content || "").slice(0, 60) || `Bài #${post.id.slice(0, 8)}`,
      receiverId: post.user_id,
      receiverLabel: post.author_name || post.author_username || "Người dùng",
      amount,
    });
  }

  return { tasks, skippedPosts, note };
}

export const DELAY_PRESETS = [
  { key: "1-3", label: "1~3s", min: 1000, max: 3000 },
  { key: "3-5", label: "3~5s", min: 3000, max: 5000 },
  { key: "5-10", label: "5~10s", min: 5000, max: 10000 },
  { key: "fast", label: "Nhanh (0.2s)", min: 150, max: 300 },
] as const;

export type DelayKey = (typeof DELAY_PRESETS)[number]["key"];

export function randomDelay(key: DelayKey): number {
  const p = DELAY_PRESETS.find((d) => d.key === key) ?? DELAY_PRESETS[0];
  return p.min + Math.floor(Math.random() * (p.max - p.min + 1));
}
