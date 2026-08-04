// Server-only helpers that talk to the Google Sheets gateway.
// Never import this file from client code.
// Toàn bộ tên Sheet và tên cột đều bằng tiếng Việt.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

// Existing spreadsheet — DO NOT change. Provided by the user.
export const SPREADSHEET_ID = "10Wy6LXweWwhwVpVX5nrmWBuCYZ_RAL3rXTbAjU9ZcHo";

// Tên Sheet (tiếng Việt)
export const SHEET_MEMBERS = "Thành Viên";
export const SHEET_GEM = "Lịch Sử Gem";
export const SHEET_GIFTS = "Lịch Sử Quà Tặng";
export const SHEET_LOGIN_HISTORY = "Lịch Sử Đăng Nhập";
export const SHEET_FWB_ONBOARDING = "FWB Đăng Ký";

// Tên cũ (tiếng Anh) — dùng để tự động đổi tên nếu phát hiện sheet cũ trong file.
const LEGACY_RENAMES: Record<string, string> = {
  Members: SHEET_MEMBERS,
  "Gem Transactions": SHEET_GEM,
  Gifts: SHEET_GIFTS,
  "Login History": SHEET_LOGIN_HISTORY,
};

// Tiêu đề cột (tiếng Việt) — theo đúng yêu cầu.
const HEADERS: Record<string, string[]> = {
  [SHEET_MEMBERS]: [
    "UID",
    "Tên đăng nhập",
    "Tên hiển thị",
    "Khu vực",
    "Gem hiện tại",
    "Ngày đăng ký",
    "Giới tính",
    "Số điện thoại",
    "Email",
    "Sở thích",
    "Đã hoàn thành hồ sơ",
    "Trạng thái tài khoản",
    "Đăng nhập gần nhất",
    "Trạng thái online",
  ],
  [SHEET_GEM]: [
    "Mã giao dịch",
    "UID",
    "Tên đăng nhập",
    "Loại giao dịch",
    "Số Gem",
    "Số dư trước",
    "Số dư sau",
    "Thời gian",
  ],
  [SHEET_GIFTS]: [
    "Mã quà tặng",
    "UID người gửi",
    "Tên người gửi",
    "UID người nhận",
    "Tên người nhận",
    "Tên quà tặng",
    "Giá trị Gem",
    "Thời gian",
  ],
  [SHEET_LOGIN_HISTORY]: [
    "UID",
    "Tên đăng nhập",
    "Địa chỉ IP",
    "Thiết bị",
    "Thời gian đăng nhập",
    "Thời gian đăng xuất",
  ],
  [SHEET_FWB_ONBOARDING]: [
    "UID",
    "Email",
    "Số điện thoại",
    "Tên hiển thị",
    "Tuổi",
    "Giới tính",
    "Thành phố",
    "Tiểu sử",
    "Sở thích",
    "Chiều cao (cm)",
    "Cân nặng (kg)",
    "Độ uy tín",
    "Thời gian đăng ký",
  ],
};

function authHeaders() {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const sheetsKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!lovableKey) throw new Error("Missing LOVABLE_API_KEY");
  if (!sheetsKey) throw new Error("Missing GOOGLE_SHEETS_API_KEY (Google Sheets connection not linked)");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": sheetsKey,
    "Content-Type": "application/json",
  } as Record<string, string>;
}

