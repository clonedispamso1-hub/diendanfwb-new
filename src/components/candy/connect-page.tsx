import { useEffect, useState } from "react";
import { Heart, MapPin, UserRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/candy/auth-provider";
import { supabase } from "@/lib/supabase";
import { setProfileHeart } from "@/lib/follow-actions";
import { resolveUserName, DEFAULT_USER_NAME } from "@/lib/user-name";
import { avatarSrc } from "@/lib/image-cdn";
import "@/styles/connect-setup.css";

type Member = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  nickname: string | null;
  avatar: string | null;
  location: string | null;
  age: number | null;
  gender: string | null;
  intent: string | null;
  is_banned: boolean | null;
};

export function relationshipLabel(intent: string | null): string | null {
  switch (intent?.trim().toLowerCase()) {
    case "fwb": return "FWB";
    case "ons": return "ONS";
    case "love": return "Người Yêu";
    default: return null;
  }
}

export function isDisplayableMember(member: Member, viewerId: string): boolean {
  return member.id !== viewerId && member.is_banned !== true &&
    resolveUserName(member) !== DEFAULT_USER_NAME &&
    Boolean(member.avatar?.trim() && member.location?.trim() &&
      Number.isInteger(member.age) && Number(member.age) >= 18 &&
      (member.gender === "male" || member.gender === "female") && relationshipLabel(member.intent));
}

export function ConnectPage() {
  const { me } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setMembers([]);
    setIndex(0);
    setLoading(true);
    setError("");
    if (!me?.id) {
      setLoading(false);
      return () => { active = false; };
    }
    void (async () => {
      try {
        const { data, error: queryError } = await supabase.from("profiles")
          .select("id, display_name, full_name, nickname, avatar, location, age, gender, intent, is_banned")
          .order("created_at", { ascending: false }).limit(100);
        if (queryError) throw queryError;
        if (active) setMembers(((data ?? []) as Member[]).filter((member) => isDisplayableMember(member, me.id)));
      } catch {
        if (active) setError("Không thể tải hồ sơ lúc này.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [me?.id]);

  const member = members[index];
  const next = () => { setError(""); setImageFailed(false); setIndex((current) => current + 1); };
  const heart = async () => {
    if (!me?.id || !member || acting) return;
    setActing(true);
    setError("");
    try {
      const saved = await setProfileHeart(me.id, member.id, true);
      if (saved) next();
      else setError("Chưa thể lưu lượt yêu thích. Vui lòng thử lại.");
    } catch {
      setError("Chưa thể lưu lượt yêu thích. Vui lòng thử lại.");
    } finally {
      setActing(false);
    }
  };

  return <main className="connect-members" aria-label="Kết nối">
    {loading ? <p className="connect-members__empty" role="status">Đang tải hồ sơ…</p> : member ? (
      <article className="connect-member" aria-label={`Hồ sơ ${resolveUserName(member)}`}>
        <div className="connect-member__portrait">
          {imageFailed ? <UserRound size={64} aria-label="Không tải được ảnh đại diện" /> :
            <img src={avatarSrc(member.avatar, 320)} alt={`Ảnh đại diện ${resolveUserName(member)}`} onError={() => setImageFailed(true)} />}
        </div>
        <div className="connect-member__info">
          <h1>{resolveUserName(member)}</h1>
          <p className="connect-member__identity">{member.gender === "male" ? "Nam" : "Nữ"} <span aria-hidden="true">·</span> {member.age} tuổi</p>
          <p className="connect-member__location"><MapPin size={18} aria-hidden="true" />{member.location}</p>
          <p className="connect-member__relationship">{relationshipLabel(member.intent)}</p>
        </div>
        <div className="connect-member__actions">
          <Button type="button" variant="outline" size="icon" aria-label="Bỏ qua" title="Bỏ qua" onClick={next} disabled={acting} className="connect-member__pass"><X size={31} strokeWidth={2.4} /></Button>
          <Button type="button" size="icon" aria-label="Yêu thích" title="Yêu thích" onClick={heart} disabled={acting} className="connect-member__heart"><Heart size={31} fill="currentColor" strokeWidth={1.8} /></Button>
        </div>
        {error && <p className="connect-member__error" role="alert">{error}</p>}
      </article>
    ) : <div className="connect-members__empty" role="status"><UserRound size={36} aria-hidden="true" /><p>{error || "Chưa có hồ sơ thành viên phù hợp để hiển thị."}</p></div>}
  </main>;
}
