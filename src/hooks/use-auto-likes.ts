import { useEffect, useMemo, useRef, useState } from "react";
import { peekAutoLikes, subscribeAutoLikes, type AutoLikeOptions } from "@/lib/like-engine";

export interface AutoLikesState {
  /** Số tim ảo đang hiển thị (đã gồm sàn tối thiểu từ DB). */
  count: number;
  /** Tăng mỗi lần có tim mới — dùng làm key cho animation "❤️ +N". */
  pulseId: number;
  /** Số tim vừa được cộng thêm (1–3…). */
  delta: number;
}

/**
 * Tim ảo tăng dần theo TUỔI bài viết. Chỉ chạy khi phần tử `ref` nằm trong
 * viewport (IntersectionObserver) — bài ngoài màn hình không tạo timer.
 */
export function useAutoLikes(
  postId: string | null | undefined,
  opts: AutoLikeOptions,
  ref?: React.RefObject<HTMLElement | null>,
): AutoLikesState {
  const { base = 0, isAdmin = false, createdAt = null } = opts;
  const memoOpts = useMemo<AutoLikeOptions>(
    () => ({ base, isAdmin, createdAt }),
    [base, isAdmin, createdAt],
  );

  const [state, setState] = useState<AutoLikesState>(() => ({
    count: postId ? peekAutoLikes(postId, memoOpts) : 0,
    pulseId: 0,
    delta: 0,
  }));
  const [visible, setVisible] = useState(!ref);
  const optsRef = useRef(memoOpts);
  optsRef.current = memoOpts;

  // Viewport gating
  useEffect(() => {
    const el = ref?.current;
    if (!ref) return;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setVisible(e.isIntersecting);
      },
      { rootMargin: "80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, postId]);

  useEffect(() => {
    if (!postId || !visible) return;
    const { count, unsubscribe } = subscribeAutoLikes(postId, memoOpts, (s) => setState(s));
    setState((prev) => (prev.count === count ? prev : { ...prev, count }));
    return unsubscribe;
  }, [postId, memoOpts, visible]);

  return state;
}
