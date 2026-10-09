import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---- Dữ liệu mẫu: 3 thành viên thật, tên và SĐT thuộc CÙNG một record ----
const MEMBERS: { id: string; full_name: string; phone: string; created_at?: string }[] = [
  { id: "11111111-1111-1111-1111-111111111111", full_name: "Nguyễn Văn A", phone: "0900000001" },
  { id: "22222222-2222-2222-2222-222222222222", full_name: "Trần Văn B", phone: "0900000002" },
  { id: "33333333-3333-3333-3333-333333333333", full_name: "Lê Văn C", phone: "0900000003" },
];

const writeText = vi.fn().mockResolvedValue(undefined);

vi.hoisted(() => ({ }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(async (name: string) => {
      if (name === "admin_list_members") {
        return {
          data: MEMBERS.map((m) => ({
            id: m.id,
            public_id: "UID" + m.id.slice(0, 4),
            full_name: m.full_name,
            username: "user" + m.phone,
            avatar: null,
            phone: m.phone,
            created_at: m.created_at ?? "2026-09-01T00:00:00.000Z",
            last_seen: null,
            is_online: false,
            is_admin: false,
            is_banned: false,
            banned_until: null,
            role: "user",
            followers_count: 0,
            posts_count: 0,
            following_count: 0,
            fingerprint: null,
            ip: null,
            user_agent: null,
          })),
          error: null,
        };
      }
      return { data: [], error: null };
    }),
    from: vi.fn(() => ({
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })), in: vi.fn(async () => ({ error: null })) })),
      select: vi.fn(() => ({ eq: vi.fn(async () => ({ data: [], error: null })) })),
    })),
  },
}));

vi.mock("@/lib/admin-members-fallback", () => ({
  isMissingRpc: () => false,
  isUuidTextMismatch: () => false,
  listMembersFallback: vi.fn(async () => []),
}));
vi.mock("@/lib/admin/member-stats", () => ({
  fetchMemberStats: vi.fn(async () => ({ gem: new Map(), posts: new Map(), followers: new Map() })),
}));
vi.mock("@/lib/device-intel", () => ({
  fetchLatestDeviceSignal: vi.fn(async () => null),
  fetchPasswordChanges: vi.fn(async () => []),
  fetchUserDeviceMarks: vi.fn(async () => new Map()),
}));
vi.mock("@/lib/admin-member-detail", () => ({
  isSystemAccount: () => false,
  loadBangchuIds: vi.fn(async () => new Set<string>()),
}));
vi.mock("@/services/restrictions.service", () => ({ restrictionsService: {} }));
vi.mock("@/hooks/use-body-scroll-lock", () => ({ useBodyScrollLock: () => undefined }));
vi.mock("@/lib/image-cdn", () => ({ avatarSrc: (v: string) => v }));
vi.mock("@/components/candy/presence-status", () => ({ isRecentlyActive: () => false }));
vi.mock("@/components/admin-v3/second-accounts/BulkAccountCreator", () => ({ BulkAccountCreator: () => null }));
vi.mock("@/components/admin-v3/members/RestrictionPanel", () => ({ RestrictionPanel: () => null }));
vi.mock("@/components/admin-v3/members/intel/AntiClonePanel", () => ({
  AntiClonePanel: () => null,
  SharedIpDialog: () => null,
}));
vi.mock("@/components/admin-v3/members/MemberDetailDialogs", () => ({
  MemberPostsDialog: () => null,
  MemberFollowDialog: () => null,
  MemberGemHistoryDialog: () => null,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), message: vi.fn() } }));

import { MembersManager } from "@/components/admin-v3/members/MembersManager";
import { toast } from "sonner";

const COPY_BTN = "Sao chép Tên + SĐT";

/** Số thành viên đang chọn hiện trong thanh thao tác: "<b>N</b> đã chọn". */
async function expectSelectedCount(n: number) {
  await waitFor(() => {
    const el = screen.getByText("đã chọn");
    expect(el.textContent?.trim()).toBe(`${n} đã chọn`);
  });
}

function renderManager() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MembersManager />
    </QueryClientProvider>,
  );
}

/** Checkbox dòng 1..n (index 0 là "chọn tất cả" ở đầu bảng). */
async function rowCheckboxes() {
  await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBe(4));
  return screen.getAllByRole("checkbox").slice(1);
}

