/**
 * Kịch Bản tin nhắn cho Tài khoản thứ hai.
 *
 * Tái sử dụng kho cấu hình sẵn có `admin_site_settings` (key = "chat_scripts"):
 *  - Ghi: adminSetSiteSetting → RPC SECURITY DEFINER save_admin_site_settings
 *    (chỉ admin hợp lệ mới ghi được, RLS sẵn có).
 *  - Đọc: getSiteSetting (RPC get_site_setting), force=true để lấy giá trị mới.
 * Không tạo bảng mới, không chạy SQL.
 */
import { adminSetSiteSetting, getSiteSetting } from "@/lib/admin-db";

export const CHAT_SCRIPTS_KEY = "chat_scripts";
export const OPEN_SCRIPTS_EVENT = "admv3:open-chat-scripts";

/** Một dòng kịch bản. Dòng chữ lưu dạng chuỗi (tương thích kịch bản cũ). */
export type ScriptLine =
  | { type: "text"; text: string }
  | { type: "voice"; voice_id: string; title: string; storage_path: string; duration: number }
  | { type: "image"; url: string };

export interface ChatScript {
  id: string;
  name: string;
  lines: ScriptLine[];
  section_id?: string;
}

export interface ScriptSection { id: string; name: string; parent_id?: string }
export interface ScriptCatalogue { sections: ScriptSection[]; scripts: ChatScript[] }
export const DEFAULT_SECTION_ID = "default-section";

export function newSection(name = "Phần 1", parent_id?: string): ScriptSection { return { id: uid(), name, ...(parent_id ? { parent_id } : {}) }; }

/** Old flat arrays stay readable; grouping never writes on page load. */
export function normalizeCatalogue(raw: unknown): ScriptCatalogue {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as { sections?: unknown; scripts?: unknown } : null;
  const scripts = normalizeScripts(value ? value.scripts : raw);
  const sections: ScriptSection[] = [];
  if (Array.isArray(value?.sections)) for (const section of value.sections) {
    if (section && typeof section.id === "string" && !sections.some((s) => s.id === section.id)) {
      sections.push({ id: section.id, name: typeof section.name === "string" ? section.name : "Phần", ...(typeof section.parent_id === "string" ? { parent_id: section.parent_id } : {}) });
    }
  }
  if (!sections.length) sections.push({ id: DEFAULT_SECTION_ID, name: "Phần 1" });
  // Invalid or cyclic parents become roots; old flat catalogues stay unchanged.
  for (const section of sections) {
    const seen = new Set([section.id]);
    let parent = section.parent_id;
    while (parent) {
      const ancestor = sections.find((s) => s.id === parent);
      if (!ancestor || seen.has(parent)) { delete section.parent_id; break; }
      seen.add(parent); parent = ancestor.parent_id;
    }
  }
  const fallback = sections[0];
  return { sections, scripts: scripts.map((s) => ({ ...s, section_id: sections.some((g) => g.id === s.section_id) ? s.section_id : fallback.id })) };
}

/** Deleting a section moves its scripts, never deletes their contents. */
export function removeSection(catalogue: ScriptCatalogue, id: string): ScriptCatalogue {
  const removed = catalogue.sections.find((s) => s.id === id);
  const sections = catalogue.sections.filter((s) => s.id !== id).map((s) => {
    if (s.parent_id !== id) return s;
    const { parent_id: _parent, ...rest } = s;
    return { ...rest, ...(removed?.parent_id ? { parent_id: removed.parent_id } : {}) };
  });
  if (!sections.length) sections.push({ id: DEFAULT_SECTION_ID, name: "Phần 1" });
  const destination = sections.find((s) => s.id === removed?.parent_id) ?? sections[0];
  return { sections, scripts: catalogue.scripts.map((s) => s.section_id === id ? { ...s, section_id: destination.id } : s) };
}

export function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = [...items];
  const target = index + direction;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export const isHttpUrl = (u: string) => /^https?:\/\/\S+$/i.test(u.trim());

