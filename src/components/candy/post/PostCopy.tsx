import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { RichText } from "@/lib/rich-content";

/**
 * PostCopy — caption bài viết, mặc định thu gọn 3 dòng.
 * Chỉ hiện "Xem thêm" khi nội dung thực sự tràn quá 3 dòng.
 * Mở/đóng tại chỗ (không reload, không mất vị trí scroll) với animation ~180ms.
 */
export const PostCopy = memo(function PostCopy({
  text,
  onGifClick,
}: {
  text: string;
  onGifClick?: (url: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Đo ở trạng thái clamp: nếu nội dung cao hơn khung 3 dòng → cần nút.
    const clamped = el.classList.contains("is-clamped");
    if (clamped) {
      setOverflowing(el.scrollHeight - el.clientHeight > 2);
    }
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [text, measure]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className="pc-copy-wrap">
      <div
        ref={ref}
        className={`pc-copy${expanded ? " is-expanded" : " is-clamped"}`}
      >
        <RichText text={text} gifVariant="post" onGifClick={onGifClick} />
      </div>
      {overflowing ? (
        <button
          type="button"
          className="pc-more-btn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Thu gọn" : "Xem thêm..."}
        </button>
      ) : null}
    </div>
  );
});