beforeEach(() => {
  writeText.mockClear();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

describe("Nút 'Sao chép Tên + SĐT' trong thanh thao tác hàng loạt", () => {
  it("chưa chọn thành viên nào → nút không xuất hiện", async () => {
    renderManager();
    await rowCheckboxes();
    expect(screen.queryByText(COPY_BTN)).toBeNull();
  });

  it("chọn 1 thành viên → nút vẫn không xuất hiện", async () => {
    renderManager();
    const boxes = await rowCheckboxes();
    fireEvent.click(boxes[0]);
    await expectSelectedCount(1);
    expect(screen.queryByText(COPY_BTN)).toBeNull();
  });

  it("chọn 2 thành viên → nút xuất hiện và copy đúng 2 dòng '[Tên] [SĐT]' của chính họ", async () => {
    renderManager();
    const boxes = await rowCheckboxes();
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    await expectSelectedCount(2);
    fireEvent.click(screen.getByText(COPY_BTN));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe("Nguyễn Văn A 0900000001\nTrần Văn B 0900000002");
    expect(String(writeText.mock.calls[0][0])).not.toContain(",");
    expect(String(writeText.mock.calls[0][0])).not.toMatch(/(Tên|SĐT):/);
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith("Đã sao chép 2 thành viên", expect.anything());
  });

  it("chọn cả 3 → copy đúng 3 dòng, tên luôn đi kèm SĐT của cùng người đó", async () => {
    renderManager();
    const boxes = await rowCheckboxes();
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.click(boxes[2]);
    await expectSelectedCount(3);
    fireEvent.click(screen.getByText(COPY_BTN));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toBe(
      "Nguyễn Văn A 0900000001\nTrần Văn B 0900000002\nLê Văn C 0900000003",
    );
    expect(String(writeText.mock.calls[0][0]).split("\n")).toHaveLength(3);
  });

  it("bấm 'chọn tất cả' → nút xuất hiện và copy đủ cả 3 thành viên", async () => {
    renderManager();
    await rowCheckboxes();
    // ô "chọn tất cả" ở đầu bảng = checkbox đầu tiên
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    await expectSelectedCount(3);
    expect(screen.queryByText(COPY_BTN)).not.toBeNull();
    fireEvent.click(screen.getByText(COPY_BTN));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = String(writeText.mock.calls[0][0]);
    expect(text.split("\n")).toHaveLength(3);
    expect(text).toContain("Nguyễn Văn A 0900000001");
    expect(text).toContain("Trần Văn B 0900000002");
    expect(text).toContain("Lê Văn C 0900000003");
  });

  it("sau khi copy, trạng thái chọn vẫn giữ nguyên (không tự bỏ chọn)", async () => {
    renderManager();
    const boxes = await rowCheckboxes();
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[2]);
    await expectSelectedCount(2);
    fireEvent.click(screen.getByText(COPY_BTN));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    await expectSelectedCount(2);
    const after = screen.getAllByRole("checkbox");
    expect((after[1] as HTMLInputElement).checked).toBe(true);
    expect((after[2] as HTMLInputElement).checked).toBe(false);
    expect((after[3] as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText(COPY_BTN)).not.toBeNull();
  });

  it("trình duyệt chặn clipboard → báo lỗi rõ ràng bằng toast, không bỏ chọn", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    renderManager();
    const boxes = await rowCheckboxes();
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    await expectSelectedCount(2);
    fireEvent.click(screen.getByText(COPY_BTN));

    await waitFor(() => expect(vi.mocked(toast.error)).toHaveBeenCalled());
    expect(String(vi.mocked(toast.error).mock.calls[0][0])).toContain("sao chép");
    await expectSelectedCount(2);
  });

  it("lọc 'Mới (1–5 ngày)' rồi chọn tất cả → chỉ chọn kết quả đã lọc, copy đúng những người đó", async () => {
    const d = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
    MEMBERS[0].created_at = d(2);
    MEMBERS[1].created_at = d(60);
    MEMBERS[2].created_at = d(4);
    try {
      renderManager();
      await rowCheckboxes();
      const sel = screen.getAllByRole("combobox").find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === "new"),
      )!;
      fireEvent.change(sel, { target: { value: "new" } });
      await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBe(3));
      fireEvent.click(screen.getAllByRole("checkbox")[0]);
      await expectSelectedCount(2);
      fireEvent.click(screen.getByText(COPY_BTN));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(writeText.mock.calls[0][0]).toBe("Nguyễn Văn A 0900000001\nLê Văn C 0900000003");
      // bỏ lọc → ô "chọn tất cả" không còn tích, bấm lại chọn đủ 3
      fireEvent.change(sel, { target: { value: "all" } });
      await waitFor(() => expect(screen.getAllByRole("checkbox").length).toBe(4));
      expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).checked).toBe(false);
      fireEvent.click(screen.getAllByRole("checkbox")[0]);
      await expectSelectedCount(3);
      fireEvent.click(screen.getByText("Bỏ chọn"));
      await waitFor(() => expect(screen.queryByText("đã chọn")).toBeNull());
    } finally {
      MEMBERS.forEach((m) => delete m.created_at);
    }
  });
});
