import { memo, useLayoutEffect, useRef, useState } from "react";
import { RichText } from "@/lib/rich-content";

/** Ngưỡng ký tự để bắt đầu thu gọn nội dung (giống Facebook). */
const COLLAPSE_CHARS = 200;

/**
 * PostCopy — caption bài viết với "… Xem thêm" / "Thu gọn".
 * Chỉ expand/collapse tại chỗ, không reload, không popup.
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

  const maybeLong = (text?.length ?? 0) > COLLAPSE_CHARS || (text?.split("\n").length ?? 0) > 6;

  useLayoutEffect(() => {
    if (!maybeLong) { setOverflowing(false); return; }
    const el = ref.current;
    if (!el) return;
    setOverflowing(el.scrollHeight - el.clientHeight > 4);
  }, [text, maybeLong]);

  const collapsed = maybeLong && !expanded;

  return (
    <div className="pc-copy-wrap">
      <div
        ref={ref}
        className={`pc-copy${collapsed ? " is-clamped" : " is-expanded"}`}
      >
        <RichText text={text} gifVariant="post" onGifClick={onGifClick} />
      </div>
      {maybeLong && (overflowing || expanded) ? (
        <button
          type="button"
          className="pc-more-btn"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Thu gọn" : "… Xem thêm"}
        </button>
      ) : null}
    </div>
  );
});
