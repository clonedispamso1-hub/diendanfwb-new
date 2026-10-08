import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CommonLockedPopup } from "./common-locked-popup";

vi.mock("@/components/candy/auth-provider", () => ({ useAuth: () => ({ me: { province: "Hà Nội" } }) }));
vi.mock("@/lib/vip-unlock-link", () => ({ useVipUnlockLink: () => "https://example.com/support" }));
vi.mock("@/lib/vip-unlock-config", () => ({
  useVipUnlockConfig: () => ({
    title: "VIP {location}", message: "Quyền lợi {location}", defaultLocation: "Toàn Quốc",
    buttonLabel: "Liên hệ Admin", buttonColor: "gold", headerMedia: "/vip.gif", icon: "👑", link: "example.com/admin",
    features: [{ icon: "💬", title: "Zalo {location}", subtitle: "Mô tả Admin {location}\nGiữ nguyên dòng hai" }, { icon: "🎥", title: "Video", subtitle: "" }],
  }),
  renderLocationText: (s: string, location: string) => s.replace(/\{location\}/gi, location),
}));

beforeEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); });
describe("VIP popup presentation preserves behavior", () => {
  it("keeps media and location, expands and collapses original descriptions", () => {
    const close = vi.fn();
    render(<CommonLockedPopup open onClose={close} />);
    expect(screen.getByRole("dialog", { name: "VIP Hà Nội" })).toBeTruthy();
    expect(document.querySelector(".clp-media img")?.getAttribute("src")).toBe("/vip.gif");
    const benefit = screen.getByRole("button", { name: "Zalo Hà Nội" });
    expect(benefit.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(benefit);
    expect(benefit.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Mô tả Admin Hà Nội/).textContent).toContain("\nGiữ nguyên dòng hai");
    fireEvent.click(benefit);
    expect(benefit.getAttribute("aria-expanded")).toBe("false");
    expect(close).not.toHaveBeenCalled();
  });
  it("retains support URL normalization and closes", () => {
    const close = vi.fn(); const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<CommonLockedPopup open onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Liên hệ Admin" }));
    expect(open).toHaveBeenCalledWith("https://example.com/admin", "_blank", "noopener,noreferrer");
    expect(close).toHaveBeenCalledOnce();
  });
  it("retains the guide flag and current-page event", () => {
    const close = vi.fn(); const event = vi.fn(); window.addEventListener("goto-vip-zalo-tab", event);
    render(<CommonLockedPopup open onClose={close} />);
    fireEvent.click(screen.getByRole("button", { name: "Hướng dẫn tham gia" }));
    expect(sessionStorage.getItem("goto-vip-zalo-tab")).toBe("1");
    expect(event).toHaveBeenCalledOnce(); expect(close).toHaveBeenCalledOnce();
    window.removeEventListener("goto-vip-zalo-tab", event);
  });
  it("retains X, Escape, backdrop dismissal and does not close inside", () => {
    const close = vi.fn(); render(<CommonLockedPopup open onClose={close} />);
    fireEvent.click(screen.getByRole("heading", { name: "VIP Hà Nội" })); expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Đóng" }));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("dialog")); expect(close).toHaveBeenCalledTimes(3);
  });
  it("does not render while closed", () => {
    render(<CommonLockedPopup open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});