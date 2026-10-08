import { afterEach, describe, expect, it, vi } from "vitest";
import { hideDevtoolsLock, installConsoleDetection, installDevtoolsDetection, installInputBlocking, installShortcutTrap, isDockedDevtoolsSize, showDevtoolsLock } from "./devtools-guard";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("explicit developer-tool shortcuts", () => {
  it.each([
    { key: "F12", code: "F12" },
    ...["I", "J", "C"].map((key) => ({ key, code: `Key${key}`, ctrlKey: true, shiftKey: true })),
    ...["I", "J", "C"].map((key) => ({ key: "∆", code: `Key${key}`, metaKey: true, altKey: true })),
    ...["I", "J", "C"].map((key) => ({ key, code: `Key${key}`, metaKey: true, shiftKey: true })),
  ])("locks synchronously exactly once for %o", (init) => {
    const lock = vi.fn();
    const remove = installShortcutTrap(lock);
    const event = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
    document.dispatchEvent(event);
    expect(lock).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
    document.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
    expect(lock).toHaveBeenCalledTimes(1);
    remove();
  });
  it.each([
    { key: "a" }, { key: "I" }, { key: "c", ctrlKey: true },
    { key: "v", metaKey: true }, { key: "s", ctrlKey: true },
    { key: "u", ctrlKey: true }, { key: "F12", isComposing: true },
  ])("does not lock ordinary input / source-save blocking %o", (init) => {
    const lock = vi.fn(); const remove = installShortcutTrap(lock);
    document.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
    expect(lock).not.toHaveBeenCalled(); remove();
  });
  it("cleanup disables shortcut locking", () => {
    const lock = vi.fn(); const remove = installShortcutTrap(lock); remove();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "F12", bubbles: true }));
    expect(lock).not.toHaveBeenCalled();
  });
  it("keeps existing source/save blocking separate from locks", () => {
    const lock = vi.fn(); const stopInput = installInputBlocking(); const stopTrap = installShortcutTrap(lock);
    const event = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, cancelable: true });
    window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); expect(lock).not.toHaveBeenCalled();
    stopInput(); stopTrap();
  });
  it("blocks the context menu everywhere, including inputs", () => {
    const stop = installInputBlocking();
    const input = document.createElement("input"); document.body.appendChild(input);
    const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    input.dispatchEvent(ev); expect(ev.defaultPrevented).toBe(true);
    const u = new KeyboardEvent("keydown", { key: "u", ctrlKey: true, cancelable: true, bubbles: true });
    input.dispatchEvent(u); expect(u.defaultPrevented).toBe(true);
    input.remove(); stop();
  });
  it("console probe stays a no-op", () => {
    vi.useFakeTimers(); const lock = vi.fn(); const stop = installConsoleDetection(lock);
    vi.advanceTimersByTime(60_000); expect(lock).not.toHaveBeenCalled(); stop();
  });
});

describe("open-DevTools detection", () => {
  it.each([
    [{ innerWidth: 1280, innerHeight: 900, outerWidth: 1280, outerHeight: 1000 }, false], // normal
    [{ innerWidth: 1024, innerHeight: 720, outerWidth: 1280, outerHeight: 1000 }, false], // zoom 125%
    [{ innerWidth: 640, innerHeight: 450, outerWidth: 1280, outerHeight: 1000 }, false], // zoom 200%
    [{ innerWidth: 820, innerHeight: 900, outerWidth: 1280, outerHeight: 1000 }, true], // docked right
    [{ innerWidth: 1280, innerHeight: 560, outerWidth: 1280, outerHeight: 1000 }, true], // docked bottom
  ])("size ratio %o -> %s", (w, expected) => {
    expect(isDockedDevtoolsSize(w)).toBe(expected);
  });
  it("debugger pause opens immediately and closes when it stops", () => {
    vi.useFakeTimers(); let paused = true; const onChange = vi.fn();
    const stop = installDevtoolsDetection(onChange, { checkDebugger: () => paused, checkSize: () => false });
    expect(onChange).toHaveBeenLastCalledWith(true);
    paused = false; vi.advanceTimersByTime(1000);
    expect(onChange).toHaveBeenLastCalledWith(false); stop();
  });
  it("size signal must persist for two samples; idle 60s closed never fires", () => {
    vi.useFakeTimers(); let sized = false; const onChange = vi.fn();
    const stop = installDevtoolsDetection(onChange, { checkDebugger: () => false, checkSize: () => sized });
    vi.advanceTimersByTime(60_000); expect(onChange).not.toHaveBeenCalled();
    sized = true; vi.advanceTimersByTime(1000); expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000); expect(onChange).toHaveBeenLastCalledWith(true);
    sized = false; vi.advanceTimersByTime(1000); expect(onChange).toHaveBeenLastCalledWith(false);
    stop();
  });
  it("detection blanks the whole page (no warning text) and restores it", () => {
    document.body.innerHTML = '<div id="site">Site UI</div>';
    showDevtoolsLock();
    expect(document.getElementById("site")).toBeNull();
    expect(document.body.childNodes.length).toBe(0);
    expect(document.documentElement.textContent?.trim()).toBe("");
    hideDevtoolsLock();
    expect(document.getElementById("site")).not.toBeNull();
  });
});
