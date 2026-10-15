import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, Loader2, RefreshCw, ChevronDown, ChevronRight, ArrowUp, ArrowDown, Search, Mic, Image as ImageIcon, Type, Folder, FolderOpen, FileText, Pencil, ArrowLeft, FolderPlus } from "lucide-react";
import { fetchScriptCatalogue, newScript, newSection, saveScriptCatalogue, removeSection, moveItem, isHttpUrl, type ChatScript, type ScriptLine, type ScriptCatalogue, type ScriptSection } from "@/lib/admin/chat-scripts";
import { VoiceLibraryPicker } from "@/components/candy/voice-library-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScriptContentPreview } from "./ScriptContentPreview";

type NameAction = { kind: "folder" | "script"; id?: string; parentId?: string };

export function ChatScriptsTab() {
  const [catalogue, setCatalogue] = useState<ScriptCatalogue>({ sections: [], scripts: [] });
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [voiceFor, setVoiceFor] = useState<{ sid: string; idx: number } | null>(null);
  const [nameAction, setNameAction] = useState<NameAction | null>(null);
  const [name, setName] = useState("");
  async function load() {
    if (dirty && !confirm("Bỏ các thay đổi chưa lưu và tải lại?")) return;
    setLoading(true); setLoadFailed(false);
    try { setCatalogue(await fetchScriptCatalogue()); setDirty(false); }
    catch (e: unknown) { setLoadFailed(true); toast.error(e instanceof Error ? e.message : "Không tải được kịch bản"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  function update(fn: (c: ScriptCatalogue) => ScriptCatalogue) { setCatalogue(fn); setDirty(true); }
  const patch = (id: string, p: Partial<ChatScript>) => update((c) => ({ ...c, scripts: c.scripts.map((s) => s.id === id ? { ...s, ...p } : s) }));
  async function save() {
    if (saving || loading || loadFailed) return;
    setSaving(true);
    try { setCatalogue(await saveScriptCatalogue(catalogue)); setDirty(false); toast.success("Đã lưu kịch bản"); }
    catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Lưu thất bại"); }
    finally { setSaving(false); }
  }
  const locked = loading || saving || loadFailed;
  const active = catalogue.scripts.find((s) => s.id === activeId);
  const folder = catalogue.sections.find((g) => g.id === (active?.section_id ?? folderId)) ?? catalogue.sections[0];
  const children = catalogue.scripts.filter((s) => s.section_id === folder?.id);
  const subfolders = catalogue.sections.filter((s) => s.parent_id === folder?.id);
  const term = search.trim().toLocaleLowerCase();
  const path: ScriptSection[] = [];
  let ancestor: ScriptSection | undefined = folder;
  while (ancestor && !path.some((s) => s.id === ancestor?.id)) { path.unshift(ancestor); ancestor = catalogue.sections.find((s) => s.id === ancestor?.parent_id); }
  function selectFolder(id: string) { setFolderId(id); setActiveId(null); }
  function openName(action: NameAction, currentName = "") { setName(currentName); setNameAction(action); }
  function applyName() {
    if (!nameAction || !name.trim() || locked) return;
    const label = name.trim();
    if (nameAction.kind === "folder") {
      if (nameAction.id) update((c) => ({ ...c, sections: c.sections.map((g) => g.id === nameAction.id ? { ...g, name: label } : g) }));
      else {
        const section = newSection(label, nameAction.parentId);
        update((c) => ({ ...c, sections: [...c.sections, section] }));
        selectFolder(section.id);
        setCollapsed((v) => v.filter((id) => id !== nameAction.parentId));
      }
    } else if (nameAction.id) patch(nameAction.id, { name: label });
    else if (nameAction.parentId) {
      const script = newScript(label, nameAction.parentId);
      update((c) => ({ ...c, scripts: [...c.scripts, script] }));
      setFolderId(nameAction.parentId); setActiveId(script.id);
    }
    setNameAction(null);
  }
  function deleteFolder(section: ScriptSection) {
    if (!confirm(`Xóa thư mục “${section.name}”? Thư mục con và kịch bản sẽ được giữ lại và chuyển ra ngoài.`)) return;
    update((c) => removeSection(c, section.id));
    if (folder?.id === section.id) { setFolderId(section.parent_id ?? null); setActiveId(null); }
  }
  function deleteScript(script: ChatScript) {
    if (!confirm(`Xóa kịch bản “${script.name}” và ${script.lines.length} nội dung bên trong?`)) return;
    update((c) => ({ ...c, scripts: c.scripts.filter((s) => s.id !== script.id) }));
    if (activeId === script.id) setActiveId(null);
  }
  function matches(section: ScriptSection): boolean {
    return !term || section.name.toLocaleLowerCase().includes(term)
      || catalogue.scripts.some((s) => s.section_id === section.id && s.name.toLocaleLowerCase().includes(term))
      || catalogue.sections.some((s) => s.parent_id === section.id && matches(s));
  }
  function folderActions(section: ScriptSection) {
    return <div className="flex flex-wrap gap-1">
      <Button variant="ghost" size="icon" title="Đổi tên thư mục" aria-label={`Đổi tên thư mục ${section.name}`} onClick={() => openName({ kind: "folder", id: section.id }, section.name)}><Pencil /></Button>
      <Button variant="ghost" size="icon" title="Thêm thư mục con" aria-label={`Thêm thư mục con vào ${section.name}`} onClick={() => openName({ kind: "folder", parentId: section.id })}><FolderPlus /></Button>
      <Button variant="ghost" size="icon" title="Thêm kịch bản" aria-label={`Thêm kịch bản vào ${section.name}`} onClick={() => openName({ kind: "script", parentId: section.id })}><Plus /></Button>
      <Button variant="ghost" size="icon" title="Xóa thư mục" aria-label={`Xóa thư mục ${section.name}`} className="text-destructive" onClick={() => deleteFolder(section)}><Trash2 /></Button>
    </div>;
  }
  function treeNode(section: ScriptSection) {
    if (!matches(section)) return null;
    const descendants = catalogue.sections.filter((s) => s.parent_id === section.id);
    const expanded = !!term || !collapsed.includes(section.id);
    return <div key={section.id}>
      <div className="flex items-center min-w-0">
        <Button variant="ghost" size="icon" className="h-8 w-7 shrink-0" aria-label={`${expanded ? "Thu gọn" : "Mở rộng"} ${section.name}`} aria-expanded={expanded} onClick={() => setCollapsed((v) => v.includes(section.id) ? v.filter((id) => id !== section.id) : [...v, section.id])}>{expanded ? <ChevronDown /> : <ChevronRight />}</Button>
        <Button variant="ghost" size="unstyled" className={`flex-1 min-w-0 justify-start p-2 text-left whitespace-normal ${folder?.id === section.id ? "bg-accent text-accent-foreground" : ""}`} aria-label={`Mở thư mục ${section.name}`} aria-pressed={folder?.id === section.id} onClick={() => selectFolder(section.id)}>{folder?.id === section.id ? <FolderOpen className="text-primary" /> : <Folder className="text-primary" />}<span className="min-w-0 flex-1 break-words">{section.name}</span></Button>
      </div>
      {expanded && <div className="script-tree-branch">{descendants.map(treeNode)}{catalogue.scripts.filter((s) => s.section_id === section.id && (!term || section.name.toLocaleLowerCase().includes(term) || s.name.toLocaleLowerCase().includes(term))).map((s) => <Button key={s.id} variant="ghost" size="unstyled" aria-label={`Mở kịch bản ${s.name}`} className={`w-full justify-start p-2 text-left whitespace-normal ${activeId === s.id ? "bg-accent text-accent-foreground" : ""}`} onClick={() => { setFolderId(section.id); setActiveId(s.id); }}><FileText className="text-muted-foreground" /><span className="min-w-0 break-words">{s.name}</span></Button>)}</div>}
    </div>;
  }
  return <div className="space-y-3 min-w-0">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="font-semibold flex-1">Kịch Bản</h3>
      <Button variant="ghost" size="sm" onClick={load} disabled={loading || saving}><RefreshCw className={loading ? "animate-spin" : ""} />Tải lại</Button>
      <Button variant="outline" size="sm" disabled={locked} onClick={() => openName({ kind: "folder" })}><FolderPlus />Tạo thư mục</Button>
      <Button size="sm" onClick={save} disabled={locked || !dirty}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Lưu</Button>
    </div>
    {dirty && <p className="text-xs text-muted-foreground" role="status">Có thay đổi chưa lưu.</p>}
    {loading ? <p className="text-sm text-muted-foreground">Đang tải…</p> : loadFailed ? <p role="alert" className="text-destructive text-sm">Không tải được dữ liệu. Hãy tải lại trước khi chỉnh sửa.</p> : <fieldset disabled={saving} className="script-explorer">
      <aside aria-label="Cây thư mục" className="script-tree">
        <label className="flex items-center gap-2 border-b px-3 py-2"><Search size={16} className="text-muted-foreground shrink-0" /><input aria-label="Tìm thư mục" placeholder="Tìm thư mục, kịch bản…" className="admv3-input flex-1 min-w-0 border-0" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <nav className="script-tree-scroll" aria-label="Thư mục kịch bản">{catalogue.sections.filter((g) => !g.parent_id).map(treeNode)}{term && !catalogue.sections.some(matches) && <p className="p-2 text-sm text-muted-foreground">Không có thư mục phù hợp.</p>}</nav>
      </aside>
      <section aria-label="Nội dung thư mục" className="min-w-0 p-3 space-y-3">
        {folder ? <>
          <nav aria-label="Đường dẫn thư mục" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{path.map((g) => <span key={g.id} className="inline-flex items-center min-w-0"><Button variant="ghost" size="sm" className="whitespace-normal text-left" onClick={() => selectFolder(g.id)}>{g.name}</Button><ChevronRight size={12} /></span>)}{active && <span className="break-words">{active.name}</span>}</nav>
          <div className="flex flex-wrap items-center gap-2 border-b pb-3">
            {active ? <FileText className="text-primary shrink-0" /> : <FolderOpen className="text-primary shrink-0" />}
            <h4 className="font-semibold flex-1 min-w-0 break-words">{active?.name ?? folder.name}</h4>
            {active ? <>
              <Button variant="ghost" size="icon" title="Đổi tên kịch bản" aria-label="Đổi tên kịch bản" onClick={() => openName({ kind: "script", id: active.id }, active.name)}><Pencil /></Button>
              {([-1, 1] as const).map((direction) => <Button key={direction} variant="ghost" size="icon" title={direction === -1 ? "Đưa kịch bản lên" : "Đưa kịch bản xuống"} aria-label={direction === -1 ? "Đưa kịch bản lên" : "Đưa kịch bản xuống"} disabled={direction === -1 ? children[0]?.id === active.id : children.at(-1)?.id === active.id} onClick={() => update((c) => { const ordered = moveItem(children, children.findIndex((s) => s.id === active.id), direction); let n = 0; return { ...c, scripts: c.scripts.map((s) => s.section_id === active.section_id ? ordered[n++] : s) }; })}>{direction === -1 ? <ArrowUp /> : <ArrowDown />}</Button>)}
              <Button variant="ghost" size="icon" title="Xóa kịch bản" aria-label="Xóa kịch bản" className="text-destructive" onClick={() => deleteScript(active)}><Trash2 /></Button>
            </> : folderActions(folder)}
          </div>
          {active ? <>
            <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" size="sm" onClick={() => setActiveId(null)}><ArrowLeft />Quay lại thư mục</Button><label className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">Chuyển đến<select aria-label="Chuyển kịch bản sang thư mục" className="admv3-input min-w-0 max-w-full" value={active.section_id} onChange={(e) => { patch(active.id, { section_id: e.target.value }); setFolderId(e.target.value); }}>{catalogue.sections.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label></div>
            <div className="script-file-list">{active.lines.map((line, i) => <div className="script-file" key={`${active.id}-${i}`}><ScriptLineRow index={i} line={line} onChange={(nl) => patch(active.id, { lines: active.lines.map((x, j) => j === i ? nl : x) })} onPickVoice={() => setVoiceFor({ sid: active.id, idx: i })} onRemove={() => { if (confirm(`Xóa nội dung ${i + 1} trong “${active.name}”?`)) patch(active.id, { lines: active.lines.filter((_, j) => j !== i) }); }} /></div>)}</div>
            <div className="flex flex-wrap gap-2">{KINDS.map(({ k, label, Icon }) => <Button key={k} variant="outline" size="sm" onClick={() => { if (k === "voice") { setVoiceFor({ sid: active.id, idx: active.lines.length }); return; } patch(active.id, { lines: [...active.lines, k === "text" ? { type: "text", text: "" } : { type: "image", url: "" }] }); }}><Icon />Thêm {label.toLocaleLowerCase()}</Button>)}</div>
          </> : <>
            <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => openName({ kind: "folder", parentId: folder.id })}><FolderPlus />Thêm thư mục con</Button><Button size="sm" onClick={() => openName({ kind: "script", parentId: folder.id })}><Plus />Thêm kịch bản</Button><span className="text-xs text-muted-foreground self-center">{subfolders.length} thư mục · {children.length} kịch bản</span></div>
            <div className="script-file-list">{subfolders.map((g) => <div className="script-file flex flex-wrap items-center gap-2" key={g.id}><Button variant="ghost" size="unstyled" className="min-w-0 flex-1 justify-start whitespace-normal text-left" onClick={() => selectFolder(g.id)}><Folder className="text-primary" /><span className="min-w-0 break-words">{g.name}</span><ChevronRight /></Button>{folderActions(g)}</div>)}{children.map((s) => <div className="script-file flex items-center gap-2" key={s.id}><Button variant="ghost" size="unstyled" aria-label={`Xem kịch bản ${s.name}`} className="min-w-0 flex-1 justify-start whitespace-normal text-left" onClick={() => setActiveId(s.id)}><FileText className="text-primary" /><span className="flex-1 min-w-0"><span className="block font-medium break-words">{s.name}</span><span className="text-xs text-muted-foreground">{s.lines.length} nội dung</span></span><ChevronRight /></Button><Button variant="ghost" size="icon" title="Đổi tên kịch bản" aria-label={`Đổi tên kịch bản ${s.name}`} onClick={() => openName({ kind: "script", id: s.id }, s.name)}><Pencil /></Button><Button variant="ghost" size="icon" title="Xóa kịch bản" aria-label={`Xóa kịch bản ${s.name}`} className="text-destructive" onClick={() => deleteScript(s)}><Trash2 /></Button></div>)}</div>
            {!children.length && !subfolders.length && <p className="text-sm text-muted-foreground py-8 text-center">Thư mục trống.</p>}
          </>}
        </> : <p className="text-sm text-muted-foreground">Chưa có thư mục.</p>}
      </section>
    </fieldset>}
    <Dialog open={!!nameAction} onOpenChange={(open) => { if (!open) setNameAction(null); }}>
      <DialogContent className="z-[210] max-w-sm" aria-describedby="script-folder-name-description">
        <DialogHeader><DialogTitle>{nameAction?.id ? "Đổi tên" : "Tạo"} {nameAction?.kind === "script" ? "kịch bản" : "thư mục"}</DialogTitle><DialogDescription id="script-folder-name-description">Tên {nameAction?.kind === "script" ? "kịch bản" : "thư mục"}</DialogDescription></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); applyName(); }} className="space-y-4"><input autoFocus aria-label="Tên thư mục" className="admv3-input w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required /><DialogFooter><Button type="button" variant="ghost" onClick={() => setNameAction(null)}>Hủy</Button><Button type="submit" disabled={!name.trim() || locked}>{nameAction?.id ? "Đổi tên" : "Tạo"}</Button></DialogFooter></form>
      </DialogContent>
    </Dialog>
    <VoiceLibraryPicker open={!!voiceFor} title="Chọn voice" storage="sb2-compressed" onClose={() => setVoiceFor(null)} onPick={(item) => { const t = voiceFor; setVoiceFor(null); if (!t) return; const nl: ScriptLine = { type: "voice", voice_id: item.id, title: item.title, storage_path: item.storage_path, duration: item.duration }; update((c) => ({ ...c, scripts: c.scripts.map((sc) => { if (sc.id !== t.sid) return sc; return { ...sc, lines: t.idx === sc.lines.length ? [...sc.lines, nl] : sc.lines.map((x, j) => j === t.idx ? nl : x) }; }) })); }} />
  </div>;
}
const KINDS = [
  { k: "text", label: "Chữ", Icon: Type },
  { k: "voice", label: "Voice", Icon: Mic },
  { k: "image", label: "Ảnh", Icon: ImageIcon },
] as const;

