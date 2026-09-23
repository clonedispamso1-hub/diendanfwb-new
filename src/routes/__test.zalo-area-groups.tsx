/**
 * Harness nội bộ: xem nhanh popup LỚP 2 (nhóm của một khu vực) mà không cần
 * đăng nhập. Tham số: ?item=<uuid>&province=<tỉnh>&area=<khu vực>&country=vn
 */
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { AreaGroupsModal } from "@/components/candy/zalo-groups-prototype";
import type { CountryFlagId } from "@/components/candy/zalo-country-flags";

type Search = { item?: string; province?: string; area?: string; country?: string };

function Harness() {
  const search = useSearch({ from: "/__test/zalo-area-groups" }) as Search;
  const [open, setOpen] = useState(true);
  return (
    <div style={{ minHeight: "100vh", background: "#0f172a" }}>
      <button onClick={() => setOpen(true)} style={{ color: "#fff", padding: "12px 20px" }}>
        Mở popup nhóm
      </button>
      {open && search.item ? (
        <AreaGroupsModal
          countryId={(search.country as CountryFlagId) || "vn"}
          itemId={String(search.item)}
          province={String(search.province ?? "")}
          area={String(search.area ?? "")}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

export const Route = createFileRoute("/__test/zalo-area-groups")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    item: s["item"] ? String(s["item"]) : undefined,
    province: s["province"] ? String(s["province"]) : undefined,
    area: s["area"] ? String(s["area"]) : undefined,
    country: s["country"] ? String(s["country"]) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Test Zalo Area Groups | Internal" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Harness,
});
