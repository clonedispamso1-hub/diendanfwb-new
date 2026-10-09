import { Play } from "lucide-react";
import { useState } from "react";

/** Visual layer only; the owning media component keeps its existing action. */
export function VideoPreviewEffect({ ready = false, unavailable = false, poster, fit = "contain" }: {
  ready?: boolean; unavailable?: boolean; poster?: string; fit?: "contain" | "cover";
}) {
  const [loadedPoster, setLoadedPoster] = useState<string | null>(null);
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  const hasPoster = Boolean(poster && loadedPoster === poster);
  return (
    <span className={`video-preview-effect video-preview-effect--clear${ready || hasPoster ? "" : " video-preview-effect--pending"}`} aria-hidden="true">
      {poster && failedPoster !== poster ? <img className={`video-preview-effect__poster video-preview-effect__poster--${fit}`}
        src={poster} alt="" loading="lazy" decoding="async"
        onLoad={() => setLoadedPoster(poster)} onError={() => setFailedPoster(poster)} /> : null}
      <span className="video-preview-effect__content">
        <span className="video-preview-effect__play">
          <Play fill="currentColor" />
        </span>
        {!ready && !hasPoster ? <span className="video-preview-effect__label">{unavailable ? "Chưa có ảnh xem trước" : "Đang tải ảnh xem trước"}</span> : null}
      </span>
    </span>
  );
}