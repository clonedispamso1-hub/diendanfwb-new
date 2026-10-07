import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostMedia } from "./post-media";
import { isVideoMediaUrl } from "@/lib/media-kind";

vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), undefined] }));
vi.mock("@/hooks/use-lazy-media", () => ({
  useLazyImage: (src: string) => ({ ref: vi.fn(), src, settle: vi.fn() }),
}));

const catbox = "https://files.catbox.moe/uyceje.mp4";
let observers: Array<{ callback: IntersectionObserverCallback; target?: Element; disconnect: () => void }> = [];
beforeEach(() => {
  observers = [];
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("IntersectionObserver", class {
    record: typeof observers[number];
    constructor(callback: IntersectionObserverCallback) {
      this.record = { callback, disconnect: vi.fn() };
      observers.push(this.record);
    }
    observe(target: Element) { this.record.target = target; }
    disconnect() { this.record.disconnect(); }
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("PostCard media", () => {
  it.each([catbox, `${catbox}?download=1#t=2`, "https://example.test/clip.webm", "https://example.test/clip.mov"])("recognizes direct video %s", (url) => {
    expect(isVideoMediaUrl(url)).toBe(true);
    const { container } = render(<PostMedia urls={[url]} />);
    const video = container.querySelector("video");
    expect(video).toHaveAttribute("src", url);
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).not.toHaveAttribute("autoplay");
    expect(container.querySelector("img")).toBeNull();
  });

  it("trims admin URL whitespace before video detection and loading", () => {
    const { container } = render(<PostMedia urls={[`  ${catbox}  `]} />);
    expect(container.querySelector("video")).toHaveAttribute("src", catbox);
  });

  it("retains the existing image gallery", () => {
    const { container } = render(<PostMedia urls={["https://example.test/photo.jpg"]} alt="Ảnh bài viết" />);
    expect(screen.getByRole("img", { name: "Ảnh bài viết" })).toBeInTheDocument();
    expect(container.querySelector(".post-photo-gallery")).toBeInTheDocument();
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders mixed carousel videos with controls and no programmatic autoplay", () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { container } = render(<PostMedia urls={[catbox, "https://example.test/photo.jpg"]} />);
    expect(container.querySelector("video")).toHaveAttribute("src", catbox);
    expect(container.querySelector("video")).toHaveAttribute("controls");
    expect(container.querySelector("video")).toHaveAttribute("preload", "metadata");
    expect(play).not.toHaveBeenCalled();
    play.mockRestore();
  });

  it("shows an explicit media error rather than a blank card", () => {
    const { container } = render(<PostMedia urls={[catbox]} />);
    const video = container.querySelector("video");
    if (!video) throw new Error("Expected native video");
    fireEvent.error(video);
    expect(screen.getByRole("link", { name: "Mở video" })).toHaveAttribute("href", catbox);
  });

  it("opens a bounded, closeable video lightbox without download or autoplay", () => {
    render(<PostMedia urls={[catbox]} />);
    fireEvent.click(screen.getByRole("button", { name: "Phóng to video" }));
    const dialog = screen.getByRole("dialog", { name: "Video phóng to" });
    const video = dialog.querySelector("video");
    expect(video).toHaveStyle({ objectFit: "contain", maxWidth: "min(90vw, calc(100vw - 32px))", maxHeight: "min(80dvh, calc(100dvh - 112px))" });
    expect(video).not.toHaveAttribute("autoplay");
    expect(screen.queryByRole("button", { name: "Tải xuống" })).toBeNull();
    expect(video?.getAttribute("controlsList")).toContain("nodownload");
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("pauses offscreen media and accepts playback again on return", () => {
    const { container, unmount } = render(<article><PostMedia urls={[catbox]} /></article>);
    const video = container.querySelector("video");
    if (!video) throw new Error("Expected video");
    const observer = observers.find((o) => o.target === container.querySelector("article"));
    if (!observer) throw new Error("Expected owner observer");
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    observer.callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver);
    expect(pause).toHaveBeenCalled();
    pause.mockClear();
    fireEvent.play(video);
    expect(pause).toHaveBeenCalled();
    observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    pause.mockClear(); fireEvent.play(video);
    expect(pause).not.toHaveBeenCalled();
    unmount(); expect(observer.disconnect).toHaveBeenCalled();
  });

  it("pauses competing post players and releases lightbox playback on close", () => {
    render(<><PostMedia urls={[catbox]} /><PostMedia urls={["https://example.test/other.webm"]} /></>);
    const videos = document.querySelectorAll("video");
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    fireEvent.play(videos[0]);
    expect(pause.mock.instances).toContain(videos[1]);
    fireEvent.click(screen.getAllByRole("button", { name: "Phóng to video" })[0]);
    const lightboxVideo = screen.getByRole("dialog").querySelector("video");
    if (!lightboxVideo) throw new Error("Expected lightbox video");
    pause.mockClear(); fireEvent.play(lightboxVideo);
    expect(pause.mock.instances).toContain(videos[0]);
    pause.mockClear(); fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(pause.mock.instances).toContain(lightboxVideo);
  });
});