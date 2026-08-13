// CRM khách hàng — 3 tab: Chưa mua · Đã mua · Thu Chi
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, RefreshCw, Search, Trash2, Pencil, Check, X, Eye, AlertTriangle,
  User, Phone, MessageCircle, Link2, Facebook, MapPin, Wallet, Tag, StickyNote,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { VN_PROVINCES } from "@/lib/vn-provinces";
import { AdminGuideModal } from "./AdminGuideModal";
import { SearchableSelect } from "./SearchableSelect";

import "@/styles/admin-stats-crm.css";
import "@/styles/admin-crm-v2.css";

const sb: any = supabase;

const nf = new Intl.NumberFormat("vi-VN");
const money = (n: any) => `${nf.format(Number(n) || 0)} đ`;
const date = (v?: string | null) => (v ? new Date(v).toLocaleDateString("vi-VN") : "—");

export interface Customer {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  zalo_name: string | null;
  facebook_url: string | null;
  facebook_name: string | null;
  region: string | null;
  package_price: number | null;
  status: string;
  purchased_at: string | null;
  approved_by: string | null;
  note: string | null;
  created_at: string;
}
interface Expense {
  id: string;
  title: string;
  amount: number;
  spent_at: string;
  note: string | null;
}

const normPhone = (p: string) => p.replace(/[^\d+]/g, "");
const normFb = (u: string) =>
  u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/^fb\.com/, "facebook.com").replace(/\/+$/, "");

type RangeKey = "today" | "yesterday" | "7d" | "30d" | "month" | "lastmonth" | "year" | "custom";

function rangeBounds(key: RangeKey, from?: string, to?: string): [Date, Date] {
  const now = new Date();
  const s = new Date(now); s.setHours(0, 0, 0, 0);
  const e = new Date(now); e.setHours(23, 59, 59, 999);
  switch (key) {
    case "today": return [s, e];
    case "yesterday": { const a = new Date(s); a.setDate(a.getDate() - 1); const b = new Date(a); b.setHours(23, 59, 59, 999); return [a, b]; }
    case "7d": { const a = new Date(s); a.setDate(a.getDate() - 6); return [a, e]; }
    case "30d": { const a = new Date(s); a.setDate(a.getDate() - 29); return [a, e]; }
    case "month": return [new Date(now.getFullYear(), now.getMonth(), 1), e];
    case "lastmonth": return [new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)];
    case "year": return [new Date(now.getFullYear(), 0, 1), e];
    case "custom": return [from ? new Date(from) : new Date(2000, 0, 1), to ? new Date(`${to}T23:59:59`) : e];
  }
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Hôm nay" },
  { key: "yesterday", label: "Hôm qua" },
  { key: "7d", label: "7 ngày" },
  { key: "30d", label: "30 ngày" },
  { key: "month", label: "Tháng này" },
  { key: "lastmonth", label: "Tháng trước" },
  { key: "year", label: "Năm nay" },
  { key: "custom", label: "Tùy chọn" },
];

