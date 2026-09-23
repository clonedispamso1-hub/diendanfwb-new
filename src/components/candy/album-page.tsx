/**
 * Tab "Album" ngoài Frontend — hiển thị các Album do Admin tạo trong
 * Admin Panel → "Quản Lý Album" (dữ liệu + ảnh cover trên Supabase #4).
 * Layout: 2 card / 1 hàng.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Album as AlbumIcon, ArrowRight, Clock3, Eye, Images, Plus, ShoppingCart, Video, X } from "lucide-react";
import { AlbumComposerModal } from "@/components/candy/album-composer-modal";
import { setAlbumTabActive } from "@/lib/album-tab-flag";
import { UserDisplayName } from "@/components/vip/user-display-name";
import { CommonLockedPopup } from "@/components/candy/common-locked-popup";
import { avatarSrc } from "@/lib/image-cdn";
import { formatDisplayCount, formatThousands, listAlbumsPublic, type Album } from "@/lib/albums";
import { formatRelativeTime } from "@/lib/time-format";
import "@/styles/community-page.css";
import "@/styles/album-page.css";

export function AlbumPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [lockedOpen, setLockedOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Chỉ trang Album: ẩn icon Zalo nổi, thay bằng nút "+" bên dưới.
  useEffect(() => {
    setAlbumTabActive(true);
    return () => setAlbumTabActive(false);
  }, []);


  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await listAlbumsPublic();
        if (alive) setAlbums(rows);
      } catch {
        if (alive) setAlbums([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (selectedAlbum || lockedOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [selectedAlbum, lockedOpen]);

  const openLocked = () => {
    setSelectedAlbum(null);
    setLockedOpen(true);
  };

  return (
    <section className="cmty-page album-page" aria-label="Album">
      {loading && <div className="album-empty">Đang tải…</div>}
      {!loading && albums.length === 0 && <div className="album-empty">Chưa có Album nào.</div>}
      {albums.length > 0 && (
        <div className="album-grid">
          {albums.map((a) => (
            <article
              key={a.id}
              className="album-card"
              role="button"
              tabIndex={0}
              onClick={() => setSelectedAlbum(a)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedAlbum(a);
                }
              }}
              aria-label={`Mở chi tiết album ${a.title}`}
            >
              <div className="album-card__cover">
                {a.cover_url ? <img src={a.cover_url} alt={a.title} loading="lazy" /> : <span />}
                {(a.price ?? 0) > 0 && <span className="album-card__badge">Mua</span>}
              </div>
              <div className="album-card__body">
                <div className="album-card__owner">
                  {a.owner_avatar ? (
                    <img src={avatarSrc(a.owner_avatar, 24)} alt="" width={24} height={24} />
                  ) : (
                    <span className="album-card__avatar-fallback" />
                  )}
                  <UserDisplayName
                    userId={a.owner_id}
                    name={a.owner_name || a.owner_username || "Người dùng"}
                    badgeSize={14}
                    nameClassName="truncate"
                  />
                </div>
                <h3 className="album-card__title">{a.title}</h3>
                <div className="album-card__meta">
                  <span title="Lượt xem" aria-label={`${formatDisplayCount(a.view_count)} lượt xem`}>
                    <Eye size={13} aria-hidden="true" /> {formatDisplayCount(a.view_count)}
                  </span>
                  <span title="Ảnh" aria-label={`${formatDisplayCount(a.photo_count)} ảnh`}>
                    <Images size={13} aria-hidden="true" /> {formatDisplayCount(a.photo_count)}
                  </span>
                  <span title="Video" aria-label={`${formatDisplayCount(a.video_count)} video`}>
                    <Video size={13} aria-hidden="true" /> {formatDisplayCount(a.video_count)}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <AlbumDetailModal
        album={selectedAlbum}
        onClose={() => setSelectedAlbum(null)}
        onAction={openLocked}
      />
      <CommonLockedPopup
        open={lockedOpen}
        onClose={() => setLockedOpen(false)}
        featureName="Album"
      />

      <button
        type="button"
        className="album-fab"
        onClick={() => setComposerOpen(true)}
        aria-label="Đăng Album"
        aria-haspopup="dialog"
      >
        <Plus size={26} aria-hidden="true" />
      </button>
      <AlbumComposerModal open={composerOpen} onClose={() => setComposerOpen(false)} />
    </section>
  );
}

/** "X ngày trước" cho mốc ≥24h (tối đa 6 ngày), còn lại dùng formatRelativeTime. */
function formatAlbumTime(input?: string | null): string {
  if (!input) return "";
  const ts = new Date(input).getTime();
  if (Number.isNaN(ts)) return "";
  const days = Math.floor((Date.now() - ts) / 86400000);
  if (days >= 1 && days < 7) return `${days} ngày trước`;
  return formatRelativeTime(input);
}

