import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Phone, MapPin, Users, ShieldCheck, Crown,
  CheckCircle2, XCircle, Sparkles, ChevronLeft, Search, Loader2,
} from "lucide-react";
import { Portal } from "@/components/candy/portal";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

const REGIONS = [
  "Hà Nội", "TP.HCM", "Đà Nẵng", "Hải Phòng", "Cần Thơ",
  "Nha Trang", "Vũng Tàu", "Huế", "Quy Nhơn", "Đà Lạt",
  "Buôn Ma Thuột", "Pleiku", "Kon Tum", "Hạ Long", "Bắc Ninh",
  "Nam Định", "Thanh Hóa", "Nghệ An", "Vinh", "Hà Tĩnh",
  "Quảng Bình", "Quảng Trị", "Quảng Nam", "Quảng Ngãi", "Bình Định",
  "Phú Yên", "Ninh Thuận", "Bình Thuận", "Tây Ninh", "Long An",
  "Tiền Giang", "Bến Tre", "Vĩnh Long", "Trà Vinh", "An Giang",
  "Kiên Giang", "Cà Mau", "Bạc Liêu", "Sóc Trăng", "Hậu Giang",
];

const VN_NAMES = [
  "Trọng Linh", "Yến Nhi", "Gia Hân", "Minh Khang", "Hoàng Anh",
  "Bảo Trân", "Quang Huy", "Ngọc Mai", "Thảo Vy", "Đức Anh",
  "Phương Linh", "Tuấn Kiệt", "Khánh Vy", "Anh Thư", "Nhật Nam",
  "Hà My", "Tường Vi", "Đăng Khoa", "Thu Trang", "Minh Tú",
  "Bảo Ngọc", "Hải Đăng", "Kim Ngân", "Quốc Bảo", "Diệu Linh",
  "Thanh Tùng", "Mỹ Duyên", "Việt Anh", "Lan Anh", "Trung Hiếu",
];

const BENEFITS = [
  "Tham gia toàn bộ cộng đồng VIP trong khu vực đã chọn.",
  "Được nhắn tin với thành viên trong cộng đồng.",
  "Admin hỗ trợ kết nối và tìm đối tượng phù hợp.",
  "Cập nhật thành viên mới thường xuyên.",
  "Cộng đồng được kiểm duyệt, hạn chế tài khoản giả mạo.",
];

const RULES = [
  "Không chia sẻ hình ảnh riêng tư của thành viên.",
  "Không phát tán video ra bên ngoài.",
  "Không quấy rối hoặc spam.",
];

interface Community {
  id: string;
  name: string;
  total: number;
  male: number;
  female: number;
  admins: string[];
}

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

function makeCommunities(region: string): Community[] {
  const count = rand(7, 10);
  const list: Community[] = [];
  for (let i = 0; i < count; i++) {
    const total = rand(400, 999);
    const male = rand(Math.floor(total * 0.25), Math.floor(total * 0.75));
    const female = total - male - rand(1, 3);
    const adminCount = Math.random() > 0.5 ? 3 : 2;
    list.push({
      id: `${region}-${i}`,
      name: `Cộng đồng VIP Zalo ${region} ${String(i + 1).padStart(2, "0")}`,
      total,
      male,
      female: Math.max(female, 0),
      admins: pickN(VN_NAMES, adminCount),
    });
  }
  return list;
}

/* ------------------------------------------------------------------ */
/* Wizard                                                              */
/* ------------------------------------------------------------------ */

const TOTAL_STEPS = 6;

