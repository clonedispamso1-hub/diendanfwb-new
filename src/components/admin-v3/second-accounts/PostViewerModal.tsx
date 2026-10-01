// Popup xem bài viết trong Admin (chỉ xem — chức năng bình luận đã bị gỡ bỏ).
import { X } from "lucide-react";

const GIF_TOKEN_G = /\[\[gif:([^\]\s]+)\]\]/g;

function RichText({ text }: { text: string | null }) {
  const raw = text || "";
  const gifs = Array.from(raw.matchAll(GIF_TOKEN_G)).map((m) => m[1]);
  const plain = raw.replace(GIF_TOKEN_G, "").trim();
  return (
    <div className="space-y-1">
      {plain && <div className="whitespace-pre-wrap break-words text-sm">{plain}</div>}
      {gifs.map((u) => <img loading="lazy" decoding="async" key={u} src={u} alt="" className="max-h-40 rounded-lg border" />)}
    </div>
  );
}

export function PostViewerModal({
  title, content, onClose,
}: {
  postId: string;
  title?: string;
  content?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[90] bg-black/50 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-background rounded-xl border shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="text-sm font-semibold truncate">{title || "Bài viết"}</div>
          <button className="admv3-btn admv3-btn-ghost admv3-btn-icon" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-4 overflow-auto space-y-4 flex-1">
          {content !== undefined && (
            <div className="border rounded-lg p-3 bg-muted/30"><RichText text={content ?? ""} /></div>
          )}
        </div>
      </div>
    </div>
  );
}
