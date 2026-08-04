/** PHASE 3.8 — Bộ lọc nâng cao Nearby. */
import { X } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export interface NearbyFilters {
  radiusKm: number | null;
  ageMin: number;
  ageMax: number;
  gender: "all" | "male" | "female";
  onlineOnly: boolean;
  verifiedOnly: boolean;
  vipOnly: boolean;
  intent: "all" | "fwb" | "ons" | "love" | "dating" | "serious";
}

export const DEFAULT_FILTERS: NearbyFilters = {
  radiusKm: 10, ageMin: 18, ageMax: 60,
  gender: "all", onlineOnly: false, verifiedOnly: false, vipOnly: false,
  intent: "all",
};

const RADII: { label: string; value: number | null }[] = [
  { label: "5km", value: 5 }, { label: "10km", value: 10 },
  { label: "50km", value: 50 }, { label: "100km", value: 100 },
  { label: "Toàn quốc", value: null },
];

const INTENTS: { label: string; value: NearbyFilters["intent"]; emoji: string }[] = [
  { label: "Tất cả", value: "all", emoji: "✨" },
  { label: "FWB", value: "fwb", emoji: "🔥" },
  { label: "ONS", value: "ons", emoji: "💋" },
  { label: "Hẹn hò", value: "dating", emoji: "💘" },
  { label: "Tình yêu", value: "love", emoji: "💖" },
  { label: "Nghiêm túc", value: "serious", emoji: "💍" },
];

interface Props {
  open: boolean;
  value: NearbyFilters;
  onChange: (next: NearbyFilters) => void;
  onClose: () => void;
  onApply: () => void;
}

export function NearbyFilterSheet({ open, value, onChange, onClose, onApply }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;
  const v = value;
  const set = (patch: Partial<NearbyFilters>) => onChange({ ...v, ...patch });

  return (
    <div className="fixed inset-0 z-[90] grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center" onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card/95 px-5 py-4 backdrop-blur">
          <h2 className="text-lg font-bold">Bộ lọc nâng cao</h2>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          {/* Khoảng cách */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Khoảng cách</h3>
            <div className="flex flex-wrap gap-1.5">
              {RADII.map((r) => {
                const active = r.value === v.radiusKm;
                return (
                  <button key={r.label} onClick={() => set({ radiusKm: r.value })}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition ${
                      active ? "border-rose-500 bg-rose-500 text-white" : "border-border bg-card hover:bg-muted"
                    }`}>
                    {r.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Độ tuổi */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Độ tuổi · {v.ageMin}–{v.ageMax}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs">
                Từ
                <input type="range" min={18} max={70} value={v.ageMin}
                  onChange={(e) => set({ ageMin: Math.min(parseInt(e.target.value), v.ageMax) })}
                  className="mt-1 w-full accent-rose-500" />
              </label>
              <label className="text-xs">
                Đến
                <input type="range" min={18} max={70} value={v.ageMax}
                  onChange={(e) => set({ ageMax: Math.max(parseInt(e.target.value), v.ageMin) })}
                  className="mt-1 w-full accent-rose-500" />
              </label>
            </div>
          </section>

          {/* Giới tính */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Giới tính</h3>
            <div className="grid grid-cols-3 gap-1.5">
              {(["all", "female", "male"] as const).map((g) => (
                <button key={g} onClick={() => set({ gender: g })}
                  className={`rounded-full border py-2 text-xs font-medium transition ${
                    v.gender === g ? "border-rose-500 bg-rose-500 text-white" : "border-border bg-card hover:bg-muted"
                  }`}>
                  {g === "all" ? "Tất cả" : g === "female" ? "Nữ ♀" : "Nam ♂"}
                </button>
              ))}
            </div>
          </section>

          {/* Mục tiêu */}
          <section>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Mục tiêu hẹn hò</h3>
            <div className="flex flex-wrap gap-1.5">
              {INTENTS.map((it) => {
                const active = v.intent === it.value;
                return (
                  <button key={it.value} onClick={() => set({ intent: it.value })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      active ? "border-rose-500 bg-rose-500 text-white" : "border-border bg-card hover:bg-muted"
                    }`}>
                    {it.emoji} {it.label}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Toggles */}
          <section className="space-y-2">
            {[
              { key: "onlineOnly",   label: "🟢 Chỉ hiển thị Online" },
              { key: "verifiedOnly", label: "✅ Chỉ hồ sơ đã xác thực" },
              { key: "vipOnly",      label: "👑 Chỉ thành viên VIP" },
            ].map((t) => (
              <label key={t.key} className="flex items-center justify-between rounded-2xl border bg-muted/30 px-4 py-3 cursor-pointer">
                <span className="text-sm font-medium">{t.label}</span>
                <input type="checkbox" checked={(v as any)[t.key]}
                  onChange={(e) => set({ [t.key]: e.target.checked } as any)}
                  className="h-5 w-5 accent-rose-500" />
              </label>
            ))}
          </section>
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t bg-card/95 p-3 backdrop-blur">
          <Button variant="outline" className="flex-1 rounded-full" onClick={() => onChange(DEFAULT_FILTERS)}>
            Đặt lại
          </Button>
          <Button className="flex-1 rounded-full bg-rose-500 hover:bg-rose-600" onClick={() => { onApply(); onClose(); }}>
            Áp dụng
          </Button>
        </div>
      </div>
    </div>
  );
}
