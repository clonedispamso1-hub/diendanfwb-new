import { useEffect, useRef, useState } from "react";
import { ScrollText, ChevronLeft, ChevronDown, ChevronRight, Loader2, X, Search, Send, Folder, FileText } from "lucide-react";
import { toast } from "sonner";
import { fetchScriptCatalogue, openScriptsManager, lineIsFilled, type ChatScript, type ScriptCatalogue } from "@/lib/admin/chat-scripts";
import { handleScriptLine } from "@/lib/admin/send-script-lines";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScriptContentPreview } from "./ScriptContentPreview";

export function ChatScriptPicker({ onSend, onInsertText, disabled, onNavigate, onScriptSent }: {
  onSend: (text: string, imageUrl?: string | null) => Promise<unknown>;
  onInsertText: (text: string, script: ChatScript) => void;
  disabled?: boolean;
  onNavigate?: () => void;
  onScriptSent?: (script: ChatScript) => void;
}) {
  const [open, setOpen] = useState(false);
  const [catalogue, setCatalogue] = useState<ScriptCatalogue | null>(null);
  const [error, setError] = useState(false);
  const [active, setActive] = useState<ChatScript | null>(null);
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [sendingIndex, setSendingIndex] = useState<number | null>(null);
  const sending = sendingIndex !== null;
  const busy = useRef(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCatalogue(null); setActive(null); setError(false); setSearch(""); setFolderId(null);
    fetchScriptCatalogue().then((c) => { if (!cancelled) setCatalogue(c); }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [open]);
  function select(script: ChatScript) { setActive(script); }
  async function pickLine(i: number) {
    if (busy.current || disabled || !active) return;
    const line = active.lines[i];
    busy.current = true; setSendingIndex(i);
    try {
      const r = await handleScriptLine(line, { onSend, onInsertText: (t) => onInsertText(t, active) });
      if (r === "insert") { toast.success("Đã đưa vào ô nhập — bấm Gửi để gửi"); busy.current = false; setSendingIndex(null); setOpen(false); return; }
      if (r === "sent") { toast.success(line.type === "voice" ? "Đã gửi voice" : "Đã gửi ảnh"); onScriptSent?.(active); }
    } catch (e: any) { toast.error(e?.message || "Gửi thất bại"); }
    finally { busy.current = false; setSendingIndex(null); }
  }
  const sectionName = catalogue?.sections.find((s) => s.id === active?.section_id)?.name;
  const usable = (catalogue?.scripts ?? []).filter((s) => s.lines.some(lineIsFilled));
  const filtered = usable.filter((s) => s.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <Popover open={open} onOpenChange={(v) => { if (!busy.current) setOpen(v); }}>
    <PopoverTrigger asChild><Button variant="ghost" size="sm" className="admv3-btn admv3-btn-ghost" title="Kịch bản" disabled={disabled}><ScrollText />Kịch bản</Button></PopoverTrigger>
    <PopoverContent side="top" align="start" sideOffset={8} collisionPadding={12} className="z-[200] flex w-[360px] max-w-[calc(100vw-24px)] max-h-[min(420px,65dvh,var(--radix-popover-content-available-height))] flex-col p-0 overflow-hidden" aria-label="Chọn kịch bản" onInteractOutside={(e) => { if (busy.current) e.preventDefault(); }} onEscapeKeyDown={(e) => { if (busy.current) e.preventDefault(); }}>
      <div className="flex items-center gap-2 border-b p-3 shrink-0"><h4 className="font-semibold flex-1">Chọn kịch bản</h4><Button variant="ghost" size="icon" aria-label="Đóng chọn kịch bản" disabled={sending} onClick={() => setOpen(false)}><X /></Button></div>
      {active ? <>
        <div className="p-3 border-b space-y-2 shrink-0">
          <Button variant="ghost" size="sm" disabled={sending} onClick={() => setActive(null)}><ChevronLeft />Quay lại thư mục</Button>
          <p className="text-xs text-muted-foreground break-words flex items-center gap-2"><Folder size={14} className="shrink-0" />{sectionName}</p>
          <h5 className="font-semibold break-words flex items-center gap-2"><FileText size={16} className="shrink-0" />{active.name}</h5>
          <p className="text-xs text-muted-foreground">{active.lines.length} nội dung · Bấm chữ để đưa vào ô nhập, bấm voice/ảnh để gửi ngay</p>
        </div>
        <ol className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 divide-y">
          {active.lines.map((line, i) => <li key={i}><Button variant="ghost" size="unstyled" type="button" data-script-line={line.type} aria-label={`Chọn nội dung ${i + 1}`} disabled={disabled || sending || !lineIsFilled(line)} onClick={() => pickLine(i)} className="flex w-full items-start justify-start whitespace-normal gap-3 py-3 text-left rounded hover:bg-muted/50 disabled:opacity-60"><span className="text-xs text-muted-foreground w-4 shrink-0 pt-1">{i + 1}.</span><div className="min-w-0 flex-1"><ScriptContentPreview line={line} /></div><span className="text-xs text-muted-foreground shrink-0 pt-1">{sendingIndex === i ? <Loader2 size={14} className="animate-spin" /> : line.type === "text" ? "Điền" : <Send size={14} />}</span></Button></li>)}
        </ol>
      </> : <>
        <div className="px-3 py-2 shrink-0 border-b"><label className="flex items-center gap-2"><Search size={14} className="text-muted-foreground" /><input autoComplete="off" aria-label="Tìm thư mục con" className="admv3-input min-w-0 flex-1" placeholder="Tìm thư mục con…" value={search} onChange={(e) => setSearch(e.target.value)} /></label></div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-2 text-sm">
          {folderId && !search.trim() && <Button variant="ghost" size="sm" className="w-full justify-start mb-2" onClick={() => setFolderId(catalogue?.sections.find((g) => g.id === folderId)?.parent_id ?? null)}><ChevronLeft />{catalogue?.sections.find((g) => g.id === folderId)?.name}</Button>}
          {error ? <p role="alert" className="p-2 text-destructive">Không tải được kịch bản. Đóng và mở lại để thử lại.</p> : !catalogue ? <p className="p-2 flex gap-2 text-muted-foreground"><Loader2 size={14} className="animate-spin" />Đang tải…</p> : !usable.length ? <div className="p-2 space-y-2"><p className="text-muted-foreground">Chưa có kịch bản có nội dung.</p><Button variant="outline" size="sm" onClick={() => { setOpen(false); onNavigate?.(); openScriptsManager(); }}>Đi đến quản lý Kịch Bản</Button></div> : !filtered.length ? <p className="p-2 text-muted-foreground">Không có kịch bản phù hợp.</p> : catalogue.sections.map((g) => {
            const scripts = filtered.filter((s) => s.section_id === g.id);
            if (!search.trim() && (g.parent_id ?? null) !== folderId && g.id !== folderId) return null;
            if (search.trim() && !scripts.length) return null;
            const expanded = !!search.trim() || g.id === folderId;
            return <div key={g.id} className="mb-2">
              {g.id !== folderId && <Button variant="ghost" size="unstyled" className="w-full justify-start p-2 whitespace-normal text-left bg-muted/50" aria-expanded={expanded} onClick={() => setFolderId(g.id)}>{expanded ? <ChevronDown /> : <ChevronRight />}<Folder className="text-primary" /><span className="flex-1 min-w-0 break-words">{g.name}</span><span className="text-xs text-muted-foreground">{scripts.length}</span></Button>}
              {expanded && scripts.map((s) => <Button key={s.id} variant="ghost" size="unstyled" className="w-full justify-start py-2 pl-6 pr-2 whitespace-normal text-left" onClick={() => select(s)}><FileText className="text-muted-foreground" /><span className="flex-1 min-w-0 break-words">{s.name}</span><span className="text-xs text-muted-foreground shrink-0">{s.lines.length} nội dung</span><ChevronRight /></Button>)}
            </div>;
          })}
        </div>
      </>}
    </PopoverContent>
  </Popover>;
}
