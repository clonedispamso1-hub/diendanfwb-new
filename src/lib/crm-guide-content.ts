/**
 * NỘI DUNG MẶC ĐỊNH — HƯỚNG DẪN ADMIN (CRM).
 *
 * File này CHỈ là dữ liệu gốc dùng lần đầu / khi Admin bấm "Khôi phục mặc định".
 * Nội dung Admin tự chỉnh sửa được lưu vĩnh viễn trong Supabase
 * (bảng public.admin_site_settings, key = "crm_guide_sections") — xem crm-guide-store.ts.
 *
 * Placeholder tự động thay theo khu vực khách hàng:
 *   {REGION}       → Quảng Ninh
 *   {REGION_UPPER} → QUẢNG NINH
 */

export interface GuideBlock {
  /** Tiêu đề (ví dụ: "Bước 1 — Chào hỏi"). Bỏ trống nếu chỉ là đoạn văn. */
  title?: string;
  /** Nội dung. Xuống dòng bằng \n. */
  text: string;
  /** Ảnh minh hoạ (URL công khai trên Supabase Storage). */
  image?: string;
  /** Cho phép nút Copy (mặc định: có). */
  copyable?: boolean;
}

export interface GuideSection {
  id: string;
  icon: string;
  label: string;
  /** "script" = mục con nằm trong nhóm "Kịch bản tư vấn". */
  group?: "script";
  blocks: GuideBlock[];
}

const scriptItem = (
  id: string,
  icon: string,
  label: string,
  title: string,
  text: string,
): GuideSection => ({
  id,
  icon,
  label,
  group: "script",
  blocks: [{ title, text }],
});

