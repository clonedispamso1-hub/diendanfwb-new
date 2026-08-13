import { avatarSrc } from "@/lib/image-cdn";
import { useMemo, useState } from "react";
import { X, MapPin, ShieldCheck, Ruler, Sparkles, Check, MessageCircle, Heart, ChevronDown } from "lucide-react";
import UniversalBadge from "@/components/candy/universal-badge";
import { Portal } from "@/components/candy/portal";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import type { FakeProfileRecord } from "@/lib/fake-profiles";
import { isFollowed, toggleFollow } from "@/lib/follow-store";

interface FakeMiniProfileProps {
  profile: FakeProfileRecord;
  fallbackProvince?: string | null;
  onClose: () => void;
  onAction: () => void;
}

const INTENTION_SETS: Array<Array<{ label: string }>> = [
  [{ label: "🔥 FWB" }, { label: "🌙 Tâm sự đêm khuya" }, { label: "☕ Cafe cuối tuần" }],
  [{ label: "💖 Tìm người yêu" }, { label: "✨ Người chill" }, { label: "💎 Dating nghiêm túc" }],
  [{ label: "🔥 ONS" }, { label: "🌙 Bạn ngủ call" }, { label: "🎈 Không ràng buộc" }],
  [{ label: "💕 Match nói chuyện" }, { label: "✨ Chill xuyên đêm" }, { label: "🎉 Đi chơi cuối tuần" }],
  [{ label: "💎 Dating nghiêm túc" }, { label: "💖 Tìm người yêu" }, { label: "☕ Cafe cuối tuần" }],
];

function seededFrom(id: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return ((h >>> 0) % 10000) / 10000;
  };
}

const SYSTEM_FONT: React.CSSProperties = {
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
  fontStyle: "normal",
  fontVariant: "normal",
};

