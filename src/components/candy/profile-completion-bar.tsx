import type { Profile } from "@/lib/app-types";

interface ProfileCompletionBarProps {
  profile: Partial<Profile> & { verified?: boolean | null };
  className?: string;
}

interface Item { key: string; label: string; ok: boolean; }

function buildItems(p: ProfileCompletionBarProps["profile"]): Item[] {
  return [
    { key: "avatar", label: "Avatar", ok: !!p.avatar },
    { key: "bio", label: "Bio", ok: !!(p.bio && p.bio.length >= 10) },
    { key: "phone", label: "SĐT", ok: !!(p.phone && p.phone.length >= 6) },
    { key: "age", label: "Tuổi", ok: !!p.age },
    { key: "location", label: "Vị trí", ok: !!(p.province || p.location) },
    { key: "verified", label: "Ảnh xác thực", ok: !!p.verified },
  ];
}

export function ProfileCompletionBar({ profile, className = "" }: ProfileCompletionBarProps) {
  const items = buildItems(profile);
  const done = items.filter((i) => i.ok).length;
  const pct = Math.round((done / items.length) * 100);
  return (
    <div className={`rounded-2xl border border-border bg-card p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Hồ sơ hoàn thiện</h3>
        <span className="text-sm font-bold text-primary">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
        {items.map((i) => (
          <li key={i.key} className="flex items-center gap-1.5">
            <span className={i.ok ? "text-emerald-500" : "text-zinc-400"}>{i.ok ? "✔" : "○"}</span>
            <span className={i.ok ? "text-foreground" : ""}>{i.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ProfileCompletionBar;
