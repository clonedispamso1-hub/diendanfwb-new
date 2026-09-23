import { useEffect, useRef, useState } from "react";
import {
  AlignLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/app-types";
import { logActivity } from "@/lib/activity-log";
import { getFriendlyError } from "@/lib/friendly-error";
import { isReservedDisplayName, RESERVED_DISPLAY_NAME_MESSAGE } from "@/lib/reserved-display-names";
import { invalidateProfile, patchProfileCache, emitProfileUpdated } from "@/lib/profile-cache";
import { resolveUserName } from "@/lib/user-name";

const BIO_LIMIT = 200;
const NAME_MIN = 2;
const NAME_MAX = 16;
const NAME_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;
const NAME_LIMIT = 2;

type Editor = "name" | "bio" | null;

interface EditProfileSheetProps {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  onSaved: () => void;
  onChangePassword?: () => void;
}

export function EditProfileSheet({
  open,
  onClose,
  profile,
  onSaved,
  onChangePassword,
}: EditProfileSheetProps) {
  const initialName = resolveUserName(profile as any, "");
  const initialBio = (profile.bio || "").slice(0, BIO_LIMIT);
  const [fullName, setFullName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [editor, setEditor] = useState<Editor>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(resolveUserName(profile as any, ""));
    setBio((profile.bio || "").slice(0, BIO_LIMIT));
    setEditor(null);
  }, [open, profile]);

  const busyRef = useRef(false);
  busyRef.current = saving;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleBack = () => {
    if (busyRef.current) return;
    if (editor) {
      setFullName(resolveUserName(profile as any, ""));
      setBio((profile.bio || "").slice(0, BIO_LIMIT));
      setEditor(null);
      return;
    }
    onCloseRef.current();
  };

  const syncProfile = (payload: Record<string, unknown>) => {
    patchProfileCache(profile.id, payload);
    emitProfileUpdated(profile.id, payload);
    onSaved();
  };

  const handleSaveName = async () => {
    if (saving) return;
    const newName = fullName.trim();
    const currentName = resolveUserName(profile as any, "").trim();
    const nameChanged = newName !== currentName;

    if (newName.length < NAME_MIN || newName.length > NAME_MAX) {
      toast.error(`Tên hiển thị phải từ ${NAME_MIN} đến ${NAME_MAX} ký tự.`);
      return;
    }
    if (/[<>]/.test(newName)) {
      toast.error("Tên hiển thị chứa ký tự không hợp lệ.");
      return;
    }
    if (isReservedDisplayName(newName)) {
      toast.error(RESERVED_DISPLAY_NAME_MESSAGE);
      return;
    }
    if (!nameChanged) {
      setEditor(null);
      return;
    }

    const lastNameAt = profile.last_name_change ? new Date(profile.last_name_change).getTime() : 0;
    const withinNameWindow = Boolean(lastNameAt && Date.now() - lastNameAt < NAME_WINDOW_MS);
    const usedInWindow = withinNameWindow ? profile.name_changes || 0 : 0;
    if (usedInWindow >= NAME_LIMIT) {
      const next = new Date(lastNameAt + NAME_WINDOW_MS);
      toast.error(
        `Đã đổi tên đủ ${NAME_LIMIT} lần / 60 ngày. Thử lại sau ${next.toLocaleDateString("vi-VN")}.`,
      );
      return;
    }

    setSaving(true);
    try {
      const { data: existed } = await supabase
        .from("profiles")
        .select("id")
        .eq("full_name", newName)
        .neq("id", profile.id)
        .maybeSingle();
      if (existed) {
        toast.error("Tên hiển thị đã được sử dụng.");
        return;
      }

      const payload: Record<string, unknown> = {
        full_name: newName,
        display_name: newName,
        name_changes: withinNameWindow ? (profile.name_changes || 0) + 1 : 1,
        last_name_change: new Date().toISOString(),
      };
      const { error } = await supabase
        .from("profiles")
        .update(payload as any)
        .eq("id", profile.id);
      if (error) {
        invalidateProfile(profile.id);
        console.error("[EditProfileSheet] name update error", error);
        toast.error(getFriendlyError(error, "Thao tác không thành công. Vui lòng thử lại."));
        return;
      }

      syncProfile(payload);
      void logActivity({
        userId: profile.id,
        actionType: "name_change",
        description: `Bạn đã thay đổi tên hiển thị thành “${newName}”.`,
        metadata: { from: currentName, to: newName },
      });
      toast.success("Đã cập nhật tên hiển thị.");
      setEditor(null);
    } catch (error) {
      console.error("[EditProfileSheet] name save error", error);
      toast.error(getFriendlyError(error, "Thao tác không thành công. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBio = async () => {
    if (saving) return;
    const newBio = bio.trim();
    const currentBio = (profile.bio || "").trim();
    if (newBio === currentBio) {
      setEditor(null);
      return;
    }

    setSaving(true);
    try {
      const payload = { bio: newBio };
      const { error } = await supabase
        .from("profiles")
        .update(payload as any)
        .eq("id", profile.id);
      if (error) {
        invalidateProfile(profile.id);
        console.error("[EditProfileSheet] bio update error", error);
        toast.error(getFriendlyError(error, "Thao tác không thành công. Vui lòng thử lại."));
        return;
      }

      syncProfile(payload);
      if (newBio) {
        void logActivity({
          userId: profile.id,
          actionType: "status_update",
          description: `Bạn đã cập nhật trạng thái mới: “${newBio.slice(0, 80)}”.`,
          metadata: { preview: newBio.slice(0, 120) },
        });
      }
      toast.success("Đã cập nhật tiểu sử.");
      setEditor(null);
    } catch (error) {
      console.error("[EditProfileSheet] bio save error", error);
      toast.error(getFriendlyError(error, "Thao tác không thành công. Vui lòng thử lại."));
    } finally {
      setSaving(false);
    }
  };

  const editingName = editor === "name";
  const editingBio = editor === "bio";

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        className="ep-sheet h-[min(92dvh,720px)] overflow-y-auto overscroll-contain rounded-t-[26px] border-0 bg-background p-0 shadow-2xl [&>button.absolute]:hidden sm:left-1/2 sm:max-w-xl sm:-translate-x-1/2"
      >
        <div className="sticky top-0 z-20 border-b border-border/50 bg-background/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex w-full max-w-xl items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={saving}
              className="settings-back-button"
            >
              <ChevronLeft size={16} strokeWidth={2.25} />
              Quay lại
            </Button>
            <h2 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-bold text-foreground">
              {editingName ? "Tên hiển thị" : editingBio ? "Tiểu sử" : "Chỉnh sửa trang cá nhân"}
            </h2>
            <div className="h-9 w-[78px]" aria-hidden="true" />
          </div>
        </div>

        <main className="mx-auto w-full max-w-xl px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-5 sm:px-6">
          {!editor ? (
            <section aria-labelledby="public-profile-heading">
              <div className="mb-5 px-1">
                <h3 id="public-profile-heading" className="text-[18px] font-bold text-foreground">
                  Thông tin công khai
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  Đây là những thông tin bạn có thể thay đổi và mọi người sẽ nhìn thấy trên hồ sơ.
                </p>
              </div>

              <div className="overflow-hidden rounded-2xl bg-card shadow-[0_8px_28px_-20px_var(--color-foreground)] ring-1 ring-border/50">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditor("name")}
                  className="h-auto min-h-20 w-full justify-start whitespace-normal rounded-none border-0 bg-card px-4 py-4 text-left shadow-none transition hover:bg-accent/40 active:bg-accent/60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <UserRound size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-muted-foreground">
                      Tên hiển thị
                    </span>
                    <span className="mt-0.5 block truncate text-[15px] font-bold text-foreground">
                      {fullName || "Chưa cập nhật"}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted-foreground/70" />
                </Button>

                <div className="mx-4 h-px bg-border/55" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditor("bio")}
                  className="h-auto min-h-20 w-full justify-start whitespace-normal rounded-none border-0 bg-card px-4 py-4 text-left shadow-none transition hover:bg-accent/40 active:bg-accent/60"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <AlignLeft size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12px] font-semibold text-muted-foreground">
                      Tiểu sử
                    </span>
                    <span className="mt-0.5 block line-clamp-2 text-[14px] font-medium leading-relaxed text-foreground">
                      {bio || "Chưa có tiểu sử"}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted-foreground/70" />
                </Button>
              </div>
              {onChangePassword ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onChangePassword}
                  className="mt-4 h-12 w-full justify-start rounded-xl px-3 text-[14px] font-semibold text-foreground"
                >
                  <LockKeyhole className="text-primary" />
                  Đổi mật khẩu
                  <ChevronRight className="ml-auto text-muted-foreground" />
                </Button>
              ) : null}
            </section>
          ) : (
            <section className="animate-in fade-in slide-in-from-right-2 duration-200">
              <div className="mb-5 px-1">
                <h3 className="text-[18px] font-bold text-foreground">
                  {editingName ? "Chỉnh sửa tên hiển thị" : "Chỉnh sửa tiểu sử"}
                </h3>
                <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                  {editingName
                    ? `Tên dài từ ${NAME_MIN}–${NAME_MAX} ký tự và được đổi ${NAME_LIMIT} lần trong 60 ngày.`
                    : "Viết ngắn gọn về bạn để mọi người dễ dàng làm quen."}
                </p>
              </div>

              <div className="rounded-2xl bg-card p-4 shadow-[0_8px_28px_-20px_var(--color-foreground)] ring-1 ring-border/50">
                {editingName ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="edit-profile-name"
                        className="text-[12px] font-semibold text-foreground"
                      >
                        Tên hiển thị
                      </label>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {fullName.length}/{NAME_MAX}
                      </span>
                    </div>
                    <input
                      id="edit-profile-name"
                      autoFocus
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value.slice(0, NAME_MAX))}
                      maxLength={NAME_MAX}
                      placeholder="Tên hiển thị"
                      enterKeyHint="done"
                      onFocus={(event) =>
                        window.setTimeout(
                          () =>
                            event.currentTarget.scrollIntoView({
                              block: "center",
                              behavior: "smooth",
                            }),
                          180,
                        )
                      }
                      className="h-12 w-full rounded-xl border border-input bg-background px-3.5 text-[16px] font-medium text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                    />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="edit-profile-bio"
                        className="text-[12px] font-semibold text-foreground"
                      >
                        Tiểu sử
                      </label>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {bio.length}/{BIO_LIMIT}
                      </span>
                    </div>
                    <textarea
                      id="edit-profile-bio"
                      autoFocus
                      rows={5}
                      value={bio}
                      onChange={(event) => setBio(event.target.value.slice(0, BIO_LIMIT))}
                      maxLength={BIO_LIMIT}
                      placeholder="Viết vài dòng giới thiệu về bản thân..."
                      enterKeyHint="done"
                      onFocus={(event) =>
                        window.setTimeout(
                          () =>
                            event.currentTarget.scrollIntoView({
                              block: "center",
                              behavior: "smooth",
                            }),
                          180,
                        )
                      }
                      className="w-full resize-none rounded-xl border border-input bg-background px-3.5 py-3 text-[16px] leading-relaxed text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                    />
                  </div>
                )}
              </div>

              <Button
                type="button"
                onClick={() => void (editingName ? handleSaveName() : handleSaveBio())}
                disabled={saving}
                className="mt-5 h-12 w-full rounded-xl text-[14px] font-bold shadow-sm shadow-primary/15 active:scale-[0.99]"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} strokeWidth={2.75} />
                )}
                {saving ? "Đang lưu" : editingName ? "Lưu tên hiển thị" : "Lưu tiểu sử"}
              </Button>
            </section>
          )}
        </main>
      </SheetContent>
    </Sheet>
  );
}
