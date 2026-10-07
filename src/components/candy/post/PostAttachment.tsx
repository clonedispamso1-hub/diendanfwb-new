import { Heart } from "lucide-react";
import { getValidAvatarUrl } from "@/lib/avatar-utils";
import { isVideoMediaUrl } from "@/lib/media-kind";
import { formatRelativeTime } from "@/lib/time-format";
import { stripBaitGroupToken } from "@/lib/bait-group-token";
import type { PostReplyContext } from "@/lib/post-reply-message";
import { PostCopy } from "./PostCopy";
import "@/styles/post-attachment.css";

/** Read-only, message-safe view of the same post content used by the feed card. */
export function PostAttachment({ context, showLikes = true }: { context: PostReplyContext; showLikes?: boolean }) {
  const post = context.post;
  const content = stripBaitGroupToken(post?.content ?? context.preview);
  return (
    <article className="pc-attachment pc-card" aria-label={`Bài viết của ${context.authorName}`}>
      <div className="pc-attachment__author">
        <img className="pc-attachment__avatar" src={getValidAvatarUrl(post?.avatar)} alt="" loading="lazy" />
        <div className="pc-attachment__identity">
          <strong>{context.authorName}</strong>
          {post?.createdAt ? <time dateTime={post.createdAt}>{formatRelativeTime(post.createdAt)}</time> : null}
        </div>
      </div>
      {content ? <PostCopy text={content} /> : null}
      {post?.media?.length ? (
        <div className="pc-attachment__media">
          {post.media.map((url, index) => isVideoMediaUrl(url) ? (
            <video key={`${url}-${index}`} src={url} controls playsInline preload="metadata" controlsList="nodownload noremoteplayback" onContextMenu={(e) => e.preventDefault()} aria-label={`Video bài viết ${index + 1}`} />
          ) : (
            <img key={`${url}-${index}`} src={url} alt={`Ảnh bài viết ${index + 1}`} loading="lazy" decoding="async" />
          ))}
        </div>
      ) : null}
      {showLikes && post?.likes != null ? <div className="pc-attachment__stats"><Heart size={14} aria-hidden="true" /> {Intl.NumberFormat("vi-VN", { notation: "compact" }).format(post.likes)}</div> : null}
    </article>
  );
}