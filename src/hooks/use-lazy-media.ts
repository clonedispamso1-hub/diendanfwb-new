import { useEffect, useRef, useState } from "react";

/**
 * Lazy-load ảnh ở tầng hiển thị Feed:
 *  1. Chỉ bắt đầu tải khi ảnh sắp vào viewport (IntersectionObserver).
 *  2. Giới hạn số ảnh tải đồng thời để tránh bùng nổ request khi cuộn nhanh.
 *
 * Không đổi URL, không đổi kích thước/tỉ lệ/chất lượng ảnh.
 */

const MAX_CONCURRENT = 5;
// Nếu một ảnh treo quá lâu thì vẫn nhả slot để hàng đợi không bị nghẽn.
const SLOT_TIMEOUT_MS = 6000;

let active = 0;
const queue: Array<() => void> = [];

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const start = queue.shift();
    if (!start) break;
    active += 1;
    start();
  }
}

function acquire(start: () => void): () => void {
  let released = false;
  let started = false;
  const wrapped = () => {
    started = true;
    start();
  };
  queue.push(wrapped);
  pump();
  return () => {
    if (released) return;
    released = true;
    if (started) {
      active = Math.max(0, active - 1);
      pump();
    } else {
      const idx = queue.indexOf(wrapped);
      if (idx >= 0) queue.splice(idx, 1);
    }
  };
}

export function useLazyImage(src: string | undefined | null) {
  const ref = useRef<HTMLImageElement | null>(null);
  const [readySrc, setReadySrc] = useState<string | undefined>(undefined);
  const releaseRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setReadySrc(undefined);
    releaseRef.current?.();
    releaseRef.current = null;
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const el = ref.current;
    if (!src) return;

    // Môi trường không hỗ trợ IntersectionObserver → tải bình thường.
    if (!el || typeof IntersectionObserver === "undefined") {
      setReadySrc(src);
      return;
    }

    let disposed = false;

    const begin = () => {
      if (disposed) return;
      releaseRef.current = acquire(() => {
        if (disposed) return;
        setReadySrc(src);
        timerRef.current = window.setTimeout(() => {
          releaseRef.current?.();
          releaseRef.current = null;
        }, SLOT_TIMEOUT_MS);
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            io.disconnect();
            begin();
            break;
          }
        }
      },
      { rootMargin: "300px 0px", threshold: 0.01 },
    );
    io.observe(el);

    return () => {
      disposed = true;
      io.disconnect();
      releaseRef.current?.();
      releaseRef.current = null;
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [src]);

  const settle = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    releaseRef.current?.();
    releaseRef.current = null;
  };

  return { ref, src: readySrc, settle };
}
