import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Palette, AlignLeft, AlignCenter, AlignRight, Smile } from "lucide-react";
import { GifPicker } from "@/components/candy/gif-picker";
import { RICH_HTML_MARKER, sanitizeRichHtml } from "@/lib/rich-content";
import { isVideoMediaUrl } from "@/lib/media-kind";

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const COLORS = ["#0f172a", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899"];
const SIZES: { label: string; value: string }[] = [
  { label: "Nhỏ", value: "2" },
  { label: "Vừa", value: "3" },
  { label: "Lớn", value: "5" },
  { label: "Rất lớn", value: "6" },
];

/** Lightweight rich text editor for Important posts (admin only). */
export function RichTextEditor({ value, onChange, placeholder, minHeight = 160 }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const incoming = value.startsWith(RICH_HTML_MARKER) ? value.slice(RICH_HTML_MARKER.length) : value;
    if (el.innerHTML !== incoming) el.innerHTML = incoming;
    // Only sync when the editor is emptied externally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value === "" ? "" : null]);

  const emit = () => {
    const html = sanitizeRichHtml(ref.current?.innerHTML ?? "");
    const empty = !html.replace(/<br\s*\/?>|<div>|<\/div>|&nbsp;|\s/g, "");
    onChange(empty ? "" : RICH_HTML_MARKER + html);
  };

  const cmd = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const insertGif = (url: string) => {
    ref.current?.focus();
    // .webm/.mp4 phải dùng <video>, không được dùng <img>.
    const html = isVideoMediaUrl(url)
      ? `<video class="rc-gif" src="${url}" autoplay muted loop playsinline></video>&nbsp;`
      : `<img loading="lazy" decoding="async" class="rc-gif" src="${url}" alt="GIF" />&nbsp;`;
    document.execCommand("insertHTML", false, html);
    setGifOpen(false);
    emit();
  };


  return (
    <div className="rte">
      <div className="rte__toolbar">
        <button type="button" onClick={() => cmd("bold")} aria-label="Đậm"><Bold size={15} /></button>
        <button type="button" onClick={() => cmd("italic")} aria-label="Nghiêng"><Italic size={15} /></button>
        <span className="rte__sep" />
        <select
          className="rte__select"
          defaultValue="3"
          onChange={(e) => cmd("fontSize", e.target.value)}
          aria-label="Cỡ chữ"
        >
          {SIZES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <span className="rte__sep" />
        <div className="rte__color-wrap">
          <button type="button" onClick={() => setColorOpen((v) => !v)} aria-label="Màu chữ">
            <Palette size={15} />
          </button>
          {colorOpen ? (
            <div className="rte__colors">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  style={{ background: c }}
                  aria-label={`Màu ${c}`}
                  onClick={() => { cmd("foreColor", c); setColorOpen(false); }}
                />
              ))}
            </div>
          ) : null}
        </div>
        <span className="rte__sep" />
        <button type="button" onClick={() => cmd("justifyLeft")} aria-label="Canh trái"><AlignLeft size={15} /></button>
        <button type="button" onClick={() => cmd("justifyCenter")} aria-label="Canh giữa"><AlignCenter size={15} /></button>
        <button type="button" onClick={() => cmd("justifyRight")} aria-label="Canh phải"><AlignRight size={15} /></button>
        <span className="rte__sep" />
        <button
          type="button"
          className={gifOpen ? "is-active" : ""}
          onClick={() => setGifOpen((v) => !v)}
          aria-label="Chèn GIF"
        >
          <Smile size={15} />
        </button>
      </div>

      {gifOpen ? (
        <div style={{ position: "relative" }}>
          <GifPicker open onClose={() => setGifOpen(false)} onPick={insertGif} variant="inline" />
        </div>
      ) : null}

      <div
        ref={ref}
        className="rte__area"
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder ?? "Nhập nội dung…"}
        style={{ minHeight }}
        onInput={emit}
        onBlur={emit}
        suppressContentEditableWarning
      />
    </div>
  );
}
