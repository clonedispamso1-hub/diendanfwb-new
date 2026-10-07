/**
 * Rich content tokens shared by Posts, Comments and Private Messages.
 *
 * A GIF/sticker is stored inline in the existing text column as a token so it
 * renders exactly where the user inserted it — no schema change required:
 *
 *   Xin chào [[gif:https://cdn/abc.gif]] bạn nhé
 *
 * Rich text (Important posts only) is stored as sanitized HTML prefixed with
 * the `<!--rt-->` marker.
 */
import { Fragment, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { VoiceBubble } from "@/components/candy/voice-bubble";
import { BaitGroupCard } from "@/components/candy/bait-group-card";
import { vipMaxSize, type VipSizeContext } from "@/lib/vip-sizes";
import { VipMedia } from "@/components/vip/vip-media";



export const RICH_HTML_MARKER = "<!--rt-->";
const GIF_TOKEN = /\[\[gif:([^\]\s]+)\]\]/g;
/** Sticker/icon VIP chèn inline trong nội dung (Admin Panel → VIP GIF). */
const STICKER_TOKEN_G = /\[\[sticker:[^\]\s]+\]\]/g;

export function gifToken(url: string): string {
  return `[[gif:${url}]]`;
}

/** Token cho sticker/icon VIP — hiển thị inline như nhãn dán, không phải media. */
export function stickerToken(url: string): string {
  return `[[sticker:${url}]]`;
}

export function countStickerTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return (text.match(STICKER_TOKEN_G) ?? []).length;
}

export function hasGifToken(text: string | null | undefined): boolean {
  if (!text) return false;
  GIF_TOKEN.lastIndex = 0;
  return GIF_TOKEN.test(text);
}

export function countGifTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return (text.match(/\[\[gif:[^\]\s]+\]\]/g) ?? []).length;
}

export function stripGifTokens(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/\[\[gif:[^\]\s]+\]\]/g, "")
    .replace(STICKER_TOKEN_G, "")
    .replace(/\[\[(?:baitgroup|simlike):[^\]\s]+\]\]/g, "")
    .trim();
}


/**
 * Friendly one-line preview that NEVER exposes raw GIF URLs or tokens.
 * Used by notifications, chat list preview, and any other UI that needs a
 * short text summary of user-authored content.
 */
export function friendlyPreview(
  text: string | null | undefined,
  fallback = "một nhãn dán",
): string {
  if (!text) return "";
  let out = String(text);
  // Strip GIF / sticker tokens like [[gif:https://...]] / [[sticker:https://...]].
  out = out.replace(/\[\[gif:[^\]\s]+\]\]/g, "").replace(STICKER_TOKEN_G, "");
  // Card Nhóm: không bao giờ lộ token kỹ thuật ra preview.
  out = out.replace(/\[\[(?:baitgroup|simlike):[^\]\s]+\]\]/g, "");

  // Strip voice tokens — never expose storage paths.
  out = out.replace(/\[voice:[^|\]]+\|\d+\]/g, " một tin nhắn thoại ");
  // Strip any bare GIF/media URL that would otherwise leak into UI.
  out = out.replace(
    /https?:\/\/\S*\.(?:gif|webp)(?:\?\S*)?/gi,
    "",
  );
  out = out.replace(/https?:\/\/(?:media\.)?giphy\.com\/\S+/gi, "");
  out = out.replace(/\s+/g, " ").trim();
  if (!out) return fallback;
  return out;
}

export function isRichHtml(text: string | null | undefined): boolean {
  return !!text && text.startsWith(RICH_HTML_MARKER);
}


/** Very small allowlist sanitizer for the Important-post rich text editor. */
export function sanitizeRichHtml(html: string): string {
  if (typeof window === "undefined") return html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const allowedTags = new Set([
    "B", "STRONG", "I", "EM", "U", "BR", "DIV", "P", "SPAN", "FONT", "UL", "OL", "LI", "IMG", "VIDEO",
  ]);
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild as HTMLElement;

  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (!allowedTags.has(child.tagName)) {
        const text = doc.createTextNode(child.textContent ?? "");
        child.replaceWith(text);
        continue;
      }
      const isMedia = child.tagName === "IMG" || child.tagName === "VIDEO";
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const ok =
          (name === "style" && !/expression|url\s*\(\s*javascript/i.test(attr.value)) ||
          (isMedia && (name === "src" || name === "alt" || name === "class")) ||
          (child.tagName === "VIDEO" &&
            ["autoplay", "muted", "loop", "playsinline", "preload"].includes(name)) ||
          (child.tagName === "FONT" && (name === "color" || name === "size")) ||
          name === "align";
        if (!ok) child.removeAttribute(attr.name);
        if (name === "src" && !/^https?:/i.test(attr.value)) child.removeAttribute(attr.name);
      }
      if (isMedia) child.setAttribute("class", "rc-gif");
      if (child.tagName === "VIDEO") {
        child.setAttribute("autoplay", "");
        child.setAttribute("muted", "");
        child.setAttribute("loop", "");
        child.setAttribute("playsinline", "");
      }
      walk(child);
    }
  };

  walk(root);
  return root.innerHTML;
}

