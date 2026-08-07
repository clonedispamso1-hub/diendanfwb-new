/**
 * <PostPendingCard /> — thông báo đẹp sau khi thành viên thường đăng bài có ảnh.
 * Bài viết được gửi tới Admin để kiểm duyệt trước khi hiển thị công khai.
 */
import { createPortal } from "react-dom";
import { ShieldCheck, X } from "lucide-react";

export function PostPendingCard({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="ppc-backdrop" onClick={onClose} />
      <div className="ppc-card" role="dialog" aria-label="Bài viết đang chờ duyệt">
        <button className="ppc-x" onClick={onClose} aria-label="Đóng">
          <X size={16} />
        </button>
        <div className="ppc-icon">
          <ShieldCheck size={26} />
        </div>
        <h3 className="ppc-title">Đăng bài thành công!</h3>
        <p className="ppc-text">
          Bài viết có hình ảnh của bạn đang <b>chờ Admin duyệt</b>. Bài sẽ hiển thị công khai ngay
          sau khi được phê duyệt.
        </p>
        <p className="ppc-hint">⭐ Thành viên VIP đăng ảnh được hiển thị ngay lập tức.</p>
        <button className="ppc-ok" onClick={onClose}>
          Đã hiểu
        </button>
      </div>
      <style>{CSS}</style>
    </>,
    document.body,
  );
}

const CSS = `
.ppc-backdrop{position:fixed;inset:0;z-index:99998;background:rgba(6,8,18,.55);
  backdrop-filter:blur(4px);animation:ppc-fade .18s ease both;}
.ppc-card{position:fixed;z-index:99999;left:50%;top:50%;transform:translate(-50%,-50%);
  width:min(360px,92vw);padding:22px 20px 18px;text-align:center;border-radius:22px;
  background:hsl(var(--card));color:hsl(var(--foreground));
  border:1px solid hsl(var(--border));
  box-shadow:0 30px 70px -24px rgba(0,0,0,.6);
  animation:ppc-pop .24s cubic-bezier(.2,.9,.3,1.1) both;}
.ppc-x{position:absolute;top:10px;right:10px;border:0;background:hsl(var(--muted));
  width:28px;height:28px;border-radius:999px;display:grid;place-items:center;cursor:pointer;
  color:hsl(var(--muted-foreground));}
.ppc-icon{width:56px;height:56px;margin:2px auto 12px;border-radius:999px;display:grid;
  place-items:center;background:hsl(var(--primary)/.14);color:hsl(var(--primary));
  animation:ppc-pop .32s .06s cubic-bezier(.2,.9,.3,1.2) both;}
.ppc-title{font-size:17px;font-weight:900;margin:0 0 6px;}
.ppc-text{font-size:13.5px;line-height:1.55;margin:0;color:hsl(var(--muted-foreground));}
.ppc-hint{margin:10px 0 0;font-size:12.5px;font-weight:700;color:hsl(var(--primary));}
.ppc-ok{margin-top:16px;width:100%;border:0;border-radius:14px;padding:11px;cursor:pointer;
  font-weight:800;font-size:14px;background:hsl(var(--primary));color:hsl(var(--primary-foreground));}
@keyframes ppc-fade{from{opacity:0}to{opacity:1}}
@keyframes ppc-pop{from{opacity:0;transform:translate(-50%,-50%) scale(.9)}
  to{opacity:1;transform:translate(-50%,-50%) scale(1)}}
.ppc-icon{animation-name:ppc-icon-pop}
@keyframes ppc-icon-pop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}
`;

export default PostPendingCard;
