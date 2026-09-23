/**
 * EMERGENCY PURGE ENGINE — SERVER-ONLY
 *
 * Phase A (dryRun): CHỈ COUNT bảng + đếm auth users + liệt kê storage object.
 *                   Không có một lời gọi DELETE nào trong đường đi của dryRun.
 * Phase B (execute): chỉ chạy khi được ARM bằng env + confirm phrase + executionId.
 *                    Fail-fast: lỗi ở bước nào là dừng ngay, không bỏ qua.
 *
 * TUYỆT ĐỐI KHÔNG: DROP / TRUNCATE / ALTER / migration / xóa bucket /
 *                  sửa RLS / sửa Auth config / log secret.
 */
import {
  ADMIN_SURFACES,
  ALWAYS_KEEP_TABLES,
  INSTANCE_ORDER,
  KEEP_SETTINGS_TABLES,
  PURGE_CONFIRM_PHRASE,
  PURGE_INSTANCES,
  PURGE_ORDER,
  REAL_FOREIGN_KEYS,
  STORAGE_PLAN,
  VIEWS,
  type InstanceId,
  type PurgeInstance,
} from "./purge-plan";

// ---------------------------------------------------------------- helpers

function keyFor(inst: PurgeInstance): string | null {
  const v = process.env[inst.serviceKeyEnv];
  return v && v.length > 10 ? v : null;
}

function headers(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

/**
 * Bảng bị loại khỏi purge:
 * - view (không bao giờ DELETE)
 * - ALWAYS_KEEP_TABLES: site_branding, zalo_float_icon — GIỮ NGUYÊN kể cả khi purgeSettings = true
 * - bảng cấu hình khác (trừ khi purgeSettings = true)
 */
function excluded(instance: InstanceId, purgeSettings: boolean): Set<string> {
  const s = new Set<string>(VIEWS[instance]);
  for (const t of ALWAYS_KEEP_TABLES[instance]) s.add(t);
  if (!purgeSettings) for (const t of KEEP_SETTINGS_TABLES[instance]) s.add(t);
  return s;
}

/** Kiểm chứng: mọi FK thật phải có child ở stage <= stage của parent. */
export function verifyOrderAgainstForeignKeys(instance: InstanceId): string[] {
  const stageOf = new Map<string, number>();
  PURGE_ORDER[instance].forEach((stage, i) => stage.forEach((t) => stageOf.set(t, i)));
  const problems: string[] = [];
  for (const { child, parent } of REAL_FOREIGN_KEYS[instance]) {
    const c = stageOf.get(child);
    const p = stageOf.get(parent);
    if (c === undefined || p === undefined) continue;
    if (c > p)
      problems.push(`${instance}: ${child} (stage ${c}) phải xóa TRƯỚC ${parent} (stage ${p})`);
  }
  return problems;
}

async function countTable(inst: PurgeInstance, key: string, table: string) {
  const r = await fetch(`${inst.url}/rest/v1/${table}?select=*&limit=1`, {
    headers: headers(key, { Prefer: "count=exact", Range: "0-0" }),
  });
  const cr = r.headers.get("content-range") ?? "";
  const n = Number(cr.split("/").pop());
  return { status: r.status, count: Number.isFinite(n) ? n : null, exists: r.status < 400 };
}

async function countAuthUsers(inst: PurgeInstance, key: string) {
  let page = 1;
  let total = 0;
  let admins = 0;
  for (;;) {
    const r = await fetch(`${inst.url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: headers(key),
    });
    if (!r.ok)
      return {
        total: null as number | null,
        admins: null as number | null,
        error: `auth ${r.status}`,
      };
    const j = (await r.json()) as { users?: Array<{ email?: string }> };
    const users = j.users ?? [];
    total += users.length;
    admins += users.filter((u) => (u.email ?? "").includes("@admin.")).length;
    if (users.length < 1000) break;
    page += 1;
  }
  return { total, admins, error: null as string | null };
}

async function listBucketPaths(
  inst: PurgeInstance,
  key: string,
  bucket: string,
  prefix = "",
  depth = 0,
): Promise<string[]> {
  if (depth > 8) return [];
  const paths: string[] = [];
  let offset = 0;
  for (;;) {
    const r = await fetch(`${inst.url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      headers: headers(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix, limit: 1000, offset }),
    });
    if (!r.ok) return paths;
    const items = (await r.json()) as Array<{ name: string; id: string | null }>;
    if (!items.length) return paths;
    for (const it of items) {
      const full = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id) paths.push(full);
      else paths.push(...(await listBucketPaths(inst, key, bucket, full, depth + 1)));
    }
    if (items.length < 1000) return paths;
    offset += 1000;
  }
}

