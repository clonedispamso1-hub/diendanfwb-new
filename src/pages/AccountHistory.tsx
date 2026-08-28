import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, IdCard, Users, User as UserIcon, Cake } from "lucide-react";
import { AuthProvider } from "@/components/candy/auth-provider";
import { NotificationProvider } from "@/components/candy/notification-provider";
import { supabase } from "@/lib/supabase";
import { formatCompact } from "@/lib/format";
import { AvatarGlow } from "@/components/candy/avatar-glow";
import { AppLoading } from "@/components/candy/app-loading";

interface PublicAccountInfo {
  id: string;
  full_name: string | null;
  username: string | null;
  public_id: string | null;
  avatar: string | null;
  bio: string | null;
  followers_count: number | null;
  gender: string | null;
  age: number | null;
}

function formatGender(g: string | null | undefined): string {
  const v = (g || "").toString().trim().toLowerCase();
  if (!v) return "Chưa cập nhật";
  if (v === "male" || v === "nam" || v === "m") return "Nam";
  if (v === "female" || v === "nữ" || v === "nu" || v === "f") return "Nữ";
  if (v === "other" || v === "khác" || v === "khac") return "Khác";
  return g as string;
}

function AccountHistoryInner() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PublicAccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, username, public_id, avatar, bio, followers_count, gender, age")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) setError(error.message);
      setProfile(data ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const publicId = profile?.public_id || (profile?.id ? profile.id.replace(/-/g, "").slice(0, 6).toUpperCase() : "");
  const displayName = profile?.full_name || "Người dùng";
  const ageDisplay =
    typeof profile?.age === "number" && profile.age > 0
      ? String(profile.age)
      : "Chưa cập nhật";

  return (
    <main className="app-shell">
      <div className="mobile-frame">
        <div className="page-body account-history-page" style={{ paddingTop: 16 }}>
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/"))}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium hover:bg-muted transition"
          >
            <ArrowLeft size={16} /> Quay lại
          </button>

          <h1 className="mt-3 text-xl font-bold tracking-tight">Lịch sử tài khoản</h1>


          {loading ? (
            <div className="mt-10 grid place-items-center">
              <AppLoading label="Đang tải hồ sơ…" size="lg" />
            </div>
          ) : error || !profile ? (
            <div className="mt-6 rounded-2xl border p-6 text-center text-sm text-muted-foreground">
              Không tìm thấy tài khoản.
            </div>
          ) : (
            <>
              {/* Header card: Avatar + Name + UID */}
              <div className="mt-5 flex items-center gap-4 rounded-3xl border bg-card p-5 shadow-sm">
                 <div className="relative shrink-0">
                   <AvatarGlow
                     avatar={profile.avatar}
                     size={80}
                     alt={displayName}
                   />
                 </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold">{displayName}</div>
                  <div className="mt-2 space-y-1 border-t pt-2 text-[13px] text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <IdCard size={14} className="shrink-0 opacity-70" />
                      <span className="w-14 shrink-0">UID</span>
                      <span className="truncate font-medium text-foreground/80">{publicId}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Info rows */}
              <div className="mt-4 divide-y rounded-3xl border bg-card">
                <InfoRow icon={<Cake size={16} />} label="Tuổi" value={ageDisplay} />
                <InfoRow
                  icon={<UserIcon size={16} />}
                  label="Giới tính"
                  value={formatGender(profile.gender)}
                />
                <InfoRow
                  icon={<Users size={16} />}
                  label="Người yêu thích"
                  value={formatCompact(profile.followers_count ?? 0)}
                  badge={<FollowerBadge gender={profile.gender} />}
                />
              </div>

              {/* Bio */}
              <div className="mt-4 rounded-3xl border bg-card p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tiểu sử
                </div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                  {profile.bio?.trim() || (
                    <span className="italic text-muted-foreground">Chưa có tiểu sử.</span>
                  )}
                </div>
              </div>
            </>

          )}
        </div>
      </div>
    </main>
  );
}

function InfoRow({
  icon,
  label,
  value,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="flex-1 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
      {badge}
    </div>
  );
}

function FollowerBadge({ gender }: { gender: string | null | undefined }) {
  const g = formatGender(gender);
  let label = "Thành viên tương tác";
  let cls = "bg-blue-500/15 text-blue-500 ring-1 ring-inset ring-blue-500/30";
  if (g === "Nam") {
    label = "Đẹp Trai Chưa Có Gấu 🧸";
    cls = "bg-sky-500/15 text-sky-500 ring-1 ring-inset ring-sky-500/30";
  } else if (g === "Nữ") {
    label = "Đẹp Gái Chưa Có Gấu 🧸";
    cls = "bg-pink-500/15 text-pink-500 ring-1 ring-inset ring-pink-500/30";
  }
  return (
    <span
      className={`ml-2 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

export default function AccountHistory() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <AccountHistoryInner />
      </NotificationProvider>
    </AuthProvider>
  );
}
