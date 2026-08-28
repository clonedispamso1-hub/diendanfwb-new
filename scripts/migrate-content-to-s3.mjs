#!/usr/bin/env node
/**
 * Copy dữ liệu nội dung Supabase 1 -> Supabase 3 qua Data API (service_role),
 * rồi đối chiếu số record.
 *
 * Yêu cầu ENV (KHÔNG commit key vào repo):
 *   S1_URL, S1_SERVICE_KEY   -> Supabase 1 (zbuwddjcqdlyijcunwgd)
 *   S3_URL, S3_SERVICE_KEY   -> Supabase 3 (uaqsetfdciyzxpuhulux)
 *
 * Chạy:  node scripts/migrate-content-to-s3.mjs [--tables posts,comments] [--dry]
 *
 * An toàn: chỉ ĐỌC ở Supabase 1, chỉ upsert (on_conflict=id) ở Supabase 3.
 * Không xoá gì ở cả hai bên. Chạy lại nhiều lần không nhân đôi dữ liệu.
 */
const TABLES = ["posts", "comments", "likes", "follows", "messages"];
const PAGE = 500;

const need = (n) => {
  const v = process.env[n];
  if (!v) {
    console.error(`Thiếu biến môi trường ${n}`);
    process.exit(1);
  }
  return v;
};

const S1 = { url: need("S1_URL").replace(/\/$/, ""), key: need("S1_SERVICE_KEY") };
const S3 = { url: need("S3_URL").replace(/\/$/, ""), key: need("S3_SERVICE_KEY") };

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const only = (() => {
  const i = args.indexOf("--tables");
  return i >= 0 && args[i + 1] ? args[i + 1].split(",").map((s) => s.trim()) : TABLES;
})();

const headers = (db, extra = {}) => ({
  apikey: db.key,
  Authorization: `Bearer ${db.key}`,
  "Content-Type": "application/json",
  ...extra,
});

async function count(db, table) {
  const res = await fetch(`${db.url}/rest/v1/${table}?select=id`, {
    headers: headers(db, { Prefer: "count=exact", Range: "0-0" }),
  });
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
  const range = res.headers.get("content-range") || "*/0";
  return { ok: true, total: Number(range.split("/")[1] || 0) };
}

async function page(db, table, offset) {
  const res = await fetch(
    `${db.url}/rest/v1/${table}?select=*&order=id.asc&offset=${offset}&limit=${PAGE}`,
    { headers: headers(db) },
  );
  if (!res.ok) throw new Error(`đọc ${table} lỗi: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Lọc cột lạ: chỉ giữ cột có thật ở Supabase 3 (tránh lỗi PGRST204). */
let allowed = {};
try {
  allowed = JSON.parse(process.env.S3_COLUMNS_JSON || "{}");
} catch {
  allowed = {};
}
function project(table, rows) {
  const cols = allowed[table];
  if (!Array.isArray(cols) || !cols.length) return rows;
  const set = new Set(cols);
  return rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => set.has(k))));
}

async function upsert(db, table, rows) {
  const res = await fetch(`${db.url}/rest/v1/${table}?on_conflict=id`, {
    method: "POST",
    headers: headers(db, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`ghi ${table} lỗi: ${res.status} ${await res.text()}`);
}

const report = [];

for (const table of only) {
  const src = await count(S1, table);
  if (!src.ok) {
    console.log(`⚠ ${table}: không đọc được ở Supabase 1 -> ${src.error}`);
    report.push({ table, s1: "?", s3: "?", status: "SKIP" });
    continue;
  }
  console.log(`\n▶ ${table}: Supabase 1 có ${src.total} record`);
  if (!dry) {
    for (let off = 0; off < src.total; off += PAGE) {
      const rows = await page(S1, table, off);
      if (!rows.length) break;
      await upsert(S3, table, project(table, rows));
      process.stdout.write(`  ...${Math.min(off + rows.length, src.total)}/${src.total}\r`);
    }
    console.log("");
  }
  const dst = await count(S3, table);
  const status = dst.ok && dst.total >= src.total ? "OK" : "LỆCH";
  console.log(`  Supabase 3: ${dst.ok ? dst.total : dst.error} -> ${status}`);
  report.push({ table, s1: src.total, s3: dst.ok ? dst.total : "lỗi", status });
}

console.log("\n=== ĐỐI CHIẾU ===");
console.table(report);
const bad = report.filter((r) => r.status !== "OK");
if (bad.length) {
  console.error("Chưa khớp hoàn toàn — KHÔNG được đổi code sang db3() cho các bảng trên.");
  process.exit(1);
}
console.log("Tất cả bảng khớp số record. Có thể chuyển code sang db3().");
