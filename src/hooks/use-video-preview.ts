import { useEffect, useState, type RefObject } from "react";

/** Preview-only URL. Playback always retains the owner's original src. */
export function videoPosterUrl(src: string, existing?: string | null): string | undefined {
  if (existing) return existing;
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(src) || !src.includes("/video/upload/") || /\/s--[^/]+--\//.test(src)) return undefined;
  const url = new URL(src);
  url.pathname = url.pathname.replace(/\.(mp4|webm|mov|m4v|ogv)$/i, ".jpg")
    .replace(/f_(auto|mp4|webm)/g, "f_jpg")
    .replace("/video/upload/", "/video/upload/so_0.1,f_jpg,c_limit,w_640/");
  return url.href;
}

/** Seek a paused native player, avoiding canvas/CORS reads and autoplay. */
export function useVideoPreview(ref: RefObject<HTMLVideoElement | null>, src: string, existingPoster?: string | null) {
  const [nearby, setNearby] = useState(false);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const poster = videoPosterUrl(src, existingPoster);
  useEffect(() => {
    setReady(false);
    setUnavailable(false);
    const video = ref.current;
    if (!video) return;
    if (typeof IntersectionObserver === "undefined") { setNearby(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setNearby(true); observer.disconnect(); }
    }, { rootMargin: "200px" });
    observer.observe(video);
    return () => observer.disconnect();
  }, [ref, src]);
  useEffect(() => {
    if (!nearby || ready) return;
    const timeout = window.setTimeout(() => setUnavailable(true), 10000);
    return () => window.clearTimeout(timeout);
  }, [nearby, ready, src]);
  return {
    poster,
    ready,
    unavailable,
    preload: nearby ? "metadata" as const : "none" as const,
    onLoadedMetadata: (video: HTMLVideoElement) => {
      if (video.paused && video.currentTime === 0 && Number.isFinite(video.duration) && video.duration > 0) {
        video.currentTime = Math.min(0.1, video.duration / 2);
      }
    },
    onLoadedData: (video: HTMLVideoElement) => { if (!video.seeking) setReady(true); },
    onSeeked: () => setReady(true),
  };
}