import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useMemo, useState } from "react";
import { X, Crown, Users, Search, Check, Sparkles } from "lucide-react";
import { CoinIcon } from "@/components/candy/coin-icon";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { CloneVipNameMedia } from "@/components/vip/clone-vip-name-media";

import { read3 } from "@/lib/content-db";
import { resolveUserName } from "@/lib/user-name";
type Tier = "basic" | "pro" | "elite";

interface TierInfo {
  key: Tier;
  name: string;
  price: number;
  maxMembers: number;
  features: string[];
  accent: string;       // tailwind color hint
  ring: string;
}

const TIERS: TierInfo[] = [
  { key: "basic", name: "Basic",  price: 100,  maxMembers: 20,  features: ["Chat nhóm cơ bản", "Tối đa 20 thành viên"], accent: "from-sky-500/15 to-sky-500/5", ring: "ring-sky-400/40" },
  { key: "pro",   name: "Pro",    price: 500,  maxMembers: 50,  features: ["Tối đa 50 thành viên", "📌 Ghim tin nhắn"], accent: "from-violet-500/15 to-violet-500/5", ring: "ring-violet-400/50" },
  { key: "elite", name: "Elite",  price: 1000, maxMembers: 200, features: ["Tối đa 200 thành viên", "📌 Ghim tin nhắn", "🎨 Đổi màu nhóm"], accent: "from-amber-500/20 to-rose-500/10", ring: "ring-amber-400/60" },
];

const ERR: Record<string, string> = {
  NOT_AUTHENTICATED: "Bạn cần đăng nhập.",
  INVALID_NAME: "Tên nhóm phải có ít nhất 2 ký tự.",
  INVALID_TIER: "Gói không hợp lệ.",
  INSUFFICIENT_BALANCE: "Bạn không đủ Coin để tạo nhóm này.",
  TOO_MANY_MEMBERS: "Vượt quá giới hạn thành viên của gói.",
  NOT_MUTUAL_FOLLOW: "Chỉ có thể mời người yêu thích lẫn nhau (bạn bè).",
  ALREADY_IN_GROUP: "Bạn đã tham gia một nhóm khác. Hãy rời nhóm trước.",
  MEMBER_ALREADY_IN_GROUP: "Người này đã tham gia nhóm khác.",
  LEAVE_COOLDOWN: "Bạn phải chờ 2 ngày sau khi rời nhóm để vào nhóm mới.",
  MEMBER_LEAVE_COOLDOWN: "Người được mời vừa rời nhóm — phải chờ 2 ngày.",
};
function readable(msg: string) {
  for (const k of Object.keys(ERR)) if (msg.includes(k)) return ERR[k];
  return msg;
}

interface MutualUser {
  id: string;
  full_name: string | null;
  username: string | null;
  public_id: string | null;
  avatar: string | null;
}

interface Props {
  onClose: () => void;
  onCreated?: (groupId: string) => void;
}

