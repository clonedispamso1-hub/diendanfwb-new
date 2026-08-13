/**
 * Admin → Quản lý Tin nhắn (MESSAGE SYSTEM V2).
 *
 * • Đếm ngược realtime tới lần reset tự động (mỗi 72 giờ).
 * • Nút "Reset dữ liệu" → popup xác nhận → xoá tin nhắn + thông báo + cache
 *   realtime. Giữ nguyên tài khoản, bạn bè, phòng chat, danh sách người
 *   từng nhắn, bài viết, xu, VIP, cấu hình.
 */
import { useState } from "react";
import { toast } from "sonner";
import { adminResetChatData, formatCountdown, MESSAGE_TTL_HOURS } from "@/lib/message-retention";
import { useResetCountdown } from "@/components/candy/reset-countdown";

export function MessageResetManager() {
  const { c } = useResetCountdown();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const doReset = async () => {
    setBusy(true);
    const res = await adminResetChatData();
    setBusy(false);
    setConfirm(false);
    if (res.ok) toast.success("Đã reset dữ liệu tin nhắn & thông báo");
    else toast.error(res.error || "Reset thất bại");
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Quản lý Tin nhắn</h2>
        <p className="text-sm text-muted-foreground">
          Tin nhắn chỉ tồn tại {MESSAGE_TTL_HOURS} giờ ({MESSAGE_TTL_HOURS / 24} ngày). Sau đó toàn bộ
          tin nhắn, ảnh, sticker, voice, reaction và trạng thái đã đọc sẽ bị xoá.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Reset sau
        </div>
        <div className="mt-1 flex flex-wrap gap-3 text-2xl font-extrabold tabular-nums">
          <span>{c.days} ngày</span>
          <span>{c.hours} giờ</span>
          <span>{c.minutes} phút</span>
          <span>{c.seconds} giây</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Tự động, không cần Admin bấm — {formatCountdown(c)}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700"
      >
        Reset dữ liệu
      </button>

      {confirm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl">
            <h3 className="text-base font-bold">Bạn có chắc chắn muốn reset?</h3>
            <p className="mt-2 text-sm font-semibold">Thao tác này sẽ:</p>
            <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
              <li>✓ Xóa toàn bộ tin nhắn</li>
              <li>✓ Xóa toàn bộ thông báo</li>
              <li>✓ Xóa cache realtime</li>
              <li>✓ Giữ nguyên tài khoản</li>
              <li>✓ Giữ nguyên bạn bè</li>
              <li>✓ Giữ nguyên phòng chat</li>
              <li>✓ Giữ nguyên lịch sử người từng nhắn</li>
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(false)}
                disabled={busy}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => void doReset()}
                disabled={busy}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? "Đang reset…" : "Xác nhận Reset"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MessageResetManager;
