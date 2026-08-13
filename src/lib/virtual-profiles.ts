/**
 * Virtual Profiles — "People You May Know" + Admin chat routing.
 *
 * IMPORTANT: KHÔNG dùng bảng `virtual_chat_messages` nữa.
 * Mọi tin nhắn (cả thật lẫn nick ảo) đều ghi vào bảng `messages`
 * với schema tối giản: { sender_id, receiver_id, content, created_at }.
 *
 * - Khách nhắn nick ảo → INSERT messages (sender = khách, receiver = nick ảo).
 * - Admin reply hộ nick ảo → INSERT messages (sender = NICK ẢO, receiver = khách).
 */
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/app-types";
import { generateFakeIdentity, pickFakeAvatar } from "@/lib/fake-identity";

const sb = supabase as any;

/**
 * Bảng nội dung ảo (clone) — KHÔNG dính tới auth.users.
 * Các nick clone (`tktheolo001..tktheolo100`) là content rows thuần,
 * lưu tại `public.nicktuongtac`. Bảng này mirror schema profiles cho UI.
 */
export const VIRTUAL_TABLE = "nicktuongtac";

const VIRTUAL_SELECT_COLS =
  "id, username, display_name, full_name, avatar, avatar_url, bio, province, location, followers_count, vip_level, is_online, trust_score, intent, age, gender, is_active, is_virtual, is_clone, is_seed_account, status, created_at";
const MESSAGE_COLS = "id, sender_id, receiver_id, content, created_at";

const VIRTUAL_INSERT_FIELDS = new Set([
  "id",
  "username",
  "display_name",
  "full_name",
  "avatar",
  "avatar_url",
  "bio",
  "province",
  "location",
  "followers_count",
  "vip_level",
  "is_online",
  "trust_score",
  "intent",
  "age",
  "gender",
  "is_active",
  "is_virtual",
  "is_clone",
  "is_seed_account",
  "status",
]);

function missingColumnName(error: any): string | null {
  const msg = error?.message || "";
  return msg.match(/column "?([a-zA-Z_]+)"? .* does not exist/i)?.[1]
    || msg.match(/Could not find the '([a-zA-Z_]+)' column/i)?.[1]
    || null;
}

function normalizeVirtualRow<T extends Record<string, any>>(row: T): T {
  const avatar = row.avatar ?? row.avatar_url ?? null;
  const displayName = row.display_name ?? row.full_name ?? row.username ?? null;
  const fullName = row.full_name ?? row.display_name ?? row.username ?? null;
  return {
    ...row,
    avatar,
    avatar_url: row.avatar_url ?? avatar,
    display_name: displayName,
    full_name: fullName,
    is_virtual: true,
    is_clone: true,
    is_seed_account: true,
    is_active: row.is_active ?? true,
    status: row.status === "suspended" ? "active" : (row.status ?? "active"),
    is_banned: false,
    banned_until: null,
  } as T;
}

function sanitizeVirtualInsertRow(raw: Record<string, any>): Record<string, any> {
  const source = normalizeVirtualRow(raw);
  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!VIRTUAL_INSERT_FIELDS.has(key) || value === undefined) continue;
    clean[key] = value;
  }
  return clean;
}

async function selectVirtualRows(cols: string[], configure?: (q: any) => any): Promise<any[]> {
  let wanted = [...cols];
  for (let attempt = 0; attempt < 6; attempt++) {
    const base = sb.from(VIRTUAL_TABLE).select(wanted.join(", "));
    const { data, error } = await (configure ? configure(base) : base);
    if (!error) return ((data || []) as any[]).map(normalizeVirtualRow);
    const missing = missingColumnName(error);
    if (missing && wanted.includes(missing)) {
      wanted = wanted.filter((c) => c !== missing);
      continue;
    }
    throw error;
  }
  return [];
}

async function updateVirtualRow(id: string, patch: Record<string, any>): Promise<void> {
  let next = { ...patch };
  for (let attempt = 0; attempt < 6; attempt++) {
    const { error } = await sb.from(VIRTUAL_TABLE).update(next).eq("id", id);
    if (!error) return;
    const missing = missingColumnName(error);
    if (missing && missing in next) {
      const { [missing]: _removed, ...rest } = next;
      next = rest;
      continue;
    }
    throw error;
  }
}

