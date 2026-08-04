/**
 * Lấy nickname hiển thị thân mật từ full_name.
 * - Nhiều từ: lấy 2 từ cuối ("Vũ Phương Trọng Hà Nam" → "Hà Nam").
 * - 1 từ: giữ nguyên.
 * - Cắt tối đa 8 ký tự, thêm "..." nếu vượt.
 */
export function getFriendlyName(
  fullName?: string | null,
  fallback?: string | null,
): string {
  const raw = (fullName ?? fallback ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "Bạn";
  const parts = raw.split(" ").filter(Boolean);
  let nick = parts.length >= 2 ? parts.slice(-2).join(" ") : parts[0];
  if (nick.length > 8) nick = nick.slice(0, 8) + "...";
  return nick;
}

export function getGreetingPrompt(
  fullName?: string | null,
  fallback?: string | null,
): string {
  return `${getFriendlyName(fullName, fallback)} ơi, hôm nay có gì mới?`;
}