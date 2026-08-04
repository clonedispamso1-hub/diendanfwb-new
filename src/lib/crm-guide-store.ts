// Lưu / khôi phục nội dung Hướng dẫn Admin do Admin tự chỉnh sửa (localStorage — không đụng DB).
import { CRM_GUIDE_SECTIONS, type GuideSection } from "./crm-guide-content";

const KEY = "crm.guide.sections.v1";

export function loadGuideSections(): GuideSection[] {
  if (typeof window === "undefined") return CRM_GUIDE_SECTIONS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return CRM_GUIDE_SECTIONS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s) => s && typeof s.id === "string" && Array.isArray(s.blocks))) {
      return parsed as GuideSection[];
    }
  } catch { /* ignore */ }
  return CRM_GUIDE_SECTIONS;
}

export function saveGuideSections(sections: GuideSection[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(sections));
  } catch { /* ignore */ }
}

export function resetGuideSections(): GuideSection[] {
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
  }
  return CRM_GUIDE_SECTIONS;
}
