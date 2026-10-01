// Hiển thị tin nhắn "trả lời bài viết" trong các khung chat của Admin
// (dùng lại PostReplyReference của Chat, không hiện payload thô).
import { PostReplyReference } from "@/components/candy/post/PostReplyReference";
import type { PostReplyContext } from "@/lib/post-reply-message";

export function AdminPostReplyBody({ reply }: { reply: { context: PostReplyContext; message: string } }) {
  const open = () => window.open(`/post/${encodeURIComponent(reply.context.postId)}`, "_blank", "noopener");
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold opacity-80">Đã trả lời bài viết</div>
      <div
        role="link"
        tabIndex={0}
        aria-label="Mở bài viết"
        className="cursor-pointer text-foreground"
        onClick={(e) => { e.stopPropagation(); open(); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
      >
        <PostReplyReference context={reply.context} />
      </div>
      {reply.message ? <div className="whitespace-pre-wrap break-words">{reply.message}</div> : null}
    </div>
  );
}
