import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/* Máy chủ giả: Code chỉ đúng khi khớp album; khôi phục xác thực lại bằng Code (vé bị bỏ qua = vé hết hạn). */
const DB = [
  { id: "a1", code: "ABC-123", name: "Album Một", cover_media_id: null, like_count: 0, view_count: 0, created_at: "2026-01-02", media: [{ id: "m1", album_id: "a1", kind: "image", storage_path: null, url: "https://x.test/1.jpg", size_bytes: 0, created_at: "2026-01-02" }] },
  { id: "a2", code: "XYZ-999", name: "Album Hai", cover_media_id: null, like_count: 0, view_count: 0, created_at: "2026-01-01", media: [{ id: "m2", album_id: "a2", kind: "image", storage_path: null, url: "https://x.test/2.jpg", size_bytes: 0, created_at: "2026-01-01" }] },
];
const auth = { session: { user: { id: "userA" } } as any, me: null as any };

vi.mock("@/components/candy/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("@/lib/flash-album-zalo", () => ({ fetchFlashZalo: async () => "" }));
vi.mock("@/lib/external-link", () => ({ openExternalLink: () => {} }));
vi.mock("@/lib/hot-content.functions", () => ({ hotPublicFn: async () => ({ banner: null }) }));
vi.mock("@/lib/flash-albums.functions", () => ({
  flashPublicListFn: async () => ({ albums: DB.map((a) => ({ id: a.id })), error: null }),
  flashViewFn: async () => ({ view_count: 1 }),
  flashUnlockFn: async ({ data }: any) => {
    const album = DB.find((a) => a.code === data.code.trim().toUpperCase());
    return album ? { ok: true, album, token: null } : { ok: false };
  },
  flashRestoreFn: async ({ data }: any) => {
    const results: any[] = [];
    const failed: string[] = [];
    for (const it of data.items) {
      const album = it.code && DB.find((a) => a.code === it.code);
      if (album) results.push({ storedId: it.id, album, token: "b".repeat(64) });
      else failed.push(it.id);
    }
    return { results, failed };
  },
}));

import { FlashAlbumTab } from "./flash-album-tab";

const LOCKED = "Album đang bị khóa";
async function enterCode(code: string) {
  fireEvent.click(screen.getByRole("button", { name: "Nhập Code" }));
  fireEvent.change(screen.getByPlaceholderText("ABC-123"), { target: { value: code } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "XÁC NHẬN" })); });
}
const back = () => fireEvent.click(screen.getByRole("button", { name: /Quay lại/ }));

describe("Album HOT ghi nhớ Code đã mở", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    auth.session = { user: { id: "userA" } };
  });

  it("chưa nhập Code / Code sai → khóa, không lưu gì", async () => {
    render(<FlashAlbumTab />);
    expect(await screen.findByText(LOCKED)).toBeTruthy();
    await enterCode("AAA-000");
    expect(screen.getByText("Code không đúng")).toBeTruthy();
    expect(localStorage.length).toBe(0);
  });

  it("Code đúng → lưu Code → xem → quay lại danh sách → xem lại → tải lại trang → xem lại", async () => {
    const view = render(<FlashAlbumTab />);
    await screen.findByText(LOCKED);
    await enterCode("abc-123");
    expect(await screen.findByAltText("Album Một 1")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("album_hot_unlocked:userA:a1")!).code).toBe("ABC-123");

    back();
    expect(screen.queryByText(LOCKED)).toBeNull();
    fireEvent.click(screen.getByText("Album Một"));
    expect(await screen.findByAltText("Album Một 1")).toBeTruthy();

    // F5 / rời trang / đóng-mở tab = component mount lại từ đầu, chỉ còn localStorage.
    view.unmount();
    render(<FlashAlbumTab />);
    fireEvent.click(await screen.findByText("Album Một"));
    expect(await screen.findByAltText("Album Một 1")).toBeTruthy();
    expect(screen.queryByText("Album Hai")).toBeNull();
  });

  it("vé hết hạn nhưng Code còn đúng → tự xác thực lại, cấp vé mới", async () => {
    localStorage.setItem("album_hot_unlocked:userA:a1", JSON.stringify({ code: "ABC-123", token: "0".repeat(64) }));
    render(<FlashAlbumTab />);
    fireEvent.click(await screen.findByText("Album Một"));
    expect(await screen.findByAltText("Album Một 1")).toBeTruthy();
    expect(JSON.parse(localStorage.getItem("album_hot_unlocked:userA:a1")!).token).toBe("b".repeat(64));
  });

  it("Code không còn hợp lệ → vẫn khóa và dọn bộ nhớ", async () => {
    localStorage.setItem("album_hot_unlocked:userA:gone", JSON.stringify({ code: "DEL-000" }));
    render(<FlashAlbumTab />);
    expect(await screen.findByText(LOCKED)).toBeTruthy();
    expect(localStorage.getItem("album_hot_unlocked:userA:gone")).toBeNull();
  });

  it("mỗi tài khoản chỉ dùng Code của mình; đăng nhập lại đúng tài khoản vẫn mở", async () => {
    const view = render(<FlashAlbumTab />);
    await screen.findByText(LOCKED);
    await enterCode("XYZ-999");
    back();
    expect(screen.getByText("Album Hai")).toBeTruthy();
    expect(screen.queryByText("Album Một")).toBeNull();

    auth.session = { user: { id: "userB" } };
    view.rerender(<FlashAlbumTab />);
    expect(await screen.findByText(LOCKED)).toBeTruthy();
    expect(screen.queryByText("Album Hai")).toBeNull();

    auth.session = null;
    view.rerender(<FlashAlbumTab />);
    auth.session = { user: { id: "userA" } };
    view.rerender(<FlashAlbumTab />);
    await waitFor(() => expect(screen.getByText("Album Hai")).toBeTruthy());
  });
});
