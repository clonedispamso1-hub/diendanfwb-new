import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * Ô nhập của khung chat — uncontrolled (giống Messenger/Threads).
 *
 * Giá trị nằm trong `valueRef` nên mỗi phím gõ KHÔNG làm re-render
 * <ChatPage> (danh sách tin nhắn, header, inbox…). Chỉ component nhỏ này
 * re-render, và chỉ khi trạng thái "có chữ / rỗng" đổi.
 *
 * Auto-grow được gom vào 1 frame bằng requestAnimationFrame để tránh
 * forced-reflow theo từng ký tự (nguyên nhân giật trên iPhone).
 */
export type ChatComposerInputProps = {
  taRef: React.RefObject<HTMLTextAreaElement | HTMLDivElement | null>;
  valueRef: React.MutableRefObject<string>;
  /** Tăng giá trị này khi cha ghi trực tiếp vào valueRef (gửi xong / rollback). */
  resetKey: number;
  sending: boolean;
  onSend: () => void;
  onTyping: () => void;
  placeholder?: string;
  /** Prevent iOS from inserting its AutoFill action row above the keyboard. */
  suppressAutofillToolbar?: boolean;
};

function autoResize(el: HTMLTextAreaElement | HTMLDivElement | null) {
  if (!el) return;
  if (el instanceof HTMLDivElement) return;
  // CSS owns the existing maximum. Reset first so scrollHeight can also shrink,
  // then publish one measured height without making the parent control the text.
  el.style.setProperty("--chat-composer-height", "auto");
  const max = Number.parseFloat(getComputedStyle(el).maxHeight);
  const limit = Number.isFinite(max) ? max : el.scrollHeight;
  const next = Math.min(limit, el.scrollHeight);
  el.style.setProperty("--chat-composer-height", `${next}px`);
  el.style.overflowY = el.scrollHeight > next ? "auto" : "hidden";
}

export const ChatComposerInput = memo(function ChatComposerInput({
  taRef,
  valueRef,
  resetKey,
  sending,
  onSend,
  onTyping,
  placeholder = "Nhập tin nhắn...",
  suppressAutofillToolbar = false,
}: ChatComposerInputProps) {
  const [hasText, setHasText] = useState(() => valueRef.current.trim().length > 0);
  const rafId = useRef<number | null>(null);

  useEffect(() => () => { if (rafId.current) cancelAnimationFrame(rafId.current); }, []);

  // Cha ghi giá trị mới (xoá sau khi gửi, khôi phục khi lỗi).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    if (el instanceof HTMLTextAreaElement) el.value = valueRef.current;
    else el.textContent = valueRef.current;
    setHasText(valueRef.current.trim().length > 0);
    autoResize(el);
  }, [resetKey, taRef, valueRef]);

  // IME (bộ gõ tiếng Việt): DOM remains the source of truth throughout the
  // composition session. React never writes a value back while the user types.
  const composingRef = useRef(false);

  const scheduleResize = useCallback((el: HTMLTextAreaElement) => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      autoResize(el);
    });
  }, []);

  const readValue = useCallback((el: HTMLTextAreaElement | HTMLDivElement) => {
    return el instanceof HTMLTextAreaElement ? el.value : (el.textContent ?? "");
  }, []);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement | HTMLDivElement>) => {
      const el = e.currentTarget;
      const value = readValue(el);
      valueRef.current = value;
      // setState cùng giá trị → React bail out, không re-render.
      setHasText(value.trim().length > 0);
      if (el instanceof HTMLTextAreaElement) scheduleResize(el);
      if (!composingRef.current) onTyping();
    },
    [onTyping, readValue, scheduleResize, valueRef],
  );

  const handleCompositionEnd = useCallback((event: React.CompositionEvent<HTMLTextAreaElement | HTMLDivElement>) => {
    composingRef.current = false;
    const el = event.currentTarget;
    const value = readValue(el);
    valueRef.current = value;
    setHasText(value.trim().length > 0);
    if (el instanceof HTMLTextAreaElement) scheduleResize(el);
    onTyping();
  }, [onTyping, readValue, scheduleResize, valueRef]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement | HTMLDivElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    if (composingRef.current || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (sending) return;
    onSend();
  }, [onSend, sending]);

  if (suppressAutofillToolbar) {
    return (
      <>
        <div
          ref={taRef as React.RefObject<HTMLDivElement | null>}
          className="app-input chat-input-luxe chat-composer-editor"
          contentEditable
          role="textbox"
          aria-label={placeholder}
          aria-multiline="true"
          data-placeholder={placeholder}
          onInput={handleInput}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={handleCompositionEnd}
          onKeyDown={handleKeyDown}
          suppressContentEditableWarning
        />
        <button
          className="icon-button chat-send-luxe"
          onClick={onSend}
          aria-label="Gửi tin nhắn"
          aria-busy={sending}
          disabled={sending || !hasText}
        >
          {sending ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <span className="chat-send-label">Gửi</span>}
        </button>
      </>
    );
  }

  return (
    <>
      <textarea
        ref={taRef as React.RefObject<HTMLTextAreaElement | null>}
        className="app-input chat-input-luxe"
        rows={1}
        defaultValue={valueRef.current}
        onInput={handleInput}
        onCompositionStart={() => { composingRef.current = true; }}
        onCompositionEnd={handleCompositionEnd}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
      />
      <button
        className="icon-button chat-send-luxe"
        onClick={onSend}
        aria-label="Gửi tin nhắn"
        aria-busy={sending}
        disabled={sending || !hasText}
      >
        {sending ? (
          <Loader2 size={16} className="animate-spin" aria-hidden />
        ) : (
          <span className="chat-send-label">Gửi</span>
        )}
      </button>
    </>
  );
});
