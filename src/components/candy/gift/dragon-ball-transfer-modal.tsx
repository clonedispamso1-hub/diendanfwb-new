import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Loader2, Minus, Plus, Search, Send, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { DragonBallIcon, type BallTier } from "./dragon-ball-icon";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { refreshInventory } from "@/components/candy/inventory/InventorySheet";
import { useAuth } from "@/components/candy/auth-provider";
import { resolveUserName } from "@/lib/user-name";

interface Props {
  open: boolean;
  tier: BallTier | null;
  maxQty: number;
  onClose: () => void;
  onSuccess?: () => void;
}

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; profile: { id: string; public_id: string; full_name: string | null; avatar: string | null } }
  | { status: "not_found" }
  | { status: "self" }
  | { status: "error"; message: string };

/**
 * Modal Chuyển Ngọc Rồng — nhập UID người nhận + số lượng.
 * Không có nút "bán". Chỉ gọi RPC `transfer_dragon_ball`.
 */
export function DragonBallTransferModal({ open, tier, maxQty, onClose, onSuccess }: Props) {
  const { me } = useAuth();
  const [uid, setUid] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  useBodyScrollLock(open);

  useEffect(() => {
    if (open) {
      setUid("");
      setQty(1);
      setLookup({ status: "idle" });
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [open, tier]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounced UID lookup — hiển thị người nhận trước khi cho gửi
  useEffect(() => {
    const cleaned = uid.trim().toUpperCase();
    if (!cleaned) { setLookup({ status: "idle" }); return; }
    if (me?.public_id && cleaned === String(me.public_id).toUpperCase()) {
      setLookup({ status: "self" });
      return;
    }
    setLookup({ status: "loading" });
    let cancelled = false;
    const handle = setTimeout(async () => {
      const { data, error } = await supabase
        .from("profiles" as any)
        .select("id, public_id, full_name, avatar")
        .ilike("public_id", cleaned)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.warn("[transfer] uid lookup error:", error);
        setLookup({ status: "error", message: error.message });
        return;
      }
      if (!data) { setLookup({ status: "not_found" }); return; }
      const p = data as any;
      if (me?.id && p.id === me.id) { setLookup({ status: "self" }); return; }
      setLookup({
        status: "found",
        profile: {
          id: p.id,
          public_id: p.public_id,
          full_name: p.full_name ?? null,
          avatar: p.avatar ?? null,
        },
      });
    }, 350);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [uid, me?.id, me?.public_id]);

  const clampedMax = Math.max(1, maxQty || 1);

  const dec = () => setQty((q) => Math.max(1, q - 1));
  const inc = () => setQty((q) => Math.min(clampedMax, q + 1));

  const canSubmit =
    !busy && tier != null && qty >= 1 && qty <= clampedMax && lookup.status === "found";

  const handleSubmit = async () => {
    if (!canSubmit || tier == null || lookup.status !== "found") return;
    setBusy(true);
    const payload = {
      p_to_uid: lookup.profile.public_id,
      p_tier: tier,
      p_amount: qty,
    };
    const { data, error } = await supabase.rpc("transfer_dragon_ball" as any, payload);
    setBusy(false);
    // Log toàn bộ response để dễ debug
    console.log("[transfer_dragon_ball] payload:", payload);
    console.log("[transfer_dragon_ball] data:", data);
    console.log("[transfer_dragon_ball] error:", error);

    const res: any = data ?? null;
    if (error || !res || res.ok === false) {
      const code = (res?.code || error?.code || error?.message || "").toString();
      const msgMap: Record<string, string> = {
        UID_NOT_FOUND: "UID không tồn tại.",
        CANNOT_TRANSFER_SELF: "Không thể chuyển cho chính mình.",
        INSUFFICIENT_BALLS: "Bạn không đủ Ngọc Rồng để chuyển.",
        INVALID_AMOUNT: "Số lượng không hợp lệ.",
        INVALID_TIER: "Loại ngọc không hợp lệ.",
        UNAUTHENTICATED: "Bạn cần đăng nhập lại.",
      };
      const mapped = Object.entries(msgMap).find(([k]) => code.includes(k))?.[1];
      toast.error(
        mapped
          ? mapped
          : `Chuyển Ngọc Rồng thất bại: ${code || res?.message || "Không rõ lỗi"}`,
      );
      return;
    }
    toast.success(`Đã chuyển ${qty} viên Ngọc Rồng ${tier} Sao cho ${lookup.profile.full_name || lookup.profile.public_id}.`);
    // Cập nhật inventory ngay lập tức (không cần F5)
    refreshInventory();
    onSuccess?.();
    onClose();
  };

  return (
    <AnimatePresence>
      {open && tier != null && (
        <>
          <motion.div
            key="dbt-backdrop"
            className="fixed inset-0"
            style={{ zIndex: 100050, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(5px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => !busy && onClose()}
          />
          <motion.div
            key="dbt-modal"
            role="dialog"
            aria-modal="true"
            className="fixed left-1/2 top-1/2 flex w-[92%] max-w-[420px] flex-col overflow-hidden rounded-3xl border border-border/50 shadow-2xl text-foreground"
            style={{
              zIndex: 100051,
              transform: "translate(-50%, -50%)",
              backgroundColor: "var(--background, #ffffff)",
              opacity: 1,
              filter: "none",
              backdropFilter: "none",
              WebkitBackdropFilter: "none" as any,
              mixBlendMode: "normal",
            }}
            initial={{ opacity: 0, scale: 0.9, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.9, x: "-50%", y: "-50%" }}
            transition={{ type: "spring", damping: 26, stiffness: 320 }}
            data-scroll-lock-ignore
          >
            <div className="flex items-center justify-between border-b border-border/40 px-5 pt-4 pb-3">
              <div>
                <h2 className="text-lg font-bold">Chuyển Ngọc Rồng</h2>
                <p className="text-[11px] text-muted-foreground">Ngọc Rồng {tier} Sao · Bạn có ×{maxQty}</p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => !busy && onClose()}
                className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col items-center gap-4 px-5 pt-5">
              <div className="relative">
                <div
                  className="absolute inset-0 -z-10 rounded-full blur-2xl"
                  style={{ background: "radial-gradient(circle, rgba(251,146,60,0.5), transparent 70%)" }}
                />
                <DragonBallIcon tier={tier} size={72} />
              </div>

              <div className="w-full">
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  UID người nhận
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={uid}
                  onChange={(e) => setUid(e.target.value.toUpperCase())}
                  placeholder="Nhập UID (VD: AUD6K9)"
                  disabled={busy}
                  className="w-full rounded-xl border border-border bg-muted/40 px-3.5 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/30 disabled:opacity-60"
                />

                {/* Recipient preview */}
                <div className="mt-2 min-h-[52px]">
                  {lookup.status === "loading" && (
                    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                      <Search size={14} className="animate-pulse" />
                      Đang tìm UID…
                    </div>
                  )}
                  {lookup.status === "found" && (
                    <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
                      {lookup.profile.avatar ? (
                        <img loading="lazy" decoding="async"
                          src={avatarSrc(lookup.profile.avatar, 64)}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/30 text-sm font-bold text-emerald-700">
                          {(lookup.profile.full_name || lookup.profile.public_id).slice(0, 1).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-sm font-semibold text-foreground">
                          <CheckCircle2 size={13} className="text-emerald-500" />
                          {resolveUserName(lookup.profile as any, "Người dùng")}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          UID: {lookup.profile.public_id}
                        </p>
                      </div>
                    </div>
                  )}
                  {lookup.status === "not_found" && (
                    <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                      <XCircle size={14} /> Không tìm thấy UID này.
                    </div>
                  )}
                  {lookup.status === "self" && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                      <XCircle size={14} /> Không thể chuyển cho chính mình.
                    </div>
                  )}
                  {lookup.status === "error" && (
                    <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-600 dark:text-rose-400">
                      <XCircle size={14} /> Lỗi tìm UID: {lookup.message}
                    </div>
                  )}
                </div>
              </div>

              <div className="w-full">
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">
                  Số lượng
                </label>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={dec}
                    disabled={busy || qty <= 1}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted/40 text-foreground transition hover:bg-muted disabled:opacity-40"
                    aria-label="Giảm"
                  >
                    <Minus size={18} />
                  </button>
                  <div className="min-w-[80px] rounded-xl border border-border bg-muted/40 py-2.5 text-center text-lg font-bold tabular-nums">
                    {qty}
                  </div>
                  <button
                    type="button"
                    onClick={inc}
                    disabled={busy || qty >= clampedMax}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-muted/40 text-foreground transition hover:bg-muted disabled:opacity-40"
                    aria-label="Tăng"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <p className="mt-1 text-center text-[10.5px] text-muted-foreground">
                  Tối đa {clampedMax} viên
                </p>
              </div>
            </div>

            <div className="flex gap-2 border-t border-border/40 px-5 py-4 mt-4">
              <button
                type="button"
                onClick={() => !busy && onClose()}
                disabled={busy}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-60"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_4px_18px_rgba(251,146,60,0.45)] transition hover:opacity-95 active:scale-[0.99] disabled:opacity-60"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                Xác nhận
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
