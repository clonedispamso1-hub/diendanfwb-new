import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SeedGroupOption } from "@/lib/seed-account-groups";
import { createContext, useContext } from "react";

const mocks = vi.hoisted(() => ({ read: vi.fn(), catalogue: vi.fn(), context: {} as any }));
vi.mock("@/lib/supabase-v4", () => ({
  sb4: () => ({ from: () => ({ select: () => ({ in: mocks.read }) }) }),
  shortCount: (n: number) => String(n),
}));
vi.mock("@/lib/seed-account-groups", () => ({ SEED_ACCOUNT_GROUPS_TABLE: "seed_account_groups", fetchAllSeedGroups: mocks.catalogue }));
vi.mock("@/components/candy/post/post-card-context", async () => {
  const { createContext, useContext } = await import("react");
  const Context = createContext<any>(null);
  return { PostCardProvider: Context.Provider, usePostCard: () => useContext(Context) ?? mocks.context };
});
vi.mock("@/components/candy/post/LikeButton", () => ({ LikeButton: () => <span>Like</span> }));
vi.mock("@/components/candy/post/PostContactActions", () => ({ PostContactActions: () => <span>Facebook Nhắn tin</span> }));
import { ReactionBar } from "@/components/candy/post/ReactionBar";
import { PostCardProvider } from "@/components/candy/post/post-card-context";

function groups(n: number): SeedGroupOption[] {
  return Array.from({ length: n }, (_, i) => ({ kind: "bait", id: String(i), name: `Nhóm ${i}`, avatar_url: null, member_count: i + 1, message_count: 0, info: null, source: "" }));
}
function mount(children = <ReactionBar />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
beforeEach(() => {
  mocks.read.mockReset(); mocks.catalogue.mockReset();
  mocks.context = { post: { user_id: "owner" }, authorName: "Chủ bài", isAnonymous: false };
});
afterEach(cleanup);

describe("post group badge and popup", () => {
  it.each([0, 1, 5, 24])("shows %i real visible groups matching popup rows", async (n) => {
    const list = groups(n);
    mocks.read.mockResolvedValue({ data: list.map(g => ({ account_id: "owner", group_kind: g.kind, group_id: g.id })), error: null });
    mocks.catalogue.mockResolvedValue(list);
    mount();
    const button = await screen.findByRole("button", { name: `Nhóm: ${n}` });
    expect(button.querySelector(".pc-group-count")?.textContent).toBe(String(n));
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog", { name: "Nhóm của Chủ bài" });
    expect(dialog.querySelectorAll(".pgp-row")).toHaveLength(n);
    if (!n) expect(dialog).toHaveTextContent("Thành viên này chưa tham gia nhóm nào.");
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });
  it("deduplicates group kind/id and excludes inaccessible catalogue rows", async () => {
    mocks.read.mockResolvedValue({ data: [
      { account_id: "owner", group_kind: "bait", group_id: "0" },
      { account_id: "owner", group_kind: "bait", group_id: "0" },
      { account_id: "owner", group_kind: "zalo", group_id: "0" },
      { account_id: "owner", group_kind: "bait", group_id: "private" },
    ], error: null });
    mocks.catalogue.mockResolvedValue([...groups(1), { ...groups(1)[0], kind: "zalo" }]);
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Nhóm: 2" }));
    expect(screen.getByRole("dialog").querySelectorAll(".pgp-row")).toHaveLength(2);
  });
  it("batches different owners and reuses one query for repeated posts", async () => {
    mocks.read.mockResolvedValue({ data: [{ account_id: "other", group_kind: "bait", group_id: "0" }], error: null });
    mocks.catalogue.mockResolvedValue(groups(1));
    function Owner({ id }: { id: string }) {
      const value = { post: { user_id: id }, authorName: id, isAnonymous: false } as any;
      return <PostCardProvider value={value}><ReactionBar /></PostCardProvider>;
    }
    mount(<><Owner id="owner" /><Owner id="owner" /><Owner id="other" /></>);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Nhóm: 0" })).toHaveLength(2));
    expect(screen.getByRole("button", { name: "Nhóm: 1" })).toBeTruthy();
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(new Set(mocks.read.mock.calls[0][1])).toEqual(new Set(["owner", "other"]));
  });
  it("never substitutes zero while loading or on error and can retry", async () => {
    let rejectRequest: ((error: Error) => void) | undefined;
    mocks.read.mockImplementationOnce(() => new Promise((_, reject) => { rejectRequest = reject; }));
    mount();
    await waitFor(() => expect(mocks.read).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Nhóm: 0" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Nhóm" }));
    expect(screen.getByText("Đang tải nhóm…")).toBeTruthy();
    rejectRequest?.(new Error("network unavailable"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không thể tải nhóm.");
    expect(screen.queryByText("Thành viên này chưa tham gia nhóm nào.")).toBeNull();
    mocks.read.mockResolvedValue({ data: [], error: null });
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByRole("button", { name: "Nhóm: 0" })).toBeTruthy();
  });
  it("reuses supplied profile list without any extra read", async () => {
    mocks.context.profileGroupsPopup = { groups: [...groups(1), ...groups(1)], loading: false, displayName: "Hồ sơ" };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Nhóm: 1" }));
    expect(screen.getByRole("dialog").querySelectorAll(".pgp-row")).toHaveLength(1);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("does not reveal an anonymous author's group count", () => {
    mocks.context.isAnonymous = true;
    mocks.context.profileGroupsPopup = { groups: groups(5), loading: false, displayName: "Private" };
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Nhóm" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".pc-group-count")).toBeNull();
    expect(mocks.read).not.toHaveBeenCalled();
  });
});