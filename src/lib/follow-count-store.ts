/**
 * Global follower-count store (client-only, zero network).
 *
 * Mục tiêu: khi bấm ❤️ ở bất kỳ đâu (bài viết, hồ sơ, card…) thì MỌI nơi đang
 * hiển thị số lượt yêu thích của người đó đổi ngay lập tức — không F5,
 * không polling, không websocket, không thêm truy vấn Supabase.
 *
 * Cách hoạt động:
 *  - `bumpFollowerCount(userId, +1 | -1)` lưu 1 "delta" tạm thời.
 *  - `useFollowerCount(userId, base)` trả về `base + delta`.
 *  - Khi `base` (số đọc từ DB) đổi → delta được xoá, vì DB là nguồn sự thật.
 */
import { useEffect, useRef, useState } from "react";

const deltas = new Map<string, number>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
}

export function subscribeFollowerCount(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getFollowerDelta(userId: string): number {
  return deltas.get(userId) ?? 0;
}

/** Optimistic +1 / -1 cho một hồ sơ — cập nhật ngay toàn website. */
export function bumpFollowerCount(userId: string, delta: number): void {
  if (!userId || !delta) return;
  deltas.set(userId, (deltas.get(userId) ?? 0) + delta);
  emit();
}

/** Xoá delta (khi đã có số chính xác mới từ DB). */
export function clearFollowerDelta(userId: string): void {
  if (deltas.delete(userId)) emit();
}

/** Số lượt yêu thích để hiển thị. `base` là số đọc từ DB. */
export function useFollowerCount(userId: string | null | undefined, base: number): number {
  const [, force] = useState(0);
  const lastBase = useRef(base);

  useEffect(() => subscribeFollowerCount(() => force((n) => n + 1)), []);

  useEffect(() => {
    if (!userId) return;
    if (lastBase.current !== base) {
      lastBase.current = base;
      clearFollowerDelta(userId);
    }
  }, [userId, base]);

  if (!userId) return base;
  return Math.max(0, base + (deltas.get(userId) ?? 0));
}
