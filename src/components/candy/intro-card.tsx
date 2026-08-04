import { useMemo, useRef, useState, useEffect } from "react";
import {
  MapPin, Sparkles, Heart, Flame, User, Ruler, Target,
  MessageCircle, Star, Calendar, ChevronDown, Globe2, Users, Lock,
} from "lucide-react";
import type { Profile } from "@/lib/app-types";
import { INTENT_LABELS, type Intent } from "@/lib/vn-provinces";
import { supabase } from "@/lib/supabase";

interface IntroCardProps {
  profile: Profile;
  isOwn?: boolean;
  viewerId?: string | null;
}

type Visibility = "public" | "friends" | "private";

const GOAL_LABELS: Record<string, string> = {
  fwb: "Bạn tình (FWB)", ons: "Hẹn hò ngắn hạn (ONS)",
  serious: "Người yêu lâu dài", longterm: "Người yêu lâu dài",
  friend: "Kết bạn", friends: "Kết bạn",
};
const REL_STATUS_LABELS: Record<string, string> = {
  single: "Độc thân", taken: "Đang hẹn hò", in_relationship: "Đang hẹn hò",
  married: "Đã kết hôn", divorced: "Đã ly hôn",
  complicated: "Phức tạp", open: "Mối quan hệ mở",
};
const labelOf = (m: Record<string, string>, v?: string | null) =>
  v ? (m[String(v).toLowerCase().trim()] || v) : null;

const VIS_CYCLE: Visibility[] = ["public", "friends", "private"];
const VIS_META: Record<Visibility, { icon: typeof Globe2; title: string }> = {
  public:  { icon: Globe2, title: "Công khai" },
  friends: { icon: Users,  title: "Bạn bè" },
  private: { icon: Lock,   title: "Riêng tư" },
};

function PrivacyToggle({
  value, onChange, disabled,
}: { value: Visibility; onChange: (v: Visibility) => void; disabled?: boolean }) {
  const Meta = VIS_META[value];
  const Icon = Meta.icon;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        const i = VIS_CYCLE.indexOf(value);
        onChange(VIS_CYCLE[(i + 1) % VIS_CYCLE.length]);
      }}
      title={Meta.title}
      aria-label={`Quyền riêng tư: ${Meta.title}`}
      className="ic-priv"
    >
      <Icon size={14} />
    </button>
  );
}

function TagPills({ items, max = 8 }: { items: string[]; max?: number }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, max);
  const hidden = items.length - visible.length;
  return (
    <div className="ic-pills">
      {visible.map((t) => <span key={t} className="ic-pill">{t}</span>)}
      {hidden > 0 && (
        <button type="button" className="ic-pill ic-pill-more" onClick={() => setExpanded(true)}>
          +{hidden} thêm
        </button>
      )}
      {expanded && items.length > max && (
        <button type="button" className="ic-pill ic-pill-more" onClick={() => setExpanded(false)}>
          Thu gọn
        </button>
      )}
    </div>
  );
}

function Section({
  title, defaultOpen = true, children,
}: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | "auto">(defaultOpen ? "auto" : 0);
  useEffect(() => {
    if (!ref.current) return;
    if (open) {
      const next = ref.current.scrollHeight;
      setH(next);
      const t = setTimeout(() => setH("auto"), 260);
      return () => clearTimeout(t);
    } else {
      setH(ref.current.scrollHeight);
      requestAnimationFrame(() => setH(0));
    }
  }, [open]);
  return (
    <div className="ic-section">
      <button type="button" className="ic-section-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="ic-section-title">{title}</span>
        <ChevronDown size={16} className={`ic-chev ${open ? "open" : ""}`} />
      </button>
      <div className="ic-section-body" style={{ height: h === "auto" ? "auto" : `${h}px` }}>
        <div ref={ref}>{children}</div>
      </div>
    </div>
  );
}

