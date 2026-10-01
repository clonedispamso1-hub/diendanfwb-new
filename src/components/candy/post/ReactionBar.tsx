import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shortCount } from "@/lib/supabase-v4";
import { fetchSeedGroupsOfAccount, type SeedGroupOption } from "@/lib/seed-account-groups";
import { LikeButton } from "./LikeButton";
import { PostContactActions } from "./PostContactActions";
import { usePostCard, type ProfileGroupsPopupData } from "./post-card-context";

/** Cache nhóm theo TỪNG tác giả (key = user_id) — không dùng chung state. */
const groupsCache = new Map<string, SeedGroupOption[]>();

const POPUP_WIDTH = 300;
const POPUP_MAX_HEIGHT = 340;
const VIEWPORT_GAP = 12;

interface PopupPos {
  /** Khi mở lên trên: neo bằng bottom để popup luôn sát icon dù danh sách ngắn. */
  top?: number;
  bottom?: number;
  left: number;
  maxHeight: number;
  width: number;
  origin: "above" | "below";
}

/** Tính vị trí popup neo theo icon Nhóm, tự căn trong mép màn hình. */
function computePopupPos(anchor: DOMRect): PopupPos {
  const width = Math.min(POPUP_WIDTH, window.innerWidth - VIEWPORT_GAP * 2);
  let left = anchor.left + anchor.width / 2 - width / 2;
  left = Math.max(VIEWPORT_GAP, Math.min(left, window.innerWidth - width - VIEWPORT_GAP));

  // Kẹp neo trong viewport: khi cuộn trang, nếu icon trôi ra ngoài màn hình
  // thì popup vẫn nằm gọn trong tầm nhìn thay vì bị kéo ra ngoài.
  const anchorTop = Math.max(VIEWPORT_GAP, Math.min(anchor.top, window.innerHeight - VIEWPORT_GAP));
  const anchorBottom = Math.max(
    VIEWPORT_GAP,
    Math.min(anchor.bottom, window.innerHeight - VIEWPORT_GAP),
  );

  const spaceAbove = anchorTop - VIEWPORT_GAP;
  const spaceBelow = window.innerHeight - anchorBottom - VIEWPORT_GAP;
  const origin: PopupPos["origin"] =
    spaceAbove >= 220 || spaceAbove >= spaceBelow ? "above" : "below";
  const maxHeight = Math.max(
    140,
    Math.min(POPUP_MAX_HEIGHT, origin === "above" ? spaceAbove - 8 : spaceBelow - 8),
  );
  if (origin === "above") {
    return { bottom: window.innerHeight - anchorTop + 8, left, maxHeight, width, origin };
  }
  return { top: anchorBottom + 8, left, maxHeight, width, origin };
}

/**
 * ReactionBar — Like · nhóm · private message.
 *
 * Icon Nhóm CHỈ có một nhiệm vụ: mở/đóng popup xem các nhóm chủ hồ sơ đã
 * tham gia (dữ liệu reuse từ tab Nhóm của hồ sơ). Không điều hướng, không
 * mở trang Nhóm, không /connect, không requestBaitFocus — ở bất kỳ ngữ cảnh nào.
 */
