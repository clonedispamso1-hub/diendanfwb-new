// CRM khách hàng — 3 tab: Chưa mua · Đã mua · Thu Chi (tái cấu trúc tối giản)
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus, RefreshCw, Search, Trash2, Check, X, Eye, AlertTriangle,
  Phone, MapPin, Wallet, Tag, TrendingUp, TrendingDown, PiggyBank,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
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
  name: string | null;
  phone: string | null;
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

const normPhone = (p: string) => p.replace(/[^\d]/g, "");
const onlyDigits = (s: string) => s.replace(/\D/g, "");

type RangeKey = "today" | "week" | "month";

function rangeBounds(key: RangeKey): [Date, Date] {
  const now = new Date();
  const s = new Date(now); s.setHours(0, 0, 0, 0);
  const e = new Date(now); e.setHours(23, 59, 59, 999);
  if (key === "today") return [s, e];
  if (key === "week") { const a = new Date(s); a.setDate(a.getDate() - 6); return [a, e]; }
  return [new Date(now.getFullYear(), now.getMonth(), 1), e];
}

const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Hôm nay" },
  { key: "week", label: "Tuần này (7 ngày)" },
  { key: "month", label: "Tháng này" },
];

export function CrmManager() {
  const [tab, setTab] = useState<"unpaid" | "paid" | "finance">("unpaid");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideRegion, setGuideRegion] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [approving, setApproving] = useState<Customer | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [c, e] = await Promise.all([
      sb.from("crm_customers")
        .select("id, code, name, phone, region, package_price, status, purchased_at, approved_by, note, created_at")
        .order("created_at", { ascending: false }).limit(300),
      sb.from("crm_expenses").select("id, title, amount, spent_at, note").order("spent_at", { ascending: false }).limit(300),
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
      [c.code, c.region].some((f) => (f ?? "").toLowerCase().includes(s)) ||
      (ph.length >= 3 && normPhone(c.phone ?? "").includes(ph)),
    );
  }, [customers, q]);

  const unpaid = filtered.filter((c) => c.status !== "paid");
  const paid = filtered.filter((c) => c.status === "paid");

  const remove = async (c: Customer) => {
    if (!confirm(`Xóa khách hàng ${c.phone ?? c.code ?? ""}?`)) return;
    const { error } = await sb.from("crm_customers").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Đã xóa khách hàng");
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
          Không đọc được dữ liệu CRM ({err}). Hãy chạy file <code>docs/sql/2026-08-27_crm_minimal.sql</code> trong SQL Editor.
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
                placeholder="Tìm theo SĐT · Khu vực · Mã KH"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          )}

          {tab !== "finance" && (
            <>
              <button className="crm2-btn primary" onClick={() => setShowForm(true)}>
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
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); void load(); }}
        />
      )}

      {tab === "unpaid" && (
        <div className="crm2-card crm2-scroll">
          <table className="crm2-table">
            <thead>
              <tr>
                <th>SĐT</th><th>Khu vực</th><th>Giá gói</th><th>Ngày tạo</th><th>Trạng thái</th><th></th>
              </tr>
            </thead>
            <tbody>
              {unpaid.map((c) => (
                <tr key={c.id}>
                  <td>{c.phone || "—"}</td>
                  <td>{c.region || "—"}</td>
                  <td>{money(c.package_price)}</td>
                  <td>{date(c.created_at)}</td>
                  <td><span className="crm2-pill unpaid">Chưa mua</span></td>
                  <td>
                    <div className="crm2-row-actions">
                      <button className="crm2-btn sm" title="Mở kịch bản theo khu vực khách" onClick={() => { setGuideRegion(c.region); setShowGuide(true); }}><Eye size={12} /> Kịch bản CSKH</button>
                      <button className="crm2-btn sm ok" onClick={() => setApproving(c)}><Check size={12} /> Duyệt đơn</button>
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
                <th>SĐT</th><th>Khu vực</th><th>Số tiền đã thanh toán</th><th>Ngày mua</th><th></th>
              </tr>
            </thead>
            <tbody>
              {paid.map((c) => (
                <tr key={c.id}>
                  <td>{c.phone || "—"}</td>
                  <td>{c.region || "—"}</td>
                  <td style={{ color: "#34d399", fontWeight: 700 }}>{money(c.package_price)}</td>
                  <td>{date(c.purchased_at ?? c.created_at)}</td>
                  <td>
                    <div className="crm2-row-actions">
                      <button className="crm2-btn sm" title="Mở kịch bản theo khu vực khách" onClick={() => { setGuideRegion(c.region); setShowGuide(true); }}><Eye size={12} /> Kịch bản CSKH</button>
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

      {showGuide && <AdminGuideModal region={guideRegion} onClose={() => setShowGuide(false)} />}

      {approving && (
        <ApproveModal
          customer={approving}
          onClose={() => setApproving(null)}
          onDone={() => { setApproving(null); void load(); }}
        />
      )}

      {confirmWipe && (
        <div className="crm2-overlay" onClick={() => setConfirmWipe(false)}>
          <div className="crm2-confirm" onClick={(e) => e.stopPropagation()}>
            <div className="crm2-confirm-title">
              <AlertTriangle size={18} color="#f87171" /> Xóa toàn bộ CRM?
            </div>
            <div className="crm2-confirm-text">
              Bạn có chắc chắn muốn xóa toàn bộ danh sách khách hàng?
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

/* ================= Popup duyệt đơn ================= */

function ApproveModal({ customer, onClose, onDone }: { customer: Customer; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState(String(customer.package_price ?? ""));
  const [saving, setSaving] = useState(false);

  const confirmApprove = async () => {
    const value = Number(onlyDigits(amount));
    if (!value) return toast.error("Nhập số tiền khách đã chuyển.");
    setSaving(true);
    const { error } = await sb.from("crm_customers").update({
      status: "paid",
      package_price: value,
      purchased_at: new Date().toISOString(),
      approved_by: "Admin",
    }).eq("id", customer.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Đã duyệt đơn ${customer.phone ?? ""} · ${money(value)} → Đã mua`);
    onDone();
  };

  return (
    <div className="crm2-overlay" onClick={onClose}>
      <div className="crm2-confirm" onClick={(e) => e.stopPropagation()}>
        <div className="crm2-confirm-title"><Check size={18} color="#34d399" /> Xác nhận duyệt đơn</div>
        <div className="crm2-confirm-text">
          Khách <b>{customer.phone || "—"}</b> · {customer.region || "—"}
          <br />Nhập số tiền khách đã chuyển thành công:
        </div>
        <input
          className="crm2-input"
          style={{ marginTop: 12 }}
          value={amount}
          inputMode="numeric"
          autoFocus
          onChange={(e) => setAmount(onlyDigits(e.target.value))}
          placeholder="388000"
        />
        <div className="crm2-hint muted">{money(onlyDigits(amount))}</div>
        <div className="crm2-confirm-actions">
          <button className="crm2-btn" onClick={onClose}>Hủy</button>
          <button className="crm2-btn primary" onClick={() => void confirmApprove()} disabled={saving}>
            <Check size={14} /> {saving ? "Đang duyệt…" : "Duyệt & cộng vào Tổng Thu"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= Form thêm khách hàng (tối giản) ================= */

function CustomerForm({
  existing, onClose, onSaved,
}: { existing: Customer[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ phone: "", region: "", package_price: "", status: "unpaid" });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const phoneDupe = useMemo(() => {
    const p = f.phone;
    if (p.length < 9) return null;
    return existing.find((c) => normPhone(c.phone ?? "").slice(-10) === p) ?? null;
  }, [f.phone, existing]);

  const phoneLenOk = f.phone.length === 10;

  const save = async () => {
    if (!phoneLenOk) return toast.error("Số điện thoại phải gồm đúng 10 chữ số.");
    if (phoneDupe) return toast.error("Số điện thoại này đã được nhập!");
    if (!f.region.trim()) return toast.error("Vui lòng chọn khu vực.");
    setSaving(true);
    const payload: Record<string, unknown> = {
      phone: f.phone,
      region: f.region.trim(),
      package_price: Number(onlyDigits(f.package_price)) || 0,
      status: f.status,
      ...(f.status === "paid" ? { purchased_at: new Date().toISOString(), approved_by: "Admin" } : {}),
    };
    const { error } = await sb.from("crm_customers").insert(payload);
    setSaving(false);
    if (error) {
      if (/duplicate|unique/i.test(error.message)) return toast.error("Số điện thoại này đã được nhập!");
      return toast.error(error.message);
    }
    toast.success("Đã thêm khách hàng");
    onSaved();
  };

  return (
    <div className="crm2-card">
      <div className="crm2-card-head">
        <div>
          <div className="crm2-card-title">Thêm khách hàng mới</div>
          <div className="crm2-card-sub">Chỉ cần 4 thông tin — nhanh gọn để chốt khách</div>
        </div>
        <button className="crm2-btn ghost sm" onClick={onClose}><X size={14} /> Đóng</button>
      </div>

      <div className="crm2-form-grid">
        <div className="crm2-field">
          <label className="crm2-label"><Phone size={13} /> Số điện thoại *</label>
          <input
            className={`crm2-input ${phoneDupe || (f.phone.length > 0 && !phoneLenOk) ? "err" : phoneLenOk ? "ok" : ""}`}
            value={f.phone}
            inputMode="numeric"
            maxLength={10}
            onChange={(e) => set("phone", onlyDigits(e.target.value).slice(0, 10))}
            placeholder="0908291842"
          />
          {phoneDupe
            ? <div className="crm2-hint err">Số điện thoại này đã được nhập!</div>
            : f.phone.length > 0 && !phoneLenOk
              ? <div className="crm2-hint err">Số điện thoại phải gồm đúng 10 chữ số.</div>
              : <div className="crm2-hint muted">Chỉ nhập số — đúng 10 chữ số.</div>}
        </div>

        <div className="crm2-field">
          <label className="crm2-label"><MapPin size={13} /> Khu vực *</label>
          <SearchableSelect
            value={f.region}
            options={VN_PROVINCES}
            placeholder="— Chọn tỉnh/thành —"
            onChange={(v) => set("region", v)}
          />
        </div>

        <div className="crm2-field">
          <label className="crm2-label"><Wallet size={13} /> Giá gói (đ)</label>
          <input className="crm2-input" value={f.package_price} inputMode="numeric" onChange={(e) => set("package_price", onlyDigits(e.target.value))} placeholder="388000" />
        </div>

        <div className="crm2-field">
          <label className="crm2-label"><Tag size={13} /> Trạng thái</label>
          <select className="crm2-select" value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="unpaid">Chưa mua</option>
            <option value="paid">Đã mua</option>
          </select>
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
  const [range, setRange] = useState<RangeKey>("month");
  const [nt, setNt] = useState({ title: "", amount: "" });
  const [adding, setAdding] = useState(false);

  const [start, end] = rangeBounds(range);
  const inRange = (v?: string | null) => {
    if (!v) return false;
    const d = new Date(v).getTime();
    return d >= start.getTime() && d <= end.getTime();
  };

  const income = customers.filter((c) => c.status === "paid" && inRange(c.purchased_at ?? c.created_at));
  const spend = expenses.filter((e) => inRange(e.spent_at));
  const sumIn = income.reduce((t, c) => t + (Number(c.package_price) || 0), 0);
  const sumOut = spend.reduce((t, e) => t + (Number(e.amount) || 0), 0);
  const profit = sumIn - sumOut;

  const addExpense = async () => {
    const amount = Number(onlyDigits(nt.amount));
    if (!nt.title.trim() || !amount) return toast.error("Nhập tên khoản chi và số tiền");
    setAdding(true);
    const { error } = await sb.from("crm_expenses").insert({ title: nt.title.trim(), amount });
    setAdding(false);
    if (error) return toast.error(error.message);
    setNt({ title: "", amount: "" });
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
      </div>

      <div className="asx-grid asx-grid-3" style={{ marginBottom: 12 }}>
        <div className="asx-tile good">
          <div className="asx-tile-label"><TrendingUp size={13} /> Tổng Thu (kỳ chọn)</div>
          <div className="asx-tile-value">{money(sumIn)}</div>
          <div className="asx-tile-sub">{income.length} đơn đã duyệt</div>
        </div>
        <div className="asx-tile bad">
          <div className="asx-tile-label"><TrendingDown size={13} /> Tổng Chi (kỳ chọn)</div>
          <div className="asx-tile-value">{money(sumOut)}</div>
          <div className="asx-tile-sub">{spend.length} khoản chi</div>
        </div>
        <div className={`asx-tile ${profit >= 0 ? "good" : "bad"}`}>
          <div className="asx-tile-label"><PiggyBank size={13} /> Lợi Nhuận Thực Nhận</div>
          <div className="asx-tile-value">{money(profit)}</div>
          <div className="asx-tile-sub">Thu − Chi</div>
        </div>
      </div>

      <div className="asx-grid asx-grid-2">
        <div className="asx-panel asx-scroll">
          <div className="asx-panel-title">Cột Thu — đơn đã duyệt ({income.length})</div>
          <table className="asx-table">
            <thead><tr><th>SĐT</th><th>Khu vực</th><th>Số tiền</th><th>Ngày mua</th></tr></thead>
            <tbody>
              {income.map((c) => (
                <tr key={c.id}>
                  <td>{c.phone || "—"}</td>
                  <td>{c.region || "—"}</td>
                  <td style={{ color: "#34d399", fontWeight: 600 }}>{money(c.package_price)}</td>
                  <td>{date(c.purchased_at ?? c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {income.length === 0 && <div className="asx-empty">Chưa có khoản thu trong kỳ.</div>}
        </div>

        <div className="asx-panel asx-scroll">
          <div className="asx-panel-title">Cột Chi ({spend.length})</div>
          <div className="asx-toolbar">
            <input className="asx-input asx-grow" placeholder="Tên khoản chi (VD: Mua đồ ăn, chạy ads…)" value={nt.title} onChange={(e) => setNt({ ...nt, title: e.target.value })} />
            <input className="asx-input" placeholder="Số tiền chi (đ)" inputMode="numeric" value={nt.amount} onChange={(e) => setNt({ ...nt, amount: onlyDigits(e.target.value) })} />
            <button className="asx-btn primary" onClick={() => void addExpense()} disabled={adding}>
              <Plus size={13} /> Thêm khoản chi
            </button>
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
