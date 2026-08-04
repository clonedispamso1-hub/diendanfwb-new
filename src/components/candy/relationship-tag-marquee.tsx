import { useState } from "react";
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
  /** Optional: override the tag list (advanced usage). */
  tags?: RelationshipTag[];
}

/**
 * RelationshipTagMarquee — LED-style horizontal scroller of relationship tags.
 *
 * Reusable across FWB / ONS / Dating / … by simply passing a different
 * `category`. Tap a pill to select. Track pauses when a selection is active
 * or when the user hovers/presses.
 */
export function RelationshipTagMarquee({ category, value, onChange, tags }: Props) {
  const list = tags ?? getRelationshipTags(category);
  const [pressed, setPressed] = useState(false);
  const selected = list.find((t) => t.id === value) ?? null;

  if (list.length === 0) return null;

  // Duplicate the list so the CSS `translateX(-50%)` loops seamlessly.
  const loop = [...list, ...list];
  const paused = pressed || !!selected;

  return (
    <div>
      {selected ? (
        <div className="rt-selected-bar" role="status">
          <span className="rt-selected-bar__label">Đã chọn:</span>
          <span
            className="rt-pill is-selected"
            style={{ background: selected.gradient }}
            aria-hidden
          >
            <span className="rt-pill__emoji">{selected.emoji}</span>
            <span className="rt-pill__label">{selected.label}</span>
          </span>
          <button
            type="button"
            className="rt-selected-bar__clear"
            onClick={() => onChange(null)}
          >
            Bỏ chọn
          </button>
        </div>
      ) : null}

      <div
        className={`rt-marquee${paused ? " is-paused" : ""}`}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        aria-label="Chọn kiểu mối quan hệ"
      >
        <div className="rt-marquee__track">
          {loop.map((t, i) => {
            const isSel = value === t.id;
            return (
              <button
                key={`${t.id}-${i}`}
                type="button"
                className={`rt-pill${isSel ? " is-selected" : ""}`}
                style={isSel ? undefined : { background: t.gradient }}
                onClick={() => onChange(isSel ? null : t.id)}
                aria-pressed={isSel}
              >
                <span className="rt-pill__emoji" aria-hidden>{t.emoji}</span>
                <span className="rt-pill__label">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
