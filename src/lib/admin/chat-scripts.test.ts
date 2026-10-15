import { beforeEach, describe, it, expect, vi } from "vitest";
vi.mock("@/lib/admin-db", () => ({ adminSetSiteSetting: vi.fn(), getSiteSetting: vi.fn() }));
import { adminSetSiteSetting } from "@/lib/admin-db";
import { normalizeCatalogue, removeSection, saveScriptCatalogue } from "./chat-scripts";

const legacy = [{ id: "existing-script", name: "Tên cũ", lines: ["Chào bạn", { type: "voice", voice_id: "voice-old", title: "Voice cũ", storage_path: "old/voice.webm", duration: 7 }, { type: "image", url: "https://example.com/old.jpg" }] }];
beforeEach(() => vi.clearAllMocks());
describe("folder presentation compatibility", () => {
  it("retains nested folder ancestry and old script IDs through save", async () => {
    const c = normalizeCatalogue({ sections: [{ id: "a", name: "A" }, { id: "b", name: "B", parent_id: "a" }, { id: "c", name: "C", parent_id: "b" }], scripts: [{ ...legacy[0], section_id: "c" }] });
    const saved = await saveScriptCatalogue(c);
    expect(saved.sections[2]).toEqual({ id: "c", name: "C", parent_id: "b" });
    expect(saved.scripts[0].id).toBe("existing-script");
    expect(saved.scripts[0].section_id).toBe("c");
  });
  it("deleting a nested folder keeps its child folders and moves scripts to its parent", () => {
    const c = normalizeCatalogue({ sections: [{ id: "a", name: "A" }, { id: "b", name: "B", parent_id: "a" }, { id: "c", name: "C", parent_id: "b" }], scripts: [{ ...legacy[0], section_id: "b" }] });
    const next = removeSection(c, "b");
    expect(next.sections).toEqual([{ id: "a", name: "A" }, { id: "c", name: "C", parent_id: "a" }]);
    expect(next.scripts[0]).toEqual({ ...c.scripts[0], section_id: "a" });
  });
  it("repairs missing and cyclic ancestry without losing folders", () => {
    const c = normalizeCatalogue({ sections: [{ id: "a", name: "A", parent_id: "b" }, { id: "b", name: "B", parent_id: "a" }, { id: "c", name: "C", parent_id: "missing" }], scripts: [] });
    expect(c.sections).toHaveLength(3);
    expect(c.sections[0].parent_id).toBeUndefined();
    expect(c.sections[2].parent_id).toBeUndefined();
  });
  it("reads old scripts without writing or changing IDs, text, voice or image", () => {
    const c = normalizeCatalogue(legacy);
    expect(c.scripts[0]).toEqual({ ...legacy[0], section_id: "default-section", lines: [{ type: "text", text: "Chào bạn" }, ...legacy[0].lines.slice(1)] });
    expect(adminSetSiteSetting).not.toHaveBeenCalled();
  });
  it("removing a parent moves children without removing their contents", () => {
    const c = normalizeCatalogue({ sections: [{ id: "a", name: "A" }, { id: "b", name: "B" }], scripts: [{ ...legacy[0], section_id: "a" }] });
    const next = removeSection(c, "a");
    expect(next.scripts).toEqual([{ ...c.scripts[0], section_id: "b" }]);
    expect(next.sections).toEqual([{ id: "b", name: "B" }]);
  });
  it("deleting the last parent preserves every child and content", () => {
    const c = normalizeCatalogue(legacy);
    const next = removeSection(c, c.sections[0].id);
    expect(next.scripts).toEqual(c.scripts);
    expect(next.sections).toHaveLength(1);
  });
  it("saves admin names in the existing version 2 format and retains history IDs", async () => {
    const c = normalizeCatalogue({ sections: [{ id: "a", name: "Tên riêng của admin" }], scripts: [{ ...legacy[0], name: "Thư mục con tự đặt", section_id: "a" }] });
    const saved = await saveScriptCatalogue(c);
    expect(saved).toEqual(c);
    expect(adminSetSiteSetting).toHaveBeenCalledWith("chat_scripts", { version: 2, sections: c.sections, scripts: [{ ...legacy[0], name: "Thư mục con tự đặt", section_id: "a" }] });
  });
});