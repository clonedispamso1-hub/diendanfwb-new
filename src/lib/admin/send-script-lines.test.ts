import { describe, it, expect, vi } from "vitest";
vi.mock("./chat-scripts", async (orig) => ({ ...(await orig<any>()), checkImageLoads: vi.fn(async () => {}) }));
import { handleScriptLine } from "./send-script-lines";

const opts = () => ({ onSend: vi.fn(async () => true), onInsertText: vi.fn() });

describe("handleScriptLine", () => {
  it("text line only fills the input, never sends", async () => {
    const o = opts();
    expect(await handleScriptLine({ type: "text", text: "Chào bạn" }, o)).toBe("insert");
    expect(o.onInsertText).toHaveBeenCalledWith("Chào bạn");
    expect(o.onSend).not.toHaveBeenCalled();
  });
  it("voice line sends exactly one voice message", async () => {
    const o = opts();
    expect(await handleScriptLine({ type: "voice", voice_id: "v", title: "Nữ", storage_path: "a/b.webm", duration: 3 }, o)).toBe("sent");
    expect(o.onSend).toHaveBeenCalledTimes(1);
    expect(o.onInsertText).not.toHaveBeenCalled();
  });
  it("image line sends exactly one real image, not URL text", async () => {
    const o = opts();
    expect(await handleScriptLine({ type: "image", url: "https://x.com/a.jpg" }, o)).toBe("sent");
    expect(o.onSend).toHaveBeenCalledTimes(1);
    expect(o.onSend).toHaveBeenCalledWith("", "https://x.com/a.jpg");
  });
});
