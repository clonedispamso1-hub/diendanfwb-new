// Nút "Xóa dữ liệu Bot" — chỉ dọn lịch sử/hàng đợi công việc của Bot.
// Bài viết, bình luận và lượt follow đã thực thi KHÔNG bị ảnh hưởng.
// SQL: docs/sql/RUN_NOW_2026-08-19_CLEAR_BOT_SCENARIO_DATA.sql
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { scenarioKeys } from "@/lib/admin/scenario-keys";

const CONFIRM_TEXT =
  "Bạn có chắc chắn muốn xóa toàn bộ danh sách/lịch sử công việc của Bot trong mục này? " +
  "(Lưu ý: Các bài viết, bình luận và lượt follow đã thực thi trên trang web vẫn sẽ được giữ nguyên).";

export function ClearBotDataButton({
  tab,
  onCleared,
}: {
  tab: "posts" | "comments" | "follows" | "all";
  onCleared?: () => void | Promise<void>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("clear_bot_scenario_data", { p_tab: tab });
      if (error) throw error;
      toast.success("Đã dọn dẹp dữ liệu lịch sử Bot thành công!");
      await qc.invalidateQueries({ queryKey: scenarioKeys.all, refetchType: "all" });
      await onCleared?.();
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Không xóa được dữ liệu Bot");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        className="admv3-btn admv3-btn-ghost text-red-500"
        onClick={() => setOpen(true)}
        disabled={busy}
      >
        <Trash2 size={14} /> Xóa dữ liệu Bot
      </button>

      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa dữ liệu Bot</AlertDialogTitle>
            <AlertDialogDescription>{CONFIRM_TEXT}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void run();
              }}
            >
              {busy ? "Đang xóa..." : "Xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