export function CrmManager() {
  const [tab, setTab] = useState<"unpaid" | "paid" | "finance">("unpaid");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [guideRegion, setGuideRegion] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);


  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [c, e] = await Promise.all([
      sb.from("crm_customers")
        .select("id, code, name, phone, zalo_name, facebook_url, facebook_name, region, package_price, status, purchased_at, approved_by, note, created_at")
        .order("created_at", { ascending: false }).limit(2000),
      sb.from("crm_expenses").select("id, title, amount, spent_at, note").order("spent_at", { ascending: false }).limit(2000),
    ]);
    if (c.error) setErr(c.error.message);
    setCustomers((c.data as Customer[]) ?? []);
    setExpenses((e.data as Expense[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return customers;
    const ph = normPhone(s);
    return customers.filter((c) =>
      [c.name, c.code, c.zalo_name, c.facebook_name, c.region, c.note].some((f) => (f ?? "").toLowerCase().includes(s)) ||
      (c.facebook_url ?? "").toLowerCase().includes(normFb(s)) ||
      (ph.length >= 3 && normPhone(c.phone ?? "").includes(ph)),
    );
  }, [customers, q]);

  const unpaid = filtered.filter((c) => c.status !== "paid");
  const paid = filtered.filter((c) => c.status === "paid");

  const remove = async (c: Customer) => {
    if (!confirm(`Xóa khách hàng ${c.name}?`)) return;
    const { error } = await sb.from("crm_customers").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Đã xóa khách hàng");
    void load();
  };

  const approve = async (c: Customer) => {
    const { error } = await sb
      .from("crm_customers")
      .update({ status: "paid", purchased_at: new Date().toISOString(), approved_by: "Admin" })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(`Đã duyệt ${c.name} → Đã mua`);
    void load();
  };

  const wipeAll = async () => {
    const { error } = await sb.from("crm_customers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) return toast.error(error.message);
    setConfirmWipe(false);
    toast.success("Đã xóa toàn bộ dữ liệu CRM.");
    void load();
  };

  return (
    <div className="admv3-page crm2">
      <div className="admv3-page-header">
        <div>
          <h1 className="admv3-page-title">CRM khách hàng</h1>
          <p className="admv3-page-sub">Quản lý khách · duyệt đơn · thu chi &amp; lợi nhuận</p>
        </div>
        <button className="crm2-btn" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "Đang tải…" : "Làm mới"}
        </button>
      </div>

      {err && (
        <div className="crm2-hint err" style={{ marginBottom: 10 }}>
          Không đọc được dữ liệu CRM ({err}). Hãy chạy file <code>docs/sql/2026-07-29_crm_customers.sql</code> trong SQL Editor.
        </div>
      )}

      <div className="crm2-card">
        <div className="crm2-toolbar">
          <div className="crm2-tabs">
            {(["unpaid", "paid", "finance"] as const).map((k) => (
              <button key={k} className={`crm2-tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>
                {k === "unpaid" ? `Chưa mua (${unpaid.length})` : k === "paid" ? `Đã mua (${paid.length})` : "Thu Chi"}
              </button>
            ))}
          </div>

          {tab !== "finance" && (
            <div className="crm2-search">
              <Search size={15} style={{ opacity: 0.55 }} />
              <input
                placeholder="Tìm theo SĐT · Tên khách · Mã KH · Facebook · Tên Zalo"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          )}

          {tab !== "finance" && (
            <>
              <button className="crm2-btn primary" onClick={() => { setEditing(null); setShowForm(true); }}>
                <Plus size={15} /> Thêm khách hàng
              </button>
              <button className="crm2-btn danger" onClick={() => setConfirmWipe(true)}>
                <Trash2 size={15} /> Xóa toàn bộ CRM
              </button>
            </>
          )}

          <button className="crm2-btn" onClick={() => { setGuideRegion(null); setShowGuide(true); }}>
            <Eye size={15} /> Hướng dẫn Admin
          </button>
        </div>
      </div>

      {showForm && (
        <CustomerForm
          existing={customers}
          editing={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSaved={() => { setShowForm(false); setEditing(null); void load(); }}
        />
      )}

      {tab === "unpaid" && (
        <div className="crm2-card crm2-scroll">
          <table className="crm2-table">
            <thead>
              <tr>
                <th>Mã KH</th><th>Tên khách</th><th>SĐT</th><th>Tên Zalo</th><th>Facebook</th>
                <th>Tên Facebook</th><th>Khu vực</th><th>Ngày tạo</th><th>Giá gói</th><th>Trạng thái</th><th></th>
              </tr>
            </thead>
            <tbody>
              {unpaid.map((c) => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.phone || "—"}</td>
                  <td>{c.zalo_name || "—"}</td>
                  <td>{c.facebook_url ? <a href={c.facebook_url} target="_blank" rel="noreferrer">link</a> : "—"}</td>
                  <td>{c.facebook_name || "—"}</td>
                  <td>{c.region || "—"}</td>
                  <td>{date(c.created_at)}</td>
                  <td>{money(c.package_price)}</td>
                  <td><span className="crm2-pill unpaid">Chưa mua</span></td>
                  <td>
                    <div className="crm2-row-actions">
                      <button className="crm2-btn sm" onClick={() => { setGuideRegion(c.region); setShowGuide(true); }}><Eye size={12} /> Hướng dẫn</button>
                      <button className="crm2-btn sm" onClick={() => { setEditing(c); setShowForm(true); }}><Pencil size={12} /> Sửa</button>
                      <button className="crm2-btn sm ok" onClick={() => void approve(c)}><Check size={12} /> Duyệt</button>
                      <button className="crm2-btn sm danger" onClick={() => void remove(c)}><Trash2 size={12} /> Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {unpaid.length === 0 && <div className="crm2-empty">Chưa có khách hàng nào.</div>}
        </div>
      )}

      {tab === "paid" && (
        <div className="crm2-card crm2-scroll">
          <table className="crm2-table">
            <thead>
              <tr>
                <th>Mã KH</th><th>Tên khách</th><th>SĐT</th><th>Tên Facebook</th><th>Link Facebook</th>
                <th>Khu vực</th><th>Ngày mua</th><th>Giá</th><th>Admin duyệt</th><th>Ghi chú</th><th></th>
              </tr>
            </thead>
            <tbody>
              {paid.map((c) => (
                <tr key={c.id}>
                  <td>{c.code}</td>
                  <td>{c.name}</td>
                  <td>{c.phone || "—"}</td>
                  <td>{c.facebook_name || "—"}</td>
                  <td>{c.facebook_url ? <a href={c.facebook_url} target="_blank" rel="noreferrer">link</a> : "—"}</td>
                  <td>{c.region || "—"}</td>
                  <td>{date(c.purchased_at)}</td>
                  <td>{money(c.package_price)}</td>
                  <td>{c.approved_by || "—"}</td>
                  <td style={{ whiteSpace: "normal", maxWidth: 220 }}>{c.note || "—"}</td>
                  <td>
                    <div className="crm2-row-actions">
                      <button className="crm2-btn sm" onClick={() => { setGuideRegion(c.region); setShowGuide(true); }}><Eye size={12} /> Hướng dẫn</button>
                      <button className="crm2-btn sm" onClick={() => { setEditing(c); setShowForm(true); }}><Pencil size={12} /> Sửa</button>
                      <button className="crm2-btn sm danger" onClick={() => void remove(c)}><Trash2 size={12} /> Xóa</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {paid.length === 0 && <div className="crm2-empty">Chưa có khách đã mua.</div>}
        </div>
      )}

      {tab === "finance" && <FinanceTab customers={customers} expenses={expenses} reload={load} />}

      <MiniDashboard customers={customers} expenses={expenses} />

      {showGuide && <AdminGuideModal region={guideRegion} onClose={() => setShowGuide(false)} />}

      {confirmWipe && (
        <div className="crm2-overlay" onClick={() => setConfirmWipe(false)}>
          <div className="crm2-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="crm2-confirm-title">
              <AlertTriangle size={18} color="#f87171" /> Xóa toàn bộ CRM?
            </div>
            <div className="crm2-confirm-text">
              Nếu xóa sẽ mất toàn bộ dữ liệu CRM. Bạn có chắc chắn không?
              <br />
              (Chỉ xóa danh sách khách hàng CRM — không ảnh hưởng thành viên, bài viết hay tài khoản đăng nhập.)
            </div>
            <div className="crm2-confirm-actions">
              <button className="crm2-btn" onClick={() => setConfirmWipe(false)}>Hủy</button>
              <button className="crm2-btn danger-solid" onClick={() => void wipeAll()}>
                <Trash2 size={14} /> Xóa toàn bộ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= Form thêm/sửa khách hàng ================= */

function CustomerForm({
  existing, editing, onClose, onSaved,
}: { existing: Customer[]; editing: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: editing?.name ?? "",
    phone: (editing?.phone ?? "").replace(/\D/g, "").slice(0, 10),
    zalo_name: editing?.zalo_name ?? "",
    facebook_url: editing?.facebook_url ?? "",
    facebook_name: editing?.facebook_name ?? "",
    region: editing?.region ?? "",
    package_price: String(editing?.package_price ?? ""),
    status: editing?.status ?? "unpaid",
    note: editing?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const others = existing.filter((c) => c.id !== editing?.id);

  const phoneDupe = useMemo(() => {
    const p = f.phone;
    if (p.length !== 10) return null;
    return others.find((c) => normPhone(c.phone ?? "").slice(-10) === p) ?? null;
  }, [f.phone, others]);

  const fbDupe = useMemo(() => {
    const u = normFb(f.facebook_url);
    if (u.length < 6) return null;
    return others.find((c) => normFb(c.facebook_url ?? "") === u) ?? null;
  }, [f.facebook_url, others]);

  const zaloDupe = useMemo(() => {
    const z = f.zalo_name.trim().toLowerCase();
    if (!z) return null;
    return others.find((c) => (c.zalo_name ?? "").trim().toLowerCase() === z) ?? null;
  }, [f.zalo_name, others]);

  const phoneLenOk = f.phone.length === 10;
  const phoneOk = phoneLenOk && !phoneDupe;

  const save = async () => {
    if (!f.name.trim()) return toast.error("Vui lòng nhập tên khách");
    if (!phoneLenOk) return toast.error("Số điện thoại phải gồm đúng 10 chữ số.");
    if (phoneDupe) return toast.error("Số điện thoại đã tồn tại, không thể lưu trùng");
    setSaving(true);
    const payload = {
      name: f.name.trim(),
      phone: f.phone || null,
      zalo_name: f.zalo_name.trim() || null,
      facebook_url: f.facebook_url.trim() || null,
      facebook_name: f.facebook_name.trim() || null,
      region: f.region.trim() || null,
      package_price: Number(String(f.package_price).replace(/[^\d]/g, "")) || 0,
      status: f.status,
      note: f.note.trim() || null,
      ...(f.status === "paid" && !editing?.purchased_at ? { purchased_at: new Date().toISOString(), approved_by: "Admin" } : {}),
    };
    const { error } = editing
      ? await sb.from("crm_customers").update(payload).eq("id", editing.id)
      : await sb.from("crm_customers").insert(payload);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Đã cập nhật khách hàng" : "Đã thêm khách hàng");
    onSaved();
  };

  return (
    <div className="crm2-card">
      <div className="crm2-card-head">
        <div>
          <div className="crm2-card-title">{editing ? `Sửa khách hàng ${editing.code ?? ""}` : "Thêm khách hàng mới"}</div>
          <div className="crm2-card-sub">Điền đầy đủ thông tin để tiện chăm sóc &amp; chốt khách</div>
        </div>
        <button className="crm2-btn ghost sm" onClick={onClose}><X size={14} /> Đóng</button>
      </div>

      <div className="crm2-form-grid">
        <div className="crm2-field">
          <label className="crm2-label"><User size={13} /> Tên khách *</label>
          <input className="crm2-input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Nguyễn Văn A" />
        </div>

        <div className="crm2-field">
          <label className="crm2-label"><Phone size={13} /> Số điện thoại *</label>
          <input
            className={`crm2-input ${phoneDupe || (f.phone.length > 0 && !phoneLenOk) ? "err" : phoneOk ? "ok" : ""}`}
            value={f.phone}
            inputMode="numeric"
            maxLength={10}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            onKeyDown={(e) => {
              if (e.key.length === 1 && !/\d/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
            }}
            placeholder="0908291842"
          />
          {!f.phone && <div className="crm2-hint muted">Chỉ nhập số — đúng 10 chữ số.</div>}
          {f.phone.length > 0 && !phoneLenOk && (
            <div className="crm2-hint err">❌ Số điện thoại phải gồm đúng 10 chữ số.</div>
          )}
          {phoneOk && <div className="crm2-hint ok">✅ Số điện thoại hợp lệ — có thể thêm khách hàng.</div>}
          {phoneDupe && (
            <>
              <div className="crm2-hint err">❌ Số điện thoại {f.phone} đã tồn tại trong hệ thống.</div>
              <div className="asx-dupe">
                <div>Tên khách: <b>{phoneDupe.name}</b></div>
                <div>Ngày tạo: <b>{date(phoneDupe.created_at)}</b></div>
                <div>Trạng thái: <b>{phoneDupe.status === "paid" ? "Đã mua" : "Chưa mua"}</b></div>
                <div>Mã KH: <b>{phoneDupe.code}</b></div>
              </div>
            </>
          )}
        </div>

        <div className="crm2-field">
          <label className="crm2-label"><MessageCircle size={13} /> Tên Zalo</label>
          <input className={`crm2-input ${zaloDupe ? "warn" : ""}`} value={f.zalo_name} onChange={(e) => set("zalo_name", e.target.value)} placeholder="Tên hiển thị Zalo" />
          {zaloDupe && <div className="crm2-hint warn">⚠️ Đã có khách hàng khác dùng tên Zalo này.</div>}
        </div>

        <div className="crm2-field">
          <label className="crm2-label"><Link2 size={13} /> Link Facebook</label>
          <input className={`crm2-input ${fbDupe ? "warn" : ""}`} value={f.facebook_url} onChange={(e) => set("facebook_url", e.target.value)} placeholder="facebook.com/nguyenvana" />
          {fbDupe && <div className="crm2-hint warn">⚠️ Facebook này đã được lưu cho khách hàng khác ({fbDupe.name} · {fbDupe.code}).</div>}
        </div>

        <div className="crm2-field">
          <label className="crm2-label"><Facebook size={13} /> Tên Facebook</label>
          <input className="crm2-input" value={f.facebook_name} onChange={(e) => set("facebook_name", e.target.value)} placeholder="Tên hiển thị Facebook" />
        </div>

        <div className="crm2-field">
          <label className="crm2-label"><MapPin size={13} /> Khu vực</label>
          <SearchableSelect
            value={f.region}
            options={VN_PROVINCES}
            placeholder="— Chọn tỉnh/thành —"
            onChange={(v) => set("region", v)}
          />
        </div>


        <div className="crm2-field">
          <label className="crm2-label"><Wallet size={13} /> Giá gói (đ)</label>
          <input className="crm2-input" value={f.package_price} inputMode="numeric" onChange={(e) => set("package_price", e.target.value.replace(/\D/g, ""))} placeholder="388000" />
        </div>

        <div className="crm2-field">
          <label className="crm2-label"><Tag size={13} /> Trạng thái</label>
          <select className="crm2-select" value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="unpaid">Chưa mua</option>
            <option value="paid">Đã mua</option>
          </select>
        </div>

        <div className="crm2-field">
          <label className="crm2-label"><StickyNote size={13} /> Ghi chú</label>
          <input className="crm2-input" value={f.note} onChange={(e) => set("note", e.target.value)} placeholder="Ghi chú thêm về khách" />
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button className="crm2-btn primary" onClick={() => void save()} disabled={saving || !!phoneDupe || !phoneLenOk}>
          <Check size={15} /> {saving ? "Đang lưu…" : "Lưu khách hàng"}
        </button>
        <button className="crm2-btn" onClick={onClose}><X size={15} /> Hủy</button>
      </div>
    </div>
  );
}


/* ================= Tab Thu Chi ================= */

function FinanceTab({ customers, expenses, reload }: { customers: Customer[]; expenses: Expense[]; reload: () => void }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [nt, setNt] = useState({ title: "", amount: "", note: "" });

  const [start, end] = rangeBounds(range, from, to);
  const inRange = (v?: string | null) => {
    if (!v) return false;
    const d = new Date(v).getTime();
    return d >= start.getTime() && d <= end.getTime();
  };

  const income = customers.filter((c) => c.status === "paid" && inRange(c.purchased_at ?? c.created_at));
  const spend = expenses.filter((e) => inRange(e.spent_at));
  const sumIn = income.reduce((t, c) => t + (Number(c.package_price) || 0), 0);
  const sumOut = spend.reduce((t, e) => t + (Number(e.amount) || 0), 0);

  const period = (key: RangeKey) => {
    const [s, e] = rangeBounds(key);
    const i = customers.filter((c) => c.status === "paid" && c.purchased_at && new Date(c.purchased_at) >= s && new Date(c.purchased_at) <= e)
      .reduce((t, c) => t + (Number(c.package_price) || 0), 0);
    const o = expenses.filter((x) => new Date(x.spent_at) >= s && new Date(x.spent_at) <= e)
      .reduce((t, x) => t + (Number(x.amount) || 0), 0);
    return { i, o, p: i - o };
  };
  const today = period("today");
  const week = period("7d");
  const month = period("month");

  const addExpense = async () => {
    const amount = Number(String(nt.amount).replace(/[^\d]/g, ""));
    if (!nt.title.trim() || !amount) return toast.error("Nhập tên khoản chi và số tiền");
    const { error } = await sb.from("crm_expenses").insert({ title: nt.title.trim(), amount, note: nt.note.trim() || null });
    if (error) return toast.error(error.message);
    setNt({ title: "", amount: "", note: "" });
    toast.success("Đã thêm khoản chi");
    reload();
  };

  const delExpense = async (id: string) => {
    const { error } = await sb.from("crm_expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    reload();
  };

  return (
    <>
      <div className="asx-toolbar">
        {RANGES.map((r) => (
          <button key={r.key} className={`asx-btn ${range === r.key ? "primary" : ""}`} onClick={() => setRange(r.key)}>{r.label}</button>
        ))}
        {range === "custom" && (
          <>
            <input type="date" className="asx-input" value={from} onChange={(e) => setFrom(e.target.value)} />
            <input type="date" className="asx-input" value={to} onChange={(e) => setTo(e.target.value)} />
          </>
        )}
      </div>

      <div className="asx-grid asx-grid-3" style={{ marginBottom: 12 }}>
        <div className="asx-tile good"><div className="asx-tile-label">Thu (kỳ đã chọn)</div><div className="asx-tile-value">{money(sumIn)}</div></div>
        <div className="asx-tile bad"><div className="asx-tile-label">Chi (kỳ đã chọn)</div><div className="asx-tile-value">{money(sumOut)}</div></div>
        <div className={`asx-tile ${sumIn - sumOut >= 0 ? "good" : "bad"}`}><div className="asx-tile-label">Lợi nhuận</div><div className="asx-tile-value">{money(sumIn - sumOut)}</div></div>
      </div>

      <div className="asx-grid asx-grid-3" style={{ marginBottom: 12 }}>
        {[["Hôm nay", today], ["Tuần này (7 ngày)", week], ["Tháng này", month]].map(([label, v]: any) => (
          <div className="asx-panel" key={label}>
            <div className="asx-panel-title">{label}</div>
            <table className="asx-table">
              <tbody>
                <tr><td>Thu</td><td style={{ textAlign: "right", color: "#34d399" }}>{money(v.i)}</td></tr>
                <tr><td>Chi</td><td style={{ textAlign: "right", color: "#f87171" }}>{money(v.o)}</td></tr>
                <tr><td><b>Lợi nhuận</b></td><td style={{ textAlign: "right", fontWeight: 700 }}>{money(v.p)}</td></tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="asx-grid asx-grid-2">
        <div className="asx-panel asx-scroll">
          <div className="asx-panel-title">Thu — khách đã mua ({income.length})</div>
          <table className="asx-table">
            <thead><tr><th>Khách</th><th>Số tiền</th><th>Ngày</th><th>Gói / ghi chú</th></tr></thead>
            <tbody>
              {income.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td style={{ color: "#34d399", fontWeight: 600 }}>{money(c.package_price)}</td>
                  <td>{date(c.purchased_at ?? c.created_at)}</td>
                  <td style={{ whiteSpace: "normal" }}>{c.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {income.length === 0 && <div className="asx-empty">Chưa có khoản thu trong kỳ.</div>}
        </div>

        <div className="asx-panel asx-scroll">
          <div className="asx-panel-title">Chi ({spend.length})</div>
          <div className="asx-toolbar">
            <input className="asx-input asx-grow" placeholder="Khoản chi (VD: Chạy quảng cáo)" value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} />
            <input className="asx-input" placeholder="300000" value={nt.amount} onChange={(e) => setNt({ ...nt, amount: e.target.value })} />
            <button className="asx-btn primary" onClick={() => void addExpense()}><Plus size={13} /> Thêm</button>
          </div>
          <table className="asx-table">
            <thead><tr><th>Khoản chi</th><th>Số tiền</th><th>Ngày</th><th></th></tr></thead>
            <tbody>
              {spend.map((e) => (
                <tr key={e.id}>
                  <td>{e.title}</td>
                  <td style={{ color: "#f87171", fontWeight: 600 }}>{money(e.amount)}</td>
                  <td>{date(e.spent_at)}</td>
                  <td><button className="asx-btn danger" onClick={() => void delExpense(e.id)}><Trash2 size={12} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {spend.length === 0 && <div className="asx-empty">Chưa có khoản chi trong kỳ.</div>}
        </div>
      </div>
    </>
  );
}

/* ================= Dashboard nhỏ cuối trang ================= */

function MiniDashboard({ customers, expenses }: { customers: Customer[]; expenses: Expense[] }) {
  const paid = customers.filter((c) => c.status === "paid");
  const unpaid = customers.filter((c) => c.status !== "paid");
  const revenue = paid.reduce((t, c) => t + (Number(c.package_price) || 0), 0);
  const cost = expenses.reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const [s] = rangeBounds("30d");
  const newCustomers = customers.filter((c) => new Date(c.created_at) >= s).length;
  const phoneSeen = new Map<string, number>();
  customers.forEach((c) => { const p = normPhone(c.phone ?? ""); if (p) phoneSeen.set(p, (phoneSeen.get(p) ?? 0) + 1); });
  const returning = [...phoneSeen.values()].filter((v) => v > 1).length;

  return (
    <div className="asx-section">
      <div className="asx-section-title">Tổng quan CRM</div>
      <div className="asx-grid asx-grid-4">
        <Tile label="Đơn chờ duyệt" value={nf.format(unpaid.length)} tone="warn" />
        <Tile label="Đã mua" value={nf.format(paid.length)} tone="good" />
        <Tile label="Chưa mua" value={nf.format(unpaid.length)} />
        <Tile label="Doanh thu" value={money(revenue)} tone="good" />
        <Tile label="Chi phí" value={money(cost)} tone="bad" />
        <Tile label="Lợi nhuận" value={money(revenue - cost)} tone={revenue - cost >= 0 ? "good" : "bad"} />
        <Tile label="Khách mới (30 ngày)" value={nf.format(newCustomers)} />
        <Tile label="Khách quay lại" value={nf.format(returning)} />
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: any; tone?: string }) {
  return (
    <div className={`asx-tile ${tone ?? ""}`}>
      <div className="asx-tile-label">{label}</div>
      <div className="asx-tile-value">{value}</div>
    </div>
  );
}
