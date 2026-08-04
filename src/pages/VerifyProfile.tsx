import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/candy/auth-provider";
import { VerifiedBadge } from "@/components/candy/verified-badge";
import { Loader2, Upload, ShieldCheck, ArrowLeft } from "lucide-react";

type VerifRow = {
  id: string;
  status: "pending" | "approved" | "rejected";
  reason: string | null;
  created_at: string;
};

async function uploadOne(userId: string, file: File, kind: "selfie" | "portrait"): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("verification-photos")
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return path;
}

export default function VerifyProfilePage() {
  const { session, me: profile } = useAuth();
  const user = session?.user ?? null;
  const navigate = useNavigate();
  const selfieRef = useRef<HTMLInputElement | null>(null);
  const portraitRef = useRef<HTMLInputElement | null>(null);
  const [selfie, setSelfie] = useState<File | null>(null);
  const [portrait, setPortrait] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [latest, setLatest] = useState<VerifRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profile_verifications")
        .select("id, status, reason, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) {
        setLatest((data as VerifRow | null) ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const verified = !!(profile as any)?.verified;
  const pending = latest?.status === "pending";

  const submit = async () => {
    if (!user) return;
    if (!selfie || !portrait) {
      toast.error("Vui lòng chọn cả 2 ảnh");
      return;
    }
    setSubmitting(true);
    try {
      const [selfieUrl, portraitUrl] = await Promise.all([
        uploadOne(user.id, selfie, "selfie"),
        uploadOne(user.id, portrait, "portrait"),
      ]);
      const { error } = await supabase.from("profile_verifications").insert({
        user_id: user.id,
        selfie_url: selfieUrl,
        portrait_url: portraitUrl,
        status: "pending",
      });
      if (error) throw error;
      toast.success("Đã gửi yêu cầu xác thực");
      setSelfie(null);
      setPortrait(null);
      const { data } = await supabase
        .from("profile_verifications")
        .select("id, status, reason, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatest((data as VerifRow | null) ?? null);
    } catch (e: any) {
      toast.error(e?.message ?? "Gửi thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Vui lòng đăng nhập.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
        <button onClick={() => navigate(-1)} className="rounded-full p-2 hover:bg-muted">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-semibold">Hồ sơ xác thực</h1>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-4 pt-4">
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="text-sky-500" size={20} />
            <div className="font-semibold">Trạng thái</div>
            {verified && <VerifiedBadge verified showLabel />}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {verified
              ? "Tài khoản đã được xác thực."
              : pending
              ? "Yêu cầu đang chờ admin duyệt. Vui lòng đợi."
              : latest?.status === "rejected"
              ? `Bị từ chối${latest.reason ? `: ${latest.reason}` : ""}. Bạn có thể gửi lại.`
              : "Chưa gửi yêu cầu xác thực."}
          </p>
        </div>

        {!verified && !pending && (
          <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <div>
              <h2 className="text-sm font-semibold mb-1">Hướng dẫn</h2>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
                <li>Ảnh selfie: rõ mặt, không che.</li>
                <li>Ảnh chân dung: thấy toàn bộ khuôn mặt và vai.</li>
                <li>Ảnh không công khai, chỉ admin xem để duyệt.</li>
              </ul>
            </div>

            <PhotoSlot
              label="Ảnh selfie"
              file={selfie}
              onPick={() => selfieRef.current?.click()}
            />
            <input
              ref={selfieRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => setSelfie(e.target.files?.[0] ?? null)}
            />

            <PhotoSlot
              label="Ảnh chân dung rõ mặt"
              file={portrait}
              onPick={() => portraitRef.current?.click()}
            />
            <input
              ref={portraitRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setPortrait(e.target.files?.[0] ?? null)}
            />

            <button
              disabled={submitting || !selfie || !portrait}
              onClick={submit}
              className="w-full rounded-xl bg-primary py-3 font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? <Loader2 className="mx-auto animate-spin" size={18} /> : "Gửi xác thực"}
            </button>
          </div>
        )}

        {loading && <div className="text-center text-xs text-muted-foreground">Đang tải…</div>}
      </div>
    </div>
  );
}

function PhotoSlot({ label, file, onPick }: { label: string; file: File | null; onPick: () => void }) {
  const url = file ? URL.createObjectURL(file) : null;
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-3 text-left hover:bg-muted/50"
    >
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {url ? <img loading="lazy" decoding="async" src={url} alt={label} className="h-full w-full object-cover" /> : <Upload size={18} className="text-muted-foreground" />}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{file ? file.name : "Bấm để chọn ảnh"}</div>
      </div>
    </button>
  );
}
