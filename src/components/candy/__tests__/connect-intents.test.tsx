import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ConnectPage, isDisplayableMember, relationshipLabel } from "@/components/candy/connect-page";

const rows = [
  { id: "member-1", display_name: "Mai", full_name: null, nickname: null, avatar: "https://example.com/mai.jpg", location: "Gò Vấp", age: 24, gender: "female", intent: "fwb", is_banned: false },
  { id: "member-2", display_name: "An", full_name: null, nickname: null, avatar: "https://example.com/an.jpg", location: "Đà Nẵng", age: 27, gender: "male", intent: "ons", is_banned: false },
];
const saveHeart = vi.fn(async (_meId: string, _memberId: string, _next: boolean) => true);
vi.mock("@/components/candy/auth-provider", () => ({ useAuth: () => ({ me: { id: "viewer" } }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }) } }));
vi.mock("@/lib/follow-actions", () => ({ setProfileHeart: (meId: string, memberId: string, next: boolean) => saveHeart(meId, memberId, next) }));

afterEach(() => { vi.clearAllMocks(); });

describe("/connect — hồ sơ thành viên thật", () => {
  it("chỉ hiển thị hồ sơ có dữ liệu thật và ba giá trị quan hệ", () => {
    expect(relationshipLabel("love")).toBe("Người Yêu");
    expect(relationshipLabel("dating")).toBeNull();
    expect(isDisplayableMember(rows[0], "viewer")).toBe(true);
    expect(isDisplayableMember({ ...rows[0], avatar: null }, "viewer")).toBe(false);
    expect(isDisplayableMember(rows[0], "member-1")).toBe(false);
  });
  it("hiển thị avatar, tên, giới tính, tuổi, vị trí và mối quan hệ; X chuyển hồ sơ", async () => {
    render(<ConnectPage />);
    expect(await screen.findByRole("heading", { name: "Mai" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Ảnh đại diện Mai" })).toHaveAttribute("src", rows[0].avatar);
    expect(screen.getByText("Nữ", { exact: false })).toHaveTextContent("24 tuổi");
    expect(screen.getByText("Gò Vấp")).toBeInTheDocument();
    expect(screen.getByText("FWB")).toBeInTheDocument();
    expect(screen.queryByText(/%|CARD BÍ ẨN|TÌM KẾT NỐI|CÀI ĐẶT/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Bỏ qua" }));
    expect(screen.getByRole("heading", { name: "An" })).toBeInTheDocument();
    expect(screen.getByText("Đà Nẵng")).toBeInTheDocument();
    expect(screen.getByText("ONS")).toBeInTheDocument();
  });
  it("tim gọi hành động yêu thích sẵn có với đúng ID rồi chuyển hồ sơ", async () => {
    render(<ConnectPage />);
    await screen.findByRole("heading", { name: "Mai" });
    fireEvent.click(screen.getByRole("button", { name: "Yêu thích" }));
    await waitFor(() => expect(saveHeart).toHaveBeenCalledWith("viewer", "member-1", true));
    await screen.findByRole("heading", { name: "An" });
  });
});
