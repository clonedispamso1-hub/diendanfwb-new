/**
 * NỘI DUNG HƯỚNG DẪN ADMIN — CRM.
 *
 * Toàn bộ nội dung popup "Hướng dẫn Admin" nằm ở file này.
 * Muốn thêm / sửa / xóa / đổi thứ tự câu chữ: CHỈ cần sửa mảng bên dưới,
 * KHÔNG cần đụng vào giao diện.
 *
 * Placeholder tự động thay theo khu vực khách hàng:
 *   {REGION}       → Quảng Ninh
 *   {REGION_UPPER} → QUẢNG NINH
 */

export interface GuideBlock {
  /** Tiêu đề bước (ví dụ: "Bước 1 — Chào hỏi"). Bỏ trống nếu chỉ là đoạn văn. */
  title?: string;
  /** Nội dung. Xuống dòng bằng \n. */
  text: string;
  /** Cho phép nút Copy (mặc định: có). */
  copyable?: boolean;
}

export interface GuideSection {
  id: string;
  icon: string;
  label: string;
  blocks: GuideBlock[];
}

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
        title: "Bước 1 — Chào hỏi",
        text: "Chào anh/chị, em là Admin của CỘNG ĐỒNG VIP ZALO {REGION_UPPER} ạ. Anh/chị đang muốn tìm hiểu về cộng đồng phải không ạ?",
      },
      {
        title: "Bước 2 — Xác định nhu cầu",
        text: "Dạ để em tư vấn đúng nhất, anh/chị đang ở khu vực {REGION} đúng không ạ? Anh/chị muốn kết nối nghiêm túc hay chỉ tìm bạn trò chuyện ạ?",
      },
      {
        title: "Bước 3 — Giới thiệu quyền lợi",
        text: "Khi tham gia CỘNG ĐỒNG VIP ZALO {REGION_UPPER}, anh/chị sẽ được:\n- Vào nhóm kín đã xác minh tại {REGION}\n- Ưu tiên ghép kết nối trong khu vực\n- Admin hỗ trợ trọn đời, không phát sinh thêm phí",
      },
      {
        title: "Bước 4 — Báo giá",
        text: "Phí tham gia trọn đời chỉ 388.000đ ạ (đóng 1 lần duy nhất, không gia hạn). Sau khi thanh toán em kích hoạt cho anh/chị trong 5 phút.",
      },
      {
        title: "Bước 5 — Xử lý từ chối",
        text: "Dạ em hiểu ạ. Chi phí này là 1 lần duy nhất cho trọn đời, rẻ hơn rất nhiều so với việc anh/chị mất thời gian tìm kiếm mà gặp tài khoản ảo ạ. Nhóm hiện đang giới hạn số lượng thành viên tại {REGION} nên em ưu tiên anh/chị trước.",
      },
      {
        title: "Bước 6 — Chốt khách",
        text: "Dạ anh/chị chuyển khoản giúp em rồi gửi ảnh xác nhận, em kích hoạt vào nhóm VIP ZALO {REGION_UPPER} ngay ạ.",
      },
    ],
  },
  {
    id: "rules",
    icon: "📜",
    label: "Nội quy",
    blocks: [
      {
        title: "Nội quy cộng đồng",
        text: "NỘI QUY CỘNG ĐỒNG VIP ZALO {REGION_UPPER}\n1. Tôn trọng mọi thành viên, không xúc phạm.\n2. Không spam, không quảng cáo, không bán hàng.\n3. Không chia sẻ thông tin thành viên ra ngoài.\n4. Không lừa đảo — vi phạm sẽ bị xóa vĩnh viễn, không hoàn phí.\n5. Mọi tranh chấp do Admin quyết định.",
      },
    ],
  },
  {
    id: "payment",
    icon: "💳",
    label: "Thanh toán",
    blocks: [
      {
        title: "Thông tin chuyển khoản",
        text: "Ngân hàng: (điền tên ngân hàng)\nSố tài khoản: (điền số tài khoản)\nChủ tài khoản: (điền tên chủ tài khoản)\nNội dung: VIP {REGION_UPPER} + Tên Zalo của anh/chị",
      },
      {
        title: "Nhắc thanh toán",
        text: "Dạ anh/chị chuyển khoản xong chụp màn hình gửi em nhé, em kiểm tra và kích hoạt ngay ạ.",
      },
    ],
  },
  {
    id: "done",
    icon: "🎉",
    label: "Hoàn tất",
    blocks: [
      {
        title: "Tin nhắn chào mừng",
        text: "Chúc mừng anh/chị đã trở thành thành viên chính thức của CỘNG ĐỒNG VIP ZALO {REGION_UPPER} 🎉\nEm gửi link nhóm bên dưới, anh/chị bấm vào tham gia nhé ạ.",
      },
      {
        title: "Việc Admin cần làm sau khi chốt",
        text: "1. Bấm nút Duyệt trong CRM để chuyển khách sang Đã mua.\n2. Ghi chú gói + ngày mua.\n3. Thêm khách vào nhóm Zalo {REGION}.\n4. Nhắn tin chào mừng ở trên.",
        copyable: false,
      },
    ],
  },
];

export function applyRegion(text: string, region?: string | null): string {
  const r = (region || "").trim() || "Việt Nam";
  return text.replaceAll("{REGION_UPPER}", r.toUpperCase()).replaceAll("{REGION}", r);
}