const BIO_TEMPLATES = [
  "Mình thích cafe sáng và đi dạo cuối tuần ☕",
  "Đang tìm bạn tâm sự cùng nhau ✨",
  "Yoga · du lịch · phim Hàn 🌸",
  "Cô gái dễ thương đang chờ kết nối 💕",
  "Online buổi tối, rep tin nhanh 🌙",
  "Thích người chân thành, ghét drama 🎀",
];

const SUGGEST_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_KEY_PREFIX = "vprof.suggest.v1::";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function readCache(key: string): { ids: string[]; ts: number } | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.ts !== "number" || !Array.isArray(parsed.ids)) return null;
    if (Date.now() - parsed.ts > SUGGEST_TTL_MS) return null;
    return parsed;
  } catch { return null; }
}

function writeCache(key: string, ids: string[]) {
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify({ ids, ts: Date.now() }));
  } catch { /* ignore */ }
}

/**
 * category: "ons" | "fwb" | "dating" → map sang cột `intent` của profiles.
 *   - ons  → intent = "ons"
 *   - fwb  → intent = "fwb"
 *   - dating → intent = "dating"
 * Nếu nick ảo chưa có intent, vẫn được hiển thị như fallback chung.
 */
export type SuggestCategory = "ons" | "fwb" | "dating";
const CATEGORY_INTENTS: Record<SuggestCategory, string[]> = {
  ons: ["ons"],
  fwb: ["fwb"],
  dating: ["dating"],
};

export async function loadSuggestedVirtualProfiles(
  province: string | null | undefined,
  count = 10,
  category?: SuggestCategory | null,
): Promise<Profile[]> {
  const key = `${(province || "_any_").toLowerCase()}::${category || "_any_"}`;
  const cached = readCache(key);
  if (cached && cached.ids.length > 0) {
    const { data } = await sb.from(VIRTUAL_TABLE).select(VIRTUAL_SELECT_COLS).in("id", cached.ids);
    const rows = (data || []) as Profile[];
    if (rows.length >= Math.min(count, cached.ids.length)) {
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered = cached.ids.map((id) => byId.get(id)).filter(Boolean) as Profile[];
      if (province) {
        const needFix = ordered.filter((p) => !(p as any).province).map((p) => p.id);
        if (needFix.length > 0) {
          await sb.from(VIRTUAL_TABLE).update({ province, location: province }).in("id", needFix);
          for (const p of ordered) if (needFix.includes(p.id)) { (p as any).province = province; (p as any).location = province; }
        }
      }
      return ordered.map(markVirtual);
    }
  }

  const intents = category ? CATEGORY_INTENTS[category] : null;
  const applyIntent = (q: any) => (intents ? q.in("intent", intents) : q);

  let same: Profile[] = [];
  if (province) {
    const { data } = await applyIntent(
      sb.from(VIRTUAL_TABLE).select(VIRTUAL_SELECT_COLS)
        .eq("province", province),
    )
      .order("created_at", { ascending: false })
      .limit(count * 2);
    same = ((data || []) as Profile[]);
  }

  let pool = [...same];
  if (pool.length < count) {
    const { data } = await applyIntent(
      sb.from(VIRTUAL_TABLE).select(VIRTUAL_SELECT_COLS),
    )
      .order("created_at", { ascending: false })
      .limit(count * 3);
    for (const p of ((data || []) as Profile[])) {
      if (pool.length >= count) break;
      if (!pool.find((x) => x.id === p.id)) pool.push(p);
    }
  }

  // Fallback cuối: nếu vẫn thiếu, lấy bất kỳ nick ảo nào (không filter intent).
  if (pool.length < count && intents) {
    const { data } = await sb
      .from(VIRTUAL_TABLE).select(VIRTUAL_SELECT_COLS)
      .order("created_at", { ascending: false })
      .limit(count * 3);
    for (const p of ((data || []) as Profile[])) {
      if (pool.length >= count) break;
      if (!pool.find((x) => x.id === p.id)) pool.push(p);
    }
  }


  if (pool.length < count) {
    const need = count - pool.length;
    const created = await materializeBatch(province || null, need, category || null);
    pool = [...pool, ...created];
  }

  pool.sort(() => Math.random() - 0.5);
  const result = pool.slice(0, count);

  if (province) {
    const toLocalize = result
      .filter((p) => (p as any).province !== province)
      .map((p) => p.id);
    if (toLocalize.length > 0) {
      await sb.from(VIRTUAL_TABLE).update({ province, location: province }).in("id", toLocalize);
      for (const p of result) {
        if (toLocalize.includes(p.id)) {
          (p as any).province = province;
          (p as any).location = province;
        }
      }
    }
  }

  writeCache(key, result.map((p) => p.id));
  return result.map(markVirtual);
}

