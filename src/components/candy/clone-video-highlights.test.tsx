import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CloneVideoHighlights } from "./clone-video-highlights";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal("IntersectionObserver", undefined);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("keeps highlight previews paused and opens the existing viewer only on click", () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  const url = "https://example.test/highlight.webm";
  render(<CloneVideoHighlights urls={[url]} />);
  const trigger = screen.getByRole("button", { name: "Video nổi bật 1" });
  fireEvent.mouseEnter(trigger);
  expect(play).not.toHaveBeenCalled();
  expect(trigger.querySelector("video")).not.toHaveAttribute("autoplay");
  expect(trigger.querySelector("video")).toHaveAttribute("src", url);
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(trigger);
  expect(screen.getByRole("dialog").querySelector("video")).toHaveAttribute("src", url);
  fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});