import { memo, useCallback, useEffect, useRef, useState } from "react";

/**
 * Composer textarea — uncontrolled (giống Facebook/Threads) để gõ không lag.
 *
 * - Không controlled bởi state cha → cha không re-render khi gõ.
 * - Giá trị ghi thẳng vào `valueRef` (không mất chữ).
 * - Chỉ bộ đếm ký tự re-render, và chỉ khi con số thay đổi.
 * - Auto-resize: tối thiểu 3 dòng, tối đa ~8 dòng rồi scroll bên trong.
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

/** 3 dòng ≈ 3 × 22.5px + padding; 8 dòng ≈ 8 × 22.5px + padding. */
const MIN_HEIGHT = 78;
const MAX_HEIGHT = 192;

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, el.scrollHeight));
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
}

const CharCount = memo(function CharCount({ remaining }: { remaining: number }) {
  return (
    <div className="cpx-count" aria-live="off">
      Còn {remaining} ký tự
    </div>
  );
});

export const ComposerTextarea = memo(function ComposerTextarea({
  taRef,
  valueRef,
  placeholder,
  maxChars = 250,
  resetKey = 0,
  onDebouncedChange,
  debounceMs = 300,
}: ComposerTextareaProps) {
  const [len, setLen] = useState(() => valueRef.current.length);
  const timer = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);

  const flush = useCallback(
    (value: string) => {
      if (!onDebouncedChange) return;
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => onDebouncedChange(value), debounceMs);
    },
    [onDebouncedChange, debounceMs],
  );

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    },
    [],
  );

  // Reset ngoài (sau khi đăng bài) hoặc chèn emoji/GIF từ cha.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.value = valueRef.current;
    setLen(el.value.length);
    autoResize(el);
  }, [resetKey, taRef, valueRef]);

  useEffect(() => {
    autoResize(taRef.current);
  }, [taRef]);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      valueRef.current = el.value;
      const nextLen = el.value.length;
      // setState với cùng giá trị → React bail out, không re-render.
      setLen(nextLen);
      // Gom việc đo/resize vào 1 frame để paste đoạn dài không giật.
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => autoResize(el));
      flush(el.value);
    },
    [flush, valueRef],
  );

  return (
    <div className="cpx-wrap">
      <textarea
        ref={taRef}
        className="app-input cpx-textarea"
        placeholder={placeholder}
        maxLength={maxChars}
        defaultValue={valueRef.current}
        rows={3}
        spellCheck={false}
        onInput={handleInput}
      />
      <CharCount remaining={Math.max(0, maxChars - len)} />
    </div>
  );
});
