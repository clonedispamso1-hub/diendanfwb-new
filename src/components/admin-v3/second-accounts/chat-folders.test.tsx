import { afterEach, describe, expect, it, vi } from "vitest";
import { createContext, useContext, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ChatScriptsTab } from "./ChatScriptsTab";
import { ChatScriptPicker } from "./ChatScriptPicker";
import { fetchScriptCatalogue, saveScriptCatalogue } from "@/lib/admin/chat-scripts";
import { handleScriptLine } from "@/lib/admin/send-script-lines";

vi.mock("@/lib/admin/chat-scripts", async (original) => ({ ...(await original<Record<string, unknown>>()), fetchScriptCatalogue: vi.fn(), saveScriptCatalogue: vi.fn(async (c) => c) }));
vi.mock("@/lib/admin/send-script-lines", () => ({ handleScriptLine: vi.fn() }));
vi.mock("@/components/candy/voice-library-picker", () => ({ VoiceLibraryPicker: ({ open, onPick }: { open: boolean; onPick: (v: unknown) => void }) => open ? <button onClick={() => onPick({ id: "voice-old", title: "Voice cũ", storage_path: "old/voice.webm", duration: 7 })}>Chọn voice thử</button> : null }));
vi.mock("@/components/candy/voice-bubble", () => ({ VoiceBubble: () => <span>Voice preview</span> }));
vi.mock("@/components/ui/popover", () => {
  const Context = createContext<{ open: boolean; toggle: () => void }>({ open: false, toggle: () => {} });
  return {
    Popover: ({ children, open, onOpenChange }: { children: ReactNode; open: boolean; onOpenChange: (v: boolean) => void }) => <Context.Provider value={{ open, toggle: () => onOpenChange(!open) }}>{children}</Context.Provider>,
    PopoverTrigger: ({ children }: { children: ReactNode }) => { const { toggle } = useContext(Context); return <div onClick={toggle}>{children}</div>; },
    PopoverContent: ({ children }: { children: ReactNode }) => { const { open } = useContext(Context); return open ? <div>{children}</div> : null; },
  };
});
const data = () => ({ sections: [{ id: "a", name: "Lời mở đầu" }, { id: "b", name: "Làm quen" }], scripts: [{ id: "old-script-id", name: "Nội dung cũ", section_id: "a", lines: [{ type: "text" as const, text: "Chào bạn" }, { type: "voice" as const, voice_id: "voice-old", title: "Voice cũ", storage_path: "old/voice.webm", duration: 7 }, { type: "image" as const, url: "https://example.com/old.jpg" }] }] });
afterEach(() => { cleanup(); vi.clearAllMocks(); });
async function editor() {
  vi.mocked(fetchScriptCatalogue).mockResolvedValue(data());
  render(<ChatScriptsTab />);
  await screen.findByRole("button", { name: "Mở kịch bản Nội dung cũ" });
}
describe("folder editor actions", () => {
  it("creates admin-named parent and child folders and saves edited content", async () => {
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Tạo thư mục" }));
    const name = screen.getByRole("textbox", { name: "Tên thư mục" });
    expect(name).toHaveValue("");
    fireEvent.change(name, { target: { value: "Tên admin chọn" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo" }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm thư mục con" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tên thư mục" }), { target: { value: "Con tự đặt" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo" }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm kịch bản" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tên thư mục" }), { target: { value: "Kịch bản mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Tạo" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Nội dung chữ 1" }), { target: { value: "Tin nhắn mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Thêm voice" }));
    fireEvent.click(screen.getByRole("button", { name: "Chọn voice thử" }));
    fireEvent.click(screen.getByRole("button", { name: "Thêm ảnh" }));
    fireEvent.change(screen.getByRole("textbox", { name: "URL ảnh 3" }), { target: { value: "https://example.com/new.jpg" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(saveScriptCatalogue).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(saveScriptCatalogue).mock.calls[0][0];
    expect(saved.sections[2].name).toBe("Tên admin chọn");
    expect(saved.sections[3]).toMatchObject({ name: "Con tự đặt", parent_id: saved.sections[2].id });
    expect(saved.scripts[1]).toMatchObject({ name: "Kịch bản mới", section_id: saved.sections[3].id, lines: [{ type: "text", text: "Tin nhắn mới" }, data().scripts[0].lines[1], { type: "image", url: "https://example.com/new.jpg" }] });
    expect(saved.scripts[0]).toEqual(data().scripts[0]);
  });
  it("renames and moves an old child while retaining its history identity and contents", async () => {
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Mở kịch bản Nội dung cũ" }));
    fireEvent.click(screen.getByRole("button", { name: "Đổi tên kịch bản" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tên thư mục" }), { target: { value: "Tên mới" } });
    fireEvent.click(screen.getByRole("button", { name: "Đổi tên" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Chuyển kịch bản sang thư mục" }), { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
    await waitFor(() => expect(saveScriptCatalogue).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveScriptCatalogue).mock.calls[0][0].scripts[0]).toEqual({ ...data().scripts[0], name: "Tên mới", section_id: "b" });
  });
  it("never deletes a child or its contents when confirmation is cancelled", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await editor();
    fireEvent.click(screen.getByRole("button", { name: "Mở kịch bản Nội dung cũ" }));
    fireEvent.click(screen.getByRole("button", { name: "Xóa kịch bản" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Nội dung chữ 1" })).toHaveValue("Chào bạn");
    expect(screen.getByRole("button", { name: "Lưu" })).toBeDisabled();
    confirm.mockRestore();
  });
});
describe("picker selects only the clicked content", () => {
  it("opening a child sends nothing and text selects only one line", async () => {
    vi.mocked(fetchScriptCatalogue).mockResolvedValue(data());
    vi.mocked(handleScriptLine).mockResolvedValue("insert");
    const onSend = vi.fn(); const onInsertText = vi.fn();
    render(<ChatScriptPicker onSend={onSend} onInsertText={onInsertText} />);
    fireEvent.click(screen.getByRole("button", { name: "Kịch bản" }));
    fireEvent.click(await screen.findByRole("button", { name: /Lời mở đầu/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Nội dung cũ/ }));
    expect(handleScriptLine).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Chọn nội dung 1" }));
    await waitFor(() => expect(handleScriptLine).toHaveBeenCalledTimes(1));
    expect(vi.mocked(handleScriptLine).mock.calls[0][0]).toEqual(data().scripts[0].lines[0]);
  });
  it.each([[2, "voice"], [3, "image"]] as const)("content %s dispatches only its %s line and records usage once", async (index, _kind) => {
    vi.mocked(fetchScriptCatalogue).mockResolvedValue(data());
    vi.mocked(handleScriptLine).mockResolvedValue("sent");
    const onScriptSent = vi.fn();
    render(<ChatScriptPicker onSend={vi.fn()} onInsertText={vi.fn()} onScriptSent={onScriptSent} />);
    fireEvent.click(screen.getByRole("button", { name: "Kịch bản" }));
    fireEvent.click(await screen.findByRole("button", { name: /Lời mở đầu/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Nội dung cũ/ }));
    fireEvent.click(screen.getByRole("button", { name: `Chọn nội dung ${index}` }));
    await waitFor(() => expect(onScriptSent).toHaveBeenCalledTimes(1));
    expect(handleScriptLine).toHaveBeenCalledTimes(1);
    expect(vi.mocked(handleScriptLine).mock.calls[0][0]).toEqual(data().scripts[0].lines[index - 1]);
    expect(onScriptSent).toHaveBeenCalledWith(data().scripts[0]);
  });
});