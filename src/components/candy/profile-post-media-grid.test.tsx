import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractProfileMediaUrls, ProfilePostMediaGrid } from "./profile-post-media-grid";
import type { PostRecord } from "@/lib/app-types";

vi.mock("embla-carousel-react", () => ({ default: () => [vi.fn(), undefined] }));
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("IntersectionObserver", undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const video = "https://files.catbox.moe/uyceje.mp4";
const image = "https://example.test/photo.jpg";
describe("Profile post thumbnails", () => {
  it("uses the post resolver for array, legacy and serialized media URLs", () => {
    const posts = [{ image_urls: [image, video] }, { image_url: video }, { image_urls: JSON.stringify([image, "https://example.test/other.webm"]) }] as unknown as PostRecord[];
    expect(extractProfileMediaUrls(posts)).toEqual([image, video, "https://example.test/other.webm"]);
  });
  it("shows a paused native frame instead of treating video as an image", () => {
    render(<ProfilePostMediaGrid urls={[image, video]} />);
    const tile = screen.getByRole("button", { name: "Video 2" });
    expect(tile.querySelector("img")).toBeNull();
    expect(tile.querySelector("video")).toHaveAttribute("src", video);
    expect(tile.querySelector("video")).toHaveAttribute("preload", "metadata");
    expect(tile.querySelector("video")).not.toHaveAttribute("autoplay");
    expect(tile.querySelector("svg")).toBeInTheDocument();
  });
  it("opens the existing bounded video viewer without downloads", () => {
    render(<ProfilePostMediaGrid urls={[video]} />);
    fireEvent.click(screen.getByRole("button", { name: "Video 1" }));
    const player = screen.getByRole("dialog", { name: "Video phóng to" }).querySelector("video");
    expect(player).toHaveAttribute("controls");
    expect(player?.getAttribute("controlsList")).toContain("nodownload");
    expect(screen.queryByRole("button", { name: "Tải xuống" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("opens the existing image viewer for image thumbnails", () => {
    render(<ProfilePostMediaGrid urls={[image]} />);
    fireEvent.click(screen.getByRole("button", { name: "Ảnh 1" }));
    expect(screen.getByRole("dialog", { name: "Trình xem ảnh" })).toBeInTheDocument();
  });
});