export function CreateGroupModal({ onClose, onCreated }: Props) {
  const { me, refreshMe } = useAuth();
  const [name, setName] = useState("");
  const [tier, setTier] = useState<Tier>("basic");
  const [mutuals, setMutuals] = useState<MutualUser[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loadingMutuals, setLoadingMutuals] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const meVip = (me?.vip_level ?? 1) as number;
  const meCandy = me?.gem_balance ?? 0;
  const tierInfo = TIERS.find((t) => t.key === tier)!;
  const canAfford = meCandy >= tierInfo.price;

  // Load mutual followers (intersect: I follow them AND they follow me)
  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    (async () => {
      setLoadingMutuals(true);
      try {
        const [{ data: iFollow }, { data: followsMe }] = await Promise.all([
          read3().from("follows").select("following_id").eq("follower_id", me.id),
          read3().from("follows").select("follower_id").eq("following_id", me.id),
        ]);
        const setA = new Set(((iFollow as any[]) || []).map((r) => r.following_id));
        const setB = new Set(((followsMe as any[]) || []).map((r) => r.follower_id));
        const mutualIds = [...setA].filter((id) => setB.has(id));
        if (mutualIds.length === 0) {
          if (!cancelled) setMutuals([]);
          return;
        }
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, username, public_id, avatar")
          .in("id", mutualIds);
        if (!cancelled) setMutuals((profiles as any[]) || []);
      } finally {
        if (!cancelled) setLoadingMutuals(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return mutuals;
    return mutuals.filter((u) =>
      (resolveUserName(u as any, "")).toLowerCase().includes(q) ||
      (u.public_id || "").toLowerCase().includes(q),
    );
  }, [mutuals, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); return next; }
      // +1 for owner already counted
      if (next.size + 1 >= tierInfo.maxMembers) {
        toast.error(`Gói ${tierInfo.name} chỉ cho phép ${tierInfo.maxMembers} thành viên.`);
        return next;
      }
      next.add(id);
      return next;
    });
  };

  const submit = async () => {
    if (!name.trim() || name.trim().length < 2) {
      toast.error("Vui lòng đặt tên nhóm (≥ 2 ký tự).");
      return;
    }
    if (!canAfford) { toast.error("Bạn không đủ Coin."); return; }

    setSubmitting(true);
    const { data, error } = await supabase.rpc("create_group" as any, {
      p_name: name.trim(),
      p_tier: tier,
      p_member_ids: Array.from(selected),
    });
    setSubmitting(false);
    if (error) {
      toast.error(readable(error.message));
      return;
    }
    toast.success(`Đã tạo nhóm "${name.trim()}" 🎉`);
    await refreshMe();
    onCreated?.(data as string);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-card text-foreground shadow-2xl animate-in slide-in-from-bottom-6 duration-300 flex flex-col"
        style={{ borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 mb-1 h-1.5 w-12 rounded-full bg-muted" />
        <div className="flex items-center justify-between px-5 pt-1 pb-3 border-b">
          <h3 className="text-base font-semibold inline-flex items-center gap-2">
            <Sparkles size={16} className="text-amber-500" /> Tạo nhóm chat
          </h3>
          <button onClick={onClose} aria-label="Đóng" className="rounded-full p-1.5 text-muted-foreground hover:bg-muted">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* VIP / Coin status pill */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 border bg-emerald-50 text-emerald-800 border-emerald-200">
              <Crown size={12} /> VIP {meVip}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 border bg-amber-50 text-amber-900 border-amber-200">
              <CoinIcon size={14} /> {meCandy.toLocaleString()} Coin
            </span>
          </div>

          {/* Name */}
          <label className="block">
            <span className="text-xs font-semibold text-muted-foreground">Tên nhóm</span>
            <input
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Hội FWB Sài Gòn"
              maxLength={60}
            />
          </label>

          {/* Tier picker */}
          <div>
            <div className="text-xs font-semibold text-muted-foreground mb-2">Chọn gói nhóm</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TIERS.map((t) => {
                const active = tier === t.key;
                const affordable = meCandy >= t.price;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTier(t.key)}
                    className={`text-left rounded-xl border p-3 transition bg-gradient-to-br ${t.accent} ${active ? `ring-2 ${t.ring} border-transparent` : "border-border hover:border-foreground/20"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm">{t.name}</div>
                      {active ? <Check size={14} className="text-emerald-600" /> : null}
                    </div>
                    <div className="mt-1 inline-flex items-center gap-1 text-amber-700 text-xs font-semibold">
                      <CoinIcon size={14} /> {t.price.toLocaleString()}
                      {!affordable ? <span className="ml-1 text-rose-600">(thiếu)</span> : null}
                    </div>
                    <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                      {t.features.map((f) => <li key={f}>• {f}</li>)}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Member picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-muted-foreground inline-flex items-center gap-1">
                <Users size={12} /> Mời thành viên ({selected.size}/{tierInfo.maxMembers - 1})
              </div>
              <span className="text-[11px] text-muted-foreground">Chỉ người yêu thích lẫn nhau</span>
            </div>
            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                className="w-full rounded-lg border bg-background pl-8 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Tìm theo tên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="rounded-xl border bg-background/40 max-h-56 overflow-y-auto">
              {loadingMutuals ? (
                <div className="p-4 text-sm text-muted-foreground text-center">Đang tải danh sách…</div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  {mutuals.length === 0
                    ? "Bạn chưa có người yêu thích lẫn nhau nào để mời."
                    : "Không tìm thấy người phù hợp."}
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((u) => {
                    const checked = selected.has(u.id);
                    return (
                      <li key={u.id}>
                        <button
                          type="button"
                          onClick={() => toggle(u.id)}
                          className={`w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/60 ${checked ? "bg-emerald-50/60 dark:bg-emerald-500/10" : ""}`}
                        >
                          <img loading="lazy" decoding="async" src={avatarSrc(u.avatar || "/placeholder.svg", 64)} alt="" className="h-9 w-9 rounded-full object-cover bg-muted" />
                          <div className="flex-1 min-w-0 text-left">
                            <div className="text-sm font-semibold truncate">{resolveUserName(u as any, "Người dùng")}<CloneVipNameMedia userId={u.id} /></div>
                            {u.public_id ? <div className="text-[11px] text-muted-foreground truncate">UID {u.public_id}</div> : null}
                          </div>
                          <span className={`grid place-items-center h-5 w-5 rounded-md border ${checked ? "bg-emerald-500 border-emerald-500 text-white" : "border-border"}`}>
                            {checked ? <Check size={12} /> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="border-t p-3 flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            Phí tạo: <strong className="text-foreground">{tierInfo.price.toLocaleString()} Coin</strong>
          </div>
          <div className="inline-flex gap-2">
            <button onClick={onClose} className="rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
              Hủy
            </button>
            <button
              onClick={() => void submit()}
              disabled={submitting || !canAfford}
              className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? "Đang tạo..." : `Tạo nhóm`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
