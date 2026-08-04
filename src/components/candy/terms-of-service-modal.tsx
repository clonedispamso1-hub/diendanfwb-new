import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Portal } from "@/components/candy/portal";

type Lang = "vi" | "en" | "zh" | "tw";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called when the user clicks "I have read and agree". */
  onAccept?: () => void;
  lang?: Lang;
}

const TITLE: Record<Lang, string> = {
  vi: "Điều khoản sử dụng",
  en: "Terms of Service",
  zh: "服务条款",
  tw: "服務條款",
};

const ACCEPT_LABEL: Record<Lang, string> = {
  vi: "Tôi đã đọc và đồng ý",
  en: "I have read and agree",
  zh: "我已阅读并同意",
  tw: "我已閱讀並同意",
};

const SCROLL_HINT: Record<Lang, string> = {
  vi: "Vui lòng cuộn xuống cuối để bật nút đồng ý.",
  en: "Please scroll to the bottom to enable the agree button.",
  zh: "请滚动至底部以启用同意按钮。",
  tw: "請捲動至底部以啟用同意按鈕。",
};

/**
 * ZaLove Terms of Service — nội dung chính thức.
 * Các placeholder [Ngày hiệu lực] / [Email hỗ trợ] cần được thay
 * bằng thông tin thật trước khi phát hành production.
 */
const ZALOVE_TOS_VI = {
  effectiveDate: "[Ngày hiệu lực]",
  supportEmail: "[Email hỗ trợ]",
  intro:
    "ZaLove là nền tảng cộng đồng trực tuyến, nơi thành viên có thể tạo hồ sơ, đăng nội dung, tương tác, theo dõi và kết nối với nhau.",
  sections: [
    {
      h: "1. Phạm vi dịch vụ",
      b: "ZaLove là nền tảng cộng đồng trực tuyến, nơi thành viên có thể tạo hồ sơ, đăng nội dung, tương tác, theo dõi và kết nối với nhau. ZaLove không bảo đảm bất kỳ mối quan hệ, kết quả kết nối, giao dịch hoặc thỏa thuận nào giữa các thành viên.",
    },
    {
      h: "2. Điều kiện sử dụng",
      b: "Bạn chỉ được sử dụng ZaLove khi có đầy đủ năng lực theo quy định pháp luật áp dụng. Bạn chịu trách nhiệm về thông tin, nội dung và hành vi thực hiện từ tài khoản của mình. Bạn không được chia sẻ mật khẩu hoặc cho người khác sử dụng tài khoản.",
    },
    {
      h: "3. Quy tắc cộng đồng",
      b: "Bạn phải giao tiếp tôn trọng, không quấy rối, đe dọa, xúc phạm, bắt nạt, kỳ thị hoặc xâm phạm quyền và lợi ích hợp pháp của người khác. Không được giả mạo danh tính, mạo danh tổ chức/cá nhân hoặc sử dụng thông tin sai lệch gây hiểu nhầm.",
    },
    {
      h: "4. Chống lừa đảo, scam và spam",
      b: "Nghiêm cấm sử dụng ZaLove để lừa đảo, chiếm đoạt tài sản, dụ dỗ chuyển tiền, mời gọi đầu tư thiếu minh bạch, vay nóng, cờ bạc, đa cấp trái phép, phát tán liên kết độc hại, lấy cắp tài khoản hoặc thu thập trái phép dữ liệu cá nhân. Nghiêm cấm gửi tin nhắn rác, quảng cáo không được phép, tạo tài khoản ảo hoặc thực hiện hành vi làm phiền người dùng khác.",
    },
    {
      h: "5. Nội dung và hoạt động bị cấm",
      b: "Nghiêm cấm đăng tải, chia sẻ hoặc tổ chức nội dung/hành vi vi phạm pháp luật; nội dung xâm hại trẻ em; mua bán hàng hóa/dịch vụ bị cấm; ma túy, vũ khí, mại dâm, cờ bạc trái phép; nội dung kích động bạo lực, thù ghét, quấy rối tình dục; mã độc; vi phạm bản quyền hoặc quyền riêng tư. Không đăng ảnh, video hoặc thông tin cá nhân của người khác khi chưa có sự đồng ý hợp pháp.",
    },
    {
      h: "6. An toàn khi kết nối ngoài đời thực",
      b: "Nếu lựa chọn gặp gỡ hoặc giao dịch ngoài nền tảng, bạn tự chịu trách nhiệm đánh giá rủi ro và bảo vệ an toàn cá nhân. ZaLove không phải là bên tham gia, môi giới hoặc bảo đảm cho các giao dịch/thỏa thuận riêng giữa các thành viên. Khuyến khích gặp ở nơi công cộng, thông báo cho người thân khi cần và không chuyển tiền cho người chưa xác minh.",
    },
    {
      h: "7. Quyền sở hữu nội dung",
      b: "Bạn chịu trách nhiệm pháp lý đối với nội dung mình đăng. Bạn cam kết có quyền sử dụng nội dung đó. Bạn cấp cho ZaLove quyền cần thiết, không độc quyền để lưu trữ, hiển thị và phân phối nội dung trong phạm vi vận hành dịch vụ. Bạn vẫn sở hữu nội dung của mình, trừ các quyền đã cấp nêu trên.",
    },
    {
      h: "8. Báo cáo và xử lý vi phạm",
      b: "Người dùng có thể báo cáo nội dung hoặc tài khoản nghi ngờ vi phạm. ZaLove có thể xem xét, hạn chế hiển thị, gỡ nội dung, đình chỉ hoặc khóa tài khoản theo mức độ vi phạm và quy định pháp luật. Các hành vi nghiêm trọng có thể được lưu vết và phối hợp xử lý theo yêu cầu hợp pháp của cơ quan có thẩm quyền.",
    },
    {
      h: "9. Dữ liệu cá nhân và quyền riêng tư",
      b: "ZaLove xử lý dữ liệu cá nhân theo Chính sách bảo mật riêng. Người dùng cần đọc Chính sách bảo mật trước khi sử dụng dịch vụ. ZaLove áp dụng biện pháp bảo vệ hợp lý, tuy nhiên không thể cam kết loại bỏ hoàn toàn mọi rủi ro trên Internet.",
    },
    {
      h: "10. Giới hạn trách nhiệm",
      b: "Trong phạm vi pháp luật cho phép, ZaLove không chịu trách nhiệm cho hành vi, nội dung, phát ngôn, giao dịch hoặc thỏa thuận do người dùng tự thực hiện với nhau. Điều khoản này không loại trừ các trách nhiệm mà pháp luật bắt buộc nền tảng phải thực hiện.",
    },
    {
      h: "11. Thay đổi điều khoản",
      b: "ZaLove có thể cập nhật Điều khoản để phù hợp với thay đổi dịch vụ hoặc quy định. Khi thay đổi quan trọng, nền tảng sẽ thông báo theo phương thức phù hợp. Việc tiếp tục sử dụng dịch vụ sau khi điều khoản có hiệu lực thể hiện sự chấp thuận của người dùng, trong phạm vi pháp luật cho phép.",
    },
  ],
};

