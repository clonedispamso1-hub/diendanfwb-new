import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/integrations/supabase/client";
import { EggSVG, EGGS, RARITY_META, type EggConfig, type Rarity } from "./eggs";
import { PetSVG, SPECIES, SPECIES_LIST, MAX_LEVEL } from "./pets";
import {
  petStore,
  currentEggPrice,
  feedCostForLevel,
  expToNextLevel,
  spendCoins,
  randomEgg,
  eggById,
  uuid,
  upsertPetToDB,
  loadPetsFromDB,
  requestCollectionReward,
  hasPendingReward,
  sellPet,
  sellPriceForPet,
  starsForSpecies,
  REWARD_TIERS,
  type InventoryEgg,
  type PetRecord,
  type PetState,
} from "./storage";
import "./petworld.css";

type Tab = "shop" | "inventory" | "collection";

const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];

export function PetWorld() {
  const { me, setGemBalance } = useAuth();
  const userId = me?.id ?? null;
  const [state, setState] = useState<PetState>(() => petStore.load(userId));
  const [tab, setTab] = useState<Tab>("shop");
  const [busy, setBusy] = useState(false);
  const [hatching, setHatching] = useState<{ egg: EggConfig } | null>(null);
  const [reveal, setReveal] = useState<PetRecord | null>(null);
  const [detail, setDetail] = useState<PetRecord | null>(null);
  const [rewardStatus, setRewardStatus] = useState<Record<Rarity, boolean>>({} as any);

  const balance = useMemo(() => {
    if (!me) return null;
    const value = Number((me as any).gem_balance ?? 0);
    return Number.isFinite(value) ? value : 0;
  }, [me]);

  useEffect(() => { petStore.save(userId, state); }, [userId, state]);

  useEffect(() => {
    const base = petStore.load(userId);
    setState(base);
    if (!userId) return;
    void (async () => {
      const remote = await loadPetsFromDB(userId);
      if (remote && remote.length > 0) setState((s) => ({ ...s, pets: remote }));
    })();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void (async () => {
      const entries = await Promise.all(RARITY_ORDER.map(async (r) => [r, await hasPendingReward(userId, r)] as const));
      setRewardStatus(Object.fromEntries(entries) as any);
    })();
  }, [userId, state.pets.length]);

  const price = currentEggPrice(state.egg_round);

  const buyEgg = async () => {
    if (!userId) { toast.error("Vui lòng đăng nhập trước."); return; }
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("buy_egg", { egg_price: price });
      if (error) { toast.error(error.message); return; }
      const payload: any = data ?? {};
      const newBal = Number(payload.new_balance ?? payload.balance ?? payload);
      if (Number.isFinite(newBal)) setGemBalance(newBal);

      const egg = randomEgg();
      const inv: InventoryEgg = { id: uuid(), egg_id: egg.id, bought_at: Date.now(), bought_price: price };
      setState((s) => ({ ...s, eggs: [inv, ...s.eggs], egg_round: s.egg_round + 1 }));
      toast.success("Mua trứng thành công!");
      setTab("inventory");
    } finally { setBusy(false); }
  };

  const hatchEgg = (inv: InventoryEgg) => {
    const egg = eggById(inv.egg_id);
    setHatching({ egg });
    window.setTimeout(() => {
      const pet: PetRecord = {
        id: uuid(),
        species: egg.species,
        name: SPECIES[egg.species]?.name ?? "Pet",
        rarity: egg.rarity,
        level: 1, exp: 0, hp: 100, hunger: 60, happiness: 80,
        times_fed: 0, birthday: Date.now(),
        owner_id: userId, from_egg_id: egg.id,
      };
      setState((s) => ({
        ...s,
        eggs: s.eggs.filter((e) => e.id !== inv.id),
        // Reveal decides whether to keep or sell. We optimistically add to
        // collection now, and remove on "Bán" so the DB stays consistent.
        pets: [pet, ...s.pets],
      }));
      if (userId) void upsertPetToDB(userId, pet);
      setHatching(null);
      setReveal(pet);
    }, 4200);
  };

  // Keep: default behavior — pet stays in collection, popup closes.
  const keepPet = (pet: PetRecord) => {
    setReveal(null);
    setTab("collection");
    toast.success(`${pet.name} đã vào bộ sưu tập!`);
  };

  // Sell: remove pet, credit coins, close popup.
  const sellRevealedPet = async (pet: PetRecord) => {
    if (!userId) return;
    const price = sellPriceForPet(pet);
    const res = await sellPet(userId, pet);
    if (!res.ok) { toast.error(res.error); return; }
    setState((s) => ({ ...s, pets: s.pets.filter((p) => p.id !== pet.id) }));
    if (res.balance != null) setGemBalance(res.balance);
    else if (balance != null) setGemBalance(balance + price);
    toast.success(`Đã bán ${pet.name} +${price.toLocaleString("vi-VN")} Coin`);
    setReveal(null);
  };

  const feedPet = async (pet: PetRecord) => {
    if (!userId) return;
    if (pet.level >= MAX_LEVEL) { toast("Pet đã đạt MAX LEVEL!"); return; }
    const cost = feedCostForLevel(pet.level);
    const fresh = balance;
    if (fresh == null || fresh < cost) { toast.error(`Không đủ Coin. Cần ${cost.toLocaleString("vi-VN")}.`); return; }
    const result = await spendCoins(userId, cost);
    if (!result.ok) { toast.error(`Lỗi trừ Coin: ${result.reason}`); return; }

    setGemBalance(result.balance);
    let updatedPet: PetRecord | null = null;
    setState((s) => {
      const pets = s.pets.map((p) => {
        if (p.id !== pet.id) return p;
        const gainExp = 20 + p.level * 4;
        let exp = p.exp + gainExp;
        let level = p.level;
        let leveled = false;
        while (level < MAX_LEVEL && exp >= expToNextLevel(level)) {
          exp -= expToNextLevel(level); level += 1; leveled = true;
        }
        if (level >= MAX_LEVEL) exp = 0;
        if (leveled) toast.success(`${p.name} tiến hóa lên cấp ${level}! ✨`);
        const next = {
          ...p, level, exp,
          hp: Math.min(100, p.hp + 10),
          hunger: Math.min(100, p.hunger + 20),
          happiness: Math.min(100, p.happiness + 8),
          times_fed: p.times_fed + 1,
        };
        updatedPet = next;
        return next;
      });
      return { ...s, pets };
    });
    if (updatedPet && userId) void upsertPetToDB(userId, updatedPet);
    setDetail((d) => (d && d.id === pet.id && updatedPet ? updatedPet : d));
  };

  const requestReward = async (rarity: Rarity) => {
    if (!userId) return;
    const tier = REWARD_TIERS.find((t) => t.rarity === rarity);
    if (!tier) return;
    const result = await requestCollectionReward(userId, rarity, tier.amountVnd);
    if (result.ok) {
      toast.success("Đã gửi yêu cầu đổi thưởng. Admin sẽ duyệt sớm.");
      setRewardStatus((s) => ({ ...s, [rarity]: true }));
    } else {
      toast.error(result.error || "Gửi yêu cầu thất bại.");
    }
  };

  return (
    <div className="pw-root">
      <div className="pw-hero">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1>🐣 Pet World</h1>
            <p>Mua trứng bí ẩn, ấp nở và sưu tầm 100 pet độc nhất.</p>
          </div>
          <div className="pw-wallet" title="Số Coin trong ví">
            🪙 {balance != null ? balance.toLocaleString("vi-VN") : "—"}
          </div>
        </div>
      </div>

      <div className="pw-tabs">
        <button className={`pw-tab${tab === "shop" ? " active" : ""}`} onClick={() => setTab("shop")}>Shop</button>
        <button className={`pw-tab${tab === "inventory" ? " active" : ""}`} onClick={() => setTab("inventory")}>
          Trứng {state.eggs.length ? `(${state.eggs.length})` : ""}
        </button>
        <button className={`pw-tab${tab === "collection" ? " active" : ""}`} onClick={() => setTab("collection")}>
          Bộ sưu tập {state.pets.length ? `(${state.pets.length})` : ""}
        </button>
      </div>

      {tab === "shop" ? (
        <ShopView price={price} round={state.egg_round} onBuy={buyEgg} busy={busy} />
      ) : tab === "inventory" ? (
        <InventoryView eggs={state.eggs} onHatch={hatchEgg} />
      ) : (
        <CollectionView
          pets={state.pets}
          onOpen={(p) => setDetail(p)}
          onFeed={feedPet}
          rewardStatus={rewardStatus}
          onRequestReward={requestReward}
        />
      )}

      {hatching ? <HatchOverlay egg={hatching.egg} /> : null}

      {reveal ? (
        <RevealModal
          pet={reveal}
          onKeep={() => keepPet(reveal)}
          onSell={() => void sellRevealedPet(reveal)}
        />
      ) : null}

      {detail ? (
        <PetDetail
          pet={detail}
          onClose={() => setDetail(null)}
          onFeed={() => feedPet(detail)}
          feedCost={feedCostForLevel(detail.level)}
        />
      ) : null}
    </div>
  );
}

