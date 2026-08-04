/**
 * RelationshipStickerGrid — sticker-style tag picker (LINE/Zalo feel).
 *
 * Reusable across FWB / ONS / Dating pages. Big emoji card + label under.
 * Tap to select. Selected card gets a soft glow.
 */
import "@/styles/relationship-tags.css";
import {
  getRelationshipTags,
  type PostCategoryId,
  type RelationshipTag,
} from "@/lib/post-categories";

interface Props {
  category: PostCategoryId;
  value: string | null;
  onChange: (tagId: string | null) => void;
  tags?: RelationshipTag[];
}

export function RelationshipStickerGrid({ category, value, onChange, tags }: Props) {
  const list = tags ?? getRelationshipTags(category);
  if (list.length === 0) return null;

  return (
    <div className="rt-sticker-grid" role="listbox" aria-label="Chọn nhãn mối quan hệ">
      {list.map((t) => {
        const isSel = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="option"
            aria-selected={isSel}
            className={`rt-sticker${isSel ? " is-selected" : ""}`}
            style={{ background: t.gradient }}
            onClick={() => onChange(isSel ? null : t.id)}
          >
            <span className="rt-sticker__emoji" aria-hidden>{t.emoji}</span>
            <span className="rt-sticker__label">{t.label}</span>
            {isSel ? <span className="rt-sticker__check" aria-hidden>✓</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export default RelationshipStickerGrid;
