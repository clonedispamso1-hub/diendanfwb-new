import { supabase } from "@/lib/supabase";
import { EGGS, type EggConfig, type Rarity } from "./eggs";
import { SPECIES_LIST, MAX_LEVEL } from "./pets";

export { MAX_LEVEL };

export type InventoryEgg = {
  id: string;
  egg_id: number;
  bought_at: number;
  bought_price: number;
};

export type PetRecord = {
  id: string;
  species: string;
  name: string;
  rarity: Rarity;
  level: number;
  exp: number;
  hp: number;
  hunger: number;
  happiness: number;
  times_fed: number;
  birthday: number;
  owner_id: string | null;
  from_egg_id: number;
};

export type PetState = {
  eggs: InventoryEgg[];
  pets: PetRecord[];
  egg_round: number;
};

const LS_KEY = "petworld:v3";

function load(userId: string | null): PetState {
  const key = LS_KEY + ":" + (userId ?? "guest");
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { eggs: [], pets: [], egg_round: 1 };
}

function save(userId: string | null, s: PetState) {
  const key = LS_KEY + ":" + (userId ?? "guest");
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(s));
  } catch { /* ignore */ }
}

export const petStore = { load, save };

// ---------- Economy ----------
export const EGG_PRICE = 100_000;

// Flat egg price — round is display-only, never affects price.
export function currentEggPrice(_round: number) {
  return EGG_PRICE;
}

export function feedCostForLevel(level: number) {
  return 500 + Math.max(0, level - 1) * 200 + Math.max(0, level - 3) * 100;
}

export function expToNextLevel(level: number) {
  return 100 + level * 40;
}

// ---------- Star system ----------
// Every pet has a star count (1..6) that fully replaces rarity text.
export function starsForSpecies(speciesId: string): 1 | 2 | 3 | 4 | 5 | 6 {
  const s = SPECIES_LIST.find((sp) => sp.id === speciesId);
  return s ? s.stars : 1;
}

// Admin buy-back prices by star tier.
export const SELL_PRICES: Record<1 | 2 | 3 | 4 | 5 | 6, number> = {
  1: 10_000,
  2: 50_000,
  3: 100_000,
  4: 300_000,
  5: 1_800_000,
  6: 5_000_000,
};

export function sellPriceForPet(pet: PetRecord): number {
  return SELL_PRICES[starsForSpecies(pet.species)];
}

// ---------- Wallet ----------
export async function spendCoins(
  _userId: string,
  amount: number,
): Promise<{ ok: true; balance: number } | { ok: false; reason: string; balance: number | null }> {
  try {
    const { data, error } = await (supabase as any).rpc("pet_world_spend_coins", { _amount: amount });
    if (error) {
      return { ok: false, reason: error.message, balance: null };
    }
    if (data != null) {
      const payload = data as any;
      const bal = Number(payload.new_balance ?? payload.balance ?? data);
      if (payload.ok === false) {
        return { ok: false, reason: payload.message ?? "spend_failed", balance: Number.isFinite(bal) ? bal : null };
      }
      if (Number.isFinite(bal)) return { ok: true, balance: bal };
    }
    return { ok: false, reason: "RPC không trả về dữ liệu", balance: null };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "spend_failed", balance: null };
  }
}

// ---------- Egg pick weighted by star tier ----------
const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 55, uncommon: 25, rare: 12, epic: 5, legendary: 2, mythic: 1,
};

export function randomEgg(): EggConfig {
  const order: Rarity[] = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
  const buckets: EggConfig[][] = order.map(() => []);
  for (const e of EGGS) buckets[order.indexOf(e.rarity)].push(e);
  const totalW = order.reduce((a, r) => a + RARITY_WEIGHT[r], 0);
  let r = Math.random() * totalW;
  for (const rarity of order) {
    r -= RARITY_WEIGHT[rarity];
    if (r <= 0) {
      const list = buckets[order.indexOf(rarity)];
      return list[Math.floor(Math.random() * list.length)] ?? EGGS[0];
    }
  }
  return EGGS[0];
}

export function eggById(id: number): EggConfig {
  return EGGS.find((e) => e.id === id) ?? EGGS[0];
}

