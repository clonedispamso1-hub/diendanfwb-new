import { useEffect, useRef, useState } from "react";
import { Play, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMediaThumb } from "@/lib/media";
import { isVideoMediaUrl } from "@/lib/media-kind";
import { resolvePostImages } from "@/lib/db-compat";
import type { PostRecord } from "@/lib/app-types";
import { ImageLightbox } from "./image-lightbox";
import { MediaLightbox } from "./post-media";

export function extractProfileMediaUrls(posts: PostRecord[]): string[] {
  return [...new Set(posts.flatMap(resolvePostImages)
    .filter((url) => typeof url === "string" && /^(https?:|blob:|data:)/.test(url.trim()))
    .map((url) => url.trim()))];
}

function ProfileMediaThumbnail({ url, index, onOpen }: { url: string; index: number; onOpen: () => void }) {
  const isVideo = isVideoMediaUrl(url);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [loadVideo, setLoadVideo] = useState(false);
  const [failed, setFailed] = useState(false);
  const [originalImage, setOriginalImage] = useState(false);
  useEffect(() => {
    if (!isVideo) return;
    const button = buttonRef.current;
    if (!button || typeof IntersectionObserver === "undefined") { setLoadVideo(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setLoadVideo(true); observer.disconnect(); }
    }, { rootMargin: "200px" });
    observer.observe(button);
    return () => observer.disconnect();
  }, [isVideo]);
  return (
    <Button ref={buttonRef} type="button" variant="ghost" className="ph3-photo min-w-0 h-auto p-0"
      aria-label={`${isVideo ? "Video" : "Ảnh"} ${index + 1}`} onClick={onOpen}>
      {failed ? <ImageOff className="text-muted-foreground" size={24} aria-hidden /> : isVideo ? (
        loadVideo ? <video src={url} muted playsInline preload="metadata" disablePictureInPicture disableRemotePlayback
          controlsList="nodownload noremoteplayback" tabIndex={-1} aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          onLoadedMetadata={(e) => {
            const video = e.currentTarget;
            if (Number.isFinite(video.duration) && video.duration > 0) video.currentTime = Math.min(0.01, video.duration / 2);
          }} onError={() => setFailed(true)} /> : null
      ) : <img src={originalImage ? url : getMediaThumb(url, 400) || url} alt="" loading="lazy" decoding="async"
        onError={() => { if (!originalImage) setOriginalImage(true); else setFailed(true); }} />}
      {isVideo ? <span className="pointer-events-none absolute bottom-2 right-2 grid h-6 w-6 place-items-center rounded-full bg-background/90 text-foreground shadow-sm"><Play size={14} fill="currentColor" aria-hidden /></span> : null}
    </Button>
  );
}

export function ProfilePostMediaGrid({ urls }: { urls: string[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const current = selected === null ? null : urls[selected];
  return <>
    <div className="ph3-photos">
      {urls.map((url, index) => <ProfileMediaThumbnail key={url} url={url} index={index} onOpen={() => setSelected(index)} />)}
    </div>
    {current && isVideoMediaUrl(current) ? <MediaLightbox items={[{ url: current, kind: "video" }]} startIndex={0} alt="Video bài viết" onClose={() => setSelected(null)} />
      : current ? <ImageLightbox src={current} alt="Ảnh" onClose={() => setSelected(null)} /> : null}
  </>;
}