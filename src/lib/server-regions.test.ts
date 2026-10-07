import { describe, expect, it } from "vitest";

import { REGIONS_BY_SERVER, searchServerRegions, stableRegionMemberCount } from "@/lib/server-regions";

describe("server region picker", () => {
  it("uses all 63 existing Vietnamese provinces", () => {
    expect(REGIONS_BY_SERVER.vn).toHaveLength(63);
  });

  it("finds Vietnamese regions without requiring accents", () => {
    expect(searchServerRegions(REGIONS_BY_SERVER.vn, "hai phong")).toEqual(["Hải Phòng"]);
  });

  it("finds international regions case-insensitively", () => {
    expect(searchServerRegions(REGIONS_BY_SERVER.us, "calif")).toEqual(["California"]);
  });

  it("includes the requested community regions outside Vietnam", () => {
    expect(REGIONS_BY_SERVER.tw).toContain("台北市");
    expect(REGIONS_BY_SERVER.jp).toContain("千葉県");
    expect(REGIONS_BY_SERVER.us).toContain("Massachusetts");
  });

  it("keeps the same mock member count for a region", () => {
    const first = stableRegionMemberCount("Hải Phòng", "vn");
    expect(stableRegionMemberCount("Hải Phòng", "vn")).toBe(first);
    expect(first).toBeGreaterThanOrEqual(52);
    expect(first).toBeLessThanOrEqual(328);
  });
});
import { detectMemberSever } from "@/lib/server-regions";

describe("author sever detection", () => {
  it("maps a Vietnamese province to Sever Việt Nam", () => {
    expect(detectMemberSever("Bình Dương")?.sever.id).toBe("vn");
    expect(detectMemberSever("Bình Dương")?.region).toBe("Bình Dương");
  });
  it("maps foreign regions to their Sever", () => {
    expect(detectMemberSever(null, "California")?.sever.id).toBe("us");
    expect(detectMemberSever("東京都")?.sever.id).toBe("jp");
    expect(detectMemberSever("Seoul")?.sever.id).toBe("kr");
  });
  it("returns nothing when the author has no location", () => {
    expect(detectMemberSever(null, "")).toBeNull();
  });
});
