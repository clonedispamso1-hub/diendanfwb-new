/**
 * Social Quick Menu — 5 mục luôn active, mọi click mở popup VIP duy nhất.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// Router + auth: jsdom không có provider.
vi.mock("react-router-dom", () => ({ useNavigate: () => () => {} }));
vi.mock("@/components/candy/auth-provider", () => ({
  useAuth: () => ({ me: null, isAdmin: false }),
}));
// Stub DB router + supabase (không network trong test).
vi.mock("@/lib/db/router", () => ({
  supabase: { from: () => ({ select: () => ({ or: async () => ({ data: [], error: null }) }) }), rpc: async () => ({ data: null, error: null }) },
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: () => ({ select: () => ({ or: async () => ({ data: [], error: null }) }) }) } }));

// Cung cấp context PostCard tối giản.
vi.mock("@/components/candy/post/post-card-context", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/components/candy/post/post-card-context")>();
  const value = {
    post: { id: "p1", user_id: "u1", content: "hello", created_at: "2026-09-01T00:00:00Z" },
    authorName: "Test",
    meId: "me1",
    likes: 3,
    botLikes: 1,
    isAnonymous: false,
  } as never;
  return { ...orig, usePostCard: () => value };
});

import { PostContactActions } from "@/components/candy/post/PostContactActions";

describe("Social Quick Menu", () => {
  it("shows all five items active and opens the VIP popup on click", async () => {
    render(<PostContactActions />);
    fireEvent.click(screen.getByLabelText("Liên hệ tác giả qua mạng xã hội"));
    const items = await screen.findAllByRole("menuitem");
    // SocialGlyph Zalo nhét chữ nhãn nhỏ vào SVG → so khớp bằng includes.
    expect(items.map((i) => i.textContent!.trim())).toEqual(
      expect.arrayContaining([
        "Kết Bạn Facebook",
        "ZaloKết Bạn Zalo",
        "Kết Bạn Telegram",
        "Theo dõi Instagram",
        "Theo dõi X",
      ]),
    );
    for (const item of items) expect(item).not.toBeDisabled();

    // Click từng mục → không mở link, chỉ mở popup VIP.
    const openSpy = vi.fn();
    vi.stubGlobal("open", openSpy);
    // Đóng menu trước (nút trigger là nút toggle).
    fireEvent.click(screen.getByLabelText("Liên hệ tác giả qua mạng xã hội"));
    for (const label of ["Kết Bạn Facebook", "Kết Bạn Telegram", "Theo dõi X"]) {
      // Click mở lại menu vì lựa chọn trước đó đã đóng popup + menu.
      fireEvent.click(screen.getByLabelText("Liên hệ tác giả qua mạng xã hội"));
      fireEvent.click(screen.getByRole("menuitem", { name: new RegExp(label) }));
      await waitFor(() => expect(document.querySelector(".clp-overlay")).toBeTruthy());
      expect(openSpy).not.toHaveBeenCalled();
      fireEvent.click(document.querySelector(".clp-close")!);
      await waitFor(() => expect(document.querySelector(".clp-overlay")).toBeNull());
    }
    expect(openSpy).not.toHaveBeenCalled();
  });
});
