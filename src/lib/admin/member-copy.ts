/**
 * member-copy.ts — Sao chép hàng loạt "Tên + SĐT" cho module Quản lý thành viên.
 *
 * Chỉ đọc dữ liệu ĐÃ có trong danh sách thành viên đang hiển thị:
 *   tên  = profiles.full_name   (field cột "Thành viên" đang hiển thị)
 *   SĐT  = profiles.phone       (field cột "SĐT" đang hiển thị)
 *
 * KHÔNG dùng `username` để làm tên: username chứa số điện thoại (dữ liệu nhạy
 * cảm) — xem src/lib/user-name.ts.
 *
 * Mỗi member đúng 1 dòng, format: "[Tên] [SĐT]" — không dấu phẩy, không ngoặc,
 * không nhãn "Tên:"/"SĐT:", không số thứ tự, không dòng trống.
 */

export type NamePhoneLike = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
};

/** Cần >= 2 thành viên được chọn để hiện nút "Sao chép Tên + SĐT". */
export const MIN_COPY_SELECTION = 2;
export function canCopyNamePhone(selectedCount: number): boolean {
  return selectedCount >= MIN_COPY_SELECTION;
}

/**
 * Lấy đúng các member đang được Admin chọn, theo đúng thứ tự hiển thị trong
 * danh sách.
 *
 * @param ordered danh sách đã lọc/sắp xếp đang hiển thị (filteredRows)
 * @param all     toàn bộ rows đã tải (phòng khi Admin đổi filter sau khi chọn)
 *
 * Member đã chọn nhưng không còn trong `ordered` được nối vào CUỐI, nên số dòng
 * luôn bằng số thành viên đang chọn — không mất dòng, không lấy thêm người
 * chưa chọn.
 */
export function pickSelected<T extends NamePhoneLike>(
  ordered: T[],
  all: T[],
  selected: Set<string>,
): T[] {
  const chosen = ordered.filter((r) => selected.has(r.id));
  const seen = new Set(chosen.map((r) => r.id));
  const rest = all.filter((r) => selected.has(r.id) && !seen.has(r.id));
  return [...chosen, ...rest];
}

/** Tên: bỏ khoảng trắng thừa; rỗng nếu không có tên thật. */
function cleanName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

/** SĐT: giữ đúng chuỗi đang hiển thị ở cột SĐT; rỗng nếu member không có SĐT. */
function cleanPhone(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/**
 * 1 member = 1 dòng "[Tên] [SĐT]".
 * Tên và SĐT luôn lấy từ CÙNG một record. Nếu member thiếu tên hoặc thiếu SĐT,
 * dòng chỉ chứa phần dữ liệu thật có sẵn (không mượn dữ liệu của người khác,
 * không tự tạo dữ liệu giả, không thêm placeholder).
 */
export function buildNamePhoneLines(rows: NamePhoneLike[]): string[] {
  return rows.map((r) => [cleanName(r.full_name), cleanPhone(r.phone)].filter(Boolean).join(" "));
}

/** Toàn bộ nội dung clipboard: các dòng nối nhau bằng "\n" (không có newline cuối). */
export function buildNamePhoneText(rows: NamePhoneLike[]): string {
  return buildNamePhoneLines(rows).join("\n");
}

/** Số member thiếu tên hoặc thiếu SĐT (để báo rõ cho Admin, không bịa dữ liệu). */
export function countIncomplete(rows: NamePhoneLike[]): number {
  return rows.filter((r) => !cleanName(r.full_name) || !cleanPhone(r.phone)).length;
}

/**
 * Copy bằng Clipboard API của trình duyệt. Nếu trình duyệt chặn (hoặc môi
 * trường không phải HTTPS), thử cách dự phòng qua textarea tạm; trả về false
 * nếu cả hai cách đều thất bại.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* rơi xuống cách dự phòng bên dưới */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
