import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyTextLines, parseCopyText } from "@/lib/chat-cards";

const settings = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/lib/admin-db", () => ({ getSiteSetting: settings.read, adminSetSiteSetting: settings.write }));
vi.mock("@/lib/media/providers", () => ({ r2Provider: {} }));
vi.mock("@/lib/qr-image", () => ({ prepareQrImage: vi.fn() }));
import { COPY_TEMPLATES_KEY, CopyTextToolButton } from "./ChatCardTools";

beforeEach(() => { vi.clearAllMocks(); settings.read.mockResolvedValue([]); settings.write.mockResolvedValue(undefined); });
afterEach(cleanup);

async function compose(onSend = vi.fn().mockResolvedValue(true)) {
  render(<CopyTextToolButton onSend={onSend} />);
  fireEvent.click(screen.getByTitle("Sao chép (tin nhắn có nút sao chép)"));
  fireEvent.change(screen.getByRole("textbox", { name: "Tiêu đề card" }), { target: { value: "Thông tin thanh toán" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Label dòng 1" }), { target: { value: "STK" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Nội dung dòng 1" }), { target: { value: "103887698556" } });
  fireEvent.click(screen.getByRole("button", { name: "Thêm dòng" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Loại dòng 2" }), { target: { value: "note" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Label dòng 2" }), { target: { value: "Lưu ý" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Nội dung dòng 2" }), { target: { value: "Chuyển đúng nội dung" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Bật sao chép dòng 2" }));
  return onSend;
}

describe("Copy form builder", () => {
  it("sends one titled card with separate labels, content and note metadata", async () => {
    const send = await compose();
    fireEvent.click(screen.getByRole("button", { name: /^Gửi$/ }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const payload = parseCopyText(send.mock.calls[0][0]);
    if (!payload) throw new Error("Missing copy card");
    expect(payload.title).toBe("Thông tin thanh toán");
    expect(copyTextLines(payload)).toEqual([
      { label: "STK", text: "103887698556", kind: "field", copyEnabled: true },
      { label: "Lưu ý", text: "Chuyển đúng nội dung", kind: "note", copyEnabled: false },
    ]);
  });
  it("stores form settings under the existing template key", async () => {
    await compose();
    fireEvent.click(screen.getByRole("button", { name: "Lưu thành mẫu" }));
    await waitFor(() => expect(settings.write).toHaveBeenCalledTimes(1));
    const [key, templates] = settings.write.mock.calls[0];
    expect(key).toBe(COPY_TEMPLATES_KEY);
    expect(templates[0].title).toBe("Thông tin thanh toán");
    expect(templates[0].lines[0].text).toBe("103887698556");
    expect(templates[0].lines[1].copyEnabled).toBe(false);
  });
  it("restores legacy templates without losing their copy settings", async () => {
    settings.read.mockResolvedValue([{ id: "saved", text: "STK: 123456789\nLưu ý: chuyển đúng nội dung", lines: [{ text: "STK: 123456789", copyEnabled: true }, { text: "Lưu ý: chuyển đúng nội dung", copyEnabled: false }] }]);
    render(<CopyTextToolButton onSend={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Sao chép (tin nhắn có nút sao chép)"));
    fireEvent.click(await screen.findByRole("button", { name: /STK: 123456789\s+Lưu ý/ }));
    expect(screen.getByRole("textbox", { name: "Nội dung dòng 1" })).toHaveValue("STK: 123456789");
    expect(screen.getByRole("checkbox", { name: "Bật sao chép dòng 1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Bật sao chép dòng 2" })).not.toBeChecked();
  });
  it("can remove a row without changing the remaining row", async () => {
    const send = await compose();
    fireEvent.click(screen.getByRole("button", { name: "Xóa dòng 1" }));
    fireEvent.click(screen.getByRole("button", { name: /^Gửi$/ }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const payload = parseCopyText(send.mock.calls[0][0]);
    if (!payload) throw new Error("Missing card");
    expect(copyTextLines(payload)).toEqual([{ label: "Lưu ý", text: "Chuyển đúng nội dung", kind: "note", copyEnabled: false }]);
  });
  it("retains the draft after a failed send", async () => {
    const send = await compose(vi.fn().mockResolvedValue(false));
    fireEvent.click(screen.getByRole("button", { name: /^Gửi$/ }));
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("textbox", { name: "Nội dung dòng 1" })).toHaveValue("103887698556");
  });
});