function ScriptLineRow({ index, line, onChange, onPickVoice, onRemove }: {
  index: number; line: ScriptLine; onChange: (l: ScriptLine) => void; onPickVoice: () => void; onRemove: () => void;
}) {
  const setKind = (k: ScriptLine["type"]) => {
    if (k === line.type) return;
    if (k === "text") onChange({ type: "text", text: "" });
    else if (k === "image") onChange({ type: "image", url: "" });
    else onPickVoice();
  };
  return (
    <div className="flex items-start gap-2 border-b py-3 last:border-b-0">
      <div className="w-20 shrink-0 space-y-1">
        <div className="text-xs text-muted-foreground pt-1">Nội dung {index + 1}</div>
        <div className="flex gap-0.5">
          {KINDS.map(({ k, label, Icon }) => (
            <Button variant="ghost" size="unstyled" key={k} type="button" title={label} aria-label={`Đổi nội dung ${index + 1} sang ${label}`} aria-pressed={line.type === k} onClick={() => setKind(k)}
              className={`admv3-btn admv3-btn-icon ${line.type === k ? "" : "admv3-btn-ghost"}`}><Icon size={12} /></Button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {line.type !== "voice" && <ScriptContentPreview line={line} />}
        {line.type === "text" && (
          <textarea aria-label={`Nội dung chữ ${index + 1}`} className="admv3-input w-full min-h-[38px]" rows={1} value={line.text} placeholder="Nội dung tin nhắn"
            onChange={(e) => onChange({ type: "text", text: e.target.value })} />
        )}
        {line.type === "voice" && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="flex-1 min-w-0"><ScriptContentPreview line={line} playVoice /></span>
            <Button variant="ghost" size="unstyled" type="button" className="admv3-btn admv3-btn-ghost" onClick={onPickVoice}>Đổi voice</Button>
          </div>
        )}
        {line.type === "image" && (
          <div className="space-y-1">
            <input aria-label={`URL ảnh ${index + 1}`} className="admv3-input w-full" value={line.url} placeholder="https://… (URL ảnh)"
              onChange={(e) => { onChange({ type: "image", url: e.target.value }); }} />
            {line.url.trim() && !isHttpUrl(line.url) && <div className="text-xs text-destructive">URL phải bắt đầu bằng http:// hoặc https://</div>}

          </div>
        )}
      </div>
      <Button variant="ghost" size="unstyled" className="admv3-btn admv3-btn-ghost admv3-btn-icon" title="Xóa nội dung" aria-label={`Xóa nội dung ${index + 1}`} onClick={onRemove}><Trash2 size={14} /></Button>
    </div>
  );
}
