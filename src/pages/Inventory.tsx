import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Coins, Loader2, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { AuthProvider, useAuth } from "@/components/candy/auth-provider";
import { NotificationProvider } from "@/components/candy/notification-provider";
import { supabase } from "@/lib/supabase";
import { DragonBallIcon, type BallTier } from "@/components/candy/gift/dragon-ball-icon";
import { DragonBallPopover } from "@/components/candy/gift/dragon-ball-popover";
import { DRAGON_BALL_CATALOG } from "@/components/candy/gift/dragon-ball-catalog";

type Inv = Record<BallTier, number>;

const EMPTY: Inv = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };

const INVALIDATE_EVENT = "dbq:inventory-changed";

function useInventory(meId: string | null) {
  const [inv, setInv] = useState<Inv>(EMPTY);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!meId) return;
    setLoading(true);
    // Đọc TRỰC TIẾP từ dragon_ball_instances (source of truth), không phụ thuộc cache.
    const { data, error } = await supabase
      .from("dragon_ball_instances" as any)
      .select("tier")
      .eq("owner_id", meId)
      .is("consumed_at", null);
    if (error) console.warn("[Inventory] load error:", error);
    const next: Inv = { ...EMPTY };
    (data as any[] | null)?.forEach((r) => {
      const t = Number(r.tier) as BallTier;
      if (t >= 1 && t <= 7) next[t] = (next[t] || 0) + 1;
    });
    console.log("[Inventory page] loaded from instances:", next, "rows=", data?.length ?? 0);
    setInv(next);
    setLoading(false);
  }, [meId]);

  useEffect(() => { void load(); }, [load]);

  // Realtime updates
  useEffect(() => {
    if (!meId) return;
    const ch = supabase
      .channel(`inv-${meId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dragon_ball_instances", filter: `owner_id=eq.${meId}` },
        () => { void load(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_dragon_ball_inventory", filter: `user_id=eq.${meId}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [meId, load]);

  // Manual invalidate signal (fired ngay sau claim RPC thành công).
  useEffect(() => {
    const onInvalidate = () => { void load(); };
    window.addEventListener(INVALIDATE_EVENT, onInvalidate);
    return () => window.removeEventListener(INVALIDATE_EVENT, onInvalidate);
  }, [load]);

  return { inv, loading, reload: load, setInv };
}

function Inner() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const { inv, loading, reload } = useInventory(me?.id || null);
  const [picked, setPicked] = useState<BallTier | null>(null);
  const [summoning, setSummoning] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const hasFullSet = useMemo(
    () => ([1, 2, 3, 4, 5, 6, 7] as BallTier[]).every((t) => inv[t] >= 1),
    [inv],
  );

  const totalCoins = useMemo(
    () => DRAGON_BALL_CATALOG.reduce((s, b) => s + b.amount * (inv[b.tier as BallTier] || 0), 0),
    [inv],
  );
  const renderData = useMemo(
    () => DRAGON_BALL_CATALOG.map((b) => ({ ...b, quantity: inv[b.tier as BallTier] || 0 })),
    [inv],
  );

  useEffect(() => {
    console.log("inventoryState", inv);
    console.log("renderData", renderData);
  }, [inv, renderData]);

  const doExchange = async (t: BallTier) => {
    if (busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("exchange_dragon_ball" as any, { p_tier: t });
    setBusy(false);
    const res = (data as any) || null;
    if (error || !res?.ok) {
      toast.error(res?.code === "INSUFFICIENT_BALLS" ? "Bạn không còn viên nào." : "Không thể đổi Coin.");
      return;
    }
    toast.success(`Đã nhận ${Number(res.coins).toLocaleString("vi-VN")} Coin`);
    setPicked(null);
    void reload();
  };

  const doSummon = async () => {
    if (busy || !hasFullSet) return;
    setBusy(true);
    setPicked(null);
    setSummoning(true);
    const { data, error } = await supabase.rpc("summon_dragon" as any);
    const res = (data as any) || null;
    // Delay to let the animation play (~4.5s)
    await new Promise((r) => setTimeout(r, 4500));
    setBusy(false);
    if (error || !res?.ok) {
      setSummoning(false);
      toast.error(res?.code === "INCOMPLETE_SET" ? "Bạn cần đủ 7 viên (1★ → 7★)." : "Triệu hồi thất bại.");
      return;
    }
    setReward(Number(res.coins));
    setSummoning(false);
    void reload();
  };

  return (
    <main className="min-h-screen bg-background text-foreground pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border/40 bg-background/85 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              navigate(-1);
            } else {
              navigate("/", { replace: true });
            }
          }}
          aria-label="Quay lại"
          className="rounded-full p-2 hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-semibold">📦 Rương đồ</h1>
      </header>

      <section className="px-4 pt-4">
        <div className="rounded-2xl border border-border/50 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-4">
          <p className="text-sm text-muted-foreground">Tổng giá trị Ngọc Rồng</p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <Coins className="text-amber-500" size={22} />
            {totalCoins.toLocaleString("vi-VN")} Coin
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Chạm vào từng viên để <b>Đổi Coin</b>, hoặc gom đủ bộ 7 viên (1★ → 7★) để <b>Gọi Rồng</b> nhận Bao Lì Xì cực lớn.
          </p>
        </div>
      </section>

      <section className="px-4 pt-4">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Đang tải…
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {DRAGON_BALL_CATALOG.map((b) => {
              const qty = inv[b.tier as BallTier] || 0;
              return (
                <DragonBallPopover
                  key={b.tier}
                  tier={b.tier as BallTier}
                  quantity={qty}
                  size={64}
                  disabled={qty <= 0}
                  onExchange={() => void doExchange(b.tier as BallTier)}
                  onSummon={doSummon}
                  canSummon={hasFullSet}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="px-4 pt-6">
        <div className={`rounded-2xl border p-4 text-center transition
          ${hasFullSet
            ? "border-amber-500 bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-red-500/10 shadow-[0_0_40px_rgba(251,146,60,0.4)]"
            : "border-border/40 bg-muted/30"}`}>
          <p className="text-lg font-bold">🐉 Gọi Rồng Thần</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Cần đủ 7 viên (1★ → 7★). Tiêu hao 1 bộ mỗi lần triệu hồi để nhận Bao Lì Xì ngẫu nhiên cực lớn.
          </p>
          <button
            type="button"
            disabled={!hasFullSet || busy}
            onClick={doSummon}
            className={`mt-3 inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold transition
              ${hasFullSet
                ? "bg-gradient-to-r from-amber-500 to-red-500 text-white hover:opacity-95 active:scale-95"
                : "bg-muted text-muted-foreground cursor-not-allowed"}`}
          >
            <Sparkles size={16} /> Triệu hồi Rồng Thần
          </button>
        </div>
      </section>

      {/* Action sheet: Đổi Coin vs Gọi Rồng */}
      <AnimatePresence>
        {picked !== null && (
          <>
            <motion.div
              key="backdrop"
              className="fixed inset-0 z-[120] bg-black/60"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setPicked(null)}
            />
            <motion.div
              key="sheet"
              className="fixed inset-x-0 bottom-0 z-[121] rounded-t-3xl border-t border-border/50 bg-background p-5 pb-8"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 260 }}
            >
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-muted" />
              <div className="flex items-center gap-3">
                <DragonBallIcon tier={picked} size={56} />
                <div>
                  <p className="text-base font-semibold">Ngọc Rồng {picked}★</p>
                  <p className="text-xs text-muted-foreground">
                    Bạn có ×{inv[picked]} viên · {DRAGON_BALL_CATALOG.find((b) => b.tier === picked)?.amount.toLocaleString("vi-VN")} Coin/viên
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void doExchange(picked)}
                  className="flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-3 text-sm font-bold text-white hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
                >
                  <Coins size={16} /> Đổi 1 viên lấy Coin
                </button>
                <button
                  type="button"
                  disabled={!hasFullSet || busy}
                  onClick={doSummon}
                  className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition
                    ${hasFullSet
                      ? "bg-gradient-to-r from-amber-500 to-red-500 text-white hover:opacity-95 active:scale-[0.99]"
                      : "bg-muted text-muted-foreground cursor-not-allowed"}`}
                >
                  <Sparkles size={16} /> Gọi Rồng {hasFullSet ? "" : "(cần đủ 7 viên)"}
                </button>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="mt-1 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
                >
                  Đóng
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Summon overlay */}
      <SummonDragonOverlay active={summoning} />

      {/* Red envelope reward */}
      <AnimatePresence>
        {reward !== null && (
          <RedEnvelope amount={reward} onClose={() => setReward(null)} />
        )}
      </AnimatePresence>
    </main>
  );
}

/** Full-screen dragon summon animation (~4.5s). */
function SummonDragonOverlay({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Storm background */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at center, rgba(20,10,0,0.95) 0%, rgba(0,0,0,0.98) 60%, #000 100%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
          />
          {/* Lightning flashes */}
          <motion.div
            className="absolute inset-0 bg-white"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.85, 0, 0.6, 0, 0.4, 0] }}
            transition={{ duration: 2.4, times: [0, 0.05, 0.1, 0.2, 0.25, 0.5, 0.6] }}
          />
          {/* 7 balls converging into center */}
          {[1, 2, 3, 4, 5, 6, 7].map((tier, i) => {
            const angle = (i / 7) * Math.PI * 2;
            const R = 220;
            return (
              <motion.div
                key={tier}
                className="absolute"
                initial={{
                  x: Math.cos(angle) * R,
                  y: Math.sin(angle) * R,
                  opacity: 0,
                  scale: 0.6,
                  rotate: 0,
                }}
                animate={{
                  x: [Math.cos(angle) * R, Math.cos(angle) * R * 0.7, 0],
                  y: [Math.sin(angle) * R, Math.sin(angle) * R * 0.7, 0],
                  opacity: [0, 1, 1, 0],
                  scale: [0.6, 1, 1.2, 0],
                  rotate: [0, 360, 720],
                }}
                transition={{ duration: 2.2, times: [0, 0.2, 0.85, 1], ease: "easeInOut" }}
              >
                <DragonBallIcon tier={tier as BallTier} size={56} />
              </motion.div>
            );
          })}
          {/* Central burst */}
          <motion.div
            className="absolute h-40 w-40 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(255,230,120,1) 0%, rgba(251,146,60,0.9) 40%, rgba(220,38,38,0.4) 70%, transparent 100%)",
              filter: "blur(4px)",
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 0, 3, 6], opacity: [0, 0, 1, 0] }}
            transition={{ duration: 3, times: [0, 0.6, 0.75, 1] }}
          />
          {/* Dragon emerges */}
          <motion.div
            className="absolute text-center"
            initial={{ scale: 0, opacity: 0, y: 40 }}
            animate={{ scale: [0, 0, 1.1, 1], opacity: [0, 0, 1, 1], y: [40, 40, 0, 0] }}
            transition={{ duration: 4, times: [0, 0.65, 0.85, 1] }}
          >
            <div className="text-[128px] leading-none drop-shadow-[0_0_60px_rgba(251,146,60,0.9)]">🐉</div>
            <motion.p
              className="mt-4 text-3xl font-black tracking-wide text-amber-300"
              style={{ textShadow: "0 0 24px rgba(251,146,60,0.9), 0 0 4px #000" }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: [0, 0, 1] }}
              transition={{ duration: 4, times: [0, 0.7, 0.85] }}
            >
              RỒNG THẦN XUẤT HIỆN!
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Red envelope prize reveal. */
function RedEnvelope({ amount, onClose }: { amount: number; onClose: () => void }) {
  const [opened, setOpened] = useState(false);
  return (
    <motion.div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-6"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="relative w-full max-w-xs rounded-3xl bg-gradient-to-b from-red-500 via-red-600 to-red-700 p-6 text-center text-white shadow-2xl"
        initial={{ scale: 0.6, rotate: -6, y: 40 }}
        animate={{ scale: 1, rotate: 0, y: 0 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full bg-black/20 p-1.5 hover:bg-black/40"
          aria-label="Đóng"
        >
          <X size={16} />
        </button>
        <div className="mx-auto mt-2 mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-yellow-400 text-4xl shadow-inner">
          {opened ? "💰" : "🧧"}
        </div>
        <p className="text-lg font-bold">Bao Lì Xì Rồng Thần</p>
        {opened ? (
          <>
            <motion.p
              className="mt-4 text-4xl font-black text-yellow-300 drop-shadow"
              initial={{ scale: 0.6 }} animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 14 }}
            >
              +{amount.toLocaleString("vi-VN")}
            </motion.p>
            <p className="mt-1 text-sm text-yellow-100">Coin đã được cộng vào ví.</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full rounded-full bg-yellow-400 px-4 py-2.5 text-sm font-bold text-red-800 hover:bg-yellow-300"
            >
              Tuyệt vời!
            </button>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/90">Chạm để mở phần thưởng</p>
            <button
              type="button"
              onClick={() => setOpened(true)}
              className="mt-5 w-full rounded-full bg-yellow-400 px-4 py-2.5 text-sm font-bold text-red-800 hover:bg-yellow-300 active:scale-95"
            >
              Mở Bao Lì Xì
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

export default function InventoryPage() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <Inner />
      </NotificationProvider>
    </AuthProvider>
  );
}
