/**
 * Trang "Vào Cộng Đồng" — bài viết ghim của Admin.
 * Toàn bộ nội dung do Admin cấu hình (Admin Panel → Quản lý Cộng đồng VIP).
 * Nội dung chia nhiều phần/bước: xem lần lượt bằng "Tiếp →" / "← Quay lại".
 * Hiệu năng: 1 query duy nhất (cache trong phiên), CSS thuần.
 */
import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Pin } from "lucide-react";
import {
  DEFAULT_COMMUNITY_PAGE,
  fetchCommunityPage,
  visibleSections,
  type CommunityPageContent,
} from "@/lib/connect/community-content";
import "@/styles/community-page.css";

import { openExternalLinkWithFeedback } from "@/lib/external-link";
function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{6,})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}

export function CommunityPage() {
  const [c, setC] = useState<CommunityPageContent | null>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let alive = true;
    // QUAN TRỌNG: luôn phải resolve state. Nếu query lỗi (mạng / client ném lỗi
    // đồng bộ) mà không có .catch thì `c` mãi là null → vùng nội dung trắng.
    fetchCommunityPage()
      .then((data) => {
        if (alive) setC(data);
      })
      .catch(() => {
        if (alive) setC({ ...DEFAULT_COMMUNITY_PAGE });
      });
    return () => {
      alive = false;
    };
  }, []);

  const sections = useMemo(() => (c ? visibleSections(c) : []), [c]);

  useEffect(() => {
    setStep((s) => Math.min(s, Math.max(sections.length - 1, 0)));
  }, [sections.length]);

  if (!c) {
    return (
      <div className="cmty-page">
        <div className="cmty-skeleton" />
      </div>
    );
  }

  const open = (url: string) => {
    if (!url) return;
    openExternalLinkWithFeedback(url);
  };

  const current = sections[Math.min(step, sections.length - 1)];
  const embed = current?.video_url ? youtubeEmbed(current.video_url) : null;
  const paragraphs = (current?.body ?? "").split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const multi = sections.length > 1;
  const isFirst = step <= 0;
  const isLast = step >= sections.length - 1;

  return (
    <div className="cmty-page">
      {c.banner_url ? (
        <img className="cmty-banner" src={c.banner_url} alt={c.title} loading="lazy" decoding="async" />
      ) : null}

      <div className="cmty-card">
        <span className="cmty-pin">
          <Pin size={13} /> Bài viết ghim của Admin
        </span>
        {multi ? (
          <p className="cmty-body" style={{ margin: "0 0 4px", opacity: 0.6, fontSize: 12.5 }}>
            Phần {step + 1}/{sections.length}
          </p>
        ) : null}
        <h1 className="cmty-title">{current?.title || c.title}</h1>

        <div className="cmty-body cmty-fade" key={current?.id ?? "s"}>
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {((current?.image_urls.length ?? 0) > 0 || current?.video_url) && (
          <div className="cmty-media">
            {(current?.image_urls ?? []).map((u, i) => (
              <img key={u + i} src={u} alt="" loading="lazy" decoding="async" />
            ))}
            {embed ? (
              <iframe
                src={embed}
                title="Video cộng đồng"
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            ) : current?.video_url ? (
              <video src={current.video_url} controls preload="none" playsInline />
            ) : null}
          </div>
        )}

        {multi ? (
          <div className="cmty-actions cmty-nav">
            {!isFirst ? (
              <button type="button" className="cmty-btn" onClick={() => setStep((s) => s - 1)}>
                ← Quay lại
              </button>
            ) : null}
            {!isLast ? (
              <button type="button" className="cmty-btn cmty-btn--cta" onClick={() => setStep((s) => s + 1)}>
                Tiếp →
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="cmty-actions cmty-social-actions">
          {c.show_zalo && c.zalo_url ? (
            <button type="button" className="cmty-btn cmty-btn--cta cmty-btn--zalo" onClick={() => open(c.zalo_url)}>
              Nhóm Zalo
            </button>
          ) : null}
          {c.show_facebook && c.facebook_url ? (
            <button type="button" className="cmty-btn cmty-btn--cta cmty-btn--fb" onClick={() => open(c.facebook_url)}>
              Facebook
            </button>
          ) : null}
          {c.show_telegram && c.telegram_url ? (
            <button type="button" className="cmty-btn" onClick={() => open(c.telegram_url)}>
              Telegram
            </button>
          ) : null}
          {c.show_admin && c.admin_url ? (
            <button
              type="button"
              className="cmty-btn cmty-btn--primary"
              onClick={() => open(c.admin_url)}
            >
              <MessageCircle size={16} />
              <span>Liên hệ Admin</span>
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default CommunityPage;
