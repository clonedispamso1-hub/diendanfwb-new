import { cleanup, fireEvent, render, renderHook, act } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { VideoThumbnail } from "@/components/candy/video-thumbnail";
import { useVideoPreview, videoPosterUrl } from "./use-video-preview";

const src = "https://example.test/original.mp4?token=public#t=0";
let intersect: IntersectionObserverCallback;
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.stubGlobal("IntersectionObserver", class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {} disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("Video previews", () => {
  it("exposes a fallback when no frame is available after ten seconds", () => {
    vi.useFakeTimers();
    const ref = { current: document.createElement("video") };
    const { result } = renderHook(() => useVideoPreview(ref, src));
    expect(result.current.unavailable).toBe(false);
    act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.unavailable).toBe(true);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });
  it("prefers an existing poster", () => {
    expect(videoPosterUrl(src, "https://example.test/cover.jpg")).toBe("https://example.test/cover.jpg");
  });
  it("creates an image-only Cloudinary preview without changing the source", () => {
    const url = "https://res.cloudinary.com/demo/video/upload/v123/dog.mp4?x=1";
    expect(videoPosterUrl(url)).toBe("https://res.cloudinary.com/demo/video/upload/so_0.1,f_jpg,c_limit,w_640/v123/dog.jpg?x=1");
    expect(videoPosterUrl(src)).toBeUndefined();
    expect(videoPosterUrl("https://res.cloudinary.com/demo/video/upload/s--signed--/dog.mp4")).toBeUndefined();
  });
  it("loads only nearby native frames, seeks while paused, and never plays on hover", () => {
    const { container } = render(<VideoThumbnail src={src} />);
    const video = container.querySelector("video");
    if (!video) throw new Error("Expected native preview");
    expect(video.preload).toBe("none");
    act(() => intersect([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    expect(video.preload).toBe("metadata");
    Object.defineProperty(video, "duration", { configurable: true, value: 8 });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(0.1);
    fireEvent.seeked(video);
    fireEvent.mouseEnter(video);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(video).not.toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("src", src);
  });
});