export function TermsOfServiceModal({ open, onClose, onAccept, lang = "vi" }: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [reachedBottom, setReachedBottom] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReachedBottom(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  // Also auto-enable if content shorter than viewport.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      const nearBottom =
        el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
      if (nearBottom) setReachedBottom(true);
    };
    // Give layout a tick
    const t = window.setTimeout(check, 60);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const handleAccept = () => {
    if (!reachedBottom) return;
    onAccept?.();
    onClose();
  };

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tos-modal-title"
        onClick={onClose}
        className="tos-modal-backdrop"
      >
        <div className="tos-modal-card" onClick={(e) => e.stopPropagation()}>
          <header className="tos-modal-header">
            <h2 id="tos-modal-title" className="tos-modal-title">
              {TITLE[lang]}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="tos-modal-close"
            >
              <X size={16} />
            </button>
          </header>

          <div
            ref={scrollRef}
            className="tos-modal-body"
            onScroll={(e) => {
              const el = e.currentTarget;
              if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
                setReachedBottom(true);
              }
            }}
          >
            {ZALOVE_TOS_VI.sections.map((s) => (
              <section key={s.h} className="tos-modal-section">
                <h3>{s.h}</h3>
                <p>
                  {s.b.replace("[Email hỗ trợ]", ZALOVE_TOS_VI.supportEmail)}
                </p>
              </section>
            ))}
            <p className="tos-modal-footnote">
              Bằng việc tiếp tục sử dụng ZaLove, bạn xác nhận đã đọc, hiểu và
              đồng ý toàn bộ Điều khoản trên.
            </p>
          </div>

          <footer className="tos-modal-footer">
            {!reachedBottom && (
              <p className="tos-modal-hint">{SCROLL_HINT[lang]}</p>
            )}
            <button
              type="button"
              onClick={handleAccept}
              disabled={!reachedBottom}
              className="tos-modal-accept"
              data-enabled={reachedBottom ? "1" : "0"}
            >
              {ACCEPT_LABEL[lang]}
            </button>
          </footer>
        </div>
      </div>

      <style>{`
        .tos-modal-backdrop {
          position: fixed; inset: 0; z-index: 2147483646;
          background: rgba(15,17,26,0.55);
          backdrop-filter: blur(10px);
          display: flex; align-items: center; justify-content: center;
          padding: 16px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .tos-modal-card {
          width: 100%; max-width: 560px; max-height: calc(100vh - 32px);
          display: flex; flex-direction: column;
          background: #ffffff;
          border: 1px solid rgba(15,23,42,0.08);
          border-radius: 20px;
          box-shadow: 0 30px 80px rgba(15,23,42,0.18);
          color: #0f172a;
          overflow: hidden;
        }
        :global(.dark) .tos-modal-card,
        html.dark .tos-modal-card {
          background: #16181f;
          border-color: rgba(255,255,255,0.08);
          color: #f5f5f7;
          box-shadow: 0 30px 80px rgba(0,0,0,0.6);
        }

        .tos-modal-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 18px 22px;
          border-bottom: 1px solid rgba(15,23,42,0.08);
        }
        html.dark .tos-modal-header { border-bottom-color: rgba(255,255,255,0.08); }

        .tos-modal-title {
          margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -0.01em;
          color: inherit;
        }
        .tos-modal-close {
          background: rgba(15,23,42,0.06); border: none;
          width: 32px; height: 32px; border-radius: 999px;
          color: inherit; display: flex; align-items: center; justify-content: center;
          cursor: pointer;
        }
        html.dark .tos-modal-close { background: rgba(255,255,255,0.08); }

        .tos-modal-body {
          overflow-y: auto; padding: 18px 22px 8px;
          font-size: 14.5px; line-height: 1.65;
          color: inherit;
          -webkit-overflow-scrolling: touch;
        }
        .tos-modal-meta {
          margin: 0 0 12px; font-size: 12.5px;
          color: rgba(15,23,42,0.55);
        }
        html.dark .tos-modal-meta { color: rgba(255,255,255,0.55); }

        .tos-modal-section { margin-bottom: 14px; }
        .tos-modal-section h3 {
          margin: 0 0 6px; font-size: 14.5px; font-weight: 600;
          color: #4338ca;
        }
        html.dark .tos-modal-section h3 { color: #c4b5fd; }
        .tos-modal-section p { margin: 0; }

        .tos-modal-footnote {
          font-size: 12px; margin-top: 12px; padding-top: 12px;
          border-top: 1px solid rgba(15,23,42,0.06);
          color: rgba(15,23,42,0.55);
        }
        html.dark .tos-modal-footnote {
          border-top-color: rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.5);
        }

        .tos-modal-footer {
          padding: 12px 22px 16px;
          border-top: 1px solid rgba(15,23,42,0.08);
          background: #ffffff;
        }
        html.dark .tos-modal-footer {
          background: #16181f;
          border-top-color: rgba(255,255,255,0.08);
        }
        .tos-modal-hint {
          margin: 0 0 8px; font-size: 12px;
          color: rgba(15,23,42,0.55); text-align: center;
        }
        html.dark .tos-modal-hint { color: rgba(255,255,255,0.55); }

        .tos-modal-accept {
          width: 100%; padding: 12px 16px;
          border: none; border-radius: 12px;
          background: linear-gradient(135deg, #4f46e5, #7c3aed);
          color: #fff; font-size: 14.5px; font-weight: 600;
          cursor: pointer;
          box-shadow: 0 8px 24px rgba(79,70,229,0.28);
          transition: opacity .18s ease, transform .18s ease;
        }
        .tos-modal-accept:disabled {
          opacity: 0.45; cursor: not-allowed; box-shadow: none;
        }
        .tos-modal-accept[data-enabled="1"]:hover { transform: translateY(-1px); }
      `}</style>
    </Portal>
  );
}
