import { useState } from "react";
import { PostCopy } from "./PostCopy";

import { Facebook, MessageCircle } from "lucide-react";
import { PostMediaBlock } from "./PostMediaBlock";
import { usePostCard } from "./post-card-context";
import { findRelationshipTagAnywhere } from "@/lib/post-categories";
import { ContactVipLockModal } from "@/components/candy/contact-vip-lock-modal";
import { ImageLightbox } from "@/components/candy/image-lightbox";
import { normalizeFacebookUrl, zaloHrefFromPhone } from "@/lib/contact-validation";
import { canOpenContact } from "@/lib/contact-permission";
import { useAuth } from "@/components/candy/auth-provider";


/**
 * PostBody — caption + inline edit affordance + media block.
 * Body copy uses the display font stack from the post design system.
 */
export function PostBody() {
  const {
    post, editingCaption, editText, savingEdit, setEditText, setEditingCaption, saveEdit, meId,
  } = usePostCard();

  const isLocked = Boolean((post as any).is_locked);
  const commentsDisabled = Boolean((post as any).comments_disabled);
  const [showVipLock, setShowVipLock] = useState(false);
  const [gifLightbox, setGifLightbox] = useState<string | null>(null);
  const isPostOwner = !!meId && meId === post.user_id;
  // Only well-formed values render an icon.
  const fbHref = normalizeFacebookUrl((post as any).facebook_url);
  const zaloHref = zaloHrefFromPhone((post as any).zalo_url);

  const { me } = useAuth();
  // Admin's contacts are open to everyone; normal users' contacts need VIP.
  const canOpen = isPostOwner || canOpenContact(me as any, (post as any).profiles ?? null);

  const handleContactClick = (href: string) => (e: React.MouseEvent) => {
    if (canOpen) return; // open the link normally
    e.preventDefault();
    setShowVipLock(true);
    void href;
  };

  return (
    <div className="pc-body">
      {(isLocked || commentsDisabled) && (
        <div
          className="pc-mod-banner"
          data-kind={isLocked ? "locked" : "comments-off"}
          role="note"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            marginBottom: 10,
            borderRadius: 10,
            fontSize: "0.82rem",
            fontWeight: 600,
            lineHeight: 1.4,
            border: "1px solid",
            borderColor: isLocked ? "rgba(239,68,68,0.45)" : "rgba(96,165,250,0.45)",
            background: isLocked ? "rgba(239,68,68,0.10)" : "rgba(96,165,250,0.10)",
            color: isLocked ? "#fecaca" : "#c7ddff",
          }}
        >
          <span aria-hidden>{isLocked ? "🔒" : "💬"}</span>
          <span>
            {isLocked
              ? "Bài viết này đã bị đội ngũ kiểm duyệt khóa."
              : "Bình luận đã bị đội ngũ kiểm duyệt tắt trên bài viết này."}
          </span>
        </div>
      )}

      {editingCaption ? (
        <div className="pc-edit">
          <textarea
            className="pc-edit-input"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            rows={4}
            autoFocus
          />
          <div className="pc-edit-actions">
            <button
              type="button"
              className="pc-btn pc-btn--ghost"
              onClick={() => setEditingCaption(false)}
              disabled={savingEdit}
            >
              Huỷ
            </button>
            <button
              type="button"
              className="pc-btn pc-btn--primary"
              onClick={() => void saveEdit()}
              disabled={savingEdit}
            >
              {savingEdit ? "Đang lưu…" : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      ) : post.content ? (
        <>
          {(() => {
            const tag = findRelationshipTagAnywhere((post as any).relationship_type);
            const province = (post as any).province as string | null | undefined;
            const district = (post as any).district as string | null | undefined;
            if (!tag && !province) return null;
            return (
              <div className="rt-post-meta">
                {tag ? (
                  <span className="rt-inline-pill" style={{ background: tag.gradient, marginBottom: 0 }}>
                    <span aria-hidden>{tag.emoji}</span>
                    <span>{tag.label}</span>
                  </span>
                ) : null}
                {province ? (
                  <span className="rt-post-meta__chip">📍 {province}</span>
                ) : null}
                {district ? (
                  <span className="rt-post-meta__chip">📌 {district}</span>
                ) : null}
              </div>
            );
          })()}
          <PostCopy
            text={post.content}
            onGifClick={(url) => setGifLightbox(url)}
          />
          {gifLightbox ? (
            <ImageLightbox src={gifLightbox} alt="GIF" onClose={() => setGifLightbox(null)} />
          ) : null}

        </>
      ) : null}

      <PostMediaBlock />

      {(() => {
        if (!fbHref && !zaloHref) return null;
        return (
          <div className="pc-contact-row" aria-label="Liên hệ chủ bài">
            {fbHref ? (
              <a
                href={fbHref}
                rel="noopener noreferrer"
                className="pc-contact-btn pc-contact-btn--fb"
                aria-label="Facebook"
                onClick={handleContactClick(fbHref)}
              >
                <Facebook size={16} /> Facebook
              </a>
            ) : null}
            {zaloHref ? (
              <a
                href={zaloHref}
                rel="noopener noreferrer"
                className="pc-contact-btn pc-contact-btn--zalo"
                aria-label="Zalo"
                onClick={handleContactClick(zaloHref)}
              >
                <MessageCircle size={16} /> Zalo
              </a>
            ) : null}
          </div>
        );
      })()}

      <ContactVipLockModal open={showVipLock} onClose={() => setShowVipLock(false)} />
    </div>
  );
}