function markVirtual<T extends Profile>(p: T): T {
  (p as any).is_virtual = true;
  (p as any).is_clone = true;
  return p;
}

async function materializeBatch(province: string | null, n: number, category: SuggestCategory | null = null): Promise<Profile[]> {
  const rows = Array.from({ length: n }, () => buildVirtualRow(province, category));
  return insertBuiltRows(rows);
}

async function insertBuiltRows(initialRows: any[]): Promise<Profile[]> {
  let rows = initialRows.map(sanitizeVirtualInsertRow);

  // Insert thẳng vào bảng nội dung ảo `nicktuongtac`.
  // Tuyệt đối không gọi auth/RPC tạo account hoặc device-registration flow.
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await sb.from(VIRTUAL_TABLE).insert(rows).select(VIRTUAL_SELECT_COLS);
    if (!error) return ((data || []) as Profile[]).map((r) => markVirtual(normalizeVirtualRow(r as any) as Profile));
    const missing = missingColumnName(error);
    if (missing) {
      rows = rows.map((r: any) => { const c = { ...r }; delete c[missing]; return c; });
      continue;
    }
    if (/null value in column "?id"?/i.test(error.message || "")) {
      rows = rows.map((r: any) => ({ ...r, id: (crypto as any).randomUUID?.() ?? cryptoRandomUUID() }));
      continue;
    }
    console.error("[virtual] cannot materialize batch:", error);
    throw new Error(
      `Không insert được nick ảo vào ${VIRTUAL_TABLE}: ${error.message || error}` +
      (error.code ? ` (code: ${error.code})` : ""),
    );
  }
  return [];
}


function cryptoRandomUUID(): string {
  // Fallback UUID v4 cho môi trường thiếu crypto.randomUUID
  const b = new Uint8Array(16);
  (globalThis.crypto || (globalThis as any).msCrypto).getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0"));
  return `${h.slice(0,4).join("")}-${h.slice(4,6).join("")}-${h.slice(6,8).join("")}-${h.slice(8,10).join("")}-${h.slice(10,16).join("")}`;
}


function buildVirtualRow(province: string | null, category: SuggestCategory | null = null) {
  const id = generateFakeIdentity();
  const avatar = pickFakeAvatar();
  const intent = category || null;
  return {
    display_name: id.displayName,
    full_name: id.displayName,
    username: id.username,
    avatar,
    avatar_url: avatar,
    bio: pick(BIO_TEMPLATES),
    province: province,
    location: province,
    followers_count: 50 + Math.floor(Math.random() * 950),
    vip_level: pick([0, 0, 1, 2, 5]),
    is_online: Math.random() < 0.4,
    trust_score: 95 + Math.floor(Math.random() * 6),
    is_active: true,
    is_virtual: true,
    is_clone: true,
    is_seed_account: true,
    status: "active",
    ...(intent ? { intent } : {}),
  };
}

export async function ensureVirtualProfile(province: string | null): Promise<Profile | null> {
  const [p] = await materializeBatch(province, 1);
  return p || null;
}

export async function isVirtualProfile(userId: string): Promise<boolean> {
  const { data } = await sb.from(VIRTUAL_TABLE).select("id").eq("id", userId).maybeSingle();
  return Boolean(data);
}

/**
 * Khách gửi tin tới profile ảo → ghi thẳng vào bảng `messages`.
 * Schema tối giản: chỉ sender_id / receiver_id / content.
 */
