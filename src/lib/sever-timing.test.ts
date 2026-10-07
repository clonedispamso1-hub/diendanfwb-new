import { describe, expect, it } from "vitest";
import { getSeverTiming, SEVER_PHASE_DURATION_MS } from "./sever-timing";

describe("local Sever progress", () => {
  it("uses a ten-second duration and clamps both endpoints", () => {
    expect(SEVER_PHASE_DURATION_MS).toBe(10_000);
    expect(getSeverTiming(-1)).toEqual({ progress: 1, remaining: 10 });
    expect(getSeverTiming(10_000)).toEqual({ progress: 100, remaining: 0 });
    expect(getSeverTiming(20_000)).toEqual({ progress: 100, remaining: 0 });
  });
  it("keeps percentage and countdown synchronized and monotonic", () => {
    let previous = 1;
    for (let elapsed = 0; elapsed <= 10_000; elapsed += 100) {
      const { progress, remaining } = getSeverTiming(elapsed);
      expect(progress).toBeGreaterThanOrEqual(previous);
      expect(remaining).toBe(Math.ceil((10_000 - elapsed) / 1000));
      previous = progress;
    }
    expect(getSeverTiming(5000)).toEqual({ progress: 50, remaining: 5 });
    expect(getSeverTiming(9900)).toEqual({ progress: 99, remaining: 1 });
  });
});