/* ---------- Star row (replaces rarity text) ---------- */
function Stars({ n, size = 14 }: { n: 1 | 2 | 3 | 4 | 5 | 6; size?: number }) {
  return (
    <span className="pw-stars" aria-label={`${n} sao`} style={{ fontSize: size }}>
      {Array.from({ length: n }).map((_, i) => (
        <span key={i} className="pw-star">★</span>
      ))}
    </span>
  );
}

/* ---------- Shop ---------- */
function ShopView({ price, round, onBuy, busy }: { price: number; round: number; onBuy: () => void; busy: boolean }) {
  return (
    <div className="pw-shop-single">
      <div className="pw-card pw-shop-card">
        <div className="pw-round-chip">Phiên #{round}</div>
        <MysteryEgg />
        <div className="pw-shop-title">Mua trứng bí ẩn</div>
        <div className="pw-shop-sub">
          Không ai biết bên trong là gì. Có thể là ★ hay tận ★★★★★★
        </div>
        <div className="pw-shop-price-big">🪙 {price.toLocaleString("vi-VN")} Coin</div>
        <button className="pw-btn pw-btn-lg" onClick={onBuy} disabled={busy}>
          {busy ? "Đang mua…" : "Mua trứng bí ẩn"}
        </button>
      </div>
    </div>
  );
}