export async function sendVirtualMessage(virtualId: string, customerId: string, content: string, replyTo?: string | null) {
  // Bộ lọc từ cấm dùng chung cho tin nhắn (kể cả nick ảo).
  {
    const { enforceContentRules } = await import("./keyword-filter");
    await enforceContentRules(content || "", "message");
  }
  const base: Record<string, any> = {
    sender_id: customerId,
    receiver_id: virtualId,
    content,
  };
  const payload = replyTo ? { ...base, reply_to: replyTo } : base;
  let { error } = await sb.from("messages").insert([payload]);
  if (error && replyTo && /reply_to/.test(error.message || "")) {
    ({ error } = await sb.from("messages").insert([base]));
  }
  if (error) {
    console.error("[sendVirtualMessage] messages insert error:", error);
    throw error;
  }
}

/** Đọc thread khách ↔ nick ảo từ bảng `messages`. */
export async function loadVirtualThread(virtualId: string, customerId: string) {
  const { data, error } = await sb
    .from("messages")
    .select(MESSAGE_COLS)
    .or(
      `and(sender_id.eq.${virtualId},receiver_id.eq.${customerId}),and(sender_id.eq.${customerId},receiver_id.eq.${virtualId})`,
    )
    .order("created_at", { ascending: true })
    .limit(500); // trần an toàn cho thread admin
  if (error) throw error;
  // Map về format cũ ({ sender: "admin"|"customer" }) để UI admin không đổi
  return (data || []).map((m: any) => ({
    id: m.id,
    virtual_id: virtualId,
    customer_id: customerId,
    sender: m.sender_id === virtualId ? "admin" : "customer",
    content: m.content,
    is_read: true,
    created_at: m.created_at,
  }));
}

/**
 * Liệt kê các thread giữa nick ảo (is_virtual=true) và khách thật,
 * dựng từ bảng `messages` duy nhất.
 */
export async function adminListVirtualThreads() {
  // 1) Lấy id của tất cả nick ảo từ bảng nội dung ảo.
  const virtuals = await selectVirtualRows(["id", "display_name", "full_name", "username", "avatar", "avatar_url"]);
  const virtualIds = new Set<string>((virtuals || []).map((p: any) => p.id));
  if (virtualIds.size === 0) return [];

  const virtualById = new Map<string, any>((virtuals || []).map((p: any) => [p.id, p]));

  // 2) Lấy tin nhắn liên quan tới bất kỳ nick ảo nào
  const idsArr = Array.from(virtualIds);
  const { data: msgs, error: mErr } = await sb
    .from("messages")
    .select(MESSAGE_COLS)
    .or(`sender_id.in.(${idsArr.join(",")}),receiver_id.in.(${idsArr.join(",")})`)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (mErr) throw mErr;

  // 3) Gom theo cặp (virtual, customer)
  const map = new Map<string, { virtual_id: string; customer_id: string; last: any; unread: number }>();
  for (const m of (msgs || []) as any[]) {
    const vIsSender = virtualIds.has(m.sender_id);
    const vIsReceiver = virtualIds.has(m.receiver_id);
    if (vIsSender === vIsReceiver) continue; // bỏ cặp ảo↔ảo hoặc thật↔thật
    const virtual_id = vIsSender ? m.sender_id : m.receiver_id;
    const customer_id = vIsSender ? m.receiver_id : m.sender_id;
    const key = `${virtual_id}__${customer_id}`;
    const cur = map.get(key);
    const isCustomerMsg = m.sender_id === customer_id;
    if (!cur) {
      map.set(key, {
        virtual_id,
        customer_id,
        last: { ...m, sender: isCustomerMsg ? "customer" : "admin" },
        unread: 0, // schema không có is_read → tạm bỏ qua
      });
    }
  }

  // 4) Lấy profile khách
  const customerIds = Array.from(new Set(Array.from(map.values()).map((t) => t.customer_id)));
  let customerById = new Map<string, any>();
  if (customerIds.length > 0) {
    const { data: custs } = await sb
      .from("profiles").select("id, full_name, username, avatar")
      .in("id", customerIds);
    customerById = new Map((custs || []).map((p: any) => [p.id, p]));
  }

  return Array.from(map.values()).map((t) => ({
    ...t,
    virtual: virtualById.get(t.virtual_id) || null,
    customer: customerById.get(t.customer_id) || null,
  }));
}

