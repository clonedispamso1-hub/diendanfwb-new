// Dropdown có ô tìm kiếm — dùng cho chọn tỉnh/thành.
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

const strip = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();

export function SearchableSelect({
  value,
  options,
  placeholder = "— Chọn —",
  onChange,
  className = "",
}: {
  value: string;
  options: readonly string[];
  placeholder?: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const list = useMemo(() => {
    const s = strip(q.trim());
    if (!s) return options;
    return options.filter((o) => strip(o).includes(s));
  }, [q, options]);

  return (
    <div className={`crm2-ss ${className}`} ref={box}>
      <button
        type="button"
        className={`crm2-input crm2-ss-trigger ${open ? "open" : ""}`}
        onClick={() => { setOpen((v) => !v); setQ(""); }}
      >
        <span className={value ? "" : "crm2-ss-ph"}>{value || placeholder}</span>
        <ChevronDown size={16} className="crm2-ss-caret" />
      </button>

      {open && (
        <div className="crm2-ss-panel">
          <div className="crm2-ss-search">
            <Search size={14} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm tỉnh/thành…"
            />
          </div>
          <div className="crm2-ss-list">
            {value && (
              <button type="button" className="crm2-ss-item" onClick={() => { onChange(""); setOpen(false); }}>
                <span style={{ opacity: 0.6 }}>{placeholder}</span>
              </button>
            )}
            {list.map((o) => (
              <button
                key={o}
                type="button"
                className={`crm2-ss-item ${o === value ? "active" : ""}`}
                onClick={() => { onChange(o); setOpen(false); }}
              >
                <span>{o}</span>
                {o === value && <Check size={14} />}
              </button>
            ))}
            {list.length === 0 && <div className="crm2-ss-empty">Không tìm thấy.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
