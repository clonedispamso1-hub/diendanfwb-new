import { Pin, Star } from "lucide-react";
import { GenderIcon } from "@/components/candy/gender-icon";
import UniversalBadge from "@/components/candy/universal-badge";
import { usePostCard } from "./post-card-context";

/**
 * PostMeta — tên tác giả, badge duy nhất (<UniversalBadge />), giới tính,
 * timestamp và các chip điều hành (edited / pinned / featured).
 */
export function PostMeta() {
  const { post, isAnonymous, authorName, postTime, isEdited, pinnedActive, featuredActive } =
    usePostCard();
  const p: any = post.profiles || {};

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
