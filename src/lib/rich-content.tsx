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
import { Fragment } from "react";
import { VoiceBubble } from "@/components/candy/voice-bubble";

export const RICH_HTML_MARKER = "<!--rt-->";
const GIF_TOKEN = /\[\[gif:([^\]\s]+)\]\]/g;

export function gifToken(url: string): string {
  return `[[gif:${url}]]`;
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
  return (text ?? "").replace(/\[\[gif:[^\]\s]+\]\]/g, "").trim();
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
  // Strip GIF tokens like [[gif:https://...]].
  out = out.replace(/\[\[gif:[^\]\s]+\]\]/g, "");
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

/**
 * Mô tả ngắn cho thông báo bình luận — KHÔNG BAO GIỜ lộ URL hoặc token
 * [[gif:...]]. Trả về cụm từ đứng sau tên người dùng.
 *
 *   GIF/sticker  → "đã bình luận một GIF vào bài viết của bạn."
 *   Emoji thuần  → "đã bình luận 😊 vào bài viết của bạn."
 *   Text thường  → "đã bình luận bài viết của bạn." (+ preview riêng)
 */
const EMOJI_ONLY =
  /^(?:[\p{Extended_Pictographic}\p{Emoji_Presentation}\u200d\ufe0f\u{1f3fb}-\u{1f3ff}\s])+$/u;

export function describeCommentContent(
  text: string | null | undefined,
): { kind: "gif" | "sticker" | "emoji" | "text" | "empty"; phrase: string; preview: string | null } {
  const raw = (text ?? "").trim();
  if (!raw) return { kind: "empty", phrase: "", preview: null };
  // Voice — không bao giờ lộ marker / storage path.
  if (/\[voice:[^|\]]+\|\d+\]/.test(raw)) {
    return { kind: "sticker", phrase: "🎙️ một tin nhắn thoại", preview: null };
  }

  const clean = friendlyPreview(raw, "");
  const hadMedia = hasGifToken(raw) || /https?:\/\/\S*\.(?:gif|webp)/i.test(raw);

  if (!clean && hadMedia) {
    const isSticker = /sticker|nhan-dan/i.test(raw);
    return {
      kind: isSticker ? "sticker" : "gif",
      phrase: isSticker ? "một nhãn dán" : "một GIF",
      preview: null,
    };
  }
  if (!clean) return { kind: "empty", phrase: "", preview: null };
  if (EMOJI_ONLY.test(clean)) {
    return { kind: "emoji", phrase: clean.slice(0, 8), preview: null };
  }
  return { kind: "text", phrase: "", preview: clean.slice(0, 160) };
}

/** Câu thông báo hoàn chỉnh cho bình luận / trả lời. */
export function commentNotifText(
  actorName: string,
  text: string | null | undefined,
  target: "post" | "comment" = "post",
): { primary: string; secondary: string | null } {
  const tail = target === "post" ? "bài viết của bạn" : "bình luận của bạn";
  const verb = target === "post" ? "đã bình luận" : "đã trả lời";
  const d = describeCommentContent(text);
  if (d.kind === "gif" || d.kind === "sticker" || d.kind === "emoji") {
    return { primary: `${actorName} ${verb} ${d.phrase} vào ${tail}.`, secondary: null };
  }
  return {
    primary: `${actorName} ${verb} ${tail}.`,
    secondary: d.preview ? `"${d.preview}"` : null,
  };
}

/** Very small allowlist sanitizer for the Important-post rich text editor. */
export function sanitizeRichHtml(html: string): string {
  if (typeof window === "undefined") return html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const allowedTags = new Set([
    "B", "STRONG", "I", "EM", "U", "BR", "DIV", "P", "SPAN", "FONT", "UL", "OL", "LI", "IMG",
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
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase();
        const ok =
          (name === "style" && !/expression|url\s*\(\s*javascript/i.test(attr.value)) ||
          (child.tagName === "IMG" && (name === "src" || name === "alt" || name === "class")) ||
          (child.tagName === "FONT" && (name === "color" || name === "size")) ||
          name === "align";
        if (!ok) child.removeAttribute(attr.name);
        if (name === "src" && !/^https?:/i.test(attr.value)) child.removeAttribute(attr.name);
      }
      if (child.tagName === "IMG") child.setAttribute("class", "rc-gif");
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

export interface RichSegment {
  type: "text" | "gif" | "voice";
  value: string;
  /** Thời lượng (giây) — chỉ dùng cho segment voice. */
  duration?: number;
}

export function parseRichSegments(text: string): RichSegment[] {
  const out: RichSegment[] = [];
  let last = 0;
  // GIF: [[gif:url]]  |  Voice: [voice:path|duration]
  const re = /\[\[gif:([^\]\s]+)\]\]|\[voice:([^|\]]+)\|(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    if (m[1]) out.push({ type: "gif", value: m[1] });
    else out.push({ type: "voice", value: m[2], duration: Number(m[3]) || 0 });
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
  /** "post" renders GIFs inside a fixed frame (feed) instead of inline. */
  gifVariant?: "inline" | "post";
  /** Called when a framed post GIF is clicked (open lightbox). */
  onGifClick?: (url: string) => void;
}

/** Renders text + inline GIF/sticker tokens (and rich HTML for Important posts). */
export function RichText({
  text, renderText, className, gifSize = 140, gifVariant = "inline", onGifClick,
}: RichTextProps) {
  if (!text) return null;

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
        seg.type === "voice" ? (
          <span key={`v${i}`} className="rc-voice">
            <VoiceBubble path={seg.value} duration={seg.duration ?? 0} />
          </span>
        ) : seg.type === "gif" ? (
          gifVariant === "post" ? (
            <span key={`g${i}`} className="rc-gif-frame">
              <img
                src={seg.value}
                alt="GIF"
                loading="lazy"
                className="rc-gif-post"
                onClick={onGifClick ? () => onGifClick(seg.value) : undefined}
                role={onGifClick ? "button" : undefined}
              />
              <span className="pm-badge" aria-hidden>GIF</span>
            </span>
          ) : (
            <img
              key={`g${i}`}
              src={seg.value}
              alt="GIF"
              loading="lazy"
              className="rc-gif"
              style={{ maxWidth: gifSize, maxHeight: gifSize }}
            />
          )
        ) : (
          <Fragment key={`t${i}`}>
            {renderText ? renderText(seg.value, `t${i}`) : seg.value}
          </Fragment>
        ),
      )}
    </span>
  );
}