// ---------------------------------------------------------------- PHASE A

export type DryRunOptions = { purgeSettings?: boolean };

export async function dryRun(options: DryRunOptions = {}) {
  const purgeSettings = options.purgeSettings === true;
  const startedAt = new Date().toISOString();

  const instances: Array<Record<string, unknown>> = [];
  const storage: Array<Record<string, unknown>> = [];
  const warnings: string[] = [];
  let totalRows = 0;
  let totalObjects = 0;

  for (const id of INSTANCE_ORDER) {
    const inst = PURGE_INSTANCES.find((i) => i.id === id)!;
    const key = keyFor(inst);
    if (!key) {
      warnings.push(`${id}: thiếu ${inst.serviceKeyEnv} → không thể purge`);
      instances.push({ instance: id, keyAvailable: false });
      continue;
    }
    const skip = excluded(id, purgeSettings);
    const stages: Array<Record<string, unknown>> = [];
    let instRows = 0;
    for (const [i, stage] of PURGE_ORDER[id].entries()) {
      const tables: Array<Record<string, unknown>> = [];
      for (const t of stage) {
        if (skip.has(t)) {
          tables.push({ table: t, action: "KEEP (cấu hình/view)", count: null });
          continue;
        }
        const c = await countTable(inst, key, t);
        if (!c.exists) {
          tables.push({ table: t, action: "SKIP (không tồn tại)", status: c.status });
          continue;
        }
        instRows += c.count ?? 0;
        tables.push({ table: t, action: "DELETE ALL ROWS", count: c.count });
      }
      stages.push({ stage: i + 1, tables });
    }
    totalRows += instRows;
    const fkProblems = verifyOrderAgainstForeignKeys(id);
    if (fkProblems.length) warnings.push(...fkProblems);
    const auth = inst.hasAuth ? await countAuthUsers(inst, key) : null;
    instances.push({
      instance: id,
      keyAvailable: true,
      rowsToDelete: instRows,
      auth: auth
        ? { users: auth.total, adminEmails: auth.admins, error: auth.error }
        : "không dùng Auth",
      fkOrderVerified: fkProblems.length === 0,
      stages,
    });
  }

  for (const b of STORAGE_PLAN) {
    const inst = PURGE_INSTANCES.find((i) => i.id === b.instance)!;
    const key = keyFor(inst);
    if (!key) continue;
    if (b.keep) {
      storage.push({ ...b, action: "KEEP OBJECTS (giao diện)", objects: b.auditedObjects });
      continue;
    }
    const paths = await listBucketPaths(inst, key, b.bucket);
    totalObjects += paths.length;
    storage.push({
      instance: b.instance,
      bucket: b.bucket,
      purpose: b.purpose,
      objects: paths.length,
      action: paths.length ? "DELETE OBJECTS (giữ bucket)" : "NO-OP (rỗng)",
    });
  }

  const authTotal =
    (instances.find((i) => i["instance"] === "SB1") as { auth?: { users?: number } } | undefined)
      ?.auth?.users ?? null;

  const scope = canonicalScope({ purgeSettings, instances, storage });
  const scopeHash = await sha256Hex(scope);
  const token = await issueExecutionToken({ purgeSettings, scopeHash });
  if (!token.ok) {
    warnings.push(
      `Không phát hành được executionId có chữ ký (${token.reason}) → Phase B sẽ bị khoá 423 cho tới khi cấu hình đủ secret.`,
    );
  }

  return {
    phase: "A_DRY_RUN",
    mutations: "none",
    executionId: token.ok ? token.token : null,
    executionIdVerifiable: token.ok,
    scopeHash,
    startedAt,
    finishedAt: new Date().toISOString(),
    options: { purgeSettings },
    summary: {
      totalRowsToDelete: totalRows,
      totalStorageObjectsToDelete: totalObjects,
      authUsersToDelete: authTotal,
      instancesAffected: INSTANCE_ORDER,
      bucketsAffected: storage
        .filter((s) => s["action"] === "DELETE OBJECTS (giữ bucket)")
        .map((s) => `${s["instance"]}/${s["bucket"]}`),
      bucketsKept: STORAGE_PLAN.filter((b) => b.keep).map((b) => `${b.instance}/${b.bucket}`),
    },
    adminSurfaces: ADMIN_SURFACES,
    executionPlan: {
      order: [
        "STORAGE_OBJECTS",
        ...INSTANCE_ORDER.map((i) => `TABLES_${i}`),
        "ADMIN_LAST",
        "AUTH_USERS_LAST",
      ],
      instances,
      storage,
    },
    warnings,
    guards: {
      dropTable: "never",
      truncate: "never",
      deleteBucket: "never",
      rlsOrAuthConfigChange: "never",
      executeRequires: [
        "EMERGENCY_PURGE_ARMED=true",
        `confirm === "${PURGE_CONFIRM_PHRASE}"`,
        "executionId từ dry-run",
      ],
    },
  };
}