export interface RichSegment {
  type: "text" | "gif" | "voice" | "sticker" | "baitgroup";
  value: string;
  /** Thời lượng (giây) — chỉ dùng cho segment voice. */
  duration?: number;
}

export function parseRichSegments(text: string): RichSegment[] {
  const out: RichSegment[] = [];
  let last = 0;
  // GIF: [[gif:url]] | Sticker VIP: [[sticker:url]] | Voice: [voice:path|duration]
  // Card Nhóm: [[baitgroup:id]]
  const re =
    /\[\[gif:([^\]\s]+)\]\]|\[\[sticker:([^\]\s]+)\]\]|\[voice:([^|\]]+)\|(\d+)\]|\[\[baitgroup:([^\]\s]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1]) out.push({ type: "gif", value: m[1] });
    else if (m[2]) out.push({ type: "sticker", value: m[2] });
    else if (m[3]) out.push({ type: "voice", value: m[3], duration: Number(m[4]) || 0 });
    else if (m[5]) out.push({ type: "baitgroup", value: m[5] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}



interface RichTextProps {
  text: string | null | undefined;
  /** Optional custom renderer for plain text chunks (e.g. @mention highlight). */
  renderText?: (chunk: string, key: string) => React.ReactNode;
  className?: string;
  gifSize?: number;
  /**
   * Ngữ cảnh hiển thị → tự lấy kích thước chuẩn (Phase 2.3):
   * name 16–18px · comment 20–22px · message 24–26px · sticker 72–96px.
   * `gifSize` (nếu truyền) vẫn được ưu tiên.
   */
  gifContext?: VipSizeContext;
  /** "post" renders GIFs inside a fixed frame (feed) instead of inline. */
  gifVariant?: "inline" | "post";
  /** Called when a framed post GIF is clicked (open lightbox). */
  onGifClick?: (url: string) => void;
}

/** Lightbox đơn giản để xem GIF lớn hơn khi bấm vào. */
function GifLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="rc-gif-lightbox" role="dialog" aria-label="Xem GIF" onClick={onClose}>
      <VipMedia url={url} alt="GIF" objectFit="contain" />
    </div>,
    document.body,
  );
}

/** Renders text + inline GIF/sticker tokens (and rich HTML for Important posts). */
export function RichText({
  text, renderText, className, gifSize, gifContext, gifVariant = "inline", onGifClick,
}: RichTextProps) {
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  if (!text) return null;

  // Nhãn dán gửi một mình (không kèm chữ) hiển thị to như sticker Telegram.
  const soloSticker =
    !gifContext && !gifSize && countGifTokens(text) === 1 && !stripGifTokens(text);
  const maxSide =
    gifSize ?? vipMaxSize(gifContext ?? (soloSticker ? "sticker" : "post"));
  // Sticker VIP: luôn hiển thị nhỏ gọn inline như icon/sticker trên Threads
  // (kể cả đứng một mình hay lẫn trong caption). Giữ gifSize nếu có override.
  const stickerSide = gifSize ?? 48;



  if (isRichHtml(text)) {
    const html = sanitizeRichHtml(text.slice(RICH_HTML_MARKER.length));
    return (
      <div
        className={`rc-rich ${className ?? ""}`}
        // Sanitized above with a strict allowlist.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  const segments = parseRichSegments(text);
  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.type === "sticker" ? (
          <VipMedia
            key={`s${i}`}
            url={seg.value}
            className="rc-sticker"
            alt="Sticker"
            objectFit="contain"
            style={{
              display: "inline-block",
              verticalAlign: "middle",
              maxWidth: stickerSide,
              maxHeight: stickerSide,
            }}
          />
        ) : seg.type === "baitgroup" ? (
          <BaitGroupCard key={`bg${i}`} groupId={seg.value} />
        ) : seg.type === "voice" ? (
          <span key={`v${i}`} className="rc-voice">
            <VoiceBubble path={seg.value} duration={seg.duration ?? 0} />
          </span>
        ) : seg.type === "gif" ? (



          gifVariant === "post" ? (
            <span key={`g${i}`} className="rc-gif-frame">
              <VipMedia
                url={seg.value}
                className="rc-gif-post"
                alt="GIF"
                objectFit="contain"
                onClick={onGifClick ? () => onGifClick(seg.value) : () => setZoomUrl(seg.value)}
              />
              <span className="pm-badge" aria-hidden>GIF</span>
            </span>
          ) : (
            <VipMedia
              key={`g${i}`}
              url={seg.value}
              className="rc-gif"
              alt="GIF"
              objectFit="contain"
              onClick={() => setZoomUrl(seg.value)}
              style={{ maxWidth: maxSide, maxHeight: maxSide, display: "inline-block" }}
            />
          )

        ) : (
          <Fragment key={`t${i}`}>
            {renderText ? renderText(seg.value, `t${i}`) : seg.value}
          </Fragment>
        ),
      )}
      {zoomUrl ? <GifLightbox url={zoomUrl} onClose={() => setZoomUrl(null)} /> : null}
    </span>
  );
}

