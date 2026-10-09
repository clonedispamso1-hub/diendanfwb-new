import { useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { safeHttpUrl, type FeedbackMediaType } from "@/lib/feedback-zalo-store";

/** Ảnh: tỷ lệ gốc. Video: controls, không autoplay. Link khác: nút mở tab mới. */
export function FeedbackMedia({ url, type, poster }: { url: string; type: FeedbackMediaType; poster?: string }) {
  const [failed, setFailed] = useState(false);
  const safe = safeHttpUrl(url);
  if (!safe) return <MediaError text="URL nội dung không hợp lệ." />;
  if (failed) {
    return <MediaError text={type === "video" ? "Không phát được video từ URL này." : "Không tải được ảnh từ URL này."} href={safe} />;
  }
  if (type === "image") {
    return <img className="fz-media" src={safe} alt="" decoding="async" onError={() => setFailed(true)} />;
  }
  if (type === "video") {
    return (
      <video className="fz-media" src={safe} poster={poster} controls playsInline preload="metadata" onError={() => setFailed(true)} />
    );
  }
  return (
    <a className="fz-media-link" href={safe} target="_blank" rel="noopener noreferrer nofollow">
      <ExternalLink size={16} aria-hidden="true" /> Mở nội dung
    </a>
  );
}

function MediaError({ text, href }: { text: string; href?: string }) {
  return (
    <div className="fz-media-error" role="alert">
      <ImageOff size={28} aria-hidden="true" />
      <p>{text}</p>
      {href ? <a href={href} target="_blank" rel="noopener noreferrer nofollow">Mở liên kết gốc</a> : null}
    </div>
  );
}
