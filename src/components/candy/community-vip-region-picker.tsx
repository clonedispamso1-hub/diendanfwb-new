import { useEffect, useState } from "react";
import { MapPin, Send, X } from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { ProvinceCombobox } from "@/components/candy/province-combobox";
import { Button } from "@/components/ui/button";

interface CommunityVipRegionPickerProps {
  open: boolean;
  initialRegion?: string;
  onClose: () => void;
  onConfirm: (region: string) => void;
}

export function CommunityVipRegionPicker({
  open,
  initialRegion = "",
  onClose,
  onConfirm,
}: CommunityVipRegionPickerProps) {
  const [region, setRegion] = useState(initialRegion);

  useEffect(() => {
    if (open) setRegion(initialRegion);
  }, [open, initialRegion]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div className="community-region-overlay" onClick={onClose}>
        <section
          className="community-region-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="community-region-title"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="community-region-modal__header">
            <span className="community-region-modal__icon" aria-hidden><MapPin size={20} /></span>
            <div>
              <span>COMMUNITY VIP CR</span>
              <h2 id="community-region-title">Chọn khu vực của khách</h2>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Đóng">
              <X size={19} />
            </Button>
          </header>

          <div className="community-region-modal__body">
            <ProvinceCombobox
              value={region}
              onChange={setRegion}
              placeholder="Chọn tỉnh / thành phố"
              required
            />
            <Button
              type="button"
              className="community-region-modal__send"
              disabled={!region}
              onClick={() => onConfirm(region)}
            >
              <Send size={16} /> Gửi Card Community VIP
            </Button>
          </div>
        </section>
      </div>
    </Portal>
  );
}