import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { submitRewardReport } = vi.hoisted(() => ({ submitRewardReport: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/services/report-reward.service", () => ({ submitRewardReport }));
vi.mock("@/components/candy/auth-provider", () => ({
  useAuth: () => ({ me: { id: "viewer-123", full_name: "Viewer" } }),
}));
vi.mock("@/lib/supabase", () => ({ supabase: {} }));
vi.mock("@/lib/media", () => ({ uploadMediaUrl: vi.fn() }));

import { ReportRewardModal } from "@/components/candy/report-reward-modal";

describe("Existing post report popup", () => {
  it("receives the author and post, then submits through the existing report service", async () => {
    const close = vi.fn();
    render(<ReportRewardModal open onClose={close} targetUid="author-123"
      targetName="Tác giả" targetAvatar="https://example.com/avatar.jpg" postId="post-456" initialKind="post" />);

    expect(screen.getByRole("dialog", { name: "Tố cáo vi phạm nhận thưởng" })).toBeTruthy();
    expect((screen.getByLabelText("Bước 1 — UID người vi phạm") as HTMLInputElement).value).toBe("author-123");
    expect(screen.getByText("Tác giả")).toBeTruthy();
    expect(screen.getByText("post-456")).toBeTruthy();
    expect(screen.getByText("Bài viết")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Bước 3 — Lý do vi phạm"), { target: { value: "Nội dung vi phạm" } });
    fireEvent.click(screen.getByRole("button", { name: "Gửi Tố Cáo" }));
    await waitFor(() => expect(submitRewardReport).toHaveBeenCalledWith(expect.objectContaining({
      targetUid: "author-123", targetName: "Tác giả", targetAvatar: "https://example.com/avatar.jpg",
      kind: "post", reason: "Post UID: post-456\nNội dung vi phạm",
    })));
    expect(close).toHaveBeenCalled();
  });
});