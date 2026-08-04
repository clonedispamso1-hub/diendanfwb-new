/**
 * Default built-in knowledge base for the Guide Center.
 * These render when the `public.guides` table is empty, so the page always
 * has substantial content for new users.
 */
export type DefaultGuide = {
  id: string;
  category: string;
  title: string;
  excerpt: string;
  body: string; // HTML string
  is_pinned?: boolean;
  sort_order?: number;
};

const p = (s: string) => `<p>${s}</p>`;
const ul = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
const h = (s: string) => `<h3>${s}</h3>`;

export const DEFAULT_GUIDES: DefaultGuide[] = [
  // ================= Kiến thức mối quan hệ =================
  {
    id: "def-fwb",
    category: "Kiến thức mối quan hệ",
    title: "FWB là gì?",
    excerpt: "Friends With Benefits — mối quan hệ bạn bè có thêm yếu tố thân mật, không ràng buộc yêu đương.",
    is_pinned: true,
    sort_order: 1,
    body:
      p("<b>FWB (Friends With Benefits)</b> là mối quan hệ giữa hai người bạn có thêm yếu tố thân mật về thể xác, nhưng <b>không xem nhau là người yêu</b> và không đặt kỳ vọng gắn bó lâu dài.") +
      h("Đặc điểm chính") +
      ul([
        "Cả hai đều <b>đồng thuận</b> và hiểu rõ giới hạn.",
        "Không ghen tuông, không ràng buộc thời gian.",
        "Tôn trọng sự riêng tư của nhau.",
        "Ưu tiên <b>an toàn</b> và <b>sức khỏe</b>.",
      ]) +
      h("Khi nào nên chọn FWB?") +
      p("Khi bạn chưa muốn yêu nghiêm túc, có nhu cầu kết nối lành mạnh, và tìm được người trưởng thành, thẳng thắn về mong muốn của mình.") +
      h("Lưu ý quan trọng") +
      ul([
        "Nói rõ giới hạn ngay từ đầu.",
        "Không giấu diếm nếu bắt đầu có tình cảm — hãy trao đổi lại.",
        "Bảo vệ danh tính và thông tin cá nhân.",
      ]),
  },
  {
    id: "def-ons",
    category: "Kiến thức mối quan hệ",
    title: "ONS là gì?",
    excerpt: "One Night Stand — cuộc gặp gỡ chỉ diễn ra trong một đêm, không hẹn gặp lại.",
    sort_order: 2,
    body:
      p("<b>ONS (One Night Stand)</b> là cuộc gặp mang tính khoảnh khắc, cả hai đồng thuận và <b>không có ràng buộc</b> sau đó.") +
      h("Nguyên tắc bắt buộc") +
      ul([
        "<b>Đồng thuận</b> tuyệt đối, không ép buộc, không lợi dụng lúc say.",
        "Ưu tiên an toàn — sử dụng biện pháp bảo vệ.",
        "Gặp ở nơi công cộng trước khi quyết định.",
        "Không quay phim, chụp ảnh nếu chưa được cho phép.",
      ]) +
      h("Cảnh báo") +
      p("ONS <b>không dành cho người đang có mối quan hệ nghiêm túc</b>. Hãy trung thực với bản thân và đối phương."),
  },
  {
    id: "def-date-night",
    category: "Kiến thức mối quan hệ",
    title: "Date Night là gì?",
    excerpt: "Buổi hẹn dành riêng cho hai người — dành để tận hưởng và làm mới cảm xúc.",
    sort_order: 3,
    body:
      p("<b>Date Night</b> là buổi hẹn hò được lên kế hoạch riêng, giúp hai người tạm rời xa công việc để dành trọn thời gian cho nhau.") +
      h("Gợi ý ý tưởng") +
      ul([
        "Ăn tối tại quán yêu thích của cả hai.",
        "Xem phim ngoài trời hoặc rạp mini.",
        "Đi bộ ven sông, đạp xe buổi tối.",
        "Cùng nấu ăn tại nhà và xem phim.",
      ]) +
      h("Bí quyết") +
      p("Không mang công việc, không lướt điện thoại. Đặt câu hỏi mở để hiểu thêm về nhau."),
  },
  {
    id: "def-green-flag",
    category: "Kiến thức mối quan hệ",
    title: "Green Flag là gì?",
    excerpt: "Dấu hiệu tích cực cho thấy đối phương xứng đáng để đầu tư cảm xúc.",
    sort_order: 4,
    body:
      p("<b>Green Flag</b> là những dấu hiệu tốt cho thấy một người trưởng thành, tôn trọng và đáng tin cậy trong mối quan hệ.") +
      h("Một số Green Flag phổ biến") +
      ul([
        "Giao tiếp rõ ràng, không né tránh vấn đề.",
        "Tôn trọng ranh giới cá nhân.",
        "Giữ lời hứa, đúng giờ.",
        "Thoải mái nói về cảm xúc.",
        "Có bạn bè và mối quan hệ gia đình lành mạnh.",
      ]),
  },
  {
    id: "def-red-flag",
    category: "Kiến thức mối quan hệ",
    title: "Red Flag là gì?",
    excerpt: "Dấu hiệu cảnh báo — nên cân nhắc kỹ trước khi tiếp tục.",
    is_pinned: true,
    sort_order: 5,
    body:
      p("<b>Red Flag</b> là các dấu hiệu tiêu cực, cảnh báo về hành vi độc hại hoặc không an toàn của đối phương.") +
      h("Red Flag cần tránh") +
      ul([
        "Kiểm soát điện thoại, mạng xã hội, bạn bè của bạn.",
        "Bạo lực lời nói hoặc thể xác.",
        "Nói dối liên tục về những việc nhỏ.",
        "Ép buộc quan hệ, ép uống rượu.",
        "Yêu cầu chuyển tiền, gửi ảnh nhạy cảm khi mới quen.",
        "Không tôn trọng lời từ chối.",
      ]) +
      p("<b>Gặp Red Flag → ngừng liên lạc và báo cáo tài khoản</b> nếu cần."),
  },
  {
    id: "def-ghosting",
    category: "Kiến thức mối quan hệ",
    title: "Ghosting là gì?",
    excerpt: "Đột ngột biến mất, không trả lời tin nhắn — cách chia tay thiếu tôn trọng.",
    sort_order: 6,
    body:
      p("<b>Ghosting</b> là hành vi ngừng mọi liên lạc mà không giải thích. Đối phương không biết chuyện gì xảy ra và bị bỏ lửng cảm xúc.") +
      h("Nếu bạn bị ghosting") +
      ul([
        "Không tự đổ lỗi cho bản thân.",
        "Ngừng gửi tin nhắn sau lần thứ 2 không trả lời.",
        "Cho bản thân thời gian nghỉ ngơi và kết nối bạn bè.",
      ]) +
      p("<b>Hãy văn minh:</b> nếu muốn dừng lại, gửi một tin nhắn ngắn cũng đủ."),
  },
  {
    id: "def-situationship",
    category: "Kiến thức mối quan hệ",
    title: "Situationship là gì?",
    excerpt: "Mối quan hệ mập mờ — hơn bạn nhưng chưa phải người yêu.",
    sort_order: 7,
    body:
      p("<b>Situationship</b> là dạng quan hệ không có định danh rõ ràng: có thân mật, có quan tâm, nhưng không ai gọi tên.") +
      h("Dấu hiệu bạn đang trong Situationship") +
      ul([
        "Không có kế hoạch tương lai chung.",
        "Không giới thiệu với bạn bè, gia đình.",
        "Chỉ nhắn tin khi cần.",
        "Né tránh các câu hỏi 'chúng ta là gì?'.",
      ]) +
      p("Nếu bạn cần rõ ràng hơn — hãy chủ động hỏi. Câu trả lời sẽ giúp bạn quyết định."),
  },

  // ================= Kỹ năng giao tiếp =================
  {
    id: "def-bat-chuyen",
    category: "Kỹ năng giao tiếp",
    title: "Cách bắt chuyện",
    excerpt: "Mở đầu ấn tượng, không nhàm chán, tăng cơ hội được trả lời.",
    is_pinned: true,
    sort_order: 10,
    body:
      p("Ấn tượng đầu tiên quyết định 80% cơ hội tiếp tục trò chuyện. Tránh <i>'hi', 'hello', 'em ơi'</i>.") +
      h("Công thức bắt chuyện hiệu quả") +
      ul([
        "<b>Cá nhân hoá:</b> nhắc đến chi tiết trên hồ sơ đối phương.",
        "<b>Hỏi mở:</b> câu hỏi cần trả lời bằng nhiều hơn 1 từ.",
        "<b>Chia sẻ:</b> kể một điều nhỏ về bản thân để đối phương dễ đáp lại.",
      ]) +
      h("Ví dụ") +
      ul([
        "\"Ảnh đi Đà Lạt của bạn xịn ghê, đi mùa nào vậy? Mình cũng đang lên plan cuối tháng.\"",
        "\"Thấy bạn hay đọc sách, gần đây bạn thích cuốn nào nhất?\"",
      ]) +
      h("Nên tránh") +
      ul([
        "Khen ngoại hình quá mức khi mới quen.",
        "Hỏi tuổi, cân nặng, thu nhập ngay tin đầu.",
        "Gửi ảnh nhạy cảm khi chưa được đồng ý.",
      ]),
  },
  {
    id: "def-xin-telegram",
    category: "Kỹ năng giao tiếp",
    title: "Cách xin Telegram",
    excerpt: "Chuyển từ chat trong app sang Telegram một cách tự nhiên, không bị từ chối.",
    sort_order: 11,
    body:
      p("Xin Telegram quá sớm dễ khiến đối phương cảnh giác. Hãy trò chuyện đủ lâu để tạo <b>sự tin tưởng</b>.") +
      h("Thời điểm phù hợp") +
      ul([
        "Sau 10–20 tin nhắn có tương tác thật.",
        "Khi cả hai đã trao đổi vài chủ đề chung.",
      ]) +
      h("Cách nói") +
      ul([
        "\"App hay lag, mình chuyển qua Telegram cho tiện nhé?\"",
        "\"Cho mình xin Telegram để gửi ảnh chuyến đi hôm trước.\"",
      ]) +
      p("Nếu đối phương từ chối — <b>tôn trọng</b>, tiếp tục nhắn trong app."),
  },
  {
    id: "def-xin-zalo",
    category: "Kỹ năng giao tiếp",
    title: "Cách xin Zalo",
    excerpt: "Zalo là kênh phổ biến ở Việt Nam — cách xin sao cho lịch sự.",
    sort_order: 12,
    body:
      p("Zalo gắn liền với số điện thoại — nhiều người sẽ ngại chia sẻ ngay. Đừng ép.") +
      h("Nguyên tắc") +
      ul([
        "Đưa <b>Zalo của bạn</b> trước, để đối phương chủ động add.",
        "Không hỏi số điện thoại trực tiếp trong 1–2 ngày đầu.",
        "Giữ nick Zalo lịch sự, avatar rõ mặt.",
      ]),
  },

  // ================= Tìm kiếm & Kết nối =================
  {
    id: "def-tim-fwb",
    category: "Tìm kiếm & Kết nối",
    title: "Cách tìm FWB",
    excerpt: "Tìm bạn FWB an toàn, đúng người, đúng kỳ vọng.",
    sort_order: 20,
    body:
      h("Bước 1 — Hoàn thiện hồ sơ") +
      ul([
        "Ảnh thật, rõ mặt.",
        "Ghi rõ bạn đang tìm gì (FWB, không tình cảm dài hạn).",
        "Xác minh tài khoản để được ưu tiên hiển thị.",
      ]) +
      h("Bước 2 — Tìm đúng người") +
      ul([
        "Dùng bộ lọc <b>Gần đây</b> để tìm người cùng khu vực.",
        "Đọc kỹ mô tả trước khi nhắn.",
        "Trao đổi thẳng thắn về mong muốn.",
      ]) +
      h("Bước 3 — Gặp mặt an toàn") +
      ul([
        "Gặp lần đầu ở quán cafe đông người.",
        "Chia sẻ vị trí với bạn thân.",
        "Không đưa CCCD, số tài khoản.",
      ]),
  },
  {
    id: "def-tim-ons",
    category: "Tìm kiếm & Kết nối",
    title: "Cách tìm ONS",
    excerpt: "Tìm bạn ONS văn minh, an toàn và tôn trọng lẫn nhau.",
    sort_order: 21,
    body:
      p("Trước khi tìm ONS, hãy tự trả lời: bạn có thật sự sẵn sàng và tỉnh táo không?") +
      h("Quy tắc vàng") +
      ul([
        "Chỉ gặp khi cả hai <b>tỉnh táo</b> và đồng thuận rõ ràng.",
        "Không dùng chất kích thích.",
        "Sử dụng biện pháp bảo vệ.",
        "Địa điểm an toàn — khách sạn có lễ tân, tránh nhà riêng lần đầu.",
        "Không mang theo nhiều tiền mặt, tài sản có giá trị.",
      ]),
  },
  {
    id: "def-tranh-lua-dao",
    category: "Tìm kiếm & Kết nối",
    title: "Cách tránh lừa đảo",
    excerpt: "Nhận diện chiêu trò lừa đảo phổ biến trong hẹn hò online.",
    is_pinned: true,
    sort_order: 22,
    body:
      h("Các dấu hiệu lừa đảo phổ biến") +
      ul([
        "Yêu cầu <b>chuyển khoản</b> vì lý do gấp (viện phí, tai nạn, thẻ khoá).",
        "Rủ đầu tư sàn ảo, tiền số, cào thẻ.",
        "Gửi link lạ để 'xác minh tài khoản'.",
        "Ép gửi ảnh nhạy cảm để tống tiền (sextortion).",
        "Hẹn gặp ở nơi vắng, ép uống rượu.",
      ]) +
      h("Bạn nên") +
      ul([
        "Không chuyển tiền cho người quen qua mạng.",
        "Không click link lạ, không cài app lạ.",
        "Chụp lại tin nhắn và <b>báo cáo tài khoản</b> ngay.",
      ]),
  },

  // ================= Quy tắc & Chính sách =================
  {
    id: "def-quy-tac",
    category: "Quy tắc & Chính sách",
    title: "Quy tắc cộng đồng",
    excerpt: "Những điều bắt buộc phải tuân thủ để tài khoản không bị khoá.",
    is_pinned: true,
    sort_order: 30,
    body:
      h("Không được phép") +
      ul([
        "Đăng nội dung khiêu dâm, ảnh nhạy cảm công khai.",
        "Xúc phạm, kỳ thị giới tính, vùng miền, tôn giáo.",
        "Rao bán dịch vụ tình dục, môi giới mại dâm.",
        "Quảng cáo cờ bạc, ma tuý, vũ khí.",
        "Giả mạo người khác, dùng ảnh của người khác.",
        "Spam, gửi tin nhắn hàng loạt.",
      ]) +
      h("Được khuyến khích") +
      ul([
        "Tôn trọng, lịch sự với mọi người.",
        "Báo cáo hành vi xấu để cộng đồng an toàn hơn.",
        "Chia sẻ trải nghiệm tích cực.",
      ]),
  },
  {
    id: "def-dang-bai",
    category: "Quy tắc & Chính sách",
    title: "Quy định đăng bài",
    excerpt: "Cách đăng bài đúng chuẩn, không bị ẩn hoặc xoá.",
    sort_order: 31,
    body:
      h("Nội dung được duyệt") +
      ul([
        "Chia sẻ về bản thân, sở thích, mong muốn kết nối.",
        "Hỏi ý kiến cộng đồng về tình cảm, mối quan hệ.",
        "Ảnh cá nhân lịch sự, ảnh du lịch, ảnh sinh hoạt.",
      ]) +
      h("Nội dung bị xoá") +
      ul([
        "Ảnh khoả thân, khiêu dâm.",
        "Số điện thoại, Zalo trong bài công khai (dễ bị spam).",
        "Nội dung công kích cá nhân.",
        "Quảng cáo dịch vụ không được duyệt.",
      ]),
  },
  {
    id: "def-bao-cao",
    category: "Quy tắc & Chính sách",
    title: "Báo cáo tài khoản",
    excerpt: "Khi gặp tài khoản xấu, hãy báo cáo để bảo vệ cộng đồng.",
    sort_order: 32,
    body:
      h("Khi nào cần báo cáo?") +
      ul([
        "Tài khoản đòi tiền, lừa đảo.",
        "Gửi ảnh nhạy cảm khi chưa được cho phép.",
        "Đe doạ, quấy rối bằng lời nói.",
        "Nghi ngờ dùng ảnh giả, mạo danh.",
      ]) +
      h("Cách báo cáo") +
      ul([
        "Vào hồ sơ tài khoản → nhấn <b>Báo cáo</b>.",
        "Chọn lý do phù hợp, gửi kèm ảnh chụp bằng chứng.",
        "Admin sẽ xử lý trong 24h.",
      ]),
  },
  {
    id: "def-faq",
    category: "Quy tắc & Chính sách",
    title: "Câu hỏi thường gặp (FAQ)",
    excerpt: "Giải đáp nhanh những thắc mắc phổ biến của người dùng mới.",
    sort_order: 33,
    body:
      h("1. Đăng ký có mất phí không?") +
      p("Không. Tài khoản cơ bản hoàn toàn miễn phí. Chỉ các tính năng nâng cao (VIP, ưu tiên hiển thị) mới cần Gem.") +
      h("2. Gem dùng để làm gì?") +
      p("Gem dùng để tặng quà, mở khoá tính năng VIP, gửi tin nhắn đặc biệt. 1 Gem = 10 VNĐ.") +
      h("3. Làm sao để xác minh tài khoản?") +
      p("Vào Hồ sơ → Xác minh → chụp ảnh CCCD + selfie theo hướng dẫn. Admin duyệt trong 24h.") +
      h("4. Tôi có bị lộ danh tính không?") +
      p("Không. Chỉ tên, ảnh, mô tả bạn công khai mới hiển thị. Số điện thoại và email được bảo mật tuyệt đối.") +
      h("5. Tôi muốn xoá tài khoản?") +
      p("Vào Cài đặt → Tài khoản → Xoá tài khoản. Dữ liệu sẽ được xoá vĩnh viễn sau 7 ngày."),
  },

  // ================= Giữ mối quan hệ =================
  {
    id: "def-giu-lau-dai",
    category: "Giữ mối quan hệ",
    title: "Cách giữ mối quan hệ lâu dài",
    excerpt: "5 nguyên tắc giúp mối quan hệ bền vững, dù là FWB hay yêu nghiêm túc.",
    sort_order: 40,
    body:
      ul([
        "<b>Giao tiếp thường xuyên</b> — không dồn nén cảm xúc.",
        "<b>Tôn trọng ranh giới</b> — không kiểm soát điện thoại, bạn bè.",
        "<b>Ghi nhận điểm tốt</b> — khen thật lòng, không so sánh.",
        "<b>Cùng phát triển</b> — chia sẻ mục tiêu, hỗ trợ nhau.",
        "<b>Giữ sự mới mẻ</b> — thử điều mới cùng nhau mỗi tháng.",
      ]),
  },
];
