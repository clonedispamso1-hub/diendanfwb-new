import { avatarSrc } from "@/lib/image-cdn";
import { X, MapPin, Ruler, Weight, Shield } from "lucide-react";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { FWB_INTERESTS, findInterest } from "@/lib/fwb-interests";
import type { FakeProfileRecord } from "@/lib/fake-profiles";

export interface FwbDetailProfile {
  id: string;
  name: string;
  age?: number | null;
  city: string;
  avatar: string;
  bio: string;
  online?: boolean;
  heightCm?: number | null;
  weightKg?: number | null;
  trustScore?: number | null;
  interests?: string[];
  isSystem?: boolean;
  job?: string | null;
  education?: string | null;
  lookingFor?: string | null;
  relationship?: string | null;
  activity?: string | null;
}

interface Props {
  profile: FwbDetailProfile;
  onClose: () => void;
  onAction?: () => void;
}

export function FwbDetailModal({ profile, onClose, onAction }: Props) {
  useBodyScrollLock(true);

  const ints = (profile.interests || [])
    .map((k) => findInterest(k) || FWB_INTERESTS.find((i) => i.label === k))
    .filter(Boolean) as { key: string; label: string; emoji: string }[];

  return (
    <div className="fwb-detail-bd" onClick={onClose}>
      <div className="fwb-detail-panel" onClick={(e) => e.stopPropagation()}>
        <div className="fwb-detail-hero">
          <img loading="lazy" decoding="async" src={avatarSrc(profile.avatar || "/placeholder.svg", 64)} alt={profile.name} />
          <div className="grad" />
          <button className="fwb-detail-close" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>
        <div className="fwb-detail-body">
          <div className="fwb-detail-name">
            <span>{profile.name}</span>
            {profile.age ? <span className="fwb-detail-age">, {profile.age}</span> : null}
            {profile.isSystem ? (
              <span
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "rgba(255,184,74,.18)", color: "#ffb84a",
                  border: "1px solid rgba(255,184,74,.4)",
                  fontSize: 10, fontWeight: 800, letterSpacing: ".3px",
                  padding: "3px 8px", borderRadius: 999, textTransform: "uppercase",
                }}
              >🟡 Hồ sơ hệ thống</span>
            ) : null}
          </div>
          <div className="fwb-detail-meta">
            <span className="inline-flex items-center gap-1">
              <MapPin size={14} /> {profile.city || "—"}
            </span>
            <span className={`fwb-detail-online ${profile.online ? "" : "offline"}`}>
              <span className="dot" />
              {profile.online ? "Đang hoạt động" : "Ngoại tuyến"}
            </span>
          </div>

          <div className="fwb-detail-bio">
            {profile.bio?.trim() || "Chưa có giới thiệu."}
          </div>


          <details className="fwb-detail-accordion">
            <summary>
              <span>👇 Nhấn để xem thêm thông tin</span>
              <span style={{ opacity: 0.6 }}>▾</span>
            </summary>
            <div className="acc-body">
              <div className="fwb-detail-grid">
                <div className="cell">
                  <div className="k"><Ruler size={12} className="inline mr-1" />Chiều cao</div>
                  <div className="v">{profile.heightCm ? `${profile.heightCm} cm` : "—"}</div>
                </div>
                <div className="cell">
                  <div className="k"><Weight size={12} className="inline mr-1" />Cân nặng</div>
                  <div className="v">{profile.weightKg ? `${profile.weightKg} kg` : "—"}</div>
                </div>
                {profile.job ? (
                  <div className="cell"><div className="k">💼 Nghề nghiệp</div><div className="v" style={{ fontSize: 14 }}>{profile.job}</div></div>
                ) : null}
                {profile.education ? (
                  <div className="cell"><div className="k">🎓 Học vấn</div><div className="v" style={{ fontSize: 14 }}>{profile.education}</div></div>
                ) : null}
                {profile.lookingFor ? (
                  <div className="cell"><div className="k">🎯 Mục tiêu</div><div className="v" style={{ fontSize: 14 }}>{profile.lookingFor}</div></div>
                ) : null}
                {profile.relationship ? (
                  <div className="cell"><div className="k">💞 Tình trạng</div><div className="v" style={{ fontSize: 14 }}>{profile.relationship}</div></div>
                ) : null}
                {profile.activity ? (
                  <div className="cell" style={{ gridColumn: "span 2" }}><div className="k">⚡ Mức độ hoạt động</div><div className="v" style={{ fontSize: 14 }}>{profile.activity}</div></div>
                ) : null}
                <div className="cell" style={{ gridColumn: "span 2" }}>
                  <div className="k"><Shield size={12} className="inline mr-1" />Độ uy tín</div>
                  <div className="v">
                    {profile.trustScore != null ? `${profile.trustScore}/100` : "Đang đánh giá"}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div className="k" style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: ".6px" }}>
                  Sở thích
                </div>
                <div className="fwb-interest-tags">
                  {ints.length ? (
                    ints.map((i) => (
                      <span key={i.key} className="fwb-tag is-selected">
                        <span>{i.emoji}</span> {i.label}
                      </span>
                    ))
                  ) : (
                    <span style={{ opacity: 0.6, fontSize: 13 }}>Chưa cập nhật</span>
                  )}
                </div>
              </div>
            </div>
          </details>

          {onAction ? (
            <button
              className="fwb-onb-btn primary"
              style={{ marginTop: 18, width: "100%" }}
              onClick={onAction}
            >
              Kết nối ngay
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Map FakeProfileRecord → FwbDetailProfile */
export function fakeToDetail(p: FakeProfileRecord, fallbackCity?: string | null): FwbDetailProfile {
  const name = p.display_name || p.full_name || "Người dùng";
  // Deterministic seed từ id
  let h = 2166136261;
  for (let i = 0; i < p.id.length; i++) {
    h ^= p.id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const seed = (h >>> 0);
  const richness = seed % 100; // 0–29 sparse, 30–69 medium, 70–99 full
  const isFull = richness >= 70;
  const isMedium = richness >= 30;

  const JOBS = [
    "Designer", "Marketing", "Nhân viên văn phòng", "Giáo viên", "Sinh viên",
    "Lập trình viên", "Y tá", "Kinh doanh tự do", "Barista", "Make-up Artist",
    "Stylist", "Photographer", "PT/HLV gym", "Kế toán", "Du lịch tự do",
  ];
  const EDUS = ["THPT", "Cao đẳng", "Đại học", "Thạc sĩ"];
  const GOALS = ["Tìm bạn tâm sự", "Hẹn hò nghiêm túc", "FWB", "Bạn cùng sở thích", "Để xem đã"];
  const RELS = ["Độc thân", "Đang tìm hiểu", "Mới chia tay", "Tự do"];
  const ACTS = ["Online cả ngày", "Cú đêm 🌙", "Sáng sớm ☀️", "Cuối tuần", "Tối muộn"];
  const BIOS = [
    "Thích cafe, phim & du lịch.",
    "Hợp gu là chốt, ngại lằng nhằng.",
    "Tìm người cùng vibe để tâm sự khuya.",
    "Sống chậm — yêu thật.",
    "Cuối tuần đi cafe không?",
    "Mê chó mèo, ghét drama.",
    "Hướng nội nhưng muốn hướng về bạn.",
    "愛してる — muốn một mối quan hệ chân thành.",
  ];
  const ALL_INTS = FWB_INTERESTS.map((i) => i.key);

  const heightCm = 152 + (seed % 30);
  const weightKg = 42 + ((seed >> 3) % 32);

  // Sở thích random theo seed
  const intCount = isFull ? 4 + (seed % 3) : isMedium ? 3 : 2;
  const interests: string[] = [];
  for (let i = 0; i < intCount; i++) {
    interests.push(ALL_INTS[((seed >> (i + 1)) ^ i * 31) % ALL_INTS.length]);
  }

  return {
    id: p.id,
    name,
    age: p.age ?? 20 + (seed % 15),
    city: p.province || fallbackCity || "—",
    avatar: p.avatar_url || p.avatar || "/placeholder.svg",
    bio: p.bio || BIOS[seed % BIOS.length],
    online: true,
    heightCm: isMedium ? heightCm : null,
    weightKg: isFull ? weightKg : null,
    trustScore: isFull ? 70 + (seed % 25) : null,
    interests: Array.from(new Set(interests)),
    isSystem: true, // FakeProfileRecord ⇒ hồ sơ hệ thống
    job: isMedium ? JOBS[seed % JOBS.length] : null,
    education: isFull ? EDUS[(seed >> 4) % EDUS.length] : null,
    lookingFor: isMedium ? GOALS[(seed >> 5) % GOALS.length] : null,
    relationship: isFull ? RELS[(seed >> 6) % RELS.length] : null,
    activity: isFull ? ACTS[(seed >> 7) % ACTS.length] : null,
  };
}