async function gw(path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init?.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Sheets gateway ${res.status}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

export async function getSpreadsheetMeta() {
  return gw(`/spreadsheets/${SPREADSHEET_ID}`);
}

export async function ensureSheets(): Promise<void> {
  const meta = await getSpreadsheetMeta();
  const sheets: Array<{ properties?: { title?: string; sheetId?: number } }> = meta.sheets ?? [];
  const titleToId = new Map<string, number>();
  for (const s of sheets) {
    if (s.properties?.title && typeof s.properties.sheetId === "number") {
      titleToId.set(s.properties.title, s.properties.sheetId);
    }
  }
  const existing = new Set<string>(titleToId.keys());

  const requests: any[] = [];

  // 1) Đổi tên các sheet tiếng Anh cũ → tiếng Việt (giữ nguyên dữ liệu).
  for (const [oldName, newName] of Object.entries(LEGACY_RENAMES)) {
    if (existing.has(oldName) && !existing.has(newName)) {
      const id = titleToId.get(oldName)!;
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: id, title: newName },
          fields: "title",
        },
      });
      existing.delete(oldName);
      existing.add(newName);
    }
  }

  // 2) Tạo các sheet còn thiếu.
  for (const title of Object.keys(HEADERS)) {
    if (!existing.has(title)) requests.push({ addSheet: { properties: { title } } });
  }
  if (requests.length) {
    await gw(`/spreadsheets/${SPREADSHEET_ID}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }

  // 3) Ghi đè hàng tiêu đề (idempotent).
  const data = Object.entries(HEADERS).map(([title, cols]) => ({
    range: `'${title}'!A1:${columnLetter(cols.length)}1`,
    values: [cols],
  }));
  await gw(`/spreadsheets/${SPREADSHEET_ID}/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: "RAW", data }),
  });
}

function columnLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

async function findRowByFirstColumn(sheet: string, key: string): Promise<number> {
  const res = await gw(`/spreadsheets/${SPREADSHEET_ID}/values/'${sheet}'!A:A`);
  const values: string[][] = res.values ?? [];
  for (let i = 1; i < values.length; i++) {
    if ((values[i]?.[0] ?? "") === key) return i + 1;
  }
  return 0;
}

async function appendRow(sheet: string, row: (string | number | boolean | null)[]) {
  await gw(
    `/spreadsheets/${SPREADSHEET_ID}/values/'${sheet}'!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      body: JSON.stringify({ values: [row.map((v) => (v == null ? "" : v))] }),
    },
  );
}

async function updateRow(sheet: string, rowNumber: number, row: (string | number | boolean | null)[]) {
  const range = `'${sheet}'!A${rowNumber}:${columnLetter(row.length)}${rowNumber}`;
  await gw(`/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    body: JSON.stringify({ values: [row.map((v) => (v == null ? "" : v))] }),
  });
}

export interface MemberRow {
  uid: string;
  username?: string | null;
  displayName?: string | null;
  region?: string | null;
  currentGem?: number | null;
  registrationDate?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  interests?: string | null;
  profileCompleted?: boolean | null;
  accountStatus?: string | null; // Trạng thái tài khoản (vd: "Hoạt động", "Khóa")
  lastLoginAt?: string | null;
  onlineStatus?: string | null;  // "Online" / "Offline"
}

function vnGender(g?: string | null): string {
  if (!g) return "";
  const s = String(g).toLowerCase();
  if (s === "male" || s === "m" || s === "nam") return "Nam";
  if (s === "female" || s === "f" || s === "nu" || s === "nữ") return "Nữ";
  return String(g);
}

function vnBool(b: any): string {
  if (b === true || b === "TRUE" || b === "true") return "Có";
  if (b === false || b === "FALSE" || b === "false") return "Không";
  return "";
}

function memberRowValues(m: MemberRow, existing?: string[]): (string | number | boolean | null)[] {
  const e = existing ?? [];
  return [
    m.uid,
    m.username ?? e[1] ?? "",
    m.displayName ?? e[2] ?? "",
    m.region ?? e[3] ?? "",
    m.currentGem ?? e[4] ?? 0,
    m.registrationDate ?? e[5] ?? new Date().toISOString(),
    vnGender(m.gender) || e[6] || "",
    m.phone ?? e[7] ?? "",
    m.email ?? e[8] ?? "",
    m.interests ?? e[9] ?? "",
    m.profileCompleted != null ? vnBool(m.profileCompleted) : (e[10] ?? ""),
    m.accountStatus ?? e[11] ?? "Hoạt động",
    m.lastLoginAt ?? e[12] ?? "",
    m.onlineStatus ?? e[13] ?? "",
  ];
}