interface AlbumDetailModalProps {
  album: Album | null;
  onClose: () => void;
  onAction: () => void;
}

function AlbumDetailModal({ album, onClose, onAction }: AlbumDetailModalProps) {
  const [mounted, setMounted] = useState(false);
  const [vipNotice, setVipNotice] = useState(false);

  useEffect(() => {
    if (!album) {
      setMounted(false);
      setVipNotice(false);
      return;
    }
    setVipNotice(false);
    const timer = window.setTimeout(() => setMounted(true), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [album, onClose]);

  if (!album || typeof document === "undefined") return null;

  const isPaid = (album.price ?? 0) > 0;
  const ownerName = album.owner_name || album.owner_username || "Người dùng";
  const timeText = formatAlbumTime(album.created_at);

  return createPortal(
    <div
      className="album-detail-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Chi tiết album ${album.title}`}
      onClick={onClose}
    >
      <div
        className={`album-detail-card${mounted ? " album-detail-card--in" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="album-detail-header">
          <span className="album-detail-header__icon" aria-hidden="true">
            <AlbumIcon size={17} />
          </span>
          <span className="album-detail-header__title">Chi tiết Album</span>
          <button
            type="button"
            className="album-detail-close"
            onClick={onClose}
            aria-label="Đóng"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="album-detail-body">
          <div className="album-detail-owner">
            {album.owner_avatar ? (
              <img
                src={avatarSrc(album.owner_avatar, 88)}
                alt=""
                width={44}
                height={44}
              />
            ) : (
              <span className="album-detail-owner__fallback" aria-hidden="true" />
            )}
            <div className="album-detail-owner__info">
              <UserDisplayName
                userId={album.owner_id}
                name={ownerName}
                badgeSize={18}
                nameClassName="album-detail-owner__name"
              />
              <span className="album-detail-time">
                <Clock3 size={13} aria-hidden="true" />
                {timeText}
              </span>
            </div>
          </div>

          <h3 className="album-detail-title">{album.title}</h3>

          <div className="album-detail-stats">
            <div className="album-detail-stat">
              <span className="album-detail-stat__icon" aria-hidden="true">
                <Images size={18} />
              </span>
              <span className="album-detail-stat__label">Ảnh</span>
              <span className="album-detail-stat__value">
                {formatDisplayCount(album.photo_count)}
              </span>
            </div>
            <div className="album-detail-stat">
              <span className="album-detail-stat__icon" aria-hidden="true">
                <Video size={18} />
              </span>
              <span className="album-detail-stat__label">Video</span>
              <span className="album-detail-stat__value">
                {formatDisplayCount(album.video_count)}
              </span>
            </div>
            {album.fake_purchase_count > 0 && (
              <div className="album-detail-stat">
                <span className="album-detail-stat__icon" aria-hidden="true">
                  <ShoppingCart size={18} />
                </span>
                <span className="album-detail-stat__label">Lượt mua</span>
                <span className="album-detail-stat__value">
                  {formatDisplayCount(album.fake_purchase_count)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="album-detail-actions">
          {isPaid && vipNotice && (
            <div className="album-detail-alert" role="alert">
              Tính năng này chỉ dành cho thành viên đã tham gia nhóm VIP Zalo.
            </div>
          )}
          <button
            type="button"
            className="album-detail-btn"
            onClick={() => {
              if (isPaid) {
                setVipNotice(true);
                return;
              }
              onAction();
            }}
          >
            {isPaid ? (
              <>
                MUA {formatThousands(album.price)} Xu
                <ShoppingCart size={17} aria-hidden="true" />
              </>
            ) : (
              <>
                XEM NGAY
                <ArrowRight size={17} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default AlbumPage;
