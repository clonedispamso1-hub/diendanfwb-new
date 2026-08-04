/**
 * PHASE 3 — Popup xin quyền vị trí khi vào "Tìm quanh đây" lần đầu.
 */

import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onAllow: () => void;
  onLater: () => void;
  loading?: boolean;
}

export function LocationPermissionDialog({ open, onAllow, onLater, loading }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onLater(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <MapPin className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <DialogTitle className="text-center">📍 Cho phép truy cập vị trí</DialogTitle>
          <DialogDescription className="text-center">
            <span className="font-medium text-foreground">OKLOVE</span> cần vị trí của bạn
            để tìm thành viên gần bạn.
            <br />
            <span className="text-xs text-muted-foreground">
              Vị trí chính xác sẽ không được công khai.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={onAllow} disabled={loading} className="w-full">
            {loading ? "Đang xin quyền…" : "Cho phép"}
          </Button>
          <Button onClick={onLater} variant="ghost" className="w-full">
            Để sau
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}