export const CRM_GUIDE_SECTIONS: GuideSection[] = [
  {
    id: "intro",
    icon: "📍",
    label: "Giới thiệu",
    blocks: [
      {
        title: "Mục tiêu",
        text: "Hướng dẫn Admin tư vấn & chốt khách tham gia CỘNG ĐỒNG VIP ZALO {REGION_UPPER}.\nLuôn nhắn nhẹ nhàng, lịch sự, trả lời trong vòng 5 phút.",
        copyable: false,
      },
      {
        title: "Nguyên tắc",
        text: "1. Không spam, không gửi liên tục nhiều tin.\n2. Luôn xưng hô lịch sự (anh/chị).\n3. Không hứa những gì cộng đồng không có.\n4. Chốt xong phải cập nhật CRM sang trạng thái Đã mua.",
        copyable: false,
      },
    ],
  },
  {
    id: "community",
    icon: "👥",
    label: "Community VIP",
    blocks: [
      {
        title: "Giới thiệu cộng đồng",
        text: "CỘNG ĐỒNG VIP ZALO {REGION_UPPER}\n- Nhóm kín, chỉ dành cho thành viên đã xác minh tại {REGION}.\n- Kết nối trực tiếp, không qua trung gian.\n- Admin kiểm duyệt 24/7, loại bỏ tài khoản ảo.",
      },
      {
        title: "Quyền lợi thành viên",
        text: "✅ Vào nhóm VIP ZALO {REGION_UPPER}\n✅ Xem danh sách thành viên đã xác minh\n✅ Được ưu tiên ghép kết nối trong khu vực {REGION}\n✅ Hỗ trợ trọn đời từ Admin",
      },
    ],
  },
  {
    id: "script",
    icon: "💬",
    label: "Kịch bản tư vấn",
    blocks: [
      {
        title: "Kịch bản chuẩn 6 bước",
        text: "Chào anh/chị, em là Admin của CỘNG ĐỒNG VIP ZALO {REGION_UPPER} ạ.\nAnh/chị đang muốn tìm hiểu về cộng đồng phải không ạ?\n\nKhi tham gia anh/chị sẽ được:\n- Vào nhóm kín đã xác minh tại {REGION}\n- Ưu tiên ghép kết nối trong khu vực\n- Admin hỗ trợ trọn đời, không phát sinh thêm phí",
      },
    ],
  },
  scriptItem(
    "script-vuitinh",
    "😄",
    "Thành viên vui tính",
    "Khách vui tính",
    "Hihi anh/chị nói chuyện vui thật ạ 😄 Bên em toàn thành viên dễ thương như anh/chị nè.\nVào nhóm VIP ZALO {REGION_UPPER} là có người trò chuyện cả ngày luôn ạ. Em gửi thông tin anh/chị xem nhé?",
  ),
  scriptItem(
    "script-khotinh",
    "😐",
    "Thành viên khó tính",
    "Khách khó tính",
    "Dạ em hiểu anh/chị cần rõ ràng trước khi tham gia ạ.\nEm xin phép nói thẳng: nhóm kín, thành viên đã xác minh tại {REGION}, đóng 1 lần duy nhất, Admin hỗ trợ trọn đời. Nếu không đúng như em nói, anh/chị phản hồi em xử lý ngay ạ.",
  ),
  scriptItem(
    "script-hoigia",
    "💰",
    "Thành viên hỏi giá",
    "Khách hỏi giá",
    "Dạ phí tham gia trọn đời chỉ 388.000đ ạ (đóng 1 lần duy nhất, không gia hạn, không phí ẩn).\nSau khi thanh toán em kích hoạt cho anh/chị vào nhóm VIP ZALO {REGION_UPPER} trong 5 phút ạ.",
  ),
  scriptItem(
    "script-chixem",
    "👀",
    "Thành viên chỉ xem",
    "Khách chỉ xem",
    "Dạ anh/chị cứ xem thoải mái ạ 😊 Em gửi trước ảnh nhóm và danh sách cộng đồng khu vực {REGION} để anh/chị tham khảo.\nKhi nào anh/chị sẵn sàng thì nhắn em, em vẫn giữ suất ưu tiên cho anh/chị ạ.",
  ),
  scriptItem(
    "script-khongtraloi",
    "🔇",
    "Thành viên không trả lời",
    "Khách không trả lời",
    "Dạ em nhắc anh/chị nhẹ thôi ạ 🙏 Suất tham gia CỘNG ĐỒNG VIP ZALO {REGION_UPPER} khu vực {REGION} đang còn ít.\nNếu anh/chị cần thêm thông tin gì cứ nhắn em, em hỗ trợ ngay ạ.",
  ),
  scriptItem(
    "script-gapnhanh",
    "⚡",
    "Thành viên muốn gặp nhanh",
    "Khách muốn gặp nhanh",
    "Dạ anh/chị muốn kết nối nhanh thì tham gia luôn hôm nay là hợp lý nhất ạ.\nEm kích hoạt trong 5 phút, vào nhóm là có sẵn thành viên khu vực {REGION} đang online để anh/chị nhắn ngay ạ.",
  ),
  scriptItem(
    "script-hoizalo",
    "📱",
    "Thành viên hỏi Zalo",
    "Khách hỏi Zalo",
    "Dạ toàn bộ kết nối đều diễn ra trong nhóm kín Zalo của cộng đồng ạ.\nSau khi kích hoạt, em gửi link nhóm VIP ZALO {REGION_UPPER}, anh/chị bấm vào là tham gia được luôn ạ.",
  ),
  scriptItem(
    "script-nghingo",
    "🛡",
    "Thành viên nghi ngờ lừa đảo",
    "Khách nghi ngờ lừa đảo",
    "Dạ em hiểu lo lắng của anh/chị ạ, giờ lừa đảo nhiều thật.\nBên em có website chính thức, Admin công khai, thành viên xác minh tại {REGION}. Anh/chị có thể xem ảnh nhóm và số lượng thành viên trước. Nếu sau khi thanh toán em không kích hoạt, anh/chị phản ánh công khai ngay ạ.",
  ),
  scriptItem(
    "script-dathamgia",
    "✅",
    "Thành viên đã tham gia",
    "Khách đã tham gia",
    "Chúc mừng anh/chị đã là thành viên chính thức của CỘNG ĐỒNG VIP ZALO {REGION_UPPER} 🎉\nAnh/chị cần hỗ trợ ghép kết nối hay tìm người cùng khu vực {REGION} thì nhắn em nhé ạ.",
  ),
  scriptItem(
    "script-quaylai",
    "🔁",
    "Thành viên quay lại",
    "Khách quay lại",
    "Dạ em vẫn nhớ anh/chị ạ 😊 Anh/chị quay lại là em vui rồi.\nHiện nhóm VIP ZALO {REGION_UPPER} đã đông hơn trước nhiều, em giữ suất ưu tiên cho anh/chị nhé ạ.",
  ),
];

export function applyRegion(text: string, region?: string | null): string {
  const r = (region || "").trim() || "Việt Nam";
  return text
    .replaceAll("{REGION_UPPER}", r.toUpperCase())
    .replaceAll("{REGION}", r)
    .replaceAll("{LOCATION_UPPER}", r.toUpperCase())
    .replaceAll("{location_upper}", r.toUpperCase())
    .replaceAll("{LOCATION}", r)
    .replaceAll("{location}", r);
}

export function cloneDefaultSections(): GuideSection[] {
  return JSON.parse(JSON.stringify(CRM_GUIDE_SECTIONS)) as GuideSection[];
}
