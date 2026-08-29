/**
 * Token "Card Nhóm" nhúng trong nội dung bài viết (giống [[gif:...]]).
 *
 *   Caption abc [[baitgroup:<uuid>]]
 *
 * Admin Panel → Tài khoản thứ hai → Đăng bài chèn token này.
 * Newsfeed đọc token, ẩn nó khỏi caption và render <BaitGroupCard />.
 */
const BAIT_TOKEN = /\[\[baitgroup:([^\]\s]+)\]\]/;

export function baitGroupToken(id: string): string {
  return `[[baitgroup:${id}]]`;
}

/** Lấy id nhóm mồi đầu tiên trong nội dung (nếu có). */
export function parseBaitGroupId(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(BAIT_TOKEN);
  return m?.[1] ?? null;
}

/** Bỏ token khỏi caption để không lộ chuỗi kỹ thuật cho user. */
export function stripBaitGroupToken(text: string | null | undefined): string {
  return (text ?? "").replace(/\[\[baitgroup:[^\]\s]+\]\]/g, "").trim();
}

/** Ghi nhớ nhóm cần mở rồi điều hướng sang trang Tin nhắn → tab Nhóm. */
export function focusBaitGroup(id: string) {
  try {
    sessionStorage.setItem("bait_focus_group", id);
  } catch {
    /* ignore */
  }
}

export function takeBaitFocus(): string | null {
  try {
    const v = sessionStorage.getItem("bait_focus_group");
    if (v) sessionStorage.removeItem("bait_focus_group");
    return v;
  } catch {
    return null;
  }
}

/** Có yêu cầu mở nhóm mồi đang chờ hay không (không xoá cờ). */
export function hasBaitFocus(): boolean {
  try {
    return !!sessionStorage.getItem("bait_focus_group");
  } catch {
    return false;
  }
}