export function FakeMiniProfile({ profile, fallbackProvince, onClose, onAction }: FakeMiniProfileProps) {
  useBodyScrollLock(true);
  const name = profile.display_name || profile.full_name || profile.username;
  const avatar = profile.avatar_url || profile.avatar || "/placeholder.svg";
  const province = profile.province || fallbackProvince || "Chưa rõ";

  const [followed, setFollowed] = useState<boolean>(() => isFollowed(profile.id));
  const [pulse, setPulse] = useState(0);

  const data = useMemo(() => {
    const rand = seededFrom(profile.id);
    const trust = 90 + Math.floor(rand() * 11);
    const height = 150 + Math.floor(rand() * 26);
    const weight = 42 + Math.floor(rand() * 19);
    const age = (profile as any).age ?? 20 + Math.floor(rand() * 13);
    const gender =
      (profile as any).gender === "female" ? "Nữ" :
      (profile as any).gender === "male"   ? "Nam" : "Nữ";
    const rawTag = ((profile as any).tag ?? "").toString().trim();
    let adminTags: Array<{ label: string }> = [];
    if (rawTag) {
      try {
        const parsed = JSON.parse(rawTag);
        if (Array.isArray(parsed)) adminTags = parsed.map((s) => ({ label: String(s).trim() })).filter((t) => t.label);
      } catch {
        adminTags = rawTag.split(/[,;|]+/).map((s) => s.trim()).filter(Boolean).map((label) => ({ label }));
      }
    }
    const intentions = adminTags.length
      ? adminTags
      : INTENTION_SETS[Math.floor(rand() * INTENTION_SETS.length)];
    const vibes = [...intentions, { label: `📍 ${province}` }];
    return { trust, height, weight, age, gender, vibes };
  }, [profile.id, province, (profile as any).tag, (profile as any).age, (profile as any).gender]);

  const handleFollow = () => {
    const next = toggleFollow(profile.id);
    setFollowed(next);
    setPulse((p) => p + 1);
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[10010] flex items-center justify-center px-4 py-6"
        onClick={onClose}
        style={{
          ...SYSTEM_FONT,
          background:
            "radial-gradient(circle at 50% 30%, rgba(255,91,138,0.35), rgba(168,85,247,0.35) 55%, rgba(31,20,48,0.62))",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          className="relative w-full overflow-hidden rounded-[24px]"
          style={{
            ...SYSTEM_FONT,
            maxWidth: 520,
            background:
              "linear-gradient(180deg, #ffffff 0%, #fff7fa 55%, #faf5ff 100%)",
            border: "1px solid rgba(168, 85, 247, 0.18)",
            boxShadow:
              "0 30px 80px -10px rgba(168, 85, 247, 0.45), 0 12px 30px -10px rgba(255, 91, 138, 0.3)",
            color: "#1f1430",
          }}
        >
          <button
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full transition active:scale-95"
            onClick={onClose}
            aria-label="Đóng"
            type="button"
            style={{
              background: "rgba(255, 255, 255, 0.92)",
              border: "1px solid rgba(168, 85, 247, 0.18)",
              color: "#6b5a82",
              backdropFilter: "blur(8px)",
              boxShadow: "0 4px 14px rgba(168, 85, 247, 0.18)",
            }}
          >
            <X size={16} />
          </button>

          {/* Header */}
          <div className="relative flex flex-col items-center px-5 pt-6 pb-3">
            <div className="relative" style={{ width: 92, height: 92 }}>
              <div
                className="h-full w-full rounded-full p-[3px]"
                style={{
                  background:
                    "conic-gradient(from 0deg, #ff5b8a, #a855f7, #f0b232, #ff5b8a)",
                  boxShadow: "0 14px 30px -8px rgba(255, 91, 138, 0.5)",
                }}
              >
                <img loading="lazy" decoding="async"
                  src={avatarSrc(avatar, 64)}
                  alt={name}
                  className="h-full w-full rounded-full object-cover"
                  style={{
                    border: "3px solid #fff",
                    objectPosition: "center 22%",
                  }}
                />
              </div>
              <span
                className="absolute rounded-full"
                style={{
                  width: 14,
                  height: 14,
                  right: 4,
                  bottom: 4,
                  background: "#22c55e",
                  border: "3px solid #fff",
                }}
                aria-label="Đang hoạt động"
              />
            </div>

            <div
              className="mt-2 flex items-center gap-1.5 text-[19px] font-extrabold"
              style={{ ...SYSTEM_FONT, color: "#1f1430" }}
            >
              <span style={SYSTEM_FONT}>{name}</span>
              <UniversalBadge profile={profile as any} />
            </div>

            <div
              className="mt-1 flex items-center gap-2 text-xs"
              style={{ ...SYSTEM_FONT, color: "#6b5a82" }}
            >
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} /> {province}
              </span>
              <span style={{ color: "rgba(168,85,247,0.4)" }}>·</span>
              <span
                className="inline-flex items-center gap-1 font-semibold"
                style={{ color: "#16a34a" }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#22c55e" }}
                />
                Đang hoạt động
              </span>
            </div>
          </div>

          {profile.bio ? (
            <div
              className="mx-4 mb-2 rounded-[16px] px-3.5 py-2.5"
              style={{
                ...SYSTEM_FONT,
                background: "linear-gradient(135deg, #fff0f5, #f5ecff)",
                border: "1px solid rgba(168, 85, 247, 0.14)",
                boxShadow: "0 6px 18px -10px rgba(168, 85, 247, 0.2)",
              }}
            >
              <p
                className="text-[13.5px] leading-relaxed"
                style={{ ...SYSTEM_FONT, color: "#3a2a52" }}
              >
                {profile.bio}
              </p>
            </div>
          ) : null}

          <div className="mx-4 grid grid-cols-2 gap-2">
            <InfoTile icon={<MapPin size={14} />} label="Thành phố" value={province} />
            <InfoTile icon={<Sparkles size={14} />} label="Tuổi" value={`${data.age}`} />
          </div>

          <MoreInfo trust={data.trust} height={data.height} weight={data.weight} />

          {data.vibes.length > 0 && (
            <div className="mx-4 mt-3">
              <div
                className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider"
                style={{ ...SYSTEM_FONT, color: "#a855f7" }}
              >
                Sở thích
              </div>
              <div className="flex flex-wrap gap-1">
                {data.vibes.map((v, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold"
                    style={{
                      ...SYSTEM_FONT,
                      background: "linear-gradient(135deg, #fff0f5, #f5ecff)",
                      color: "#5b21b6",
                      border: "1px solid rgba(168, 85, 247, 0.2)",
                    }}
                  >
                    {v.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div
            className="social-action-bar mt-3 px-4 py-3"
            style={{
              borderTop: "1px solid rgba(168, 85, 247, 0.12)",
              background: "linear-gradient(180deg, transparent, rgba(245,243,255,0.6))",
              margin: 0,
            }}
            role="group"
            aria-label="Hành động"
          >
            <button
              key={pulse}
              onClick={handleFollow}
              type="button"
              className="social-btn social-btn-follow"
              data-following={followed ? "true" : "false"}
              aria-pressed={followed}
            >
              {followed ? <Check size={16} /> : <Heart size={16} />}
              <span>{followed ? "Đã yêu thích" : "Yêu thích"}</span>
            </button>
            <button
              onClick={onAction}
              type="button"
              className="social-btn social-btn-message"
              aria-label="Nhắn tin"
            >
              <MessageCircle size={16} />
              <span>Nhắn tin</span>
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div
      className="flex items-start gap-2 px-3 py-2.5"
      style={{
        ...SYSTEM_FONT,
        borderRadius: 16,
        background: "#fff",
        border: "1px solid rgba(168, 85, 247, 0.14)",
        boxShadow: "0 4px 14px -8px rgba(168, 85, 247, 0.18)",
      }}
    >
      <span
        className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-xl"
        style={{
          background: "linear-gradient(135deg, #fff0f5, #f5ecff)",
          color: "#ec4899",
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ ...SYSTEM_FONT, color: "#a855f7" }}
        >
          {label}
        </div>
        <div
          className="mt-0.5 truncate text-[14px] font-bold"
          style={{ ...SYSTEM_FONT, color: "#1f1430" }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function MoreInfo({ trust, height, weight }: { trust: number; height: number; weight: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fwb-mini-more" style={{ marginTop: 10 }}>
      <button
        type="button"
        className="fwb-mini-more__btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={SYSTEM_FONT}>👇 Nhấn để xem thêm thông tin</span>
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.18s ease" }} />
      </button>
      {open ? (
        <div className="fwb-mini-more__panel">
          <div className="grid grid-cols-2 gap-2.5">
            <InfoTile icon={<Ruler size={14} />} label="Chiều cao" value={`${height} cm`} />
            <InfoTile icon={<Ruler size={14} />} label="Cân nặng" value={`${weight} kg`} />
            <InfoTile icon={<ShieldCheck size={14} />} label="Độ uy tín" value={`${trust}%`} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
