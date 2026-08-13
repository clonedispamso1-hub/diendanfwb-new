/**
 * Trang "Cộng đồng VIP Zalo" — trang riêng (/vip-community), không popup/modal.
 * Phong cách: trắng, tối giản, nghiêm túc, ít icon.
 * Nút CTA mở link đã cấu hình trong Admin (admin_site_settings) — không hardcode.
 */
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { AuthProvider, useAuth } from "@/components/candy/auth-provider";
import { useVipUnlockLink } from "@/lib/vip-unlock-link";
import { useVipUnlockConfig } from "@/lib/vip-unlock-config";
import { openExternalLinkWithFeedback } from "@/lib/external-link";
import "@/styles/vip-community.css";

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "Cộng đồng theo từng khu vực",
    body: [
      "Bạn sẽ được tham gia nhóm Zalo riêng theo đúng khu vực đang sinh sống.",
      "Điều này giúp việc giao lưu, gặp gỡ và kết nối trở nên thuận tiện hơn.",
    ],
  },
  {
    title: "Được Admin kiểm duyệt thành viên",
    body: [
      "Tất cả thành viên tham gia nhóm đều được kiểm tra trước khi duyệt.",
      "Giảm tối đa tài khoản ảo và hạn chế nguy cơ lừa đảo.",
    ],
  },
  {
    title: "Hỗ trợ kết nối",
    body: [
      "Admin hỗ trợ giới thiệu, kết nối và ghép đôi giữa các thành viên phù hợp.",
    ],
  },
  {
    title: "Hoạt động cộng đồng",
    body: ["Định kỳ tổ chức giao lưu, offline, kết nối và hoạt động cuối tuần."],
  },
];

const WEB_BENEFITS = [
  "Mở khóa toàn bộ tính năng",
  "Xem Live miễn phí",
  "Ghép đôi không giới hạn",
  "Gọi Voice",
  "Gọi Video",
  "Xem Zalo trực tiếp",
  "Kết bạn Zalo bằng một chạm",
  "Ưu tiên hiển thị hồ sơ",
  "Hỗ trợ từ Admin",
];

const SAFETY = [
  "Tài khoản giả mạo",
  "Hồ sơ không xác thực",
  "Hành vi lừa đảo",
  "Làm phiền",
];

function VipCommunityInner() {
  const navigate = useNavigate();
  const { me } = useAuth();
  // Cùng nguồn dữ liệu với popup VIP: vip_unlock_popup.link → vip_contact_link → admin_contact_url
  const vipCfg = useVipUnlockConfig();
  const fallbackLink = useVipUnlockLink();
  const link = (vipCfg.link || "").trim() || fallbackLink;
  const region = (me?.province || me?.location || "").trim();

  const join = () => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) openExternalLinkWithFeedback(link);
    else navigate(link.startsWith("/") ? link : `/${link}`);
  };

  return (
    <main className="app-shell">
      <div className="mobile-frame">
        <header className="app-header">
          <div className="inline-flex items-center gap-3 min-w-0">
            <button className="icon-button" onClick={() => navigate(-1)} aria-label="Quay lại">
              <ArrowLeft size={18} />
            </button>
            <h1 className="page-title truncate">Cộng đồng VIP</h1>
          </div>
        </header>

        <div className="page-body">
          <div className="vipc">
            <h2 className="vipc__title">CỘNG ĐỒNG VIP ZALO</h2>

            <section className="vipc__region">
              <div className="vipc__region-label">Khu vực của bạn</div>
              <div className="vipc__region-value">{region || "Chưa cập nhật"}</div>
              <p className="vipc__region-note">
                {region
                  ? `Bạn sẽ được tham gia Cộng đồng VIP Zalo khu vực ${region}.`
                  : "Vui lòng cập nhật khu vực trong hồ sơ để được xếp vào đúng nhóm Zalo khu vực."}
              </p>
            </section>

            <section className="vipc__section">
              <h3 className="vipc__heading">Quyền lợi khi tham gia Cộng đồng VIP Zalo</h3>
              {SECTIONS.map((s) => (
                <article key={s.title} className="vipc__block">
                  <h4>{s.title}</h4>
                  {s.body.map((b) => (
                    <p key={b}>{b}</p>
                  ))}
                </article>
              ))}
            </section>

            <section className="vipc__section">
              <h3 className="vipc__heading">Quyền lợi trên Website</h3>
              <ul className="vipc__list">
                {WEB_BENEFITS.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </section>

            <section className="vipc__section">
              <h3 className="vipc__heading">An toàn hơn</h3>
              <p className="vipc__text">Việc tham gia Cộng đồng VIP giúp hạn chế:</p>
              <ul className="vipc__list">
                {SAFETY.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
              <p className="vipc__text">
                Tất cả đều được đội ngũ Admin theo dõi và xử lý.
              </p>
            </section>

            <button type="button" className="vipc__cta" onClick={join} disabled={!link}>
              THAM GIA CỘNG ĐỒNG VIP
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function VipCommunityPage() {
  return (
    <AuthProvider>
      <VipCommunityInner />
    </AuthProvider>
  );
}