export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ---------- Supabase persistence ----------
export async function upsertPetToDB(userId: string, pet: PetRecord): Promise<void> {
  try {
    await supabase.from("pet_collection").upsert({
      id: pet.id,
      user_id: userId,
      species: pet.species,
      name: pet.name,
      rarity: pet.rarity,
      level: pet.level,
      exp: pet.exp,
      hp: pet.hp,
      hunger: pet.hunger,
      happiness: pet.happiness,
      times_fed: pet.times_fed,
      birthday: new Date(pet.birthday).toISOString(),
      from_egg_id: pet.from_egg_id,
    } as any, { onConflict: "id" });
  } catch { /* ignore */ }
}

export async function loadPetsFromDB(userId: string): Promise<PetRecord[] | null> {
  try {
    const { data, error } = await supabase
      .from("pet_collection")
      .select("*")
      .eq("user_id", userId)
      .order("birthday", { ascending: false });
    if (error || !Array.isArray(data)) return null;
    return data.map((r: any) => ({
      id: r.id,
      species: r.species,
      name: r.name,
      rarity: r.rarity,
      level: Math.min(MAX_LEVEL, r.level ?? 1),
      exp: r.exp ?? 0,
      hp: r.hp ?? 100,
      hunger: r.hunger ?? 60,
      happiness: r.happiness ?? 80,
      times_fed: r.times_fed ?? 0,
      birthday: r.birthday ? new Date(r.birthday).getTime() : Date.now(),
      owner_id: r.user_id,
      from_egg_id: r.from_egg_id ?? 0,
    }));
  } catch {
    return null;
  }
}

// ---------- Sell pet to admin ----------
// Preferred: server RPC `pet_world_sell_pet(_pet_id uuid)` that deletes the
// pet, credits coins according to SELL_PRICES, and inserts a transaction
// row. Falls back to a best-effort client delete when the RPC is absent.
export async function sellPet(userId: string, pet: PetRecord): Promise<{ ok: true; balance: number | null } | { ok: false; error: string }> {
  const price = sellPriceForPet(pet);
  try {
    const { data, error } = await (supabase as any).rpc("pet_world_sell_pet", {
      _pet_id: pet.id,
      _amount: price,
    });
    if (!error) {
      const payload: any = data ?? {};
      const bal = Number(payload.new_balance ?? payload.balance ?? NaN);
      return { ok: true, balance: Number.isFinite(bal) ? bal : null };
    }
    // Fallback: delete row + best-effort log
    const del = await supabase.from("pet_collection").delete().eq("id", pet.id).eq("user_id", userId);
    if (del.error) return { ok: false, error: del.error.message };
    try {
      await supabase.from("pet_transactions").insert({
        user_id: userId,
        pet_id: pet.id,
        species: pet.species,
        stars: starsForSpecies(pet.species),
        amount: price,
        kind: "sell_to_admin",
      } as any);
    } catch { /* ignore */ }
    return { ok: true, balance: null };
  } catch (e: any) {
    return { ok: false, error: e?.message || "sell_failed" };
  }
}

// ---------- Reward requests (unchanged) ----------
export type RewardTier = { rarity: Rarity; label: string; amountVnd: number };
export const REWARD_TIERS: RewardTier[] = [
  { rarity: "common",    label: "Common Collection",   amountVnd:    200_000 },
  { rarity: "uncommon",  label: "Uncommon Collection", amountVnd:    500_000 },
  { rarity: "rare",      label: "Rare Collection",     amountVnd:  2_000_000 },
  { rarity: "epic",      label: "Epic Collection",     amountVnd:  5_000_000 },
  { rarity: "legendary", label: "Legend Collection",   amountVnd: 20_000_000 },
  { rarity: "mythic",    label: "Mythic Collection",   amountVnd: 50_000_000 },
];

export async function requestCollectionReward(
  userId: string,
  rarity: Rarity,
  amountVnd: number,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { error } = await supabase.from("pet_reward_requests").insert({
      user_id: userId,
      collection_rarity: rarity,
      amount_vnd: amountVnd,
      status: "pending",
    } as any);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || "unknown" };
  }
}

export async function hasPendingReward(userId: string, rarity: Rarity): Promise<boolean> {
  try {
    const { data } = await supabase
      .from("pet_reward_requests")
      .select("id, status")
      .eq("user_id", userId)
      .eq("collection_rarity", rarity)
      .in("status", ["pending", "paid"])
      .limit(1);
    return !!(data && data.length);
  } catch { return false; }
}