export function IntroCard({ profile, isOwn = false, viewerId = null }: IntroCardProps) {
  const p = profile as any;

  // Local visibility state (optimistic)
  const [vis, setVis] = useState<Record<string, Visibility>>(() => ({
    location:     (p.location_visibility     as Visibility) || "public",
    gender:       (p.gender_visibility       as Visibility) || "public",
    birthday:     (p.birthday_visibility     as Visibility) || "public",
    zodiac:       (p.zodiac_visibility       as Visibility) || "public",
    relationship: (p.relationship_visibility as Visibility) || "public",
    goal:         (p.goal_visibility         as Visibility) || "public",
  }));

  // Mutual-follow check: viewer counts as "friend" only if BOTH follow each other.
  const [isMutualFriend, setIsMutualFriend] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (isOwn || !viewerId || !profile?.id || viewerId === profile.id) {
      setIsMutualFriend(false);
      return;
    }
    (async () => {
      try {
        const [a, b] = await Promise.all([
          supabase.from("follows").select("follower_id", { head: true, count: "exact" })
            .eq("follower_id", viewerId).eq("following_id", profile.id),
          supabase.from("follows").select("follower_id", { head: true, count: "exact" })
            .eq("follower_id", profile.id).eq("following_id", viewerId),
        ]);
        if (cancelled) return;
        setIsMutualFriend(((a.count ?? 0) > 0) && ((b.count ?? 0) > 0));
      } catch {
        if (!cancelled) setIsMutualFriend(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOwn, viewerId, profile?.id]);

  // Authorization helpers for per-field privacy enforcement.
  const canView = (v: Visibility) => {
    if (isOwn) return true;
    if (v === "public") return true;
    if (v === "friends") return isMutualFriend;
    return false; // private => owner only
  };
  const maskFor = (v: Visibility) =>
    v === "private" ? "Thông tin riêng tư" : "Chỉ chia sẻ với bạn bè";


  const updateVis = async (field: keyof typeof vis, v: Visibility) => {
    setVis(prev => ({ ...prev, [field]: v }));
    if (!isOwn) return;
    const col = `${field}_visibility`;
    try { await supabase.from("profiles").update({ [col]: v } as any).eq("id", profile.id); }
    catch { /* silent */ }
  };

  const loc = p.region || p.province || p.location;
  const locationDisplay = loc
    ? (String(loc).toLowerCase().startsWith("tp") ? String(loc).replace(/^TP\.?\s*/i, "Thành phố ") : loc)
    : null;
  const gender = p.gender as "male" | "female" | null | undefined;
  const genderLabel = gender === "male" ? "Nam" : gender === "female" ? "Nữ" : null;
  const intent = (profile.intent || p.goal) as Intent | null | undefined;
  const intentLabel = intent && INTENT_LABELS[intent as Intent]
    ? INTENT_LABELS[intent as Intent]
    : labelOf(GOAL_LABELS, p.goal);
  const intentIcon = intent === "fwb" ? Flame : intent === "ons" ? Sparkles : Heart;
  const birthday: string | null = p.birthday || null;
  const zodiac: string | null = p.zodiac || null;
  const relStatusLabel = labelOf(REL_STATUS_LABELS, p.relationship_status);
  const age = typeof p.age === "number" ? p.age : null;
  const ageLabel = age ? `${age} tuổi` : null;

  const interests: string[]   = Array.isArray(p.interests)           ? p.interests.filter(Boolean) : [];
  const personality: string[] = Array.isArray(p.personality_tags)    ? p.personality_tags.filter(Boolean) : [];
  const commStyles: string[]  = Array.isArray(p.communication_styles)? p.communication_styles.filter(Boolean) : [];
  const height = profile.height, weight = profile.weight;
  const bodyVal = height && weight ? `${height} cm · ${weight} kg` : height ? `${height} cm` : weight ? `${weight} kg` : null;

  type Row = { icon: any; label: string; value: React.ReactNode; visKey?: keyof typeof vis; muted?: boolean };
  const PLACEHOLDER = "Chưa cập nhật";
  const personalRows: Row[] = useMemo(() => {
    const r: Row[] = [];
    r.push({ icon: MapPin,     label: "Khu vực",    value: locationDisplay || PLACEHOLDER, visKey: "location",     muted: !locationDisplay });
    if (ageLabel)        r.push({ icon: User,     label: "Tuổi",            value: ageLabel });
    if (zodiac)          r.push({ icon: Star,     label: "Cung hoàng đạo",  value: zodiac, visKey: "zodiac" });
    r.push({ icon: intentIcon, label: "Mục tiêu",   value: intentLabel     || PLACEHOLDER, visKey: "goal",         muted: !intentLabel });

    return r;
  }, [locationDisplay, genderLabel, ageLabel, birthday, zodiac, relStatusLabel, intentLabel, bodyVal, intentIcon]);

  const hasTags = personality.length + commStyles.length + interests.length > 0;

  return (
    <div className="ic-root">


      <Section title="Thông tin cá nhân" defaultOpen>
        <ul className="ic-list">
          {personalRows.map((row) => {
            const Icon = row.icon;
            const fieldVis = row.visKey ? vis[row.visKey] : "public";
            const allowed = row.visKey ? canView(fieldVis) : true;
            const displayValue = allowed ? row.value : maskFor(fieldVis);
            const valueMuted = allowed ? row.muted : true;
            return (
              <li key={row.label} className="ic-row">
                <Icon size={15} className="ic-row-icon" />
                <span className="ic-row-label">{row.label}:</span>
                <span
                  className={`ic-row-value ${valueMuted ? "ic-row-value-muted" : ""} ${!allowed ? "ic-row-value-locked" : ""}`}
                >
                  {displayValue}
                </span>
                {row.visKey && isOwn && (
                  <PrivacyToggle value={vis[row.visKey]} onChange={(v) => updateVis(row.visKey!, v)} />
                )}
                {row.visKey && !isOwn && (
                  <span className="ic-priv ic-priv-readonly" title={VIS_META[vis[row.visKey]].title}>
                    {(() => { const I = VIS_META[vis[row.visKey]].icon; return <I size={14} />; })()}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      {hasTags && (
        <Section title="Phong cách & sở thích" defaultOpen={false}>
          <div className="ic-tag-groups">
            {personality.length > 0 && (
              <div className="ic-tag-group">
                <div className="ic-tag-head"><Sparkles size={13} /><span>Tính cách</span></div>
                <TagPills items={personality} />
              </div>
            )}
            {commStyles.length > 0 && (
              <div className="ic-tag-group">
                <div className="ic-tag-head"><MessageCircle size={13} /><span>Phong cách giao tiếp</span></div>
                <TagPills items={commStyles} />
              </div>
            )}
            {interests.length > 0 && (
              <div className="ic-tag-group">
                <div className="ic-tag-head"><Target size={13} /><span>Sở thích</span></div>
                <TagPills items={interests} />
              </div>
            )}
          </div>
        </Section>
      )}

      <style>{`
        .ic-root { display: flex; flex-direction: column; gap: 10px; }
        .ic-section {
          background: hsl(var(--card, 0 0% 100%));
          border: 1px solid hsl(var(--border, 220 13% 91%));
          border-radius: 12px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.02);
          overflow: hidden;
        }
        :where(.dark) .ic-section { box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
        .ic-section-head {
          width: 100%; display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px; background: transparent; border: 0;
          font-size: 13px; font-weight: 600;
          color: hsl(var(--foreground)); cursor: pointer;
          letter-spacing: 0.01em;
        }
        .ic-section-title { text-transform: none; }
        .ic-chev { transition: transform .22s ease; color: hsl(var(--muted-foreground)); }
        .ic-chev.open { transform: rotate(180deg); }
        .ic-section-body { overflow: hidden; transition: height .25s ease; }
        .ic-section-body > div { padding: 0 14px 12px; }

        .ic-bio { display: flex; gap: 8px; align-items: flex-start; }
        .ic-bio-q { color: hsl(var(--muted-foreground)); margin-top: 3px; flex-shrink: 0; }
        .ic-bio p { margin: 0; font-size: 14px; line-height: 1.55; color: hsl(var(--foreground)); white-space: pre-wrap; }
        .ic-muted { color: hsl(var(--muted-foreground)); font-style: italic; }

        .ic-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
        .ic-row {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 0;
          font-size: 13.5px;
          border-bottom: 1px dashed hsl(var(--border) / 0.6);
        }
        .ic-row:last-child { border-bottom: 0; }
        .ic-row-icon { color: hsl(var(--muted-foreground)); flex-shrink: 0; }
        .ic-row-label { color: hsl(var(--muted-foreground)); font-weight: 500; flex-shrink: 0; }
        .ic-row-value { color: hsl(var(--foreground)); font-weight: 500; flex: 1; min-width: 0; word-break: break-word; }
        .ic-row-value-muted { color: hsl(var(--muted-foreground)); font-style: italic; font-weight: 400; }

        .ic-priv {
          display: inline-flex; align-items: center; justify-content: center;
          width: 26px; height: 26px; border-radius: 8px;
          background: hsl(var(--muted) / 0.5);
          color: hsl(var(--muted-foreground));
          border: 1px solid hsl(var(--border));
          cursor: pointer; transition: background .15s ease, color .15s ease;
          flex-shrink: 0;
        }
        .ic-priv:hover { background: hsl(var(--muted)); color: hsl(var(--foreground)); }
        .ic-priv-readonly { cursor: default; opacity: 0.7; }

        .ic-tag-groups { display: flex; flex-direction: column; gap: 12px; }
        .ic-tag-group { display: flex; flex-direction: column; gap: 6px; }
        .ic-tag-head {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 600; color: hsl(var(--muted-foreground));
        }
        .ic-pills { display: flex; flex-wrap: wrap; gap: 6px; }
        .ic-pill {
          display: inline-flex; align-items: center;
          padding: 4px 10px; font-size: 12px; font-weight: 500;
          line-height: 1.4; border-radius: 999px;
          background: hsl(var(--muted) / 0.6);
          color: hsl(var(--foreground));
          border: 1px solid hsl(var(--border));
        }
        .ic-pill-more {
          cursor: pointer; background: transparent;
          color: hsl(var(--primary, 222 47% 50%));
          border-color: hsl(var(--primary, 222 47% 50%) / 0.4);
        }
        .ic-pill-more:hover { background: hsl(var(--primary, 222 47% 50%) / 0.08); }
      `}</style>
    </div>
  );
}
