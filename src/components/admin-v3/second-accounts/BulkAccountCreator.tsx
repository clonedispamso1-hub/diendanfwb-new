// BulkAccountCreator — tạo hàng loạt tài khoản THẬT bằng đúng luồng đăng ký
// của website (RPC admin_bulk_signup → INSERT auth.users + trigger
// handle_new_user tạo profile giống hệt user thường).
// Chỉ Super Admin (đã gate ở AdminV3Shell + kiểm tra lại trong RPC).
// SQL: docs/sql/2026-08-01_bulk_signup_v5.sql
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { X, Wand2, RefreshCw, Trash2, Plus, Check, AlertCircle, Shuffle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { NAME_STYLE_OPTIONS, generateDisplayName, type NameStyle } from "@/lib/admin/display-name-styles";
import { pickVipMediaUrls } from "@/lib/vip-assets";
import { MediaItem } from "@/components/admin-v3/MediaItem";
import {
  VipMediaSourceSelector,
  DEFAULT_VIP_MEDIA_SELECTION,
  describeVipMediaSelection,
  type VipMediaSourceValue,
} from "@/components/admin-v3/vip/VipMediaSourceSelector";

const sb = supabase as any;

// -------- vault mật khẩu (local máy admin, dùng cho xuất CSV) --------
const VAULT_KEY = "fwb_internal_account_pw_v1";
function rememberPassword(username: string, password: string) {
  try {
    const v = JSON.parse(localStorage.getItem(VAULT_KEY) || "{}") || {};
    v[username.toLowerCase()] = password;
    localStorage.setItem(VAULT_KEY, JSON.stringify(v));
  } catch { /* quota */ }
}

// -------------------------- random helpers --------------------------
export const PROVINCES = [
  "Hà Nội", "Hồ Chí Minh", "Đà Nẵng", "Hải Phòng", "Cần Thơ",
  "Bình Dương", "Đồng Nai", "Khánh Hòa", "Nghệ An", "Thanh Hóa",
  "Quảng Ninh", "Bắc Ninh", "Lâm Đồng", "Huế", "Vũng Tàu",
];

function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomGender(): "male" | "female" { return Math.random() < 0.5 ? "male" : "female"; }
function randomAge() { return randInt(18, 39); }

/** 0000005551 → 0000005552 (giữ nguyên độ dài / số 0 ở đầu). */
function incrementUsername(base: string, offset: number): string {
  const m = base.match(/^(.*?)(\d+)$/);
  if (!m) return offset === 0 ? base : `${base}${offset + 1}`;
  const [, prefix, digits] = m;
  const next = (BigInt(digits) + BigInt(offset)).toString();
  return prefix + next.padStart(digits.length, "0");
}

export type BulkRow = {
  key: string;
  username: string;
  password: string;
  gender: "male" | "female";
  province: string;
  age: number;
  avatar_url: string;
  full_name: string;
  followers: string;
  following: string;
  profile_gif: string;
  created_at: string; // yyyy-MM-ddTHH:mm
  taken?: boolean;
  status?: "ok" | "error";
  error?: string;
};

let seq = 0;
function makeRow(index: number, opts: {
  base: string; password: string;
  gender: "male" | "female" | "random";
  province: string | "random";
  nameStyle: NameStyle;
}): BulkRow {
  const g = opts.gender === "random" ? randomGender() : opts.gender;
  return {
    key: `r${++seq}`,
    username: opts.base ? incrementUsername(opts.base, index) : "",
    password: opts.password,
    gender: g,
    province: opts.province === "random" ? pick(PROVINCES) : opts.province,
    age: randomAge(),
    avatar_url: "",
    full_name: generateDisplayName(opts.nameStyle, g),
    followers: "",
    following: "",
    profile_gif: "",
    created_at: "",
  };
}

// ------------------------------ component ------------------------------
export function BulkAccountCreator({
  onClose,
  onDone,
  title = "Tạo tài khoản hàng loạt",
  subtitle = "Dùng đúng luồng đăng ký của website — tài khoản hoạt động như user thường.",
  onCreatedUsernames,
}: {
  onClose: () => void;
  onDone: () => void;
  title?: string;
  subtitle?: string;
  /** Gọi sau khi tạo xong, nhận danh sách username tạo thành công. */
  onCreatedUsernames?: (usernames: string[]) => Promise<void> | void;
}) {
  const [count, setCount] = useState(5);
  const [base, setBase] = useState("");
  const [sharedPassword, setSharedPassword] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "random">("random");
  const [province, setProvince] = useState<string>("random");
  const [nameStyle, setNameStyle] = useState<NameStyle>("two_words");
  const [showBuff, setShowBuff] = useState(false);
  // Nguồn Media VIP khi tạo Account — Random toàn bộ / theo thư mục / chọn bằng tay
  const [gifSel, setGifSel] = useState<VipMediaSourceValue>(DEFAULT_VIP_MEDIA_SELECTION);
  const [gifPickerOpen, setGifPickerOpen] = useState(false);
  const [gifBusy, setGifBusy] = useState(false);
  const [rows, setRows] = useState<BulkRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);


  /** Random 1 Media VIP (từ Quản Lý Icon VIP) cho mỗi dòng. */
  const randomizeGifs = useCallback(async () => {
    if (!rows.length) { toast.error("Chưa có dòng nào"); return; }
    setGifBusy(true);
    try {
      const urls = await pickVipMediaUrls(rows.length, gifSel);
      setRows((rs) => rs.map((r, i) => ({ ...r, profile_gif: urls[i] ?? r.profile_gif })));
      setShowBuff(true);
      toast.success(`Đã random Media VIP cho ${rows.length} tài khoản`);
    } catch (e: any) {
      toast.error(e?.message || "Không random được Media VIP");
    } finally { setGifBusy(false); }
  }, [rows.length, gifSel]);

  const generate = useCallback(() => {
    const n = Math.max(1, Math.min(200, count || 1));
    setRows(Array.from({ length: n }, (_, i) =>
      makeRow(i, { base: base.trim(), password: sharedPassword, gender, province, nameStyle })));
  }, [count, base, sharedPassword, gender, province, nameStyle]);

  function patch(key: string, p: Partial<BulkRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }

  // Áp password chung cho mọi dòng (vẫn cho sửa từng dòng sau đó).
  function applySharedPassword() {
    setRows((rs) => rs.map((r) => ({ ...r, password: sharedPassword })));
  }

  // Validate username tức thời (debounce) qua RPC admin_check_usernames.
  useEffect(() => {
    if (checkTimer.current) clearTimeout(checkTimer.current);
    const names = rows.map((r) => r.username.trim()).filter(Boolean);
    if (!names.length) return;
    checkTimer.current = setTimeout(async () => {
      try {
        const { data, error } = await sb.rpc("admin_check_usernames", { p_usernames: names });
        if (error) throw error;
        const takenSet = new Set(
          (data ?? []).filter((d: any) => d.taken).map((d: any) => String(d.username).toLowerCase()),
        );
        setRows((rs) => rs.map((r) => ({ ...r, taken: takenSet.has(r.username.trim().toLowerCase()) })));
      } catch { /* im lặng — vẫn kiểm tra lại ở server khi tạo */ }
    }, 500);
    return () => { if (checkTimer.current) clearTimeout(checkTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.map((r) => r.username).join("|")]);

  const dupes = useMemo(() => {
    const seen = new Map<string, number>();
    rows.forEach((r) => {
      const u = r.username.trim().toLowerCase();
      if (u) seen.set(u, (seen.get(u) ?? 0) + 1);
    });
    return new Set(Array.from(seen.entries()).filter(([, n]) => n > 1).map(([u]) => u));
  }, [rows]);

  function rowError(r: BulkRow): string | null {
    const u = r.username.trim();
    if (!u) return "Thiếu username";
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(u)) return "Username không hợp lệ (3–32, chữ/số/._-)";
    if (dupes.has(u.toLowerCase())) return "Trùng trong danh sách";
    if (r.taken) return "Username đã tồn tại";
    if ((r.password || "").length < 6) return "Mật khẩu ≥ 6 ký tự";
    return null;
  }

  const invalidCount = rows.filter((r) => rowError(r)).length;

  async function create() {
    if (!rows.length) { toast.error("Chưa có dòng nào"); return; }
    if (invalidCount) { toast.error(`${invalidCount} dòng chưa hợp lệ`); return; }
    setBusy(true);
    setProgress({ done: 0, total: rows.length });
    const CHUNK = 10;
    let ok = 0;
    const createdNames: string[] = [];
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const slice = rows.slice(i, i + CHUNK);
        const payload = slice.map((r) => ({
          username: r.username.trim(),
          password: r.password,
          full_name: r.full_name.trim() || null,
          avatar_url: r.avatar_url.trim() || null,
          gender: r.gender,
          province: r.province || null,
          age: r.age || null,
          followers: r.followers === "" ? null : Number(r.followers),
          following: r.following === "" ? null : Number(r.following),
          profile_gif: r.profile_gif.trim() || null,
          created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
        }));
        const { data, error } = await sb.rpc("admin_bulk_signup", { p_rows: payload });
        if (error) throw error;
        const res: any[] = Array.isArray(data) ? data : [];
        setRows((rs) => rs.map((r) => {
          const hit = res.find((x) => String(x.username).toLowerCase() === r.username.trim().toLowerCase());
          if (!hit) return r;
          return { ...r, status: hit.ok ? "ok" : "error", error: hit.ok ? undefined : hit.error };
        }));
        slice.forEach((r) => {
          const hit = res.find((x) => String(x.username).toLowerCase() === r.username.trim().toLowerCase());
          if (hit?.ok) { ok++; createdNames.push(r.username.trim()); rememberPassword(r.username.trim(), r.password); }
        });
        setProgress({ done: Math.min(i + CHUNK, rows.length), total: rows.length });
      }
      if (ok) toast.success(`Đã tạo ${ok}/${rows.length} tài khoản thật`);
      if (ok < rows.length) toast.error(`${rows.length - ok} dòng lỗi — xem cột trạng thái`);
      if (createdNames.length && onCreatedUsernames) await onCreatedUsernames(createdNames);
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Tạo thất bại");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 grid place-items-center p-3" onClick={onClose}>
      <div
        className="bg-background rounded-xl border shadow-xl w-full max-w-6xl max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <div className="font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
          <button onClick={onClose} className="admv3-btn admv3-btn-ghost admv3-btn-icon"><X size={16} /></button>
        </div>

        {/* Thanh cấu hình */}
        <div className="p-4 border-b grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
          <L label="Số lượng">
            <input type="number" min={1} max={200} className="admv3-input" value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(200, +e.target.value || 1)))} />
          </L>
          <L label="Username bắt đầu (tự tăng)">
            <input className="admv3-input" value={base} placeholder="0000005551"
              onChange={(e) => setBase(e.target.value)} />
          </L>
          <L label="Mật khẩu chung">
            <div className="flex gap-1">
              <input className="admv3-input flex-1" value={sharedPassword} placeholder="≥ 6 ký tự"
                onChange={(e) => setSharedPassword(e.target.value)} />
              <button className="admv3-btn admv3-btn-ghost" title="Áp cho tất cả dòng"
                onClick={applySharedPassword} disabled={!rows.length}><RefreshCw size={14} /></button>
            </div>
          </L>
          <L label="Giới tính">
            <select className="admv3-input" value={gender} onChange={(e) => setGender(e.target.value as any)}>
              <option value="random">Random</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
            </select>
          </L>
          <L label="Khu vực">
            <select className="admv3-input" value={province} onChange={(e) => setProvince(e.target.value)}>
              <option value="random">Random</option>
              {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </L>
          <L label="Kiểu tên hiển thị">
            <select
              className="admv3-input"
              value={nameStyle}
              onChange={(e) => setNameStyle(e.target.value as NameStyle)}
            >
              {NAME_STYLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </L>
          <div className="flex items-end gap-2">
            <button className="admv3-btn w-full" onClick={generate} disabled={busy}>
              <Wand2 size={14} /> Tạo bảng
            </button>
          </div>
        </div>

        {/* Bảng dòng */}
        <div className="flex-1 overflow-auto p-4">
          {!rows.length ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              Nhập số lượng + username bắt đầu rồi bấm “Tạo bảng”.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs flex items-center gap-1.5">
                  <input type="checkbox" checked={showBuff} onChange={(e) => setShowBuff(e.target.checked)} />
                  Hiện cột buff (Followers / Following / GIF / Ngày tạo)
                </label>
                <div className="flex items-center gap-2 ml-auto mr-2">
                  <button
                    className="admv3-btn admv3-btn-ghost text-xs"
                    onClick={() => setGifPickerOpen((v) => !v)}
                    title="Chọn Nguồn Media VIP để random"
                  >
                    {describeVipMediaSelection(gifSel)}
                  </button>
                  <button
                    className="admv3-btn admv3-btn-ghost"
                    onClick={randomizeGifs}
                    disabled={busy || gifBusy}
                    title="Mỗi tài khoản một Media VIP random"
                  >
                    <Shuffle size={14} /> Random Media VIP
                  </button>
                </div>
                <button className="admv3-btn admv3-btn-ghost" disabled={busy}
                  onClick={() => setRows((rs) => [...rs, makeRow(rs.length, {
                    base: base.trim(), password: sharedPassword, gender, province, nameStyle,
                  })])}>
                  <Plus size={14} /> Thêm dòng
                </button>
              </div>

              {gifPickerOpen && (
                <div className="mb-3 rounded-lg border p-3 bg-card">
                                    <VipMediaSourceSelector value={gifSel} onChange={setGifSel} compact />
                </div>
              )}

              <table className="w-full text-sm">
                <thead className="text-[11px] uppercase text-muted-foreground border-b">
                  <tr>
                    <th className="px-2 py-2 w-8">#</th>
                    <th className="text-left px-2 py-2">Username</th>
                    <th className="text-left px-2 py-2">Mật khẩu</th>
                    <th className="text-left px-2 py-2">Tên hiển thị</th>
                    <th className="text-left px-2 py-2">Giới tính</th>
                    <th className="text-left px-2 py-2">Khu vực</th>
                    <th className="text-left px-2 py-2 w-16">Tuổi</th>
                    <th className="text-left px-2 py-2">Avatar URL</th>
                    {showBuff && <>
                      <th className="text-left px-2 py-2 w-20">FL</th>
                      <th className="text-left px-2 py-2 w-20">FLW</th>
                      <th className="text-left px-2 py-2">GIF</th>
                      <th className="text-left px-2 py-2">Ngày tạo</th>
                    </>}
                    <th className="text-left px-2 py-2">Trạng thái</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const err = rowError(r);
                    return (
                      <tr key={r.key} className="border-b align-top">
                        <td className="px-2 py-1 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1">
                          <input className={`admv3-input w-40 ${err ? "border-red-500" : ""}`} value={r.username}
                            onChange={(e) => patch(r.key, { username: e.target.value, taken: undefined })} />
                        </td>
                        <td className="px-2 py-1">
                          <input className="admv3-input w-32" value={r.password}
                            onChange={(e) => patch(r.key, { password: e.target.value })} />
                        </td>
                        <td className="px-2 py-1">
                          <input className="admv3-input w-40" value={r.full_name}
                            onChange={(e) => patch(r.key, { full_name: e.target.value })} />
                        </td>
                        <td className="px-2 py-1">
                          <select className="admv3-input w-24" value={r.gender}
                            onChange={(e) => patch(r.key, { gender: e.target.value as any })}>
                            <option value="male">Nam</option>
                            <option value="female">Nữ</option>
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <select className="admv3-input w-32" value={r.province}
                            onChange={(e) => patch(r.key, { province: e.target.value })}>
                            {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1">
                          <input type="number" min={18} max={70} className="admv3-input w-16" value={r.age}
                            onChange={(e) => patch(r.key, { age: +e.target.value || 18 })} />
                        </td>
                        <td className="px-2 py-1">
                          <input className="admv3-input w-48" placeholder="https://… (trống = mặc định)"
                            value={r.avatar_url}
                            onChange={(e) => patch(r.key, { avatar_url: e.target.value })} />
                        </td>
                        {showBuff && <>
                          <td className="px-2 py-1">
                            <input type="number" min={0} className="admv3-input w-20" value={r.followers}
                              onChange={(e) => patch(r.key, { followers: e.target.value })} />
                          </td>
                          <td className="px-2 py-1">
                            <input type="number" min={0} className="admv3-input w-20" value={r.following}
                              onChange={(e) => patch(r.key, { following: e.target.value })} />
                          </td>
                          <td className="px-2 py-1">
                            <div className="flex items-center gap-1.5">
                              <div className="h-9 w-9 shrink-0 grid place-items-center rounded border bg-muted/40 overflow-hidden">
                                {r.profile_gif ? (
                                  <MediaItem
                                    url={r.profile_gif}
                                    alt="GIF"
                                    style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                                  />
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </div>
                              <input className="admv3-input w-40" placeholder="https://….gif / .webm" value={r.profile_gif}
                                onChange={(e) => patch(r.key, { profile_gif: e.target.value })} />
                              {r.profile_gif ? (
                                <button type="button" className="admv3-btn admv3-btn-ghost admv3-btn-icon"
                                  title="Xoá GIF dòng này"
                                  onClick={() => patch(r.key, { profile_gif: "" })}>
                                  <X size={13} />
                                </button>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-2 py-1">
                            <input type="datetime-local" className="admv3-input w-44" value={r.created_at}
                              onChange={(e) => patch(r.key, { created_at: e.target.value })} />
                          </td>
                        </>}
                        <td className="px-2 py-1 text-xs">
                          {r.status === "ok" ? (
                            <span className="text-emerald-600 inline-flex items-center gap-1"><Check size={12} /> Đã tạo</span>
                          ) : r.status === "error" ? (
                            <span className="text-red-500 inline-flex items-center gap-1"><AlertCircle size={12} /> {r.error}</span>
                          ) : err ? (
                            <span className="text-red-500 inline-flex items-center gap-1"><AlertCircle size={12} /> {err}</span>
                          ) : (
                            <span className="text-muted-foreground">Sẵn sàng</span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Xóa dòng" disabled={busy}
                            onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="p-4 border-t flex items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground">
            {rows.length} dòng{invalidCount ? ` • ${invalidCount} dòng lỗi` : ""}
            {progress ? ` • đã xử lý ${progress.done}/${progress.total}` : ""}
          </div>
          <div className="flex gap-2">
            <button className="admv3-btn admv3-btn-ghost" onClick={onClose} disabled={busy}>Đóng</button>
            <button className="admv3-btn" onClick={create} disabled={busy || !rows.length || invalidCount > 0}>
              {busy ? "Đang tạo…" : `Tạo ${rows.length} tài khoản`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
