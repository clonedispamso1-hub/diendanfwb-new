import { memo, useCallback, useEffect, useRef, useState } from "react";

/**
 * Composer textarea — uncontrolled (giống Facebook) để gõ không lag.
 *
 * - Không controlled bởi state cha → cha không re-render khi gõ.
 * - Giá trị được ghi vào `valueRef` ngay lập tức (không mất chữ).
 * - Bộ đếm ký tự cập nhật realtime nhưng chỉ re-render component này.
 * - Tự động cao dần (auto-resize), không hiện scrollbar quá sớm.
 */
export type ComposerTextareaProps = {
  taRef: React.RefObject<HTMLTextAreaElement | null>;
  valueRef: React.MutableRefObject<string>;
  placeholder?: string;
  maxChars?: number;
  /** Đổi giá trị này để xoá trắng ô nhập (sau khi đăng bài). */
  resetKey?: number;
  /** Đồng bộ ngược về state cha (debounce) — chỉ cho các logic phụ. */
  onDebouncedChange?: (value: string) => void;
  debounceMs?: number;
};

const MIN_HEIGHT = 120;
const MAX_HEIGHT = 420;

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, el.scrollHeight));
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
}

export const ComposerTextarea = memo(function ComposerTextarea({
  taRef,
  valueRef,
  placeholder,
  maxChars = 250,
  resetKey = 0,
  onDebouncedChange,
  debounceMs = 250,
}: ComposerTextareaProps) {
  const [len, setLen] = useState(() => valueRef.current.length);
  const timer = useRef<number | null>(null);

  const flush = useCallback(
    (value: string) => {
      if (!onDebouncedChange) return;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => onDebouncedChange(value), debounceMs);
    },
    [onDebouncedChange, debounceMs],
  );

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  // Reset ngoài (sau khi đăng bài) hoặc chèn emoji/hashtag từ cha.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.value = valueRef.current;
    setLen(el.value.length);
    autoResize(el);
  }, [resetKey, taRef, valueRef]);

  useEffect(() => { autoResize(taRef.current); }, [taRef]);

  const remaining = Math.max(0, maxChars - len);

  return (
    <div className="cpx-wrap">
      <textarea
        ref={taRef}
        className="app-input cpx-textarea"
        placeholder={placeholder}
        maxLength={maxChars}
        defaultValue={valueRef.current}
        onInput={(e) => {
          const el = e.currentTarget;
          valueRef.current = el.value;
          setLen(el.value.length);
          autoResize(el);
          flush(el.value);
        }}
      />
      <div className="cpx-count" aria-live="polite">
        Còn {remaining} ký tự
      </div>
    </div>
  );
});
