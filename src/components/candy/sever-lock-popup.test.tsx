import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CountryFlagType } from "@/components/candy/country-flag";
import { SeverLockPopup } from "./sever-lock-popup";

vi.mock("@/hooks/use-body-scroll-lock", () => ({ useBodyScrollLock: vi.fn() }));

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("SeverLockPopup", () => {
  it.each([
    ["An Giang", "vn"],
    ["Bình Dương", "vn"],
    ["台北市", "tw"],
    ["東京都", "jp"],
    ["Seoul", "kr"],
    ["北京", "cn"],
    ["California", "us"],
  ] as Array<[string, CountryFlagType]>)("shows the lock reason for %s and returns only once after 10s", (location, country) => {
    vi.useFakeTimers();
    const onReturn = vi.fn();
    render(<SeverLockPopup location={location} country={country} onReturnToMixed={onReturn} />);
    expect(document.getElementById("sever-lock-title")?.textContent).toBe(`Không mở được ${location}`);
    expect(screen.getByText((_, el) => el?.classList.contains("sever-lock-desc") === true)?.textContent)
      .toBe(`Vì bạn chưa tham gia VIP ZALO khu\u00A0vực ${location}.`);
    expect(screen.getByText("Bạn sẽ được đưa về Sever Hỗn Tạp")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "1");
    for (let second = 1; second <= 10; second++) {
      expect(onReturn).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1000));
    }
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "100");
    act(() => vi.advanceTimersByTime(40));
    expect(onReturn).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(10_000));
    expect(onReturn).toHaveBeenCalledTimes(1);
  });

  it("cleans up the timer when unmounted", () => {
    vi.useFakeTimers();
    const onReturn = vi.fn();
    const { unmount } = render(<SeverLockPopup location="Bình Dương" country="vn" onReturnToMixed={onReturn} />);
    act(() => vi.advanceTimersByTime(2000));
    unmount();
    act(() => vi.advanceTimersByTime(10_000));
    expect(onReturn).not.toHaveBeenCalled();
  });
});
