import { describe, it, expect } from "vitest";
import { isDeviceBlockedSticky, markDeviceBlocked } from "@/lib/access-guard";

describe("device block không dựa vào cờ lưu trên máy", () => {
  it("cờ fwb_dev_blk cũ không còn làm máy bị coi là chặn", () => {
    localStorage.setItem("fwb_dev_blk", "1");
    expect(isDeviceBlockedSticky()).toBe(false);
  });
  it("markDeviceBlocked không ghi cờ dính nữa", () => {
    markDeviceBlocked();
    expect(localStorage.getItem("fwb_dev_blk")).toBeNull();
  });
});
