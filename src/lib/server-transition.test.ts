import { describe, expect, it } from "vitest";

import {
  SERVER_TRANSITION_DURATION_MS,
  SERVER_TRANSITION_STATUSES,
  shouldReturnToMixedOnClose,
} from "@/lib/server-transition";

describe("server transition timing", () => {
  it("keeps the transition active for exactly ten seconds", () => {
    expect(SERVER_TRANSITION_DURATION_MS).toBe(10_000);
  });

  it("shows all four progress messages before the transition completes", () => {
    expect(SERVER_TRANSITION_STATUSES.map(({ at }) => at)).toEqual([0, 3_000, 6_000, 9_000]);
    expect(SERVER_TRANSITION_STATUSES.at(-1)?.at).toBeLessThan(SERVER_TRANSITION_DURATION_MS);
  });

  it("returns a non-VIP user from a regional server to mixed on close", () => {
    expect(shouldReturnToMixedOnClose("vn", false)).toBe(true);
  });

  it("closes normally when the user is already on mixed", () => {
    expect(shouldReturnToMixedOnClose("mixed", false)).toBe(false);
  });

  it("closes normally when the user has valid VIP access", () => {
    expect(shouldReturnToMixedOnClose("jp", true)).toBe(false);
  });
});