export async function upsertMember(m: MemberRow) {
  await ensureSheets();
  const rowNum = await findRowByFirstColumn(SHEET_MEMBERS, m.uid);
  if (rowNum === 0) {
    await appendRow(SHEET_MEMBERS, memberRowValues(m));
    return { action: "insert" as const };
  }
  const res = await gw(`/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_MEMBERS}'!A${rowNum}:N${rowNum}`);
  const existing = (res.values?.[0] ?? []) as string[];
  await updateRow(SHEET_MEMBERS, rowNum, memberRowValues(m, existing));
  return { action: "update" as const };
}

export interface GiftRow {
  giftId: string;
  senderUid: string;
  senderUsername?: string | null;
  receiverUid: string;
  receiverUsername?: string | null;
  giftName: string;
  giftValue: number;
  createdAt?: string | null;
}

export async function appendGift(g: GiftRow) {
  await ensureSheets();
  const existingRow = await findRowByFirstColumn(SHEET_GIFTS, g.giftId);
  if (existingRow > 0) return { action: "skip" as const };
  await appendRow(SHEET_GIFTS, [
    g.giftId,
    g.senderUid,
    g.senderUsername ?? "",
    g.receiverUid,
    g.receiverUsername ?? "",
    g.giftName,
    g.giftValue,
    g.createdAt ?? new Date().toISOString(),
  ]);
  return { action: "insert" as const };
}

// Loại giao dịch Gem (tiếng Việt). Map từ tiếng Anh nếu có.
const GEM_TYPE_MAP: Record<string, string> = {
  topup: "Nạp Gem",
  purchase: "Nạp Gem",
  deposit: "Nạp Gem",
  send: "Tặng Gem",
  gift_send: "Tặng Gem",
  receive: "Nhận Gem",
  gift_receive: "Nhận Gem",
  adjust: "Điều chỉnh Gem",
  admin_adjust: "Điều chỉnh Gem",
  refund: "Hoàn tiền",
};
function vnGemType(t?: string | null): string {
  if (!t) return "Điều chỉnh Gem";
  return GEM_TYPE_MAP[String(t).toLowerCase()] ?? String(t);
}

export interface GemRow {
  txId: string;
  uid: string;
  username?: string | null;
  type: string;            // raw or VN type
  amount: number;          // có thể âm hoặc dương
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  createdAt?: string | null;
}

export async function appendGem(g: GemRow) {
  await ensureSheets();
  const existingRow = await findRowByFirstColumn(SHEET_GEM, g.txId);
  if (existingRow > 0) return { action: "skip" as const };
  await appendRow(SHEET_GEM, [
    g.txId,
    g.uid,
    g.username ?? "",
    vnGemType(g.type),
    g.amount,
    g.balanceBefore ?? "",
    g.balanceAfter ?? "",
    g.createdAt ?? new Date().toISOString(),
  ]);
  return { action: "insert" as const };
}

export interface LoginRow {
  uid: string;
  username?: string | null;
  ip?: string | null;
  device?: string | null;
  loginTime?: string | null;
}

export async function appendLogin(l: LoginRow): Promise<{ rowKey: string }> {
  await ensureSheets();
  const loginTime = l.loginTime ?? new Date().toISOString();
  await appendRow(SHEET_LOGIN_HISTORY, [
    l.uid,
    l.username ?? "",
    l.ip ?? "",
    l.device ?? "",
    loginTime,
    "",
  ]);
  return { rowKey: `${l.uid}|${loginTime}` };
}

