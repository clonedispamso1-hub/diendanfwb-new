// Thanh bộ lọc clone dùng chung: Giới tính + Khu vực.
// Dùng ở Tin nhắn / Đăng bài / Bình luận hàng loạt để đồng bộ trải nghiệm.
import { memo } from "react";
import { VN_PROVINCES } from "@/lib/vn-provinces";
import { GENDER_OPTIONS, type GenderFilter } from "@/lib/admin/profile-meta";

export type CloneFilterValue = { gender: GenderFilter; province: string };

export const EMPTY_CLONE_FILTER: CloneFilterValue = { gender: "all", province: "" };

export const CloneFilterBar = memo(function CloneFilterBar({
  value,
  onChange,
  className = "",
}: {
  value: CloneFilterValue;
  onChange: (v: CloneFilterValue) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <select
        className="admv3-input w-28"
        value={value.gender}
        onChange={(e) => onChange({ ...value, gender: e.target.value as GenderFilter })}
        aria-label="Lọc theo giới tính"
      >
        {GENDER_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.value === "all" ? "Giới tính: Tất cả" : o.label}
          </option>
        ))}
      </select>
      <select
        className="admv3-input w-44"
        value={value.province}
        onChange={(e) => onChange({ ...value, province: e.target.value })}
        aria-label="Lọc theo khu vực"
      >
        <option value="">Khu vực: Tất cả</option>
        {VN_PROVINCES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </div>
  );
});