export function VipZaloJoinWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [phoneErr, setPhoneErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [regionQuery, setRegionQuery] = useState("");
  const [selectedPack, setSelectedPack] = useState<"8m" | "life">("life");

  const communities = useMemo(
    () => (region ? makeCommunities(region) : []),
    [region],
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const filteredRegions = useMemo(() => {
    const q = regionQuery.trim().toLowerCase();
    if (!q) return REGIONS;
    return REGIONS.filter((r) => r.toLowerCase().includes(q));
  }, [regionQuery]);

  const canNext = (() => {
    if (step === 1) return checked;
    if (step === 2) return !!region;
    return true;
  })();

  const runCheckPhone = () => {
    if (!/^\d{10}$/.test(phone)) {
      setPhoneErr("Số điện thoại phải gồm đúng 10 chữ số.");
      return;
    }
    setPhoneErr(null);
    setChecking(true);
    setTimeout(() => {
      setChecking(false);
      setChecked(true);
    }, 2000);
  };

  const goNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  const goPrev = () => setStep((s) => Math.max(s - 1, 1));

  const finish = () => {
    toast.success("Cảm ơn bạn! Admin sẽ liên hệ để hoàn tất tham gia.");
    onClose();
  };

  return (
    <Portal>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 10060,
          background: "rgba(2,6,23,0.55)", backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          display: "grid", placeItems: "center", padding: "20px 12px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 22 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 14 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
          role="dialog" aria-modal="true"
          style={{
            position: "relative", width: "100%", maxWidth: 460,
            background: "#ffffff", borderRadius: 28,
            maxHeight: "92vh", display: "flex", flexDirection: "column",
            boxShadow: "0 40px 90px -20px rgba(2,6,23,0.55)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div style={{
            padding: "16px 18px 12px", borderBottom: "1px solid rgba(15,23,42,0.06)",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            {step > 1 && step < TOTAL_STEPS + 1 ? (
              <button type="button" onClick={goPrev} aria-label="Quay lại" style={{
                width: 34, height: 34, borderRadius: 999, border: "none",
                background: "#f1f5f9", cursor: "pointer",
                display: "grid", placeItems: "center",
              }}><ChevronLeft size={16} /></button>
            ) : <div style={{ width: 34 }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 0.4 }}>
                BƯỚC {step} / {TOTAL_STEPS}
              </div>
              <div style={{
                marginTop: 6, height: 4, borderRadius: 999,
                background: "#eef2f7", overflow: "hidden",
              }}>
                <motion.div
                  animate={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                  transition={{ type: "spring", stiffness: 200, damping: 26 }}
                  style={{
                    height: "100%",
                    background: "linear-gradient(90deg,#0068ff,#33a3ff)",
                  }}
                />
              </div>
            </div>
            <button type="button" onClick={onClose} aria-label="Đóng" style={{
              width: 34, height: 34, borderRadius: 999, border: "none",
              background: "#f1f5f9", cursor: "pointer",
              display: "grid", placeItems: "center",
            }}><X size={16} /></button>
          </div>

          {/* Body */}
          <div style={{ overflowY: "auto", flex: 1, padding: 22 }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                {step === 1 && (
                  <StepPhone
                    phone={phone} setPhone={(v) => { setPhone(v); setPhoneErr(null); setChecked(false); }}
                    err={phoneErr} checking={checking} checked={checked}
                    onCheck={runCheckPhone}
                  />
                )}
                {step === 2 && (
                  <StepRegion
                    region={region} setRegion={setRegion}
                    query={regionQuery} setQuery={setRegionQuery}
                    regions={filteredRegions}
                  />
                )}
                {step === 3 && <StepCommunities region={region!} list={communities} />}
                {step === 4 && <StepBenefits />}
                {step === 5 && <StepRules />}
                {step === 6 && (
                  <StepPackages
                    selected={selectedPack}
                    onSelect={setSelectedPack}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div style={{
            padding: 16, borderTop: "1px solid rgba(15,23,42,0.06)",
            background: "#ffffff",
          }}>
            {step < TOTAL_STEPS ? (
              <button
                type="button"
                disabled={!canNext}
                onClick={goNext}
                style={{
                  width: "100%", height: 52, borderRadius: 16, border: "none",
                  background: canNext
                    ? "linear-gradient(135deg,#0068ff,#33a3ff)"
                    : "#cbd5e1",
                  color: "#fff", fontWeight: 800, fontSize: 15,
                  cursor: canNext ? "pointer" : "not-allowed",
                  boxShadow: canNext ? "0 14px 30px -10px rgba(0,104,255,0.55)" : "none",
                }}
              >
                {step === 1 && !checked ? "Vui lòng kiểm tra số điện thoại" : "Tiếp tục"}
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                style={{
                  width: "100%", height: 52, borderRadius: 16, border: "none",
                  background: "linear-gradient(135deg,#f59e0b,#f97316)",
                  color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer",
                  boxShadow: "0 14px 30px -10px rgba(245,158,11,0.6)",
                }}
              >
                Xác nhận tham gia
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </Portal>
  );
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

function StepHeader({ icon, title, desc }: { icon: React.ReactNode; title: string; desc?: string }) {
  return (
    <div style={{ textAlign: "center", marginBottom: 20 }}>
      <div style={{
        width: 56, height: 56, borderRadius: 18, margin: "0 auto 12px",
        background: "linear-gradient(135deg,#e0f0ff,#dbeafe)",
        display: "grid", placeItems: "center", color: "#0068ff",
      }}>{icon}</div>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{title}</h2>
      {desc && (
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: "#64748b", lineHeight: 1.55 }}>
          {desc}
        </p>
      )}
    </div>
  );
}

function StepPhone({
  phone, setPhone, err, checking, checked, onCheck,
}: {
  phone: string; setPhone: (v: string) => void;
  err: string | null; checking: boolean; checked: boolean;
  onCheck: () => void;
}) {
  return (
    <div>
      <StepHeader
        icon={<Phone size={26} />}
        title="Kiểm tra số điện thoại"
        desc="Nhập số điện thoại Zalo của bạn để kiểm tra trạng thái tham gia cộng đồng."
      />
      <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#334155", marginBottom: 6 }}>
        Số điện thoại
      </label>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
        placeholder="0xxxxxxxxx"
        inputMode="numeric"
        maxLength={10}
        style={{
          width: "100%", height: 50, borderRadius: 14,
          border: `1px solid ${err ? "#ef4444" : "rgba(15,23,42,0.14)"}`,
          padding: "0 14px", fontSize: 15, outline: "none",
          background: "#f8fafc",
        }}
      />
      {err && (
        <div style={{ color: "#ef4444", fontSize: 12.5, marginTop: 6, fontWeight: 600 }}>
          {err}
        </div>
      )}
      {!checked && (
        <button
          type="button"
          onClick={onCheck}
          disabled={checking}
          style={{
            marginTop: 14, width: "100%", height: 46, borderRadius: 14,
            border: "1px solid rgba(0,104,255,0.28)", background: "#fff",
            color: "#0068ff", fontWeight: 700, fontSize: 14,
            cursor: checking ? "wait" : "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}
        >
          {checking ? <><Loader2 size={16} className="animate-spin" /> Đang kiểm tra…</> : "Kiểm tra"}
        </button>
      )}
      {checked && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{
            marginTop: 16, padding: 14, borderRadius: 14,
            background: "linear-gradient(135deg,#fff7ed,#ffedd5)",
            border: "1px solid rgba(249,115,22,0.24)",
            display: "flex", gap: 10, alignItems: "flex-start",
          }}
        >
          <XCircle size={20} color="#f97316" style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13.5, color: "#7c2d12", lineHeight: 1.5, fontWeight: 600 }}>
            Số điện thoại này hiện chưa tham gia cộng đồng VIP Zalo.
          </div>
        </motion.div>
      )}
    </div>
  );
}

function StepRegion({
  region, setRegion, query, setQuery, regions,
}: {
  region: string | null; setRegion: (r: string) => void;
  query: string; setQuery: (v: string) => void;
  regions: string[];
}) {
  return (
    <div>
      <StepHeader
        icon={<MapPin size={26} />}
        title="Chọn khu vực"
        desc="Chọn khu vực bạn đang sinh sống để hiển thị cộng đồng phù hợp."
      />
      <div style={{ position: "relative", marginBottom: 12 }}>
        <Search size={16} color="#94a3b8" style={{ position: "absolute", top: 17, left: 14 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm khu vực…"
          style={{
            width: "100%", height: 48, borderRadius: 14,
            border: "1px solid rgba(15,23,42,0.14)",
            padding: "0 14px 0 40px", fontSize: 14, outline: "none",
            background: "#f8fafc",
          }}
        />
      </div>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8,
        maxHeight: 340, overflowY: "auto", paddingRight: 4,
      }}>
        {regions.map((r) => {
          const active = region === r;
          return (
            <button
              key={r}
              type="button"
              onClick={() => setRegion(r)}
              style={{
                height: 46, borderRadius: 12, padding: "0 12px",
                border: active ? "1.5px solid #0068ff" : "1px solid rgba(15,23,42,0.10)",
                background: active ? "rgba(0,104,255,0.08)" : "#fff",
                color: active ? "#0068ff" : "#0f172a",
                fontWeight: active ? 800 : 600, fontSize: 13.5, cursor: "pointer",
                textAlign: "left",
              }}
            >{r}</button>
          );
        })}
        {regions.length === 0 && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: 24, color: "#94a3b8", fontSize: 13 }}>
            Không tìm thấy khu vực.
          </div>
        )}
      </div>
    </div>
  );
}

function StepCommunities({ region, list }: { region: string; list: Community[] }) {
  return (
    <div>
      <StepHeader
        icon={<Users size={26} />}
        title={`Cộng đồng tại ${region}`}
        desc={`Có ${list.length} cộng đồng VIP đang hoạt động tại khu vực bạn chọn.`}
      />
      <div style={{ display: "grid", gap: 10 }}>
        {list.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            style={{
              padding: 14, borderRadius: 16,
              background: "linear-gradient(135deg,#ffffff,#f8fbff)",
              border: "1px solid rgba(0,104,255,0.14)",
              boxShadow: "0 6px 18px -10px rgba(0,104,255,0.35)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 14.5 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>{c.total} thành viên</div>
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 12, color: "#334155", marginBottom: 8 }}>
              <span>👨 {c.male} Nam</span>
              <span>👩 {c.female} Nữ</span>
              <span>👑 {c.admins.length} Admin</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {c.admins.map((a) => (
                <span key={a} style={{
                  padding: "3px 9px", borderRadius: 999,
                  background: "rgba(0,104,255,0.10)", color: "#0068ff",
                  fontSize: 11.5, fontWeight: 700,
                }}>{a}</span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function StepBenefits() {
  return (
    <div>
      <StepHeader
        icon={<Sparkles size={26} />}
        title="Lợi ích khi tham gia VIP Zalo"
        desc="Những đặc quyền dành riêng cho thành viên VIP."
      />
      <div style={{ display: "grid", gap: 10 }}>
        {BENEFITS.map((b, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            style={{
              display: "flex", gap: 10, padding: 14, borderRadius: 14,
              background: "linear-gradient(135deg,#ecfdf5,#f0fdf4)",
              border: "1px solid rgba(16,185,129,0.22)",
            }}
          >
            <CheckCircle2 size={20} color="#10b981" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13.5, color: "#065f46", lineHeight: 1.5, fontWeight: 600 }}>{b}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function StepRules() {
  return (
    <div>
      <StepHeader
        icon={<ShieldCheck size={26} />}
        title="Nội quy cộng đồng"
        desc="Vui lòng đọc kỹ trước khi tham gia."
      />
      <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
        {RULES.map((r, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            style={{
              display: "flex", gap: 10, padding: 14, borderRadius: 14,
              background: "linear-gradient(135deg,#fef2f2,#fff1f2)",
              border: "1px solid rgba(239,68,68,0.22)",
            }}
          >
            <XCircle size={20} color="#ef4444" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 13.5, color: "#7f1d1d", lineHeight: 1.5, fontWeight: 600 }}>{r}</div>
          </motion.div>
        ))}
      </div>
      <div style={{
        padding: 14, borderRadius: 14,
        background: "#f8fafc", border: "1px solid rgba(15,23,42,0.08)",
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "#0f172a", marginBottom: 6 }}>
          Hình thức xử lý khi vi phạm
        </div>
        <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.6 }}>
          <div>• Lần 1: Khóa quyền tham gia <b>4 ngày</b>.</div>
          <div>• Lần 2: Loại khỏi cộng đồng <b>vĩnh viễn</b>.</div>
        </div>
      </div>
    </div>
  );
}

function StepPackages({
  selected, onSelect,
}: { selected: "8m" | "life"; onSelect: (v: "8m" | "life") => void }) {
  const packs = [
    { key: "8m" as const, title: "VIP 8 tháng", price: "388.000 VNĐ", sub: "Trọn gói 8 tháng" },
    { key: "life" as const, title: "VIP Trọn đời", price: "541.000 VNĐ", sub: "Truy cập vĩnh viễn", recommended: true },
  ];
  return (
    <div>
      <StepHeader
        icon={<Crown size={26} />}
        title="Gói tham gia"
        desc="Chọn gói phù hợp để bắt đầu tham gia cộng đồng VIP."
      />
      <div style={{ display: "grid", gap: 12 }}>
        {packs.map((p) => {
          const active = selected === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onSelect(p.key)}
              style={{
                position: "relative", textAlign: "left", cursor: "pointer",
                padding: 16, borderRadius: 18,
                border: active ? "2px solid #f59e0b" : "1.5px solid rgba(15,23,42,0.10)",
                background: active
                  ? "linear-gradient(135deg,#fff7ed,#fffbeb)"
                  : "#fff",
                boxShadow: active ? "0 14px 30px -14px rgba(245,158,11,0.55)" : "none",
                transition: "all 160ms ease",
              }}
            >
              {p.recommended && (
                <span style={{
                  position: "absolute", top: -10, right: 14,
                  padding: "4px 10px", borderRadius: 999,
                  background: "linear-gradient(135deg,#f59e0b,#f97316)",
                  color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
                  boxShadow: "0 6px 14px -4px rgba(245,158,11,0.55)",
                }}>ĐỀ XUẤT</span>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{p.sub}</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: active ? "#c2410c" : "#0f172a" }}>
                  {p.price}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{
        marginTop: 14, padding: 12, borderRadius: 12,
        background: "#f1f5f9", fontSize: 12.5, color: "#475569", lineHeight: 1.55,
      }}>
        Bạn có <b>24 giờ trải nghiệm</b>. Nếu cảm thấy không phù hợp, hãy liên hệ Admin để được hỗ trợ theo chính sách của cộng đồng.
      </div>
    </div>
  );
}