export async function setLogout(rowKey: string, logoutTime?: string) {
  const res = await gw(`/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_LOGIN_HISTORY}'!A:F`);
  const values: string[][] = res.values ?? [];
  for (let i = values.length - 1; i >= 1; i--) {
    const row = values[i] ?? [];
    // Khớp theo UID (cột A) + Thời gian đăng nhập (cột E, index 4)
    const key = `${row[0] ?? ""}|${row[4] ?? ""}`;
    if (key === rowKey) {
      const rowNumber = i + 1;
      await gw(
        `/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_LOGIN_HISTORY}'!F${rowNumber}?valueInputOption=USER_ENTERED`,
        {
          method: "PUT",
          body: JSON.stringify({ values: [[logoutTime ?? new Date().toISOString()]] }),
        },
      );
      return { ok: true };
    }
  }
  return { ok: false };
}

export async function verifyConnection() {
  const res = await fetch("https://connector-gateway.lovable.dev/api/v1/verify_credentials", {
    method: "POST",
    headers: authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ===== FWB Onboarding =====

export interface FwbOnboardingRow {
  uid: string;
  email?: string | null;
  phone?: string | null;
  displayName: string;
  age: number | null;
  gender: string;
  city: string;
  bio: string;
  interests: string[];
  heightCm?: number | null;
  weightKg?: number | null;
  trustScore?: number | null;
}

function normEmail(e?: string | null) {
  return (e || "").trim().toLowerCase();
}
function normPhone(p?: string | null) {
  return (p || "").replace(/[^\d+]/g, "");
}

/** Kiểm tra email hoặc phone đã tồn tại trong sheet FWB Đăng Ký. */
export async function fwbCheckUnique(input: { email?: string | null; phone?: string | null; excludeUid?: string | null }): Promise<{ exists: boolean; field?: "email" | "phone" }> {
  await ensureSheets();
  const email = normEmail(input.email);
  const phone = normPhone(input.phone);
  if (!email && !phone) return { exists: false };
  const res = await gw(`/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_FWB_ONBOARDING}'!A:C`);
  const rows: string[][] = res.values ?? [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const uid = r[0] ?? "";
    if (input.excludeUid && uid === input.excludeUid) continue;
    const e = normEmail(r[1] ?? "");
    const p = normPhone(r[2] ?? "");
    if (email && e && e === email) return { exists: true, field: "email" };
    if (phone && p && p === phone) return { exists: true, field: "phone" };
  }
  return { exists: false };
}

/** Append FWB onboarding row. Reject if uid already onboarded (locked). */
export async function fwbAppendOnboarding(row: FwbOnboardingRow): Promise<{ action: "insert" | "locked" }> {
  await ensureSheets();
  const existing = await findRowByFirstColumn(SHEET_FWB_ONBOARDING, row.uid);
  if (existing > 0) return { action: "locked" };
  await appendRow(SHEET_FWB_ONBOARDING, [
    row.uid,
    normEmail(row.email),
    normPhone(row.phone),
    row.displayName,
    row.age ?? "",
    row.gender,
    row.city,
    row.bio,
    row.interests.join(", "),
    row.heightCm ?? "",
    row.weightKg ?? "",
    row.trustScore ?? "",
    new Date().toISOString(),
  ]);
  return { action: "insert" };
}

/** Trả về thông tin đã đăng ký (nếu có) để khóa form. */
export async function fwbGetOnboarding(uid: string): Promise<FwbOnboardingRow | null> {
  await ensureSheets();
  const res = await gw(`/spreadsheets/${SPREADSHEET_ID}/values/'${SHEET_FWB_ONBOARDING}'!A:M`);
  const rows: string[][] = res.values ?? [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if ((r[0] ?? "") !== uid) continue;
    return {
      uid: r[0] ?? "",
      email: r[1] ?? "",
      phone: r[2] ?? "",
      displayName: r[3] ?? "",
      age: r[4] ? Number(r[4]) : null,
      gender: r[5] ?? "",
      city: r[6] ?? "",
      bio: r[7] ?? "",
      interests: (r[8] ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      heightCm: r[9] ? Number(r[9]) : null,
      weightKg: r[10] ? Number(r[10]) : null,
      trustScore: r[11] ? Number(r[11]) : null,
    };
  }
  return null;
}
