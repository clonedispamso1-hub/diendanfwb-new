/**
 * LocationPicker — two-step province → district picker with icon cards.
 * Replaces the old dropdown. Reused across FWB / ONS / Dating.
 */
import { useMemo, useState } from "react";
import "@/styles/relationship-tags.css";
import {
  FEATURED_PROVINCES,
  ALL_PROVINCES,
  getDistricts,
} from "@/lib/vn-locations";

interface Props {
  province: string | null;
  district: string | null;
  onChange: (next: { province: string | null; district: string | null }) => void;
}

export function LocationPicker({ province, district, onChange }: Props) {
  const [showAllProvinces, setShowAllProvinces] = useState(false);
  const [search, setSearch] = useState("");

  const featured = FEATURED_PROVINCES;
  const featuredNames = new Set(featured.map((f) => f.name));
  const restProvinces = useMemo(
    () => ALL_PROVINCES.filter((p) => !featuredNames.has(p)),
    [featuredNames],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return restProvinces;
    return restProvinces.filter((p) => p.toLowerCase().includes(q));
  }, [restProvinces, search]);

  const districts = province ? getDistricts(province) : [];

  return (
    <div className="loc-picker">
      {/* Step 1: province */}
      <div className="loc-picker__step">
        <div className="loc-picker__step-header">
          <span className="loc-picker__step-num">1</span>
          <span>Chọn tỉnh / thành</span>
          {province ? (
            <button
              type="button"
              className="loc-picker__clear"
              onClick={() => onChange({ province: null, district: null })}
            >
              Đổi
            </button>
          ) : null}
        </div>

        {province ? (
          <div className="loc-selected-chip">
            <span aria-hidden>📍</span>
            <span>{province}</span>
          </div>
        ) : (
          <>
            <div className="loc-card-grid">
              {featured.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`loc-card${province === p.name ? " is-selected" : ""}`}
                  onClick={() => onChange({ province: p.name, district: null })}
                >
                  <span className="loc-card__emoji" aria-hidden>{p.emoji}</span>
                  <span className="loc-card__name">{p.name}</span>
                  {p.badge ? <span className="loc-card__badge">{p.badge}</span> : null}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="loc-picker__more"
              onClick={() => setShowAllProvinces((v) => !v)}
            >
              {showAllProvinces ? "Thu gọn" : "Xem tất cả tỉnh thành"}
            </button>

            {showAllProvinces ? (
              <div className="loc-picker__all">
                <input
                  className="loc-picker__search"
                  placeholder="Tìm tỉnh / thành…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="loc-picker__all-list">
                  {filtered.map((name) => (
                    <button
                      key={name}
                      type="button"
                      className="loc-picker__all-item"
                      onClick={() => onChange({ province: name, district: null })}
                    >
                      📍 {name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Step 2: district (only after province chosen) */}
      {province ? (
        <div className="loc-picker__step">
          <div className="loc-picker__step-header">
            <span className="loc-picker__step-num">2</span>
            <span>Chọn quận / huyện</span>
          </div>
          <div className="loc-district-wrap">
            {districts.map((d) => (
              <button
                key={d}
                type="button"
                className={`loc-district${district === d ? " is-selected" : ""}`}
                onClick={() => onChange({ province, district: d })}
              >
                📌 {d}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default LocationPicker;
