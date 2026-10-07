import { BadgeCheck, Pin, Star } from "lucide-react";
import { GenderIcon } from "@/components/candy/gender-icon";
import UniversalBadge, { hasVipBadge } from "@/components/candy/universal-badge";
import { isVipProfile, useHasVipNameIcon } from "@/lib/vip-status";
import { usePostCard } from "./post-card-context";

/**
 * PostMeta — tên tác giả, badge duy nhất (<UniversalBadge />), giới tính,
 * timestamp và các chip điều hành (edited / pinned / featured).
 *
 * Dưới tên là TRẠNG THÁI XÁC MINH (không còn location/province):
 *  • Có GIF/icon xác minh sau tên (vip_media / tick clone VIP / crown admin)
 *    hoặc VIP thực → "Đã xác minh" kèm tích xanh.
 *  • Không có → "Chưa xác minh", không tích xanh.
 */
export function PostMeta() {
  const { post, isAnonymous, authorName, postTime, isEdited, pinnedActive, featuredActive } =
    usePostCard();
  const p: any = post.profiles || {};
  // Tiêu chí xác minh = GIF/icon xác minh hiện có của member (icon sau tên),
  // cùng nguồn với <UniversalBadge /> và popup hồ sơ — không tạo tiêu chí mới.
  // GIF sau tên lấy từ cùng store với <CloneVipNameMedia> (vip_media_assign).
  const hasNameGif = useHasVipNameIcon(isAnonymous ? null : (p.id ?? post.user_id));
  const hasVerifyIcon = !isAnonymous && (hasNameGif || hasVipBadge(p) || isVipProfile(p));

  return (
    <div className="pc-meta">
      <div className="pc-meta-title-row">
        <span className="pc-meta-name">
          {authorName}
          {/* HỆ THỐNG 2: Media VIP dán ngay sát tên, không cách khoảng. */}
          
        </span>
        {!isAnonymous ? (
          <>
            <span className="pc-meta-icon">
              <GenderIcon gender={p.gender} />
            </span>
            <UniversalBadge profile={p} />
          </>
        ) : null}
      </div>

      <div className="pc-meta-sub">
        {isAnonymous ? null : hasVerifyIcon ? (
          <span className="pc-verify-chip pc-verify-chip--ok" title="Đã xác minh">
            <BadgeCheck size={12} strokeWidth={2.4} aria-hidden /> Đã xác minh
          </span>
        ) : (
          <span className="pc-verify-chip pc-verify-chip--none" title="Chưa xác minh">
            Chưa xác minh
          </span>
        )}
        <span className="pc-meta-time">{postTime}</span>
        {isEdited ? <span className="pc-meta-edited">· Đã chỉnh sửa</span> : null}
        {pinnedActive ? (
          <span className="pc-chip pc-chip-pinned" title="Bài viết ghim">
            <Pin size={10} /> Ghim
          </span>
        ) : null}
        {featuredActive ? (
          <span className="pc-chip pc-chip-featured" title="Bài viết ưu tiên">
            <Star size={10} /> Ưu tiên
          </span>
        ) : null}
      </div>
    </div>
  );
}