// ---------------------------------------------------------------- PHASE B

export type ExecuteRequest = { confirm: string; executionId: string; purgeSettings?: boolean };

export type ExecuteGateResult =
  { allowed: false; httpStatus: number; reason: string } | { allowed: true; payload: TokenPayload };

/**
 * executionId KHÔNG còn dựa vào in-memory state của một serverless instance.
 * Nó là một token có chữ ký HMAC-SHA256, tự mang đủ thông tin để xác minh ở
 * request Execute (kể cả khi rơi vào instance khác / instance vừa khởi động lại):
 *
 *   dryv1.<base64url(payload)>.<hmac hex>
 *   payload = { v, iat, exp, ps (purgeSettings), sh (scope hash) }
 *
 * Không lưu secret/token/cookie ở bất kỳ đâu; khoá ký chỉ đọc từ process.env.
 */
export const EXECUTION_TOKEN_TTL_MS = 30 * 60 * 1000;
const TOKEN_PREFIX = "dryv1.";

export type TokenPayload = { v: 1; iat: number; exp: number; ps: boolean; sh: string };

function signingSecret(): string | null {
  const s =
    process.env["PURGE_TOKEN_SECRET"] ??
    process.env["CRON_SECRET"] ??
    process.env["LOVABLE_CRON_SECRET"] ??
    null;
  return s && s.length >= 16 ? s : null;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  return atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Chuỗi canonical mô tả TOÀN BỘ phạm vi + count + thứ tự phụ thuộc của một lần
 * dry-run. Execute sẽ tính lại chuỗi này và so sánh hash; lệch một dòng dữ liệu
 * hay một bảng cũng làm token mất hiệu lực → 423, không mutation.
 */
export function canonicalScope(input: {
  purgeSettings: boolean;
  instances: Array<Record<string, unknown>>;
  storage: Array<Record<string, unknown>>;
}): string {
  const inst = input.instances.map((i) => {
    const stages = (i["stages"] as Array<Record<string, unknown>> | undefined) ?? [];
    return {
      instance: i["instance"],
      keyAvailable: i["keyAvailable"] ?? false,
      rowsToDelete: i["rowsToDelete"] ?? null,
      fkOrderVerified: i["fkOrderVerified"] ?? null,
      auth:
        typeof i["auth"] === "object" && i["auth"]
          ? ((i["auth"] as { users?: number | null }).users ?? null)
          : null,
      stages: stages.map((s) => ({
        stage: s["stage"],
        tables: ((s["tables"] as Array<Record<string, unknown>> | undefined) ?? []).map((t) => ({
          table: t["table"],
          action: t["action"],
          count: t["count"] ?? null,
        })),
      })),
    };
  });
  const store = input.storage.map((s) => ({
    instance: s["instance"],
    bucket: s["bucket"],
    action: s["action"],
    objects: s["objects"] ?? null,
  }));
  return JSON.stringify({ ps: input.purgeSettings, instances: inst, storage: store });
}

export async function issueExecutionToken(input: {
  purgeSettings: boolean;
  scopeHash: string;
}): Promise<{ ok: true; token: string } | { ok: false; reason: string }> {
  const secret = signingSecret();
  if (!secret) return { ok: false, reason: "thiếu PURGE_TOKEN_SECRET/CRON_SECRET trên server" };
  const now = Date.now();
  const payload: TokenPayload = {
    v: 1,
    iat: now,
    exp: now + EXECUTION_TOKEN_TTL_MS,
    ps: input.purgeSettings,
    sh: input.scopeHash,
  };
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacHex(secret, body);
  return { ok: true, token: `${TOKEN_PREFIX}${body}.${sig}` };
}

export async function verifyExecutionToken(
  token: string | undefined,
  purgeSettings: boolean,
): Promise<{ ok: true; payload: TokenPayload } | { ok: false; reason: string }> {
  const secret = signingSecret();
  if (!secret)
    return { ok: false, reason: "server không có khoá ký → không thể xác minh executionId." };
  if (!token || !token.startsWith(TOKEN_PREFIX)) {
    return { ok: false, reason: "Thiếu executionId hợp lệ từ một lần dry-run." };
  }
  const parts = token.slice(TOKEN_PREFIX.length).split(".");
  const body = parts[0];
  const sig = parts[1];
  if (parts.length !== 2 || !body || !sig)
    return { ok: false, reason: "executionId sai định dạng." };
  const expected = await hmacHex(secret, body);
  if (!timingSafeEqualHex(expected, sig))
    return { ok: false, reason: "Chữ ký executionId không hợp lệ." };
  let payload: TokenPayload;
  try {
    payload = JSON.parse(fromB64url(body)) as TokenPayload;
  } catch {
    return { ok: false, reason: "executionId không đọc được." };
  }
  if (payload.v !== 1 || typeof payload.sh !== "string" || !payload.sh) {
    return { ok: false, reason: "executionId thiếu dấu vân tay phạm vi." };
  }
  if (!Number.isFinite(payload.exp) || Date.now() > payload.exp) {
    return { ok: false, reason: "executionId đã hết hiệu lực — hãy chạy lại dry-run." };
  }
  if (payload.ps !== purgeSettings) {
    return { ok: false, reason: "Phạm vi execute không khớp dry-run đã xác nhận." };
  }
  return { ok: true, payload };
}

/**
 * Cổng an toàn Phase B — phải thỏa ĐỒNG THỜI:
 * EMERGENCY_PURGE_ARMED=true + confirm phrase + executionId có chữ ký còn hiệu lực
 * và đúng phạm vi. Mọi thất bại đều trả 423 và KHÔNG mutation.
 */
export async function checkExecuteGate(req: Partial<ExecuteRequest>): Promise<ExecuteGateResult> {
  if (process.env["EMERGENCY_PURGE_ARMED"] !== "true") {
    return {
      allowed: false,
      httpStatus: 423,
      reason: "EMERGENCY_PURGE_ARMED chưa bật — Phase B bị khoá.",
    };
  }
  if (req.confirm !== PURGE_CONFIRM_PHRASE) {
    return { allowed: false, httpStatus: 423, reason: "Thiếu hoặc sai confirm phrase." };
  }
  const v = await verifyExecutionToken(req.executionId, req.purgeSettings === true);
  if (!v.ok) return { allowed: false, httpStatus: 423, reason: v.reason };
  return { allowed: true, payload: v.payload };
}

/** Audit log tối giản: không chứa key/token/cookie/nội dung dữ liệu. */
export function auditLog(entry: {
  executionId: string;
  phase: "A_DRY_RUN" | "B_EXECUTE_BLOCKED" | "B_EXECUTE";
  status: string;
  stage?: string;
  countBefore?: number | null;
  countAfter?: number | null;
  errorCode?: string;
  detail?: string;
}) {
  console.info(
    JSON.stringify({ kind: "emergency_purge_audit", at: new Date().toISOString(), ...entry }),
  );
}

// ------------------------------------------------- Phase B: primitives

class PurgeError extends Error {
  code: string;
  stage: string;
  constructor(stage: string, code: string, message: string) {
    super(message);
    this.stage = stage;
    this.code = code;
  }
}

/** Lấy 1 cột bất kỳ của bảng để dựng filter "match mọi dòng" cho DELETE (PostgREST bắt buộc có filter). */
async function anyColumn(inst: PurgeInstance, key: string, table: string): Promise<string | null> {
  const r = await fetch(`${inst.url}/rest/v1/${table}?select=*&limit=1`, { headers: headers(key) });
  if (!r.ok) return null;
  const rows = (await r.json()) as Array<Record<string, unknown>>;
  const first = rows[0];
  if (!first) return null;
  return Object.keys(first)[0] ?? null;
}

/** DELETE toàn bộ record của 1 bảng (KHÔNG truncate, KHÔNG drop). Trả count trước/sau. */
async function deleteAllRows(inst: PurgeInstance, key: string, stage: string, table: string) {
  const before = await countTable(inst, key, table);
  if (!before.exists) return { table, skipped: "không tồn tại", status: before.status };
  if ((before.count ?? 0) === 0) return { table, countBefore: 0, countAfter: 0, action: "no-op" };

  const col = await anyColumn(inst, key, table);
  if (!col)
    throw new PurgeError(
      stage,
      "NO_COLUMN",
      `${inst.id}.${table}: không xác định được cột để filter DELETE`,
    );

  // Lặp có giới hạn (không retry vô hạn).
  for (let round = 0; round < 20; round += 1) {
    const r = await fetch(`${inst.url}/rest/v1/${table}?or=(${col}.is.null,${col}.not.is.null)`, {
      method: "DELETE",
      headers: headers(key, { Prefer: "return=minimal" }),
    });
    if (!r.ok) {
      throw new PurgeError(
        stage,
        `HTTP_${r.status}`,
        `${inst.id}.${table}: DELETE thất bại (HTTP ${r.status})`,
      );
    }
    const after = await countTable(inst, key, table);
    if ((after.count ?? 0) === 0)
      return { table, countBefore: before.count, countAfter: 0, action: "deleted" };
    if (round === 19) {
      throw new PurgeError(
        stage,
        "NOT_EMPTY",
        `${inst.id}.${table}: còn ${after.count} dòng sau nhiều lượt DELETE`,
      );
    }
  }
  return { table, countBefore: before.count, countAfter: null };
}

/** Xóa toàn bộ object của bucket theo lô, GIỮ NGUYÊN bucket. */
async function purgeBucket(inst: PurgeInstance, key: string, bucket: string) {
  const stage = `STORAGE:${inst.id}/${bucket}`;
  const paths = await listBucketPaths(inst, key, bucket);
  if (!paths.length) return { bucket, countBefore: 0, countAfter: 0, action: "no-op" };
  for (let i = 0; i < paths.length; i += 1000) {
    const batch = paths.slice(i, i + 1000);
    const r = await fetch(`${inst.url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      headers: headers(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: batch }),
    });
    if (!r.ok) {
      throw new PurgeError(
        stage,
        `HTTP_${r.status}`,
        `${inst.id}/${bucket}: xóa object thất bại (HTTP ${r.status})`,
      );
    }
  }
  const remaining = await listBucketPaths(inst, key, bucket);
  if (remaining.length) {
    throw new PurgeError(
      stage,
      "NOT_EMPTY",
      `${inst.id}/${bucket}: còn ${remaining.length} object sau khi xóa`,
    );
  }
  return { bucket, countBefore: paths.length, countAfter: 0, action: "deleted" };
}

/** Xóa từng auth user bằng Admin API (service-role, server-side). Không chạm schema auth. */
async function purgeAuthUsers(inst: PurgeInstance, key: string) {
  const stage = `AUTH:${inst.id}`;
  const before = await countAuthUsers(inst, key);
  if (before.error)
    throw new PurgeError(stage, "AUTH_LIST", `${inst.id}: không đọc được danh sách auth users`);
  let deleted = 0;
  for (let round = 0; round < 20; round += 1) {
    const r = await fetch(`${inst.url}/auth/v1/admin/users?page=1&per_page=1000`, {
      headers: headers(key),
    });
    if (!r.ok)
      throw new PurgeError(stage, `HTTP_${r.status}`, `${inst.id}: list auth users thất bại`);
    const users = ((await r.json()) as { users?: Array<{ id: string }> }).users ?? [];
    if (!users.length) break;
    for (const u of users) {
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt += 1) {
        const d = await fetch(`${inst.url}/auth/v1/admin/users/${u.id}`, {
          method: "DELETE",
          headers: headers(key),
        });
        ok = d.ok || d.status === 404;
        if (!ok && attempt === 1) {
          throw new PurgeError(
            stage,
            `HTTP_${d.status}`,
            `${inst.id}: xóa 1 auth user thất bại (HTTP ${d.status})`,
          );
        }
      }
      deleted += 1;
    }
  }
  const after = await countAuthUsers(inst, key);
  if ((after.total ?? -1) !== 0) {
    throw new PurgeError(
      stage,
      "NOT_EMPTY",
      `${inst.id}: còn ${after.total} auth user sau khi xóa`,
    );
  }
  return { countBefore: before.total, countAfter: 0, deleted };
}

// ------------------------------------------------- Phase B: orchestrator

export type ExecuteResult =
  | {
      locked: true;
      httpStatus: 423;
      reason: string;
      executionId: string;
      preflight?: Record<string, unknown>;
    }
  | { locked: false; [k: string]: unknown };

/**
 * PREFLIGHT (chỉ ĐỌC): tự kiểm tra lại toàn bộ phạm vi / count / dependency và
 * đối chiếu với dấu vân tay trong executionId. Chạy TRƯỚC mọi mutation.
 * Bất kỳ sai lệch nào → khoá (423), không xóa gì.
 */
async function preflight(
  req: ExecuteRequest,
  purgeSettings: boolean,
): Promise<
  { ok: true; scopeHash: string } | { ok: false; reason: string; detail?: Record<string, unknown> }
> {
  const verified = await verifyExecutionToken(req.executionId, purgeSettings);
  if (!verified.ok) return { ok: false, reason: verified.reason };

  // Service key phải có đủ cho MỌI instance trong phạm vi, nếu không → khoá.
  const missing = PURGE_INSTANCES.filter((i) => INSTANCE_ORDER.includes(i.id) && !keyFor(i)).map(
    (i) => i.id,
  );
  if (missing.length) {
    return {
      ok: false,
      reason: `Thiếu service-role key cho: ${missing.join(", ")} — không thể thực thi an toàn.`,
    };
  }

  // Dependency (FK) phải hợp lệ ở thời điểm execute.
  const fkProblems = INSTANCE_ORDER.flatMap((id) => verifyOrderAgainstForeignKeys(id));
  if (fkProblems.length)
    return { ok: false, reason: `Thứ tự FK không hợp lệ: ${fkProblems.join(" | ")}` };

  // Đếm lại toàn bộ (dryRun không có bất kỳ mutation nào) và so dấu vân tay.
  const recheck = await dryRun({ purgeSettings });
  if (recheck.warnings.length) {
    return {
      ok: false,
      reason: `Dry-run xác minh lại có cảnh báo: ${recheck.warnings.join(" | ")}`,
    };
  }
  if (recheck.scopeHash !== verified.payload.sh) {
    return {
      ok: false,
      reason:
        "Phạm vi/count đã thay đổi so với dry-run đã xác nhận — hãy chạy lại dry-run và xác nhận lại.",
      detail: { expected: verified.payload.sh, actual: recheck.scopeHash },
    };
  }
  return { ok: true, scopeHash: recheck.scopeHash };
}

export async function execute(req: ExecuteRequest): Promise<ExecuteResult> {
  const purgeSettings = req.purgeSettings === true;
  const executionId = req.executionId;
  const startedAt = new Date().toISOString();
  const steps: Array<Record<string, unknown>> = [];
  const log = (stage: string, status: string, extra: Record<string, unknown> = {}) => {
    auditLog({ executionId, phase: "B_EXECUTE", stage, status, ...extra });
    steps.push({ stage, status, ...extra });
  };

  const pre = await preflight(req, purgeSettings);
  if (!pre.ok) {
    auditLog({
      executionId,
      phase: "B_EXECUTE_BLOCKED",
      status: "preflight_failed",
      detail: pre.reason,
    });
    return {
      locked: true,
      httpStatus: 423,
      reason: pre.reason,
      executionId,
      ...(pre.detail ? { preflight: pre.detail } : {}),
    };
  }
  log("PREFLIGHT", "ok", { scopeHash: pre.scopeHash });

  try {
    // 1) STORAGE OBJECTS (giữ bucket; giữ object của site-branding & zalo-float-icon)
    for (const b of STORAGE_PLAN) {
      const inst = PURGE_INSTANCES.find((i) => i.id === b.instance)!;
      const key = keyFor(inst);
      const stage = `STORAGE:${b.instance}/${b.bucket}`;
      if (!key) throw new PurgeError(stage, "NO_KEY", `${b.instance}: thiếu service key`);
      if (b.keep) {
        log(stage, "kept");
        continue;
      }
      const res = await purgeBucket(inst, key, b.bucket);
      log(stage, "ok", { countBefore: res.countBefore, countAfter: res.countAfter });
    }

    // 2) TABLES theo thứ tự instance + stage (con trước cha, Admin cuối)
    for (const id of INSTANCE_ORDER) {
      const inst = PURGE_INSTANCES.find((i) => i.id === id)!;
      const key = keyFor(inst);
      if (!key) throw new PurgeError(`TABLES:${id}`, "NO_KEY", `${id}: thiếu service key`);

      const fk = verifyOrderAgainstForeignKeys(id);
      if (fk.length) throw new PurgeError(`TABLES:${id}`, "FK_ORDER", fk.join(" | "));

      const skip = excluded(id, purgeSettings);
      for (const [i, stageTables] of PURGE_ORDER[id].entries()) {
        const stage = `TABLES:${id}:stage${i + 1}`;
        for (const t of stageTables) {
          if (skip.has(t)) {
            log(`${stage}:${t}`, "kept");
            continue;
          }
          const res = await deleteAllRows(inst, key, stage, t);
          log(`${stage}:${t}`, res.skipped ? "skipped" : "ok", {
            countBefore: (res as { countBefore?: number | null }).countBefore ?? null,
            countAfter: (res as { countAfter?: number | null }).countAfter ?? null,
          });
        }
      }

      // verify lại count sau mỗi Supabase
      for (const stageTables of PURGE_ORDER[id]) {
        for (const t of stageTables) {
          if (skip.has(t)) continue;
          const c = await countTable(inst, key, t);
          if (c.exists && (c.count ?? 0) !== 0) {
            throw new PurgeError(`VERIFY:${id}`, "NOT_EMPTY", `${id}.${t}: còn ${c.count} dòng`);
          }
        }
      }
      log(`VERIFY:${id}`, "ok");
    }

    // 3) AUTH USERS — cuối cùng
    for (const inst of PURGE_INSTANCES.filter((i) => i.hasAuth)) {
      const key = keyFor(inst);
      if (!key) throw new PurgeError(`AUTH:${inst.id}`, "NO_KEY", `${inst.id}: thiếu service key`);
      const res = await purgeAuthUsers(inst, key);
      log(`AUTH:${inst.id}`, "ok", { countBefore: res.countBefore, countAfter: res.countAfter });
    }

    auditLog({ executionId, phase: "B_EXECUTE", status: "completed" });
    return {
      locked: false,
      phase: "B_EXECUTE",
      executed: true,
      completed: true,
      executionId,
      startedAt,
      finishedAt: new Date().toISOString(),
      options: { purgeSettings },
      steps,
    };
  } catch (e) {
    const err =
      e instanceof PurgeError ? e : new PurgeError("UNKNOWN", "UNEXPECTED", "Lỗi không xác định");
    auditLog({
      executionId,
      phase: "B_EXECUTE",
      stage: err.stage,
      status: "failed",
      errorCode: err.code,
    });
    return {
      locked: false,
      phase: "B_EXECUTE",
      executed: true,
      completed: false,
      stoppedAt: { stage: err.stage, errorCode: err.code, message: err.message },
      executionId,
      startedAt,
      finishedAt: new Date().toISOString(),
      options: { purgeSettings },
      steps,
    };
  }
}
