import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const openReport = vi.fn();
vi.mock("@/components/candy/post/post-card-context", () => ({
  usePostCard: () => ({ openReport, isPostOwner: false, menuOpen: true, canDelete: false,
    setMenuOpen: vi.fn(), copyUrl: vi.fn(), copyUid: vi.fn(), openPostMenu: vi.fn() }),
}));
vi.mock("@/components/candy/post/LikeButton", () => ({ LikeButton: () => <span>Like</span> }));
vi.mock("@/components/candy/post/PostContactActions", () => ({ PostContactActions: () => <span>Facebook Nhắn tin</span> }));

import { ReactionBar } from "@/components/candy/post/ReactionBar";
import { PostMenu } from "@/components/candy/post/PostMenu";

describe("Post report action", () => {
  it("opens the existing report handler immediately after Like", () => {
    render(<ReactionBar />);
    const row = screen.getByRole("group", { name: "Tương tác" });
    expect(row.textContent).toContain("LikeFacebook Nhắn tin");
    expect(screen.queryByText("Tố cáo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tố cáo bài viết" }));
    expect(openReport).toHaveBeenCalledOnce();
  });

  it("does not offer reporting in the overflow menu", () => {
    render(<PostMenu />);
    expect(screen.getByText("Sao chép liên kết")).toBeTruthy();
    expect(screen.getByText("Sao chép Post UID")).toBeTruthy();
    expect(screen.queryByText("Báo cáo bài viết")).toBeNull();
  });
});