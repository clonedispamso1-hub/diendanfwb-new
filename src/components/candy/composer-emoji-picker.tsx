import { lazy, Suspense, useEffect, useRef } from "react";
import { EmojiStyle } from "emoji-picker-react";

const EmojiPicker = lazy(() => import("emoji-picker-react"));

interface ComposerEmojiPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
  anchorClassName?: string;
}

export function ComposerEmojiPicker({ open, onClose, onPick }: ComposerEmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Defer to avoid catching the same click that opened it
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} className="composer-emoji-popover" role="dialog" aria-label="Chọn biểu tượng cảm xúc">
      <Suspense fallback={<div className="composer-emoji-loading">Đang tải…</div>}>
        
        <EmojiPicker
          onEmojiClick={(data: { emoji: string }) => onPick(data.emoji)}
          autoFocusSearch={false}
          width={320}
          height={380}
          previewConfig={{ showPreview: false }}
          searchPlaceHolder="Tìm emoji…"
          lazyLoadEmojis
          emojiStyle={EmojiStyle.APPLE}
        />
      </Suspense>
    </div>
  );
}
