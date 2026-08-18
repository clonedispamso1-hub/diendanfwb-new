/**
 * Trang "Vào Cộng Đồng" — bài viết ghim của Admin.
 * Toàn bộ nội dung do Admin cấu hình (Admin Panel → Quản lý Cộng Đồng VIP).
 * Hiệu năng: 1 query duy nhất (cache trong phiên), CSS thuần.
 */
import { useEffect, useState } from "react";
import { MessageCircle, Pin } from "lucide-react";
import {
  fetchCommunityPage,
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

  useEffect(() => {
    let alive = true;
    void fetchCommunityPage().then((data) => {
      if (alive) setC(data);
    });
    return () => {
      alive = false;
    };
  }, []);

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

  const embed = c.video_url ? youtubeEmbed(c.video_url) : null;
  const paragraphs = c.body.split(/\n{2,}/).filter((p) => p.trim().length > 0);

  return (
    <div className="cmty-page">
      {c.banner_url ? (
        <img className="cmty-banner" src={c.banner_url} alt={c.title} loading="lazy" decoding="async" />
      ) : null}

      <div className="cmty-card">
        <span className="cmty-pin">
          <Pin size={13} /> Bài viết ghim của Admin
        </span>
        <h1 className="cmty-title">{c.title}</h1>

        <div className="cmty-body">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>

        {(c.image_urls.length > 0 || c.video_url) && (
          <div className="cmty-media">
            {c.image_urls.map((u, i) => (
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
            ) : c.video_url ? (
              <video src={c.video_url} controls preload="none" playsInline />
            ) : null}
          </div>
        )}

        <div className="cmty-actions">
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