/**
 * Admin reply hộ nick ảo → ghi thẳng vào `messages` với
 * sender_id = ID NICK ẢO, receiver_id = ID khách.
 * KHÔNG dùng auth.uid() làm sender. RLS phải cho phép insert khi
 * sender_id thuộc 1 profile có is_virtual = true (do admin đang đăng nhập).
 */
export async function adminReplyVirtual(virtualId: string, customerId: string, content: string) {
  if (!virtualId || !customerId) {
    throw new Error("Thiếu virtualId hoặc customerId khi admin reply.");
  }
  const { error } = await sb.from("messages").insert([{
    sender_id: virtualId,
    receiver_id: customerId,
    content,
  }]);
  if (error) {
    console.error("[adminReplyVirtual] messages insert error:", error, {
      sender_id: virtualId,
      receiver_id: customerId,
    });
    throw new Error(
      `Không gửi được tin nhắn ảo: ${error.message}` +
      (error.code ? ` (code: ${error.code})` : "") +
      `. Hãy chắc chắn RLS bảng messages cho phép insert khi sender_id là nick ảo (is_virtual = true).`,
    );
  }
}

/** Schema mới không có cột is_read → no-op để giữ tương thích chỗ gọi. */
export async function adminMarkThreadRead(_virtualId: string, _customerId: string) {
  return;
}

export async function adminUpdateVirtualProfile(
  id: string,
  patch: { full_name?: string; bio?: string; vip_level?: number; avatar?: string },
) {
  const update: Record<string, any> = {};
  if (patch.full_name !== undefined) update.full_name = patch.full_name;
  if (patch.bio !== undefined) update.bio = patch.bio;
  if (patch.vip_level !== undefined) update.vip_level = patch.vip_level;
  if (patch.avatar !== undefined) {
    update.avatar = patch.avatar;
    update.avatar_url = patch.avatar;
  }
  await updateVirtualRow(id, update);
}

/* ============================================================
 * ADMIN — Quản lý "Tìm quanh đây" (clone stream + stats)
 * ============================================================ */

/**
 * Tạo nhanh N nick ảo (clone) trong 1 lệnh.
 * Username theo serial tăng dần: tktheolo001, tktheolo002, ... bắt đầu từ
 * (max serial hiện có trong DB) + 1, pad tối thiểu 3 chữ số.
 */
export const CLONE_USERNAME_PREFIX = "tktheolo";
export const CLONE_USERNAME_MAX_SERIAL = 100;

async function nextCloneSerialStart(): Promise<number> {
  const { data } = await sb
    .from(VIRTUAL_TABLE)
    .select("username")
    .ilike("username", `${CLONE_USERNAME_PREFIX}%`)
    .order("username", { ascending: false })
    .limit(CLONE_USERNAME_MAX_SERIAL);
  let maxN = 0;
  for (const row of ((data || []) as any[])) {
    const m = String(row.username || "").match(new RegExp(`^${CLONE_USERNAME_PREFIX}(\\d+)$`, "i"));
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > maxN) maxN = n;
    }
  }
  return maxN + 1;
}

function padSerial(n: number): string {
  return String(n).padStart(3, "0");
}

export async function bulkCreateVirtualClones(
  n: number,
  province: string | null = null,
): Promise<Profile[]> {
  if (!n || n < 1) return [];
  const start = await nextCloneSerialStart();
  const remaining = Math.max(0, CLONE_USERNAME_MAX_SERIAL - start + 1);
  if (remaining === 0) {
    throw new Error(
      `Đã đạt giới hạn serial ${CLONE_USERNAME_PREFIX}001..${CLONE_USERNAME_PREFIX}${CLONE_USERNAME_MAX_SERIAL}. Vui lòng xoá nick cũ trong bảng ${VIRTUAL_TABLE} trước khi tạo thêm.`,
    );
  }
  const capped = Math.min(Math.max(1, Math.floor(n)), 100, remaining);
  const rows = Array.from({ length: capped }, (_, i) => {
    const row = buildVirtualRow(province, null) as any;
    row.username = `${CLONE_USERNAME_PREFIX}${padSerial(start + i)}`;
    row.full_name = row.full_name || `Nick ảo ${padSerial(start + i)}`;
    return row;
  });
  return insertBuiltRows(rows);
}