export function ReactionBar() {
  const { profileGroupsPopup, post, authorName, isAnonymous } = usePostCard();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<PopupPos | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  // Ở FEED/Trang chủ không có profileGroupsPopup: mỗi card tự lấy nhóm của
  // CHÍNH tác giả bài viết (post.user_id) — state riêng theo từng card.
  const authorId = !isAnonymous && !profileGroupsPopup ? post.user_id : "";
  const [feedGroups, setFeedGroups] = useState<SeedGroupOption[] | null>(
    authorId ? (groupsCache.get(authorId) ?? null) : null,
  );
  const [feedLoading, setFeedLoading] = useState(false);

  const loadFeedGroups = useCallback(() => {
    if (!authorId || groupsCache.has(authorId)) {
      if (authorId) setFeedGroups(groupsCache.get(authorId) ?? []);
      return;
    }
    setFeedLoading(true);
    fetchSeedGroupsOfAccount(authorId)
      .then((data) => {
        groupsCache.set(authorId, data);
        setFeedGroups(data);
      })
      .catch((err) => {
        console.warn("[feed-groups] fetch failed", err);
        setFeedGroups([]);
      })
      .finally(() => setFeedLoading(false));
  }, [authorId]);

  const popupData: ProfileGroupsPopupData | null = useMemo(() => {
    if (profileGroupsPopup) return profileGroupsPopup;
    if (!authorId) return null;
    return {
      groups: feedGroups ?? [],
      loading: feedLoading,
      displayName: authorName || "Người dùng",
    };
  }, [profileGroupsPopup, authorId, feedGroups, feedLoading, authorName]);

  const close = useCallback(() => setOpen(false), []);

  // Popup đóng khi: bấm ra ngoài, bấm lại icon, nhấn Escape, hoặc NGAY KHI
  // người dùng bắt đầu cuộn/vuốt trang (lên hoặc xuống). Không reposition.
  useEffect(() => {
    if (!open) return;
    // Bấm ra ngoài dùng "click" (không phải pointerdown) để tap và vuốt được
    // phân biệt rõ; vuốt sẽ được bắt bởi listener scroll/touchmove bên dưới.
    const onOutsideClick = (e: Event) => {
      const t = e.target as Node | null;
      if (!t) return close();
      if (popupRef.current?.contains(t) || btnRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Cuộn bên trong danh sách nhóm của popup thì không đóng.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && t !== document && popupRef.current?.contains(t)) return;
      close();
    };
    // Vuốt trên mobile: đóng ngay khi ngón tay di chuyển (passive, không chặn cuộn trang).
    let startY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      const t = e.target as Node | null;
      startY = t && popupRef.current?.contains(t) ? null : (e.touches[0]?.clientY ?? null);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (startY == null) return;
      const y = e.touches[0]?.clientY ?? startY;
      if (Math.abs(y - startY) > 6) close();
    };
    document.addEventListener("click", onOutsideClick, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });
    return () => {
      document.removeEventListener("click", onOutsideClick, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", onTouchMove, true);
    };
  }, [open, close]);

  const handleGroupClick = (e: React.MouseEvent) => {
    // Chặn mọi lan truyền: sự kiện không bao giờ bubble lên post card,
    // container cha hay bottom navigation.
    e.preventDefault();
    e.stopPropagation();
    if (!popupData) return; // Không có tác giả hợp lệ: không làm gì, không điều hướng.
    if (open) {
      close();
      return;
    }
    loadFeedGroups(); // feed: nạp nhóm của đúng tác giả bài viết (no-op ở profile)
    if (btnRef.current) setPos(computePopupPos(btnRef.current.getBoundingClientRect()));
    setOpen(true);
  };

  return (
    <div className="pc-reactions" role="group" aria-label="Tương tác">
      <LikeButton />
      <Button
        type="button"
        variant="ghost"
        className="pc-action pc-report-action"
        ref={btnRef}
        onClick={handleGroupClick}
        aria-label="Nhóm"
        aria-expanded={popupData ? open : undefined}
        title="Nhóm"
      >
        <span className="pc-action-icon"><Users size={20} aria-hidden="true" /></span>
      </Button>
      <PostContactActions />
      {popupData && open && pos
        ? createPortal(
            <div
              ref={popupRef}
              className="pgp-popup"
              data-origin={pos.origin}
              role="dialog"
              aria-label={`Nhóm của ${popupData.displayName}`}
              style={{
                top: pos.top,
                bottom: pos.bottom,
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
              }}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <p className="pgp-title">
                <Users size={14} aria-hidden="true" className="pgp-title-icon" />
                Các nhóm của {popupData.displayName}
              </p>
              <div className="pgp-list">
                {popupData.loading ? (
                  <p className="pgp-state">Đang tải nhóm…</p>
                ) : popupData.groups.length === 0 ? (
                  <p className="pgp-state">Thành viên này chưa tham gia nhóm nào.</p>
                ) : (
                  // Popup chỉ để XEM: mỗi dòng là thông tin tĩnh, không bấm/không điều hướng.
                  popupData.groups.map((g) => (
                    <div key={`${g.kind}:${g.id}`} className="pgp-row">
                      {g.avatar_url ? (
                        <img className="pgp-avatar" src={g.avatar_url} alt="" loading="lazy" />
                      ) : (
                        <span className="pgp-avatar pgp-avatar-fallback" aria-hidden>
                          <Users size={16} />
                        </span>
                      )}
                      <span className="pgp-meta">
                        <span className="pgp-name">{g.name}</span>
                        <span className="pgp-counts">{shortCount(g.member_count)} thành viên</span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
