import { avatarSrc } from "@/lib/image-cdn";
import { ShieldAlert, UserRound } from "lucide-react";
import type { GateResult } from "@/lib/access-guard";
import { getSavedAccounts } from "@/lib/account-switcher";

/** Chỉ hiển thị — không gọi backend, không thay đổi logic khóa. */
function useBlockedIdentity(info: GateResult | null) {
  const raw = (info ?? {}) as Record<string, unknown>;
  const saved = typeof window !== "undefined" ? getSavedAccounts()[0] : undefined;

  const name =
    (raw.display_name as string) ||
    (raw.full_name as string) ||
    saved?.fullName ||
    saved?.username ||
    "Thành viên";
  const avatar = (raw.avatar_url as string) || saved?.avatar || null;
  const uidSource = (raw.uid as string) || (raw.member_uid as string) || (raw.user_id as string) || saved?.username || "";
  const uid = uidSource ? String(uidSource).replace(/-/g, "").slice(0, 10).toUpperCase() : null;

  return { name, avatar, uid };
}

export function BlockedScreen({ info }: { info: GateResult | null }) {
  const { name, avatar, uid } = useBlockedIdentity(info);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 px-5 py-10">
      <section className="w-full max-w-md animate-in fade-in duration-700 rounded-[2rem] border border-rose-500/25 bg-slate-900/85 p-7 text-center shadow-2xl sm:p-9">
        <div
          className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-500"
          style={{ animation: "fwb-shield-pulse 4s ease-in-out infinite" }}
        >
          <ShieldAlert size={32} />
        </div>

        <div className="flex flex-col items-center">
          {avatar ? (
            <img loading="lazy" decoding="async"
              src={avatarSrc(avatar, 64)}
              alt={name}
              className="h-[76px] w-[76px] rounded-full border-2 border-rose-500/40 object-cover"
            />
          ) : (
            <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-2 border-rose-500/40 bg-slate-800 text-slate-500">
              <UserRound size={34} />
            </div>
          )}
          <p className="mt-3 text-base font-semibold text-white">{name}</p>
          {uid ? <p className="mt-0.5 text-xs text-slate-400">UID: {uid}</p> : null}
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-400">
            🔴 Đã khóa
          </span>
        </div>

        <div className="mt-7 border-t border-white/5 pt-6">
          <h1 className="text-xl font-extrabold text-white">Tài khoản đã bị khóa</h1>

          <p className="mt-5 text-sm font-semibold text-white">Lý do:</p>
          <p className="mt-1 text-sm leading-relaxed text-rose-300">
            Vi phạm điều khoản sử dụng của Diễn Đàn FWB.
          </p>

          <p className="mt-5 text-sm font-semibold text-white">Thời hạn:</p>
          <p className="mt-1 text-sm font-bold text-rose-500">Vĩnh viễn</p>
        </div>
      </section>

      <style>{`
        @keyframes fwb-shield-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.65; transform: scale(1.06); }
        }
      `}</style>
    </main>
  );
}

export default BlockedScreen;