export interface CloneStreamRow {
  id: string;
  username: string | null;
  display_name: string | null;
  full_name: string | null;
  avatar: string | null;
  vip_level: number | null;
  province: string | null;
  created_at: string;
  incoming_messages: number;
  new_followers: number;
}

/** Liệt kê toàn bộ nick ảo + thống kê tương tác (tin nhắn đến, follower mới). */
export async function adminListClonesWithStats(limit = 200): Promise<CloneStreamRow[]> {
  const clones = await selectVirtualRows(
    ["id", "username", "display_name", "full_name", "avatar", "avatar_url", "vip_level", "province", "location", "created_at", "is_active", "status"],
    (q) => q.order("created_at", { ascending: false }).limit(limit),
  );

  const list = (clones || []) as any[];
  if (list.length === 0) return [];
  const ids = list.map((c) => c.id);

  // 1) Tin nhắn đến: messages.receiver_id ∈ clones, sender_id ∉ clones (sender là user thật).
  const cloneSet = new Set(ids);
  const msgCount = new Map<string, number>();
  const { data: msgs } = await sb
    .from("messages")
    .select("sender_id, receiver_id")
    .in("receiver_id", ids)
    .limit(20000);
  for (const m of ((msgs || []) as any[])) {
    if (cloneSet.has(m.sender_id)) continue; // bỏ tin do nick ảo khác gửi
    msgCount.set(m.receiver_id, (msgCount.get(m.receiver_id) || 0) + 1);
  }

  // 2) Follower mới: follows.following_id ∈ clones
  const followCount = new Map<string, number>();
  const { data: fls } = await sb
    .from("follows")
    .select("follower_id, following_id")
    .in("following_id", ids)
    .limit(20000);
  for (const f of ((fls || []) as any[])) {
    followCount.set(f.following_id, (followCount.get(f.following_id) || 0) + 1);
  }

  return list.map((c) => ({
    id: c.id,
    username: c.username,
    display_name: c.display_name || c.full_name || c.username || null,
    full_name: c.full_name || c.display_name || c.username || null,
    avatar: c.avatar || c.avatar_url || null,
    vip_level: c.vip_level,
    province: c.province || c.location || null,
    created_at: c.created_at,
    incoming_messages: msgCount.get(c.id) || 0,
    new_followers: followCount.get(c.id) || 0,
  }));
}

/** Lấy danh sách khách (user thật) đã chat với nick ảo này — sắp theo tin gần nhất. */
export async function adminListCustomersForClone(virtualId: string) {
  const { data: msgs, error } = await sb
    .from("messages")
    .select("sender_id, receiver_id, content, created_at")
    .or(`sender_id.eq.${virtualId},receiver_id.eq.${virtualId}`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const map = new Map<string, { customer_id: string; last_content: string; last_at: string }>();
  for (const m of ((msgs || []) as any[])) {
    const customer_id = m.sender_id === virtualId ? m.receiver_id : m.sender_id;
    if (!customer_id || customer_id === virtualId) continue;
    if (map.has(customer_id)) continue;
    map.set(customer_id, { customer_id, last_content: m.content, last_at: m.created_at });
  }

  const ids = Array.from(map.keys());
  if (ids.length === 0) return [];
  const { data: profs } = await sb
    .from("profiles")
    .select("id, full_name, username, avatar, is_virtual")
    .in("id", ids);
  const byId = new Map<string, any>(((profs || []) as any[]).map((p) => [p.id, p]));

  return Array.from(map.values())
    .filter((row) => {
      const p = byId.get(row.customer_id);
      return p && !p.is_virtual; // chỉ giữ khách thật
    })
    .map((row) => ({
      ...row,
      customer: byId.get(row.customer_id) || null,
    }));
}

