import { ModuleShell } from "./module-shell";
import { Heart, UserPlus, Eye, Flame, Sparkles, Radio, Compass } from "lucide-react";

const BUFFS = [
  { icon: Heart, label: "Buff Like", desc: "Tăng like ảo cho bài/người dùng" },
  { icon: UserPlus, label: "Buff Follow", desc: "Tăng follower ảo theo lô" },
  { icon: Eye, label: "Buff View", desc: "Tăng lượt xem bài / video" },
  { icon: Flame, label: "Buff Trending", desc: "Đẩy bài lên trending 24h" },
  { icon: Sparkles, label: "Buff Match", desc: "Ưu tiên hiện cho user mục tiêu" },
  { icon: Radio, label: "Buff Livestream", desc: "Tăng viewer livestream" },
  { icon: Compass, label: "Buff Explore", desc: "Ưu tiên xuất hiện trang khám phá" },
];

export function BuffSystem() {
  return (
    <ModuleShell title="Hệ thống Buff ẩn" subtitle="Kích hoạt các nút buff hệ thống cho user mục tiêu">
      <div className="adm-modules-grid">
        {BUFFS.map((b) => {
          const Icon = b.icon;
          return (
            <button key={b.label} className="adm-module-card" style={{ ["--accent" as any]: "#f472b6" }}>
              <div className="adm-module-card-icon"><Icon size={20} /></div>
              <div className="adm-module-card-text">
                <div className="adm-module-card-title">{b.label}</div>
                <div className="adm-module-card-desc">{b.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
      <p className="adm-empty" style={{ marginTop: 16 }}>
        UI buff chi tiết (chọn user, thời lượng, cường độ) sẽ được mở trong popup khi click vào từng nút.
      </p>
    </ModuleShell>
  );
}
