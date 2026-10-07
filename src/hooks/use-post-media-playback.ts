import { useEffect, type RefObject } from "react";

const PLAY_EVENT = "post-media:play";

/** Only post-owned media participates; chat and unrelated audio stay unchanged. */
export function usePostMediaPlayback(
  ref: RefObject<HTMLVideoElement | null>,
  source: string,
  enabled = true,
) {
  useEffect(() => {
    const media = ref.current;
    if (!media || !enabled) return;
    let visible = true;
    const pause = () => {
      media.pause();
      if (document.pictureInPictureElement === media) {
        void document.exitPictureInPicture?.().catch(() => undefined);
      }
    };
    const onPlay = () => {
      if (!visible) { pause(); return; }
      window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: media }));
    };
    const onOtherPlay = (event: Event) => {
      if ((event as CustomEvent<HTMLVideoElement>).detail !== media) pause();
    };
    const owner = media.closest("article") ?? media.parentElement;
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (!visible) pause();
    }, { threshold: 0 });
    if (owner) observer?.observe(owner);
    media.addEventListener("play", onPlay);
    window.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => {
      observer?.disconnect();
      media.removeEventListener("play", onPlay);
      window.removeEventListener(PLAY_EVENT, onOtherPlay);
      pause();
      // Release detached media and pending network work without changing its URL.
      if (!media.isConnected) {
        media.removeAttribute("src");
        media.load();
      }
    };
  }, [ref, source, enabled]);
}