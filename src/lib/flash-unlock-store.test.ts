import { describe, expect, it } from "vitest";
import { readUnlocks, removeUnlock, saveUnlock, unlockKey } from "./flash-unlock-store";

function mem(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}
const T = "a".repeat(64);

describe("flash unlock store", () => {
  it("uses album_hot_unlocked:{userId}:{albumId} key", () => {
    expect(unlockKey("u1", "a1")).toBe("album_hot_unlocked:u1:a1");
  });
  it("stores the confirmed Code for that user + album", () => {
    const s = mem();
    saveUnlock(s, "userA", "a1", "abc-123", T);
    expect(readUnlocks(s, "userA")).toEqual([{ id: "a1", code: "ABC-123", token: T }]);
  });
  it("another account never sees the unlock", () => {
    const s = mem();
    saveUnlock(s, "userA", "a1", "ABC-123", null);
    expect(readUnlocks(s, "userB")).toEqual([]);
  });
  it("unlocking album B adds only B", () => {
    const s = mem();
    saveUnlock(s, "userA", "a", "AAA-111");
    saveUnlock(s, "userA", "b", "BBB-222");
    expect(readUnlocks(s, "userA").map((x) => x.id).sort()).toEqual(["a", "b"]);
  });
  it("still reads old token-only entries and removes both forms", () => {
    const s = mem();
    s.setItem("album_unlock:userA:old", T);
    expect(readUnlocks(s, "userA")).toEqual([{ id: "old", token: T }]);
    removeUnlock(s, "userA", "old");
    expect(readUnlocks(s, "userA")).toEqual([]);
  });
});
