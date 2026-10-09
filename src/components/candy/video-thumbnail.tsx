import { useRef } from "react";
import { useVideoPreview } from "@/hooks/use-video-preview";
import { VideoPreviewEffect } from "./video-preview-effect";

/** Passive highlight thumbnail; opening and playback belong to its owner. */
export function VideoThumbnail({ src, poster, className }: { src: string; poster?: string; className?: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const preview = useVideoPreview(ref, src, poster);
  return <>
    <video ref={ref} src={src} poster={preview.poster} muted playsInline preload={preview.preload}
      tabIndex={-1} aria-hidden className={className} disablePictureInPicture disableRemotePlayback
      onLoadedMetadata={(e) => preview.onLoadedMetadata(e.currentTarget)}
      onLoadedData={(e) => preview.onLoadedData(e.currentTarget)} onSeeked={preview.onSeeked} />
    <VideoPreviewEffect ready={preview.ready} poster={preview.poster} unavailable={preview.unavailable} fit="cover" />
  </>;
}