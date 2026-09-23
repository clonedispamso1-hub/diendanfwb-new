/**
 * MemberGuideCard — thẻ "Hướng dẫn thành viên" hiển thị trong cuộc trò chuyện.
 *
 * - Không cho sao chép / chọn text / menu chuột phải (chống copy nội dung).
 * - Bấm "Xem chi tiết" → mở popup (desktop) / bottom-sheet (mobile) nội dung đầy đủ.
 */
import { ChevronRight } from "lucide-react";

import { BottomSheet } from "@/components/candy/bottom-sheet";
import { Portal } from "@/components/candy/portal";
import type { GuideCardContent } from "@/lib/member-guide-card";

const noCopy = (event: React.SyntheticEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function MemberGuideCard({
  data,
  onOpen,
}: {
  data: GuideCardContent;
  onOpen: () => void;
}) {
  return (
    <div
      className="mgc-card"
    >
      <div className="mgc-card-top">
        <span className="mgc-emoji" aria-hidden>
          {data.emoji}
        </span>
        <div className="mgc-card-text">
          <span className="mgc-eyebrow">{data.eyebrow}</span>
          <strong className="mgc-title">{data.title}</strong>
          <span className="mgc-subtitle">{data.subtitle}</span>
        </div>
      </div>
      <button
        type="button"
        className="mgc-cta"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }}
      >
        Xem chi tiết
        <ChevronRight size={15} aria-hidden />
      </button>
    </div>
  );
}

export function MemberGuideDetailSheet({
  data,
  open,
  onClose,
}: {
  data: GuideCardContent;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Portal>
      <BottomSheet open={open} onClose={onClose} title={data.title} leftAction={<></>} height={88}>
        <div
          className="mgc-detail"
        >
          <div className="mgc-detail-hero">
            <span className="mgc-detail-emoji" aria-hidden>
              {data.emoji}
            </span>
            <p className="mgc-detail-lead">{data.subtitle}</p>
          </div>

          {data.blocks.map((block) => (
            <section className="mgc-block" key={block.heading}>
              <h3 className="mgc-block-title">
                <span aria-hidden>{block.icon}</span>
                {block.heading}
              </h3>
              {block.intro ? <p className="mgc-block-intro">{block.intro}</p> : null}
              {block.bullets?.length ? (
                <ul className="mgc-bullets">
                  {block.bullets.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <p className="mgc-footnote">{data.footnote}</p>
        </div>
      </BottomSheet>
    </Portal>
  );
}

export default MemberGuideCard;
