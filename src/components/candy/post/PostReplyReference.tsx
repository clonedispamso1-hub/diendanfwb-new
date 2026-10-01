import { Image as ImageIcon } from "lucide-react";
import { getValidAvatarUrl } from "@/lib/avatar-utils";
import { formatPostDateTime } from "@/lib/time-format";
import type { PostReplyContext } from "@/lib/post-reply-message";
import "@/styles/post-attachment.css";

/** A bounded post snapshot: only inline/attached GIFs survive the media filter. */
export function PostReplyReference({ context }: { context: PostReplyContext }) {
  const raw = context.post?.content ?? context.preview;
  const inlineGif = raw.match(/\[\[gif:([^\]\s]+)\]\]/)?.[1];
  const attachedGif = context.post?.media.find((url) => /\.gif(?:[?#]|$)/i.test(url));
  const gif = [inlineGif, attachedGif].find((url) => {
    if (!url) return false;
    try { return new URL(url).protocol === "https:"; } catch { return false; }
  });
  const caption = raw
    .replace(/\[\[(?:gif|sticker|baitgroup):[^\]\s]+\]\]/g, "")
    .replace(/\[voice:[^\]]+\]/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/<!--rt-->/g, "")
    .trim();

  return (
    <article className="post-reply-reference" aria-label={`Bài viết của ${context.authorName}`}>
      <div className="post-reply-reference__author">
        <img src={getValidAvatarUrl(context.post?.avatar)} alt="" loading="lazy" />
        <div className="post-reply-reference__identity">
          <strong>{context.authorName}</strong>
          {context.post?.createdAt ? <time dateTime={context.post.createdAt}>{formatPostDateTime(context.post.createdAt)}</time> : null}
        </div>
        {gif ? <span className="post-reply-reference__gif-label"><ImageIcon size={13} aria-hidden="true" /> GIF</span> : null}
      </div>
      {caption ? <p className="post-reply-reference__caption" title={caption}>{caption}</p> : null}
      {gif ? <img className="post-reply-reference__gif" src={gif} alt="GIF bài viết" loading="lazy" /> : null}
    </article>
  );
}