export function normalizeLine(l: any): ScriptLine | null {
  if (typeof l === "string") return { type: "text", text: l };
  if (!l || typeof l !== "object") return null;
  if (l.type === "text") return { type: "text", text: String(l.text ?? "") };
  if (l.type === "image") return { type: "image", url: String(l.url ?? "") };
  if (l.type === "voice") return {
    type: "voice", voice_id: String(l.voice_id ?? ""), title: String(l.title ?? ""),
    storage_path: String(l.storage_path ?? ""), duration: Number(l.duration) || 0,
  };
  return null;
}

/** Dòng có đủ dữ liệu để gửi không. */
export function lineIsFilled(l: ScriptLine): boolean {
  if (l.type === "text") return !!l.text.trim();
  if (l.type === "image") return !!l.url.trim();
  return !!l.storage_path;
}

function serializeLine(l: ScriptLine): unknown {
  if (l.type === "text") return l.text;
  if (l.type === "image") return { type: "image", url: l.url.trim() };
  return l;
}

/** Kiểm tra ảnh tải được trước khi gửi. */
export function checkImageLoads(url: string, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isHttpUrl(url)) return reject(new Error("URL ảnh không hợp lệ (cần bắt đầu bằng http:// hoặc https://)"));
    const img = new Image();
    const t = setTimeout(() => { img.src = ""; reject(new Error("Ảnh tải quá lâu, không gửi được")); }, timeoutMs);
    img.onload = () => { clearTimeout(t); resolve(); };
    img.onerror = () => { clearTimeout(t); reject(new Error("Không tải được ảnh từ URL này")); };
    img.src = url.trim();
  });
}

function uid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function newScript(name = "", section_id = DEFAULT_SECTION_ID): ChatScript {
  return { id: uid(), name, section_id, lines: [{ type: "text", text: "" }] };
}

export function normalizeScripts(raw: unknown): ChatScript[] {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) raw = (raw as { scripts?: unknown }).scripts;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === "object")
    .map((s: any) => ({
      id: typeof s.id === "string" && s.id ? s.id : uid(),
      name: typeof s.name === "string" ? s.name : "",
      section_id: typeof s.section_id === "string" ? s.section_id : undefined,
      lines: Array.isArray(s.lines) ? s.lines.map(normalizeLine).filter((l: ScriptLine | null): l is ScriptLine => !!l) : [],
    }));
}

export async function fetchChatScripts(): Promise<ChatScript[]> {
  return (await fetchScriptCatalogue()).scripts;
}

export async function fetchScriptCatalogue(): Promise<ScriptCatalogue> {
  return normalizeCatalogue(await getSiteSetting<unknown>(CHAT_SCRIPTS_KEY, true));
}

/** Lưu toàn bộ danh sách: bỏ dòng trống, đặt tên mặc định nếu thiếu. */
export async function saveChatScripts(list: ChatScript[]): Promise<ChatScript[]> {
  const current = await fetchScriptCatalogue();
  return (await saveScriptCatalogue({ ...current, scripts: list })).scripts;
}

export async function saveScriptCatalogue(catalogue: ScriptCatalogue): Promise<ScriptCatalogue> {
  const { scripts: list, sections } = normalizeCatalogue(catalogue);
  for (const s of list) for (const l of s.lines) {
    if (l.type === "image" && l.url.trim() && !isHttpUrl(l.url)) {
      throw new Error(`“${s.name || "Kịch bản"}”: URL ảnh không hợp lệ — ${l.url}`);
    }
  }
  const clean = list.map((s, i) => ({
    id: s.id,
    name: s.name.trim() || `Kịch bản ${i + 1}`,
    section_id: s.section_id,
    lines: s.lines.map(serializeLine),
  }));
  const value = { version: 2, sections, scripts: clean };
  await adminSetSiteSetting(CHAT_SCRIPTS_KEY, value);
  return normalizeCatalogue(value);
}

export function openScriptsManager() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(OPEN_SCRIPTS_EVENT));
}
