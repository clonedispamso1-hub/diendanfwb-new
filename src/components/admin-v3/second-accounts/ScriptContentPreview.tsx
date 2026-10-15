import { useState } from "react";
import { ImageIcon, Mic, Type } from "lucide-react";
import type { ScriptLine } from "@/lib/admin/chat-scripts";
import { VoiceBubble } from "@/components/candy/voice-bubble";

export function ScriptContentPreview({ line, playVoice = false }: { line: ScriptLine; playVoice?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const Icon = line.type === "text" ? Type : line.type === "voice" ? Mic : ImageIcon;
  return <div className="min-w-0 space-y-2">
    <span className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs text-muted-foreground"><Icon size={12} />{line.type === "text" ? "Chữ" : line.type === "voice" ? "Voice" : "Ảnh"}</span>
    {line.type === "text" ? <p className="whitespace-pre-wrap break-words text-sm">{line.text || "Chưa có nội dung"}</p> : line.type === "voice" ? <>
      <p className="break-words text-sm">{line.title || "Voice"}{line.duration > 0 ? ` — ${line.duration} giây` : ""}</p>
      {playVoice && line.storage_path && <VoiceBubble key={line.storage_path} path={line.storage_path} duration={line.duration} />}
    </> : line.url && failedUrl !== line.url ? <img src={line.url.trim()} alt="Ảnh kịch bản" className="max-h-28 max-w-full rounded-md object-contain" onError={() => setFailedUrl(line.url)} /> : <p className="text-xs text-muted-foreground">{line.url ? "Không tải được ảnh" : "Chưa có URL ảnh"}</p>}
  </div>;
}