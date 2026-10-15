import { useRef, useState, type ReactNode, type PointerEvent } from "react";
import { Grip, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared presentation only; conversation state and delivery stay in callers. */
export function ResizableChatWindow({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  function startResize(event: PointerEvent<HTMLButtonElement>) {
    const panel = ref.current;
    if (!panel) return;
    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    const x = event.clientX, y = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    const handle = event.currentTarget;
    const move = (e: globalThis.PointerEvent) => {
      panel.style.width = `${Math.min(window.innerWidth - 24, Math.max(Math.min(420, window.innerWidth - 24), rect.width + (e.clientX - x) * 2))}px`;
      panel.style.height = `${Math.min(window.innerHeight - 24, Math.max(Math.min(360, window.innerHeight - 24), rect.height + (e.clientY - y) * 2))}px`;
    };
    const stop = () => { handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", stop); handle.removeEventListener("pointercancel", stop); };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
    setExpanded(false);
  }
  return <div ref={ref} role="dialog" aria-label="Cửa sổ chat" className={`admin-chat-window ${compact ? "admin-chat-window-compact" : ""} ${expanded ? "admin-chat-window-expanded" : ""}`} onClick={(e) => e.stopPropagation()}>
    <div className="admin-chat-window-controls"><Button variant="ghost" size="icon" title={expanded ? "Thu nhỏ cửa sổ" : "Mở rộng cửa sổ"} aria-label={expanded ? "Thu nhỏ cửa sổ" : "Mở rộng cửa sổ"} onClick={() => setExpanded((v) => !v)}>{expanded ? <Minimize2 /> : <Maximize2 />}</Button></div>
    {children}
    <Button variant="ghost" size="icon" className="admin-chat-resize" title="Kéo đổi kích thước" aria-label="Đổi kích thước cửa sổ chat" onPointerDown={startResize} onKeyDown={(e) => {
      const panel = ref.current;
      if (!panel || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
      e.preventDefault(); setExpanded(false);
      const rect = panel.getBoundingClientRect();
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") panel.style.width = `${Math.min(window.innerWidth - 24, Math.max(Math.min(420, window.innerWidth - 24), rect.width + (e.key === "ArrowRight" ? 40 : -40)))}px`;
      else panel.style.height = `${Math.min(window.innerHeight - 24, Math.max(Math.min(360, window.innerHeight - 24), rect.height + (e.key === "ArrowDown" ? 40 : -40)))}px`;
    }}><Grip /></Button>
  </div>;
}