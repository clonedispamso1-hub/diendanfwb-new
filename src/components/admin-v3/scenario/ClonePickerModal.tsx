// Popup chọn clone — hỗ trợ Ctrl / Shift giống Windows Explorer.
import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Check } from "lucide-react";
import { toast } from "sonner";
import { scenarioClones, type CloneLite } from "@/lib/admin/scenario";

export function ClonePickerModal({
  gender,
  max,
  initial,
  onClose,
  onConfirm,
}: {
  gender: "male" | "female";
  /** Số clone tối đa được phép chọn (theo thứ). */
  max: number;
  initial: string[];
  onClose: () => void;
  onConfirm: (ids: string[], rows: CloneLite[]) => void;
}) {
  const [rows, setRows] = useState<CloneLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(() => new Set(initial));
  const lastIndex = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    scenarioClones(gender)
      .then((r) => { if (alive) setRows(r); })
      .catch((e: any) => toast.error(e?.message || "Không tải được danh sách clone"))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [gender]);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(
      (r) =>
        (r.username ?? "").toLowerCase().includes(s) ||
        (r.full_name ?? "").toLowerCase().includes(s) ||
        (r.uid ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  function apply(next: Set<string>) {
    if (next.size > max) {
      toast.error(`Không được vượt quá ${max} clone cho thứ này`);
      return;
    }
    setSel(next);
  }

  function click(e: React.MouseEvent, index: number) {
    const row = list[index];
    if (!row) return;
    const next = new Set(sel);

    if (e.shiftKey && lastIndex.current !== null) {
      const [a, b] = [lastIndex.current, index].sort((x, y) => x - y);
      for (let i = a; i <= b; i++) next.add(list[i].id);
    } else if (e.ctrlKey || e.metaKey) {
      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
      lastIndex.current = index;
    } else {
      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
      lastIndex.current = index;
    }
    apply(next);
  }

  return (
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-3"
      onClick={onClose}>
      <div className="bg-background border rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 p-3 border-b">
          <div className="text-sm font-semibold">
            Chọn clone {gender === "female" ? "nữ" : "nam"}
          </div>
          <span className="text-xs text-muted-foreground">
            Đã chọn {sel.size}/{max}
          </span>
          <button className="ml-auto admv3-btn admv3-btn-ghost" onClick={onClose}><X size={14} /></button>
        </div>

        <div className="p-3 border-b flex items-center gap-2">
          <Search size={14} className="text-muted-foreground" />
          <input className="admv3-input" placeholder="Tìm username / UID…" value={q}
            onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="text-[11px] text-muted-foreground px-3 py-1 border-b">
          Click để chọn • Shift + click = chọn dải • Ctrl/⌘ + click = chọn thêm
        </div>

        <div className="flex-1 overflow-auto divide-y select-none">
          {loading && <div className="p-6 text-center text-xs text-muted-foreground">Đang tải…</div>}
          {!loading && !list.length && (
            <div className="p-6 text-center text-xs text-muted-foreground">Không có clone nào</div>
          )}
          {list.map((r, i) => {
            const on = sel.has(r.id);
            return (
              <div key={r.id} onClick={(e) => click(e, i)}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-xs ${on ? "bg-primary/10" : "hover:bg-muted/40"}`}>
                <span className={`h-4 w-4 rounded border flex items-center justify-center ${on ? "bg-primary text-primary-foreground" : ""}`}>
                  {on && <Check size={11} />}
                </span>
                <span className="w-6 text-muted-foreground">{i + 1}</span>
                <img loading="lazy" decoding="async" src={r.avatar || "/favicon.ico"} alt={r.username ?? ""}
                  className="h-7 w-7 rounded-full object-cover" />
                <span className="font-medium truncate">@{r.username ?? "—"}</span>
                <span className="text-muted-foreground truncate">UID {r.uid ?? "—"}</span>
                <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${gender === "female" ? "bg-pink-500/15 text-pink-600" : "bg-sky-500/15 text-sky-600"}`}>
                  {gender === "female" ? "Nữ" : "Nam"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t flex items-center gap-2">
          <button className="admv3-btn admv3-btn-ghost" onClick={() => apply(new Set())}>Bỏ chọn hết</button>
          <button className="admv3-btn ml-auto"
            onClick={() => onConfirm([...sel], rows.filter((r) => sel.has(r.id)))}>
            Xong ({sel.size})
          </button>
        </div>
      </div>
    </div>
  );
}