function MysteryEgg() {
  return (
    <div className="pw-mystery-wrap">
      <svg viewBox="0 0 100 120" width={160} height={192} aria-hidden className="pw-mystery-egg">
        <defs>
          <linearGradient id="mystery-shell" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="60%" stopColor="#f0abfc" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
          <radialGradient id="mystery-glow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#f472b6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#f472b6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="50" cy="60" rx="52" ry="58" fill="url(#mystery-glow)" />
        <path d="M50 4 C22 4 8 44 8 74 C8 100 28 116 50 116 C72 116 92 100 92 74 C92 44 78 4 50 4 Z" fill="url(#mystery-shell)" />
        <text x="50" y="86" textAnchor="middle" fontSize="52" fontWeight="900" fill="white" opacity="0.9">?</text>
        <ellipse cx="50" cy="118" rx="26" ry="4" fill="black" opacity="0.18" />
      </svg>
    </div>
  );
}

function InventoryView({ eggs, onHatch }: { eggs: InventoryEgg[]; onHatch: (i: InventoryEgg) => void }) {
  if (eggs.length === 0) return <div className="pw-empty">Chưa có trứng nào. Ghé Shop mua trứng đầu tiên nhé!</div>;
  return (
    <div className="pw-grid">
      {eggs.map((inv) => {
        const egg = eggById(inv.egg_id);
        return (
          <div key={inv.id} className="pw-card">
            <EggSVG egg={egg} size={100} />
            <div className="pw-card-name">Trứng bí ẩn</div>
            <button className="pw-btn" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => onHatch(inv)}>
              Ấp trứng
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Collection ---------- */
function CollectionView({
  pets, onOpen, onFeed, rewardStatus, onRequestReward,
}: {
  pets: PetRecord[];
  onOpen: (p: PetRecord) => void;
  onFeed: (p: PetRecord) => void;
  rewardStatus: Record<Rarity, boolean>;
  onRequestReward: (r: Rarity) => void;
}) {
  const bookByRarity = useMemo(() => {
    const map = new Map<Rarity, string[]>();
    for (const r of RARITY_ORDER) map.set(r, []);
    for (const e of EGGS) {
      const list = map.get(e.rarity)!;
      if (!list.includes(e.species)) list.push(e.species);
    }
    return map;
  }, []);
  const ownedSet = useMemo(() => new Set(pets.map((p) => `${p.rarity}:${p.species}`)), [pets]);
  const bestPetOf = useMemo(() => {
    const m = new Map<string, PetRecord>();
    for (const p of pets) {
      const k = `${p.rarity}:${p.species}`;
      const cur = m.get(k);
      if (!cur || p.level > cur.level) m.set(k, p);
    }
    return m;
  }, [pets]);

  return (
    <div className="pw-collections">
      {RARITY_ORDER.map((rarity) => {
        const list = bookByRarity.get(rarity) ?? [];
        const owned = list.filter((sp) => ownedSet.has(`${rarity}:${sp}`)).length;
        const total = list.length;
        const complete = total > 0 && owned >= total;
        const meta = RARITY_META[rarity];
        const tier = REWARD_TIERS.find((t) => t.rarity === rarity);
        const requested = rewardStatus[rarity];
        return (
          <section key={rarity} className="pw-col-section">
            <header className="pw-col-header">
              <div className="pw-col-title" style={{ color: meta.color }}>
                {meta.label} Collection
              </div>
              <div className="pw-col-progress">
                <div className="pw-col-bar"><i style={{ width: `${(owned / Math.max(1, total)) * 100}%`, background: meta.color }} /></div>
                <span>{owned}/{total} {complete ? "✓" : ""}</span>
              </div>
              {complete && tier ? (
                <button className="pw-btn pw-btn-reward" disabled={requested} onClick={() => onRequestReward(rarity)}>
                  {requested ? "Đang chờ duyệt" : `Đổi thưởng ${tier.amountVnd.toLocaleString("vi-VN")}₫`}
                </button>
              ) : null}
            </header>
            <div className="pw-grid">
              {list.map((sp) => {
                const key = `${rarity}:${sp}`;
                const isOwned = ownedSet.has(key);
                const petData = bestPetOf.get(key);
                const stars = starsForSpecies(sp);
                return (
                  <div
                    key={sp}
                    className={`pw-card pw-col-card${isOwned ? " is-owned" : " is-locked"}`}
                    style={isOwned ? { boxShadow: `0 0 22px ${meta.color}44` } : undefined}
                  >
                    <button
                      type="button"
                      className="pw-col-avatar"
                      onClick={() => petData && onOpen(petData)}
                      disabled={!isOwned}
                    >
                      <div className={isOwned ? "" : "pw-locked-silhouette"}>
                        <PetSVG species={sp} size={92} level={petData?.level ?? 1} animate={isOwned} />
                      </div>
                    </button>
                    <div className="pw-card-name">
                      {isOwned ? (SPECIES[sp]?.name ?? sp) : "?????"}
                    </div>
                    <Stars n={stars} />
                    {isOwned && petData ? (
                      <>
                        <div className="pw-card-level">Lv.{petData.level}{petData.level >= MAX_LEVEL ? " · MAX" : ""}</div>
                        {petData.level < MAX_LEVEL ? (
                          <div className="pw-exp-bar">
                            <i style={{ width: `${(petData.exp / expToNextLevel(petData.level)) * 100}%` }} />
                          </div>
                        ) : (
                          <div className="pw-max-badge">MAX LEVEL</div>
                        )}
                        {petData.level < MAX_LEVEL ? (
                          <button
                            className="pw-btn pw-btn-feed"
                            onClick={() => onFeed(petData)}
                          >
                            Cho ăn 🪙 {feedCostForLevel(petData.level).toLocaleString("vi-VN")}
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ---------- Hatch overlay ---------- */
function HatchOverlay({ egg }: { egg: EggConfig }) {
  return (
    <div className="pw-hatch pw-hatch-v3" role="dialog" aria-label="Đang ấp trứng">
      <div className="pw-hatch-rays" aria-hidden />
      <div className="pw-hatch-rainbow" aria-hidden />
      <div className="pw-hatch-stage pw-hatch-shake-stage">
        <div className="pw-hatch-glow" style={{ background: `radial-gradient(circle, ${egg.glow}bb, transparent 65%)` }} aria-hidden />
        <div className="pw-hatch-egg-wrap">
          <EggSVG egg={egg} size={240} hatching />
          <div className="pw-hatch-crack" aria-hidden>
            <svg viewBox="0 0 100 120" width={240} height={288}>
              <path d="M40 40 L52 60 L44 78 L58 96" stroke="white" strokeWidth="2.5" fill="none" opacity="0" className="pw-crack-line" />
              <path d="M62 44 L54 66 L66 82" stroke="white" strokeWidth="2.5" fill="none" opacity="0" className="pw-crack-line pw-crack-line-2" />
            </svg>
          </div>
        </div>
        <div className="pw-particles" aria-hidden>
          {Array.from({ length: 36 }).map((_, i) => {
            const ang = (Math.PI * 2 * i) / 36;
            const dist = 130 + (i % 4) * 20;
            return (
              <span
                key={i}
                style={{
                  top: "50%", left: "50%",
                  ["--dx" as any]: `${Math.cos(ang) * dist}px`,
                  ["--dy" as any]: `${Math.sin(ang) * dist}px`,
                  background: egg.glow,
                  boxShadow: `0 0 12px ${egg.glow}`,
                  animationDelay: `${(i % 8) * 0.08}s`,
                }}
              />
            );
          })}
        </div>
        <div className="pw-hatch-flash" aria-hidden />
      </div>
      <div className="pw-hatch-caption">✨ Trứng đang nứt vỡ… ✨</div>
    </div>
  );
}

/* ---------- Reveal modal: MUST choose Keep or Sell ---------- */
function RevealModal({ pet, onKeep, onSell }: { pet: PetRecord; onKeep: () => void; onSell: () => void }) {
  const stars = starsForSpecies(pet.species);
  const price = sellPriceForPet(pet);
  // Block ESC + backdrop click from closing. Default action (backdrop) = keep.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onKeep(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKeep]);
  return (
    <div className="pw-modal pw-reveal" onClick={onKeep}>
      <div className="pw-reveal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="pw-reveal-rays" aria-hidden />
        <div className="pw-reveal-stars-row" aria-hidden>
          <Stars n={stars} size={22} />
        </div>
        <div className="pw-reveal-pet">
          <PetSVG species={pet.species} size={220} level={1} celebrate />
        </div>
        <div className="pw-reveal-name">{pet.name}</div>
        <div className="pw-reveal-actions">
          <button className="pw-btn pw-btn-lg" onClick={onKeep}>
            Đưa vào bộ sưu tập
          </button>
          <button className="pw-btn pw-btn-lg pw-btn-sell" onClick={onSell}>
            Bán cho Admin<br />
            <span style={{ fontSize: 12, opacity: 0.9 }}>+{price.toLocaleString("vi-VN")} Coin</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Pet detail ---------- */
function PetDetail({ pet, onClose, onFeed, feedCost }: { pet: PetRecord; onClose: () => void; onFeed: () => void; feedCost: number }) {
  const stars = starsForSpecies(pet.species);
  const maxed = pet.level >= MAX_LEVEL;
  return (
    <div className="pw-modal" onClick={onClose}>
      <div className="pw-modal-panel" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "grid", placeItems: "center", gap: 6 }}>
          <PetSVG species={pet.species} size={180} level={pet.level} />
          <div style={{ fontWeight: 800, fontSize: 18 }}>{pet.name}</div>
          <Stars n={stars} size={16} />
          <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
            Sinh: {new Date(pet.birthday).toLocaleDateString("vi-VN")}
          </div>
        </div>
        <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
          <StatRow label={`Cấp độ ${maxed ? "· MAX" : ""}`} value={`Lv ${pet.level}/${MAX_LEVEL}`}>
            <div className="pw-bar exp">
              <i style={{ width: maxed ? "100%" : `${(pet.exp / expToNextLevel(pet.level)) * 100}%` }} />
            </div>
          </StatRow>
          <StatRow label="HP" value={`${pet.hp}/100`}>
            <div className="pw-bar hp"><i style={{ width: `${pet.hp}%` }} /></div>
          </StatRow>
          <StatRow label="Hạnh phúc" value={`${pet.happiness}/100`}>
            <div className="pw-bar hap"><i style={{ width: `${pet.happiness}%` }} /></div>
          </StatRow>
          <StatRow label="No" value={`${pet.hunger}/100`}>
            <div className="pw-bar hungr"><i style={{ width: `${pet.hunger}%` }} /></div>
          </StatRow>
          <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>Đã cho ăn {pet.times_fed} lần.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="pw-btn" onClick={onFeed} disabled={maxed} style={{ flex: 1 }}>
            {maxed ? "MAX LEVEL" : `Cho ăn 🪙 ${feedCost.toLocaleString("vi-VN")}`}
          </button>
          <button className="pw-btn ghost" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, children }: { label: string; value: string; children: React.ReactNode }) {
  return (
    <div className="pw-stat-row">
      <b>{label}</b>
      {children}
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </div>
  );
}

// Named export retained; avoids "unused" warning for SPECIES_LIST.
export const __speciesCount = SPECIES_LIST.length;
