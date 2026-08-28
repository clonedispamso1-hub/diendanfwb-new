import { resolveUserName } from "@/lib/user-name";

/**
 * Lấy tên hiển thị thân mật.
 * - Ưu tiên display_name → full_name → username (xem `resolveUserName`).
 * - KHÔNG cắt tên, KHÔNG thêm "..." (yêu cầu: không tự cắt tên khi hiển thị).
 */
export function getFriendlyName(
  fullName?: string | null,
  fallback?: string | null,
): string {
  const raw = (fullName ?? "").trim().replace(/\s+/g, " ");
  const alt = (fallback ?? "").trim().replace(/\s+/g, " ");
  return resolveUserName({ full_name: raw, username: alt }, "Bạn");
}

export function getGreetingPrompt(
  fullName?: string | null,
  fallback?: string | null,
): string {
  return `${getFriendlyName(fullName, fallback)} ơi, hôm nay có gì mới?`;
}
