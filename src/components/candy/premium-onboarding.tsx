import { avatarSrc } from "@/lib/image-cdn";
import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronRight, ChevronLeft, Plus, Loader2, Sparkles, MapPin, Phone, ShieldCheck, Mars, Venus, Transgender } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/components/candy/auth-provider";
import { VN_PROVINCES } from "@/lib/vn-provinces";
import { ProvinceCombobox } from "@/components/candy/province-combobox";
import { AgeSheet, ageLabel } from "@/components/candy/age-bottom-sheet";


/* ──────────────────────────────────────────────────────────────
 * Premium Onboarding Flow — luxury dark theme + i18n (VI/EN/TW/CN)
 * 10 steps + final radar matching animation.
 * Gating: profiles.is_onboarding_completed must become TRUE only
 * after the radar finishes.
 * ────────────────────────────────────────────────────────────── */

type Lang = "vi" | "en" | "tw" | "cn";

const LANG_OPTIONS: Array<{ code: Lang; flag: string; label: string }> = [
  { code: "vi", flag: "🇻🇳", label: "Tiếng Việt" },
  { code: "en", flag: "🇬🇧", label: "English" },
  { code: "tw", flag: "🇹🇼", label: "繁體中文" },
  { code: "cn", flag: "🇨🇳", label: "简体中文" },
];

/* ───── i18n dictionary ───── */
const T = {
  welcome: { vi: "Chào mừng bạn", en: "Welcome", tw: "歡迎光臨", cn: "欢迎光临" },
  pickLang: { vi: "Chọn ngôn ngữ của bạn", en: "Choose your language", tw: "選擇您的語言", cn: "选择您的语言" },
  continue: { vi: "Tiếp tục", en: "Continue", tw: "繼續", cn: "继续" },
  back: { vi: "Quay lại", en: "Back", tw: "返回", cn: "返回" },
  tosTitle: { vi: "Điều khoản dịch vụ", en: "Terms of Service", tw: "服務條款", cn: "服务条款" },
  tosBody: {
    vi: `Chào mừng bạn đến với nền tảng. Bằng việc sử dụng dịch vụ, bạn đồng ý:\n\n1. Tôn trọng người dùng khác, không quấy rối, không phát tán nội dung khiêu dâm trẻ vị thành niên hoặc bất hợp pháp.\n2. Tự chịu trách nhiệm về nội dung mình đăng tải.\n3. Không sử dụng nền tảng để lừa đảo, rửa tiền hoặc các hành vi vi phạm pháp luật.\n4. Nền tảng có quyền tạm khoá, xoá tài khoản vi phạm mà không cần báo trước.\n5. Dữ liệu cá nhân được lưu trữ và xử lý theo Chính sách Bảo mật.\n6. Bạn xác nhận đã đủ 18 tuổi và có đầy đủ năng lực hành vi dân sự.\n7. Mọi tranh chấp được giải quyết theo pháp luật Việt Nam.\n\nVui lòng đọc kỹ trước khi tiếp tục.`,
    en: `Welcome. By using this platform you agree to:\n\n1. Respect other users, no harassment, no minor / illegal sexual content.\n2. Take full responsibility for content you publish.\n3. Not use the platform for fraud, money laundering, or any illegal activity.\n4. The platform may suspend or delete violating accounts without notice.\n5. Personal data is processed under our Privacy Policy.\n6. You confirm you are at least 18 years old and legally competent.\n7. Disputes are resolved under applicable local law.\n\nPlease read carefully before continuing.`,
    tw: `歡迎使用本平台。使用即表示您同意：\n\n1. 尊重其他用戶，不騷擾、不傳播未成年或違法色情內容。\n2. 自行承擔所發布內容的全部責任。\n3. 不得用於詐騙、洗錢或任何違法活動。\n4. 平台有權在不另行通知的情況下暫停或刪除違規帳戶。\n5. 個人資料依《隱私政策》處理。\n6. 您確認已滿 18 歲且具有完全民事行為能力。\n7. 爭議依當地法律解決。\n\n請於繼續前仔細閱讀。`,
    cn: `欢迎使用本平台。使用即表示您同意：\n\n1. 尊重其他用户，不骚扰、不传播未成年或违法色情内容。\n2. 自行承担所发布内容的全部责任。\n3. 不得用于诈骗、洗钱或任何违法活动。\n4. 平台有权在不另行通知的情况下暂停或删除违规账户。\n5. 个人资料依《隐私政策》处理。\n6. 您确认已年满 18 岁且具有完全民事行为能力。\n7. 争议依当地法律解决。\n\n请于继续前仔细阅读。`,
  },
  agreeTos: {
    vi: "Tôi đồng ý với tất cả điều khoản trên",
    en: "I agree to all terms above",
    tw: "我同意以上所有條款",
    cn: "我同意以上所有条款",
  },
  agreeAge: {
    vi: "Tôi xác nhận mình đã trên 18 tuổi",
    en: "I confirm I am over 18 years old",
    tw: "我確認本人已年滿 18 歲",
    cn: "我确认本人已年满 18 岁",
  },
  yourGender: { vi: "Giới tính của bạn", en: "Your gender", tw: "您的性別", cn: "您的性别" },
  targetGender: { vi: "Giới tính bạn muốn tìm kiếm", en: "Gender you're looking for", tw: "您想尋找的性別", cn: "您想寻找的性别" },
  male: { vi: "Nam", en: "Male", tw: "男", cn: "男" },
  female: { vi: "Nữ", en: "Female", tw: "女", cn: "女" },
  other: { vi: "Khác", en: "Other", tw: "其他", cn: "其他" },
  uploadAvatar: { vi: "Tải lên ảnh đại diện", en: "Upload your avatar", tw: "上傳頭像", cn: "上传头像" },
  uploadHint: { vi: "Nhấn để chọn ảnh", en: "Tap to choose a photo", tw: "點擊選擇照片", cn: "点击选择照片" },
  nickname: { vi: "Tên hiển thị (Nickname)", en: "Display name (Nickname)", tw: "暱稱", cn: "昵称" },
  birthday: { vi: "Ngày tháng năm sinh", en: "Date of birth", tw: "出生日期", cn: "出生日期" },
  zodiac: { vi: "Cung hoàng đạo", en: "Zodiac sign", tw: "星座", cn: "星座" },
  goal: { vi: "Bạn muốn tìm điều gì?", en: "What are you looking for?", tw: "您想尋找什麼？", cn: "您想寻找什么？" },
  fwb: { vi: "FWB", en: "FWB", tw: "FWB", cn: "FWB" },
  ons: { vi: "ONS", en: "ONS", tw: "ONS", cn: "ONS" },
  love: { vi: "Người yêu lâu dài", en: "Long-term partner", tw: "長期伴侶", cn: "长期伴侣" },
  relStatus: { vi: "Tình trạng hôn nhân", en: "Relationship status", tw: "感情狀態", cn: "感情状态" },
  single: { vi: "Độc thân", en: "Single", tw: "單身", cn: "单身" },
  separated: { vi: "Đã ly thân", en: "Separated", tw: "已分居", cn: "已分居" },
  married: { vi: "Đã kết hôn", en: "Married", tw: "已婚", cn: "已婚" },
  dating: { vi: "Đang hẹn hò", en: "In a relationship", tw: "戀愛中", cn: "恋爱中" },
  personality: { vi: "Tính cách", en: "Personality", tw: "個性", cn: "个性" },
  commStyle: { vi: "Phong cách giao tiếp", en: "Communication style", tw: "溝通風格", cn: "沟通风格" },
  interests: { vi: "Sở thích", en: "Interests", tw: "興趣", cn: "兴趣" },
  region: { vi: "Khu vực của bạn", en: "Your region", tw: "您的地區", cn: "您的地区" },
  regionHint: { vi: "Chọn tỉnh / thành phố nơi bạn đang sống", en: "Pick the province / city where you live", tw: "選擇您所在的省 / 城市", cn: "选择您所在的省 / 城市" },
  pickRegion: { vi: "-- Chọn tỉnh / thành --", en: "-- Select province / city --", tw: "-- 選擇省 / 市 --", cn: "-- 选择省 / 市 --" },
  matching: { vi: "Đang tìm kiếm người phù hợp...", en: "Finding suitable people...", tw: "開始 Vibe Matching...", cn: "开始 Vibe Matching..." },
  finish: { vi: "Hoàn tất", en: "Finish", tw: "完成", cn: "完成" },
  saving: { vi: "Đang lưu...", en: "Saving...", tw: "儲存中...", cn: "保存中..." },
} as const;

const t = (key: keyof typeof T, lang: Lang) => T[key][lang];

/* ───── Tag pools ───── */
const PERSONALITY_TAGS: Record<Lang, string[]> = {
  vi: ["Hướng nội", "Hướng ngoại", "Hài hước", "Lãng mạn", "Bí ẩn", "Chân thành", "Năng động", "Trầm tính", "Tự tin", "Dễ thương", "Mạnh mẽ", "Dịu dàng", "Thông minh", "Sáng tạo", "Trách nhiệm"],
  en: ["Introvert", "Extrovert", "Funny", "Romantic", "Mysterious", "Sincere", "Energetic", "Quiet", "Confident", "Cute", "Strong", "Gentle", "Smart", "Creative", "Responsible"],
  tw: ["內向", "外向", "幽默", "浪漫", "神秘", "真誠", "活力", "安靜", "自信", "可愛", "堅強", "溫柔", "聰明", "創意", "負責"],
  cn: ["内向", "外向", "幽默", "浪漫", "神秘", "真诚", "活力", "安静", "自信", "可爱", "坚强", "温柔", "聪明", "创意", "负责"],
};

const COMMUNICATION_TAGS: Record<Lang, string[]> = {
  vi: ["Trực tiếp", "Tế nhị", "Hài hước", "Sâu sắc", "Lắng nghe", "Cảm xúc", "Lý trí", "Flirty", "Thẳng thắn", "Ấm áp"],
  en: ["Direct", "Tactful", "Humorous", "Deep", "Listener", "Emotional", "Logical", "Flirty", "Straight-up", "Warm"],
  tw: ["直接", "委婉", "幽默", "深度", "傾聽", "感性", "理性", "曖昧", "坦率", "溫暖"],
  cn: ["直接", "委婉", "幽默", "深度", "倾听", "感性", "理性", "暧昧", "坦率", "温暖"],
};

const INTEREST_TAGS: Record<Lang, string[]> = {
  vi: ["Du lịch ✈️", "Phim ảnh 🎬", "Âm nhạc 🎧", "Nấu ăn 🍳", "Game 🎮", "Bóng đá ⚽", "Gym 💪", "Yoga 🧘", "Đọc sách 📚", "Cà phê ☕", "Thời trang 👗", "Thú cưng 🐶", "Nhiếp ảnh 📷", "Nghệ thuật 🎨", "Khiêu vũ 💃", "Mua sắm 🛍️", "Công nghệ 💻", "Phượt 🏍️", "Karaoke 🎤", "Pub & Bar 🍷", "Chạy bộ 🏃", "Bơi lội 🏊", "Anime 🌸", "Thiền 🕉️"],
  en: ["Travel ✈️", "Movies 🎬", "Music 🎧", "Cooking 🍳", "Gaming 🎮", "Football ⚽", "Gym 💪", "Yoga 🧘", "Reading 📚", "Coffee ☕", "Fashion 👗", "Pets 🐶", "Photography 📷", "Art 🎨", "Dance 💃", "Shopping 🛍️", "Tech 💻", "Road trips 🏍️", "Karaoke 🎤", "Pub & Bar 🍷", "Running 🏃", "Swimming 🏊", "Anime 🌸", "Meditation 🕉️"],
  tw: ["旅行 ✈️", "電影 🎬", "音樂 🎧", "烹飪 🍳", "電玩 🎮", "足球 ⚽", "健身 💪", "瑜珈 🧘", "閱讀 📚", "咖啡 ☕", "時尚 👗", "寵物 🐶", "攝影 📷", "藝術 🎨", "舞蹈 💃", "購物 🛍️", "科技 💻", "公路旅行 🏍️", "K歌 🎤", "酒吧 🍷", "跑步 🏃", "游泳 🏊", "動漫 🌸", "冥想 🕉️"],
  cn: ["旅行 ✈️", "电影 🎬", "音乐 🎧", "烹饪 🍳", "电玩 🎮", "足球 ⚽", "健身 💪", "瑜伽 🧘", "阅读 📚", "咖啡 ☕", "时尚 👗", "宠物 🐶", "摄影 📷", "艺术 🎨", "舞蹈 💃", "购物 🛍️", "科技 💻", "公路旅行 🏍️", "K歌 🎤", "酒吧 🍷", "跑步 🏃", "游泳 🏊", "动漫 🌸", "冥想 🕉️"],
};

/* ───── Mutually-exclusive tag pairs (per language) ─────
 * Selecting one of these tags automatically deselects/blocks its opposite. */
const EXCLUSIVE_PAIRS: Record<"personality" | "comm", Record<Lang, Array<[string, string]>>> = {
  personality: {
    vi: [["Hướng nội", "Hướng ngoại"], ["Năng động", "Trầm tính"], ["Mạnh mẽ", "Dịu dàng"]],
    en: [["Introvert", "Extrovert"], ["Energetic", "Quiet"], ["Strong", "Gentle"]],
    tw: [["內向", "外向"], ["活力", "安靜"], ["堅強", "溫柔"]],
    cn: [["内向", "外向"], ["活力", "安静"], ["坚强", "温柔"]],
  },
  comm: {
    vi: [["Trực tiếp", "Tế nhị"], ["Cảm xúc", "Lý trí"]],
    en: [["Direct", "Tactful"], ["Emotional", "Logical"]],
    tw: [["直接", "委婉"], ["感性", "理性"]],
    cn: [["直接", "委婉"], ["感性", "理性"]],
  },
};

const MAX_TAGS_PER_CATEGORY = 3;

function findExclusive(tag: string, pairs: Array<[string, string]>): string | null {
  for (const [a, b] of pairs) {
    if (a === tag) return b;
    if (b === tag) return a;
  }
  return null;
}

/* ───── Zodiac calculator ───── */
const ZODIACS: Record<Lang, string[]> = {
  vi: ["Bạch Dương", "Kim Ngưu", "Song Tử", "Cự Giải", "Sư Tử", "Xử Nữ", "Thiên Bình", "Bọ Cạp", "Nhân Mã", "Ma Kết", "Bảo Bình", "Song Ngư"],
  en: ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"],
  tw: ["牡羊座", "金牛座", "雙子座", "巨蟹座", "獅子座", "處女座", "天秤座", "天蠍座", "射手座", "摩羯座", "水瓶座", "雙魚座"],
  cn: ["白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座", "水瓶座", "双鱼座"],
};

function calcZodiacIndex(date: Date): number {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const cutoffs: Array<[number, number, number]> = [
    [3, 21, 0], [4, 20, 1], [5, 21, 2], [6, 22, 3], [7, 23, 4], [8, 23, 5],
    [9, 23, 6], [10, 23, 7], [11, 22, 8], [12, 22, 9], [1, 20, 10], [2, 19, 11],
  ];
  for (const [mm, dd, idx] of cutoffs) {
    if (m === mm && d >= dd) return idx;
    if (m === ((mm % 12) + 1) && d < (cutoffs[(idx + 1) % 12][1])) return idx;
  }
  return 9; // fallback Capricorn
}

function getZodiac(birthday: string, lang: Lang): string {
  if (!birthday) return "";
  const d = new Date(birthday);
  if (Number.isNaN(d.getTime())) return "";
  return ZODIACS[lang][calcZodiacIndex(d)] || "";
}

/* ───── Image compression (canvas, target <200KB) ───── */
async function compressAvatar(file: File, maxKB = 200): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  let { width, height } = img;
  const MAX = 720;
  if (width > MAX || height > MAX) {
    const r = Math.min(MAX / width, MAX / height);
    width = Math.round(width * r);
    height = Math.round(height * r);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);

  let quality = 0.85;
  let blob: Blob | null = null;
  for (let i = 0; i < 8; i++) {
    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    if (!blob) break;
    if (blob.size / 1024 <= maxKB) break;
    quality -= 0.1;
    if (quality < 0.3) break;
  }
  if (!blob) throw new Error("compression failed");
  return blob;
}

/* ───── Container ───── */
function StepFrame({ children, title, subtitle }: { children: ReactNode; title?: string; subtitle?: string }) {
  return (
    <div className="po-frame">
      {title && <h2 className="po-title">{title}</h2>}
      {subtitle && <p className="po-subtitle">{subtitle}</p>}
      <div className="po-body">{children}</div>
    </div>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`po-choice${active ? " is-active" : ""}`}>
      {children}
      {active ? (
        <span className="po-choice-tick" aria-hidden>
          <Check size={12} strokeWidth={3.4} />
        </span>
      ) : null}
    </button>
  );
}

/* ───── Age picker (UI only — same value/validation contract as before) ───── */
function AgePicker({
  value,
  options,
  onSelect,
}: {
  value: number | "";
  options: number[];
  onSelect: (v: number | "") => void;
}) {
  const [open, setOpen] = useState(false);

  const label = value === "" ? "Chọn tuổi của bạn" : ageLabel(value);

  return (
    <div className="po-picker">
      <button
        type="button"
        className={`po-picker-trigger${value === "" ? "" : " is-filled"}`}
        onClick={() => setOpen(true)}
        aria-expanded={open}
      >
        <span>{label}</span>
        <ChevronRight size={16} className={`po-picker-caret${open ? " is-open" : ""}`} />
      </button>
      <AgeSheet
        open={open}
        value={value}
        options={options}
        onClose={() => setOpen(false)}
        onSelect={(v) => onSelect(v)}
      />
    </div>
  );
}



/* ───── Main component ─────
 * Simplified 6-step flow (user request 2026-07-24):
 *   2 Phone (instant duplicate check) → 3 Gender → 4 Age → 5 Region → 6 Avatar → 7 Radar.
 * Removed: nickname, goal (fwb/ons/love), marital status, date-of-birth picker,
 * personality/communication/interest tag pools. Language auto-detected. */
const TOTAL_STEPS = 8;
const RADAR_STEP = 8;
// Bắt đầu từ bước Giới tính — bỏ bước nhập SĐT trong Wizard theo yêu cầu
// (SĐT vẫn được lưu ở các luồng khác, không bị xoá khỏi hệ thống).
const FIRST_STEP = 3;

const AGE_OPTIONS = Array.from({ length: 43 }, (_, i) => 18 + i); // 18 → 60

function detectLang(): Lang {
  if (typeof navigator === "undefined") return "vi";
  const l = (navigator.language || "").toLowerCase();
  if (l.startsWith("vi")) return "vi";
  if (l.startsWith("zh-tw") || l.startsWith("zh-hk") || l.startsWith("zh-hant")) return "tw";
  if (l.startsWith("zh")) return "cn";
  if (l.startsWith("en")) return "en";
  return "vi";
}

export function PremiumOnboarding() {
  const { me, refreshMe } = useAuth();
  const [lang, setLang] = useState<Lang>(
    ((me as any)?.preferred_language as Lang) || detectLang(),
  );
  const [step, setStep] = useState(FIRST_STEP);
  // Hướng trượt của animation chuyển bước (chỉ phục vụ UI).
  const [dir, setDir] = useState(1);
  const goStep = (next: number) => {
    setDir(next >= step ? 1 : -1);
    setStep(next);
  };


  const [zaloPhone, setZaloPhone] = useState<string>((me as any)?.phone || "");
  // Instant phone-availability check: null = unchecked, "checking" | "available" | "taken" | "invalid"
  type PhoneStatus = "idle" | "checking" | "available" | "taken" | "invalid";
  const [phoneStatus, setPhoneStatus] = useState<PhoneStatus>("idle");

  // Bước 5: xác nhận số Zalo chính chủ (chỉ so khớp phía client, không lưu DB).
  const [confirmZalo, setConfirmZalo] = useState("");
  const registeredPhone = ((me as any)?.phone ?? "").toString().trim();
  const confirmZaloFormatOk = /^0\d{9}$/.test(confirmZalo);
  const confirmZaloMatched = confirmZaloFormatOk && confirmZalo === registeredPhone;

  const [yourGender, setYourGender] = useState<string>((me as any)?.gender || "");
  const [targetGender] = useState<string>((me as any)?.target_gender || "");

  const [avatarUrl, setAvatarUrl] = useState<string>(me?.avatar || "");
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);

  const [age, setAge] = useState<number | "">(
    typeof (me as any)?.age === "number" ? (me as any).age : "",
  );
  const [region, setRegion] = useState<string>((me as any)?.region || (me as any)?.province || (me as any)?.location || "");

  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  void toggle;

  const zaloValid = /^(0[35789])\d{8}$/.test(zaloPhone.trim());

  // Debounced live check: as soon as the user has typed a valid 10-digit
  // phone, query `profiles.phone` to fail fast if the number is already
  // registered — do NOT wait until the final step to surface this.
  useEffect(() => {
    const raw = zaloPhone.trim();
    if (!raw) { setPhoneStatus("idle"); return; }
    if (!zaloValid) { setPhoneStatus("invalid"); return; }
    setPhoneStatus("checking");
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id")
          .eq("phone", raw)
          .neq("id", me?.id ?? "")
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          // On network / RLS errors we still allow the user to proceed;
          // the finalize() call runs the same check server-side.
          console.warn("[onboarding] phone check error", error);
          setPhoneStatus("available");
          return;
        }
        setPhoneStatus(data ? "taken" : "available");
      } catch (e) {
        if (!cancelled) setPhoneStatus("available");
        console.warn("[onboarding] phone check exception", e);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [zaloPhone, zaloValid, me?.id]);

  const ageValid = typeof age === "number" && age >= 18;

  const canNext = (): boolean => {
    switch (step) {
      case 2: return zaloValid && phoneStatus === "available";
      case 3: return !!yourGender;
      case 4: return ageValid;
      case 5: return !!region;
      case 6: return !!avatarUrl;
      case 7: return confirmZaloMatched;
      default: return true;
    }
  };



  const uploadAvatarBlob = async (blob: Blob) => {
    if (!me) return;
    setUploading(true);
    try {
      const { uploadAvatarUrl } = await import("@/lib/media");
      const file = new File([blob], `avatar-${Date.now()}.jpg`, { type: "image/jpeg" });
      const url = await uploadAvatarUrl(file, { kind: "avatar" });
      setAvatarUrl(url);
      // Only persist the lightweight URL string to the profile row
      await supabase.from("profiles").update({ avatar: url }).eq("id", me.id);
    } catch (e: any) {
      toast.error(e?.message || "Không tải được ảnh. Vui lòng thử lại.");
    } finally {
      setUploading(false);
    }
  };


  const finalize = async () => {
    if (!me) return;
    setSaving(true);
    const phoneToSave = zaloPhone.trim();
    const ageToSave = typeof age === "number" ? age : null;
    // Derive a synthetic ISO birthday so downstream consumers that still read
    // `birthday` (age badges, sort keys) keep working without a real DOB.
    const syntheticBirthday = ageToSave
      ? `${new Date().getFullYear() - ageToSave}-01-01`
      : null;

    // Chặn số điện thoại trùng trước khi update để không tạo state lỗi khó hiểu.
    if (phoneToSave) {
      try {
        const { data: existing } = await supabase
          .from("profiles")
          .select("id")
          .eq("phone", phoneToSave)
          .neq("id", me.id)
          .maybeSingle();
        if (existing) {
          toast.error("Số điện thoại này đã được đăng ký. Vui lòng sử dụng số điện thoại khác.");
          setPhoneStatus("taken");
          setSaving(false);
          setStep(2);
          return;
        }
      } catch (e) {
        console.warn("[onboarding] phone duplicate check failed", e);
      }
    }

    // Always include both `region` (new column) and `province`/`location`
    // (legacy columns) so the value survives whichever schema the DB has.
    const fullPayload: Record<string, any> = {
      preferred_language: lang,
      gender: yourGender,
      target_gender: targetGender || null,
      avatar: avatarUrl,
      age: ageToSave,
      birthday: syntheticBirthday,
      region: region || null,
      province: region || null,
      location: region || null,
      is_onboarding_completed: true,
    };
    // KHÔNG bao giờ ghi `phone: null`. Tài khoản đăng ký bằng SĐT dùng chính
    // `profiles.phone` để đăng nhập — ghi đè NULL ở bước onboarding (khi user
    // bỏ trống ô SĐT) khiến họ không thể đăng nhập lại sau khi đăng xuất.
    if (phoneToSave) fullPayload.phone = phoneToSave;


    // Strip a single unknown column key and retry — keeps onboarding alive
    // even when the DB schema is missing optional columns.
    const tryUpdate = async (
      payload: Record<string, any>,
    ): Promise<{ ok: boolean; error?: any }> => {
      let attempt = { ...payload };
      for (let i = 0; i < 8; i++) {
        // `.select("id")` để phát hiện trường hợp RLS chặn: PostgREST trả về
        // 0 dòng mà KHÔNG có error → trước đây bị coi là thành công, nên
        // `is_onboarding_completed` không hề được lưu và user bị bắt
        // onboarding lại sau mỗi lần refresh.
        const { data, error } = await supabase
          .from("profiles")
          .update(attempt)
          .eq("id", me.id)
          .select("id");
        if (!error) {
          if (Array.isArray(data) && data.length > 0) return { ok: true };
          return { ok: false, error: new Error("Không lưu được hồ sơ (không có quyền cập nhật).") };
        }
        const msg = String(error.message || "");
        const m = msg.match(/column "?([a-zA-Z0-9_]+)"? of relation|Could not find the '([a-zA-Z0-9_]+)' column/);
        const badKey = m?.[1] || m?.[2];
        if (badKey && badKey in attempt) {
          console.warn(`[onboarding] dropping unknown column "${badKey}" and retrying`);
          const { [badKey]: _drop, ...rest } = attempt;
          attempt = rest;
          continue;
        }
        return { ok: false, error };
      }
      return { ok: false, error: new Error("too many retries") };
    };



    try {
      const res = await tryUpdate(fullPayload);
      if (!res.ok) {
        // Last-resort minimal payload so the user is never stuck.
        const minimal: Record<string, any> = {
          is_onboarding_completed: true,
          gender: yourGender,
          avatar: avatarUrl,
          
          preferred_language: lang,
        };
        const fb = await tryUpdate(minimal);
        if (!fb.ok) throw fb.error;
      }

      // Xoá cache profile cũ để Profile page fetch lại dữ liệu mới (bao gồm khu vực).
      try {
        Object.keys(sessionStorage).forEach((k) => {
          if (k.startsWith("profile.cache.v2::")) sessionStorage.removeItem(k);
        });
      } catch { /* ignore */ }

      // Xác nhận cờ đã thật sự nằm trong DB trước khi rời onboarding — tránh
      // trường hợp "hoàn tất" trên UI nhưng refresh lại quay về onboarding.
      const { data: verify } = await supabase
        .from("profiles")
        .select("is_onboarding_completed")
        .eq("id", me.id)
        .maybeSingle();
      if ((verify as any)?.is_onboarding_completed !== true) {
        throw new Error("Không lưu được hồ sơ. Vui lòng thử lại.");
      }

      await refreshMe();

      // Note: on success the parent gate (`needsPremiumOnboarding`) flips to
      // false and unmounts this component — no need to setSaving(false).
    } catch (e: any) {
      console.error("[onboarding] finalize failed:", e);
      const { getFriendlyError } = await import("@/lib/friendly-error");
      toast.error(getFriendlyError(e, "Không lưu được hồ sơ. Vui lòng thử lại."));
      setSaving(false);
      setStep(10); // back to last editable step (tags) instead of hanging on radar
    }
  };

  // Trigger radar step
  useEffect(() => {
    if (step !== RADAR_STEP) return;
    const timer = setTimeout(() => {
      void finalize();
    }, 3500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!me) return null;

  return (
    <div className="po-root">
      <PremiumOnboardingStyles />
      <div className="po-bg" />
      <div className="po-glow po-glow-1" />
      <div className="po-glow po-glow-2" />
      <div className="po-glow po-glow-3" />

      <div className="po-shell">
        {/* Progress */}
        {step < RADAR_STEP && (
          <div className="po-progress" role="progressbar" aria-valuenow={step - FIRST_STEP + 1} aria-valuemin={1} aria-valuemax={TOTAL_STEPS - FIRST_STEP}>
            {Array.from({ length: TOTAL_STEPS - FIRST_STEP }, (_, i) => {
              const idx = FIRST_STEP + i;
              const state = idx < step ? "done" : idx === step ? "active" : "todo";
              return (
                <div key={idx} className="po-pstep">
                  {i > 0 ? <span className={`po-pline${idx <= step ? " is-on" : ""}`} /> : null}
                  <span className={`po-pdot po-pdot--${state}`}>
                    {state === "done" ? <Check size={12} strokeWidth={3.4} /> : i + 1}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            initial={{ opacity: 0, x: dir >= 0 ? 46 : -46 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir >= 0 ? -46 : 46 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="po-step"
          >

            {step === 1 && null /* Language selection removed — auto-detected */}

            {step === 2 && (
              <StepFrame
                title="Số điện thoại của bạn"
                subtitle="Nhập số điện thoại (10 số) — hệ thống sẽ kiểm tra ngay."
              >
                <div
                  className={`po-zalo-wrap ${
                    phoneStatus === "available" ? "is-valid" : ""
                  } ${
                    zaloPhone && (phoneStatus === "invalid" || phoneStatus === "taken")
                      ? "is-invalid"
                      : ""
                  }`}
                >
                  <Phone size={18} className="po-zalo-icon" aria-hidden />
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoFocus
                    maxLength={10}
                    className="po-input po-zalo-input"
                    value={zaloPhone}
                    onChange={(e) => setZaloPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                    placeholder="Nhập số điện thoại..."
                    aria-invalid={phoneStatus === "invalid" || phoneStatus === "taken"}
                  />
                  {phoneStatus === "checking" && (
                    <Loader2
                      size={18}
                      className="po-zalo-check po-spin"
                      aria-hidden
                      style={{ color: "#a855f7" }}
                    />
                  )}
                  {phoneStatus === "available" && (
                    <Check size={18} className="po-zalo-check" aria-hidden />
                  )}
                </div>
                {zaloPhone && phoneStatus === "invalid" && (
                  <p className="po-zalo-err">
                    Số điện thoại không hợp lệ. Vui lòng nhập đúng số điện thoại Việt Nam gồm 10 số.
                  </p>
                )}
                {phoneStatus === "taken" && (
                  <p className="po-zalo-err">
                    Số điện thoại này đã được đăng ký. Vui lòng sử dụng số điện thoại khác.
                  </p>
                )}
                {phoneStatus === "available" && (
                  <p className="po-zalo-hint" style={{ color: "#22c55e" }}>
                    <Check size={13} /> Số điện thoại hợp lệ — bấm Tiếp tục.
                  </p>
                )}
                <p className="po-zalo-hint">
                  <ShieldCheck size={13} /> Thông tin được bảo mật tuyệt đối.
                </p>
              </StepFrame>
            )}

            {step === 3 && (
              <StepFrame title={t("yourGender", lang)} subtitle="Hãy chọn giới tính của bạn">
                <div className="po-row po-gender-row">
                  {(["male", "female", "other"] as const).map((g) => {
                    const Icon = g === "male" ? Mars : g === "female" ? Venus : Transgender;
                    return (
                      <Choice key={g} active={yourGender === g} onClick={() => setYourGender(g)}>
                        <span className={`po-gender-icon po-gender-${g}`} aria-hidden="true" data-gender={g}>
                          <Icon size={34} strokeWidth={2.4} absoluteStrokeWidth />
                        </span>
                        <span className="po-gender-label">{t(g, lang)}</span>
                      </Choice>
                    );
                  })}
                </div>
              </StepFrame>
            )}

            {step === 4 && (
              <StepFrame title="Tuổi của bạn" subtitle="Bạn phải từ 18 tuổi trở lên để sử dụng nền tảng.">
                <AgePicker value={age} options={AGE_OPTIONS} onSelect={(v) => setAge(v)} />
                {age !== "" && !ageValid ? (
                  <p style={{ margin: 0, fontSize: 12.5, color: "#f87171" }}>
                    Bạn phải từ 18 tuổi trở lên để sử dụng nền tảng.
                  </p>
                ) : null}
              </StepFrame>
            )}

            {step === 5 && (
              <StepFrame title={t("region", lang)} subtitle={t("regionHint", lang)}>
                <div className="po-region-wrap">
                  <ProvinceCombobox
                    value={region}
                    onChange={setRegion}
                    placeholder={t("pickRegion", lang)}
                  />
                </div>
              </StepFrame>
            )}

            {step === 6 && (
              <StepFrame title={t("uploadAvatar", lang)} subtitle={t("uploadHint", lang)}>
                {avatarUrl ? (
                  <div className="po-avatar-done">
                    <div className="po-avatar-preview">
                      <img loading="lazy" decoding="async" src={avatarSrc(avatarUrl, 64)} alt="avatar" />
                      {uploading ? <span className="po-avatar-busy"><Loader2 className="po-spin" size={22} /></span> : null}
                    </div>
                    <button
                      type="button"
                      className="po-avatar-change"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                    >
                      Đổi ảnh
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="po-avatar-drop"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <Loader2 className="po-spin" size={26} />
                    ) : (
                      <>
                        <span className="po-avatar-drop-icon">👤</span>
                        <span className="po-avatar-drop-label">
                          <Plus size={15} /> Chọn ảnh
                        </span>
                        <span className="po-avatar-drop-hint">JPG, PNG hoặc WEBP</span>
                      </>
                    )}
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    const { isAllowedAvatarFile, AVATAR_ONLY_MESSAGE } = await import("@/lib/media");
                    if (!isAllowedAvatarFile(f)) {
                      toast.error(AVATAR_ONLY_MESSAGE);
                      return;
                    }
                    setCropFile(f);
                  }}
                />

              </StepFrame>
            )}

            {step === 7 && (
              <StepFrame
                title="Xác nhận số Zalo chính chủ"
                subtitle="Nhập lại số Zalo bạn đã đăng ký (10 số, bắt đầu bằng 0)."
              >
                <div
                  className={`po-zalo-wrap ${confirmZaloMatched ? "is-valid" : ""} ${
                    confirmZalo.length === 10 && !confirmZaloMatched ? "is-invalid" : ""
                  }`}
                >
                  <ShieldCheck size={18} className="po-zalo-icon" aria-hidden />
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoFocus
                    maxLength={10}
                    className="po-zalo-input"
                    placeholder="0xxxxxxxxx"
                    value={confirmZalo}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, "").slice(0, 10);
                      if (v && v[0] !== "0") v = "";
                      setConfirmZalo(v);
                    }}
                    onKeyDown={(e) => {
                      if (e.key.length === 1 && !/\d/.test(e.key)) e.preventDefault();
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      let v = (e.clipboardData.getData("text") || "").replace(/\D/g, "").slice(0, 10);
                      if (v && v[0] !== "0") v = "";
                      setConfirmZalo(v);
                    }}
                    aria-invalid={confirmZalo.length === 10 && !confirmZaloMatched}
                  />
                  {confirmZaloMatched && (
                    <Check size={18} strokeWidth={3} style={{ color: "#22c55e" }} aria-hidden />
                  )}
                </div>
                {confirmZalo.length === 10 && !confirmZaloMatched && (
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: "#ef4444" }}>
                    Số Zalo không đúng với số đã đăng ký.
                  </div>
                )}
                {confirmZaloMatched && (
                  <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: "#22c55e", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Check size={15} strokeWidth={3} /> Số Zalo chính chủ đã được xác nhận.
                  </div>
                )}
              </StepFrame>
            )}

            {step === RADAR_STEP && <RadarStep avatarUrl={avatarUrl} label={t("matching", lang)} />}

          </motion.div>
        </AnimatePresence>

        {step < RADAR_STEP && (
          <div className="po-actions">
            {step > FIRST_STEP ? (
              <button type="button" className="po-btn-ghost" onClick={() => goStep(step - 1)}>
                <ChevronLeft size={17} /> {t("back", lang)}
              </button>
            ) : <span />}
            <button
              type="button"
              className="po-btn-primary"
              disabled={!canNext()}
              onClick={() => {
                if (step === RADAR_STEP - 1) goStep(RADAR_STEP);
                else goStep(step + 1);
              }}
            >
              {saving ? <Loader2 className="po-spin" size={16} /> : null}
              {step === RADAR_STEP - 1 ? t("finish", lang) : t("continue", lang)} <ChevronRight size={17} />

            </button>
          </div>
        )}

        {step === RADAR_STEP && saving && (
          <div className="po-saving"><Loader2 className="po-spin" /> {t("saving", lang)}</div>
        )}
      </div>

      {cropFile && (
        <AvatarCropper
          file={cropFile}
          onCancel={() => setCropFile(null)}
          onConfirm={async (blob) => {
            setCropFile(null);
            await uploadAvatarBlob(blob);
          }}
          lang={lang}
        />
      )}
    </div>
  );
}

/* ───── Avatar Cropper (drag + zoom, circular viewport) ───── */
function AvatarCropper({
  file, onConfirm, onCancel, lang,
}: { file: File; onConfirm: (b: Blob) => void; onCancel: () => void; lang: Lang }) {
  const VIEW = 280;
  const OUT = 512;
  const [src, setSrc] = useState<string>("");
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    const i = new Image();
    i.onload = () => {
      const base = Math.max(VIEW / i.width, VIEW / i.height);
      setImg(i);
      setMinScale(base);
      setScale(base);
      setTx(0); setTy(0);
    };
    i.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clamp = (s: number, x: number, y: number) => {
    if (!img) return { x, y };
    const dispW = img.width * s;
    const dispH = img.height * s;
    const maxX = Math.max(0, (dispW - VIEW) / 2);
    const maxY = Math.max(0, (dispH - VIEW) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    const next = clamp(scale, dragRef.current.tx + dx, dragRef.current.ty + dy);
    setTx(next.x); setTy(next.y);
  };
  const onPointerUp = () => { dragRef.current = null; };

  const handleScale = (s: number) => {
    setScale(s);
    const next = clamp(s, tx, ty);
    setTx(next.x); setTy(next.y);
  };

  const confirm = async () => {
    if (!img || busy) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = OUT; canvas.height = OUT;
      const ctx = canvas.getContext("2d")!;
      // visible viewport => source rect in image coords
      const srcW = VIEW / scale;
      const srcH = VIEW / scale;
      const srcX = img.width / 2 - (VIEW / 2 + tx) / scale;
      const srcY = img.height / 2 - (VIEW / 2 + ty) / scale;
      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, OUT, OUT);
      let quality = 0.88;
      let blob: Blob | null = null;
      for (let i = 0; i < 6; i++) {
        blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
        if (!blob) break;
        if (blob.size / 1024 <= 200) break;
        quality -= 0.12;
        if (quality < 0.3) break;
      }
      if (!blob) throw new Error("crop failed");
      onConfirm(blob);
    } finally {
      setBusy(false);
    }
  };

  const labels = {
    title: { vi: "Cắt ảnh đại diện", en: "Crop your avatar", tw: "裁剪頭像", cn: "裁剪头像" }[lang],
    hint: { vi: "Kéo để di chuyển · trượt để phóng to", en: "Drag to move · slide to zoom", tw: "拖曳移動 · 滑動縮放", cn: "拖动移动 · 滑动缩放" }[lang],
    cancel: { vi: "Huỷ", en: "Cancel", tw: "取消", cn: "取消" }[lang],
    ok: { vi: "Xong", en: "Done", tw: "完成", cn: "完成" }[lang],
  };

  return (
    <div className="po-crop-overlay">
      <div className="po-crop-shell">
        <h3 className="po-crop-title">{labels.title}</h3>
        <p className="po-crop-hint">{labels.hint}</p>
        <div
          className="po-crop-viewport"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {src && img && (
            <img loading="lazy" decoding="async"
              src={src}
              alt=""
              draggable={false}
              className="po-crop-img"
              style={{
                width: img.width * scale,
                height: img.height * scale,
                transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px))`,
              }}
            />
          )}
          <div className="po-crop-mask" />
        </div>
        <input
          type="range"
          min={minScale}
          max={minScale * 4}
          step={0.01}
          value={scale}
          onChange={(e) => handleScale(parseFloat(e.target.value))}
          className="po-crop-zoom"
        />
        <div className="po-crop-actions">
          <button type="button" className="po-btn-ghost" onClick={onCancel}>{labels.cancel}</button>
          <button type="button" className="po-btn-primary" onClick={confirm} disabled={busy}>
            {busy ? <Loader2 className="po-spin" size={16} /> : labels.ok}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ───── Radar step ───── */
function RadarStep({ avatarUrl, label }: { avatarUrl: string; label: string }) {
  const dummies = [
    "https://i.pravatar.cc/120?img=11",
    "https://i.pravatar.cc/120?img=22",
    "https://i.pravatar.cc/120?img=33",
    "https://i.pravatar.cc/120?img=44",
    "https://i.pravatar.cc/120?img=55",
  ];
  return (
    <div className="po-radar-wrap">
      <div className="po-radar">
        <div className="po-ring po-ring-1" />
        <div className="po-ring po-ring-2" />
        <div className="po-ring po-ring-3" />
        <div className="po-radar-sweep" />
        {dummies.map((src, i) => (
          <div key={i} className={`po-orbit po-orbit-${i + 1}`}>
            <img loading="lazy" decoding="async" src={src} alt="" className="po-dummy" />
          </div>
        ))}
        <div className="po-radar-center">
          {avatarUrl ? <img loading="lazy" decoding="async" src={avatarSrc(avatarUrl, 64)} alt="me" /> : <div className="po-radar-placeholder" />}
        </div>
      </div>
      <div className="po-radar-label">
        <Sparkles size={18} /> {label}
      </div>
    </div>
  );
}

/* ───── Inline styled-jsx-like via <style> ───── */
function PremiumOnboardingStyles() {
  return (
    <style>{`
    .po-root { position: fixed; inset: 0; z-index: 9999; color: #f5f5f7; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; padding: 14px; overflow: hidden; }
    .po-bg { position: absolute; inset: 0; background: radial-gradient(1100px 760px at 18% 6%, rgba(139,92,246,0.20), transparent 62%), radial-gradient(900px 700px at 84% 92%, rgba(56,189,248,0.14), transparent 62%), radial-gradient(700px 520px at 60% 40%, rgba(236,72,153,0.10), transparent 65%), linear-gradient(180deg, #0a0813 0%, #07070b 100%); }
    .po-glow { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; opacity: .55; }
    .po-glow-1 { width: 320px; height: 320px; top: -80px; left: -60px; background: rgba(139,92,246,0.45); }
    .po-glow-2 { width: 300px; height: 300px; bottom: -90px; right: -70px; background: rgba(56,189,248,0.32); }
    .po-glow-3 { width: 260px; height: 260px; bottom: 20%; left: 20%; background: rgba(236,72,153,0.22); }
    .po-shell { position: relative; width: 100%; max-width: 480px; max-height: calc(100dvh - 28px); display: flex; flex-direction: column; gap: 14px; background: linear-gradient(180deg, rgba(22,19,33,0.88), rgba(10,9,16,0.94)); border: 1px solid rgba(255,255,255,0.10); border-radius: 24px; padding: 18px 18px 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset; backdrop-filter: blur(22px); overflow: hidden; }

    /* Progress — dots + connectors */
    .po-progress { display: flex; align-items: center; justify-content: center; gap: 0; padding: 2px 4px 0; }
    .po-pstep { display: flex; align-items: center; }
    .po-pline { width: 30px; height: 2px; border-radius: 999px; background: rgba(255,255,255,0.10); transition: background .3s ease, box-shadow .3s ease; }
    .po-pline.is-on { background: linear-gradient(90deg, #8B5CF6, #A855F7); box-shadow: 0 0 10px rgba(168,85,247,0.55); }
    .po-pdot { width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 700; color: rgba(255,255,255,0.45); background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); transition: all .25s ease; }
    .po-pdot--active { color: #fff; background: linear-gradient(135deg, #8B5CF6, #A855F7); border-color: transparent; box-shadow: 0 0 0 4px rgba(168,85,247,0.16), 0 0 16px rgba(168,85,247,0.6); transform: scale(1.08); }
    .po-pdot--done { color: #fff; background: rgba(168,85,247,0.28); border-color: rgba(168,85,247,0.6); }

    .po-step { flex: 1; overflow-y: auto; min-height: 0; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
    .po-step::-webkit-scrollbar { width: 6px; } .po-step::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
    .po-frame { display: flex; flex-direction: column; gap: 10px; padding: 2px; }
    .po-title { font-size: 26px; line-height: 1.15; font-weight: 800; letter-spacing: -0.02em; background: linear-gradient(180deg, #fff, #c7c7d1); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; }
    .po-subtitle { font-size: 15px; line-height: 1.4; color: rgba(255,255,255,0.55); margin: -2px 0 2px; }
    .po-section { font-size: 14px; color: rgba(255,255,255,0.75); margin: 6px 0 2px; font-weight: 600; }
    .po-body { display: flex; flex-direction: column; gap: 10px; }

    /* Age picker */
    .po-picker { position: relative; }
    .po-picker-trigger { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); color: rgba(255,255,255,0.55); font-size: 16px; font-weight: 600; cursor: pointer; transition: all .18s ease; }
    .po-picker-trigger.is-filled { color: #fff; border-color: rgba(168,85,247,0.55); box-shadow: 0 0 18px rgba(168,85,247,0.20); }
    .po-picker-trigger:hover { border-color: rgba(168,85,247,0.6); }
    .po-picker-caret { transform: rotate(90deg); transition: transform .2s ease; color: #A855F7; }
    .po-picker-caret.is-open { transform: rotate(-90deg); }
    .po-picker-panel { position: absolute; z-index: 20; left: 0; right: 0; top: calc(100% + 6px); max-height: 232px; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; scroll-behavior: smooth; padding: 6px; border-radius: 16px; background: rgba(16,14,26,0.98); border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
    .po-picker-panel::-webkit-scrollbar { width: 6px; } .po-picker-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.14); border-radius: 3px; }
    .po-picker-item { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 11px 14px; border: 0; background: transparent; border-radius: 11px; color: rgba(255,255,255,0.82); font-size: 15px; cursor: pointer; transition: background .14s ease; }
    .po-picker-item:hover { background: rgba(255,255,255,0.06); }
    .po-picker-item.is-selected { background: linear-gradient(135deg, rgba(139,92,246,0.30), rgba(168,85,247,0.18)); color: #fff; font-weight: 700; }

    /* Avatar upload */
    .po-avatar-drop { width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 22px 16px; border-radius: 18px; background: linear-gradient(180deg, rgba(168,85,247,0.08), rgba(255,255,255,0.02)); border: 1.5px dashed rgba(168,85,247,0.45); color: #fff; cursor: pointer; transition: all .2s ease; }
    .po-avatar-drop:hover { border-color: rgba(168,85,247,0.85); background: linear-gradient(180deg, rgba(168,85,247,0.14), rgba(255,255,255,0.03)); transform: translateY(-1px); }
    .po-avatar-drop-icon { font-size: 34px; line-height: 1; }
    .po-avatar-drop-label { display: inline-flex; align-items: center; gap: 6px; font-size: 15px; font-weight: 700; }
    .po-avatar-drop-hint { font-size: 12px; color: rgba(255,255,255,0.45); }
    .po-avatar-done { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .po-avatar-preview { position: relative; width: 132px; height: 132px; border-radius: 50%; overflow: hidden; border: 2px solid rgba(168,85,247,0.7); box-shadow: 0 0 30px rgba(168,85,247,0.35); }
    .po-avatar-preview img { width: 100%; height: 100%; object-fit: cover; }
    .po-avatar-busy { position: absolute; inset: 0; display: grid; place-items: center; background: rgba(0,0,0,0.45); }
    .po-avatar-change { padding: 9px 18px; border-radius: 999px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.16); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; transition: all .18s ease; }
    .po-avatar-change:hover { background: rgba(255,255,255,0.12); }

    .po-region-wrap { position: relative; }
    .po-region-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #a855f7; pointer-events: none; }
    .po-region-select { padding-left: 42px; appearance: none; background-image: linear-gradient(45deg, transparent 50%, #a855f7 50%), linear-gradient(135deg, #a855f7 50%, transparent 50%); background-position: calc(100% - 18px) 50%, calc(100% - 13px) 50%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; cursor: pointer; }
    .po-region-select option { background: #14121e; color: #fff; }
    .po-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .po-row { display: flex; gap: 10px; flex-wrap: wrap; }
    .po-choice { position: relative; flex: 1; min-width: 90px; padding: 14px 12px; border-radius: 16px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); color: #f5f5f7; font-size: 14px; font-weight: 500; cursor: pointer; transition: transform .2s ease, box-shadow .2s ease, background .2s ease, border-color .2s ease; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .po-choice-tick { position: absolute; top: 7px; right: 7px; width: 19px; height: 19px; border-radius: 50%; display: grid; place-items: center; color: #fff; background: linear-gradient(135deg, #8B5CF6, #A855F7); box-shadow: 0 0 12px rgba(168,85,247,0.7); animation: po-tick-in .2s ease-out; }
    @keyframes po-tick-in { from { transform: scale(0.4); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    @keyframes po-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }

    .po-choice:hover { background: rgba(255,255,255,0.06); border-color: rgba(168,85,247,0.4); }
    .po-choice.is-active { background: linear-gradient(135deg, rgba(168,85,247,0.18), rgba(56,189,248,0.12)); border-color: rgba(168,85,247,0.7); box-shadow: 0 0 24px rgba(168,85,247,0.35), inset 0 0 12px rgba(168,85,247,0.15); }
    .po-gender-row { gap: 10px; }
    .po-gender-row .po-choice { flex-direction: column; padding: 14px 8px; gap: 6px; min-width: 84px; }
    .po-gender-row .po-choice.is-active { animation: po-shake .2s ease-out; }
    .po-gender-icon { display: inline-flex; align-items: center; justify-content: center; line-height: 1; transition: transform .2s, filter .2s; }
    .po-gender-icon > svg { width: 34px; height: 34px; }
    .po-choice:hover .po-gender-icon { transform: translateY(-2px) scale(1.06); }
    .po-gender-male   { color: #4DA3FF; filter: drop-shadow(0 0 12px rgba(77,163,255,0.55)); }
    .po-gender-female { color: #FF5CB8; filter: drop-shadow(0 0 12px rgba(255,92,184,0.55)); }
    .po-gender-other  { color: #A855F7; filter: drop-shadow(0 0 12px rgba(168,85,247,0.55)); }
    .po-choice.is-active .po-gender-male   { filter: drop-shadow(0 0 22px rgba(77,163,255,0.95)); transform: scale(1.08); }
    .po-choice.is-active .po-gender-female { filter: drop-shadow(0 0 22px rgba(255,92,184,0.95)); transform: scale(1.08); }
    .po-choice.is-active .po-gender-other  { filter: drop-shadow(0 0 22px rgba(168,85,247,0.95)); transform: scale(1.08); }
    .po-gender-label { font-size: 14px; font-weight: 700; letter-spacing: 0.2px; }
    @media (max-width: 380px) { .po-gender-icon > svg { width: 30px; height: 30px; } }


    /* Gender tile color-coded backgrounds */
    .po-gender-row .po-choice:has(.po-gender-male)   { background: linear-gradient(160deg, rgba(77,163,255,0.14), rgba(59,130,246,0.06)); border-color: rgba(77,163,255,0.35); }
    .po-gender-row .po-choice:has(.po-gender-female) { background: linear-gradient(160deg, rgba(255,92,184,0.16), rgba(236,72,153,0.06)); border-color: rgba(255,92,184,0.35); }
    .po-gender-row .po-choice:has(.po-gender-other)  { background: linear-gradient(160deg, rgba(168,85,247,0.16), rgba(139,92,246,0.06)); border-color: rgba(168,85,247,0.35); }
    .po-gender-row .po-choice:hover { transform: translateY(-3px); }
    .po-gender-row .po-choice:hover:has(.po-gender-male)   { background: linear-gradient(160deg, rgba(77,163,255,0.24), rgba(59,130,246,0.12)); border-color: rgba(77,163,255,0.6); box-shadow: 0 0 24px rgba(77,163,255,0.35); }
    .po-gender-row .po-choice:hover:has(.po-gender-female) { background: linear-gradient(160deg, rgba(255,92,184,0.26), rgba(236,72,153,0.14)); border-color: rgba(255,92,184,0.6); box-shadow: 0 0 24px rgba(255,92,184,0.35); }
    .po-gender-row .po-choice:hover:has(.po-gender-other)  { background: linear-gradient(160deg, rgba(168,85,247,0.26), rgba(139,92,246,0.14)); border-color: rgba(168,85,247,0.6); box-shadow: 0 0 24px rgba(168,85,247,0.35); }
    .po-gender-row .po-choice.is-active:has(.po-gender-male)   { box-shadow: 0 0 30px rgba(77,163,255,0.55), inset 0 0 14px rgba(77,163,255,0.2); border-color: rgba(77,163,255,0.85); transform: scale(1.05); }
    .po-gender-row .po-choice.is-active:has(.po-gender-female) { box-shadow: 0 0 30px rgba(255,92,184,0.55), inset 0 0 14px rgba(255,92,184,0.2); border-color: rgba(255,92,184,0.85); transform: scale(1.05); }
    .po-gender-row .po-choice.is-active:has(.po-gender-other)  { box-shadow: 0 0 30px rgba(168,85,247,0.55), inset 0 0 14px rgba(168,85,247,0.2); border-color: rgba(168,85,247,0.85); transform: scale(1.05); }

    /* Zalo phone step */
    .po-zalo-wrap { position: relative; display: flex; align-items: center; }
    .po-zalo-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: rgba(168,85,247,0.85); pointer-events: none; z-index: 1; }
    .po-zalo-check { position: absolute; right: 16px; top: 50%; transform: translateY(-50%); color: #22c55e; filter: drop-shadow(0 0 8px rgba(34,197,94,0.7)); z-index: 1; }
    .po-zalo-input { padding-left: 46px !important; padding-right: 44px !important; font-size: 17px; letter-spacing: 1px; font-weight: 600; background: linear-gradient(180deg, rgba(168,85,247,0.06), rgba(56,189,248,0.03)) !important; border: 1.5px solid rgba(168,85,247,0.3) !important; transition: border-color .2s, box-shadow .2s, background .25s; }
    .po-zalo-input:focus { border-color: rgba(168,85,247,0.9) !important; box-shadow: 0 0 0 4px rgba(168,85,247,0.18), 0 0 26px rgba(168,85,247,0.35) !important; background: linear-gradient(180deg, rgba(168,85,247,0.12), rgba(56,189,248,0.06)) !important; }
    .po-zalo-wrap.is-valid .po-zalo-input { border-color: rgba(34,197,94,0.7) !important; box-shadow: 0 0 22px rgba(34,197,94,0.25) !important; }
    .po-zalo-wrap.is-invalid .po-zalo-input { border-color: rgba(248,113,113,0.7) !important; box-shadow: 0 0 22px rgba(248,113,113,0.22) !important; }
    .po-zalo-err { margin: 4px 2px 0; font-size: 12.5px; color: #f87171; }
    .po-zalo-hint { display: inline-flex; align-items: center; gap: 6px; margin: 4px 2px 0; font-size: 12px; color: rgba(255,255,255,0.55); }

    .po-flag { font-size: 22px; }
    .po-tos-box { max-height: 260px; overflow-y: auto; padding: 14px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; font-size: 12.5px; line-height: 1.6; color: rgba(255,255,255,0.75); }
    .po-tos-text { white-space: pre-wrap; font-family: inherit; margin: 0; }
    .po-check { display: flex; align-items: center; gap: 10px; font-size: 13px; color: rgba(255,255,255,0.85); cursor: pointer; padding: 8px 4px; }
    .po-check input { width: 18px; height: 18px; accent-color: #a855f7; cursor: pointer; }
    .po-avatar-btn { width: 140px; height: 140px; border-radius: 50%; align-self: center; background: rgba(255,255,255,0.04); border: 2px dashed rgba(168,85,247,0.45); color: rgba(168,85,247,0.9); display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden; box-shadow: 0 0 30px rgba(168,85,247,0.25); transition: all .2s; }
    .po-avatar-btn:hover { background: rgba(168,85,247,0.08); }
    .po-avatar-btn img { width: 100%; height: 100%; object-fit: cover; }
    .po-input { width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; color: #fff; font-size: 15px; outline: none; transition: all .2s; box-sizing: border-box; }
    .po-input:focus { border-color: rgba(168,85,247,0.6); box-shadow: 0 0 0 3px rgba(168,85,247,0.15); }
    /* Dropdown options — nền tối, chữ trắng, đồng bộ dark theme */
    .po-input option, select.po-input option { background: #14121e !important; color: #fff !important; padding: 10px; }
    .po-input option:hover, .po-input option:focus, .po-input option:checked {
      background: linear-gradient(135deg, #a855f7, #7c3aed) !important;
      color: #fff !important;
    }
    select.po-input { appearance: none; -webkit-appearance: none; background-image: linear-gradient(45deg, transparent 50%, #a855f7 50%), linear-gradient(135deg, #a855f7 50%, transparent 50%); background-position: calc(100% - 18px) 50%, calc(100% - 13px) 50%; background-size: 5px 5px, 5px 5px; background-repeat: no-repeat; padding-right: 40px; }
    .po-zodiac { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; background: linear-gradient(135deg, rgba(168,85,247,0.18), rgba(56,189,248,0.12)); border: 1px solid rgba(168,85,247,0.4); border-radius: 999px; font-size: 13px; color: #e9d5ff; align-self: flex-start; box-shadow: 0 0 16px rgba(168,85,247,0.25); }
    .po-tag-group { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
    .po-tag-label { margin: 0; font-size: 13px; color: rgba(255,255,255,0.6); font-weight: 600; }
    .po-tag-wrap { display: flex; gap: 8px; flex-wrap: wrap; }
    .po-tag { padding: 8px 14px; border-radius: 999px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.85); font-size: 13px; cursor: pointer; transition: all .15s; }
    .po-tag:hover { border-color: rgba(168,85,247,0.5); }
    .po-tag.is-active { background: linear-gradient(135deg, rgba(168,85,247,0.25), rgba(56,189,248,0.18)); border-color: rgba(168,85,247,0.8); color: #fff; box-shadow: 0 0 14px rgba(168,85,247,0.45); }
    .po-tag.is-blocked { opacity: .3; cursor: not-allowed; }
    .po-tag.is-blocked:hover { border-color: rgba(255,255,255,0.1); }
    .po-tag-count { margin-left: 6px; font-size: 11px; color: rgba(255,255,255,0.45); font-weight: 500; }
    .po-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 2px; padding-bottom: env(safe-area-inset-bottom); }
    .po-btn-ghost { display: inline-flex; align-items: center; gap: 4px; padding: 12px 18px; background: transparent; border: 1px solid rgba(255,255,255,0.28); border-radius: 14px; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; transition: all .18s ease; }
    .po-btn-ghost:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.5); }
    .po-btn-ghost:active { transform: scale(0.97); }
    .po-btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 13px 24px; background: linear-gradient(135deg, #8B5CF6, #A855F7); border: none; border-radius: 14px; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; box-shadow: 0 10px 26px rgba(139,92,246,0.45); transition: transform .15s ease, box-shadow .2s ease, filter .2s ease; margin-left: auto; }
    .po-btn-primary:hover:not(:disabled) { filter: brightness(1.1); transform: translateY(-1px); box-shadow: 0 14px 34px rgba(168,85,247,0.6); }
    .po-btn-primary:active:not(:disabled) { transform: scale(0.96); }
    .po-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
    @media (max-width: 420px) {
      .po-root { padding: 10px; }
      .po-shell { padding: 14px 14px 12px; border-radius: 22px; gap: 12px; max-height: calc(100dvh - 20px); }
      .po-title { font-size: 23px; }
      .po-subtitle { font-size: 14px; }
      .po-btn-ghost, .po-btn-primary { padding: 12px 16px; font-size: 15px; }
    }

    .po-spin { animation: po-spin 1s linear infinite; }
    @keyframes po-spin { to { transform: rotate(360deg); } }

    /* Radar */
    .po-radar-wrap { display: flex; flex-direction: column; align-items: center; gap: 24px; padding: 30px 0; }
    .po-radar { position: relative; width: 320px; height: 320px; display: flex; align-items: center; justify-content: center; }
    .po-ring { position: absolute; inset: 0; margin: auto; border-radius: 50%; border: 1px solid rgba(168,85,247,0.25); }
    .po-ring-1 { width: 320px; height: 320px; animation: po-pulse 3s ease-in-out infinite; }
    .po-ring-2 { width: 220px; height: 220px; animation: po-pulse 3s ease-in-out infinite .5s; border-color: rgba(56,189,248,0.3); }
    .po-ring-3 { width: 130px; height: 130px; animation: po-pulse 3s ease-in-out infinite 1s; border-color: rgba(168,85,247,0.4); }
    @keyframes po-pulse { 0%, 100% { opacity: .4; transform: scale(1); } 50% { opacity: 1; transform: scale(1.04); box-shadow: 0 0 30px rgba(168,85,247,0.5); } }
    .po-radar-sweep { position: absolute; inset: 0; margin: auto; width: 320px; height: 320px; border-radius: 50%; background: conic-gradient(from 0deg, transparent 0deg, rgba(168,85,247,0.35) 30deg, transparent 60deg); animation: po-spin 2.5s linear infinite; mask: radial-gradient(circle, transparent 30px, black 31px); -webkit-mask: radial-gradient(circle, transparent 30px, black 31px); }
    .po-radar-center { position: relative; width: 96px; height: 96px; border-radius: 50%; overflow: hidden; border: 3px solid rgba(168,85,247,0.8); box-shadow: 0 0 40px rgba(168,85,247,0.7), inset 0 0 18px rgba(168,85,247,0.3); z-index: 2; }
    .po-radar-center img { width: 100%; height: 100%; object-fit: cover; }
    .po-radar-placeholder { width: 100%; height: 100%; background: linear-gradient(135deg, #a855f7, #38bdf8); }
    .po-orbit { position: absolute; top: 50%; left: 50%; width: 0; height: 0; animation: po-orbit-spin linear infinite; }
    .po-orbit-1 { animation-duration: 8s; --r: 110px; }
    .po-orbit-2 { animation-duration: 10s; animation-direction: reverse; --r: 110px; transform: rotate(72deg); }
    .po-orbit-3 { animation-duration: 12s; --r: 155px; transform: rotate(144deg); }
    .po-orbit-4 { animation-duration: 14s; animation-direction: reverse; --r: 155px; transform: rotate(216deg); }
    .po-orbit-5 { animation-duration: 9s; --r: 155px; transform: rotate(288deg); }
    @keyframes po-orbit-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .po-dummy { position: absolute; width: 38px; height: 38px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.85); box-shadow: 0 0 14px rgba(168,85,247,0.7); transform: translate(var(--r), -19px); animation: po-bob 2s ease-in-out infinite; }
    @keyframes po-bob { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.3) drop-shadow(0 0 8px rgba(168,85,247,.9)); } }
    .po-radar-label { display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; font-size: 14px; color: rgba(255,255,255,0.85); background: rgba(168,85,247,0.1); border: 1px solid rgba(168,85,247,0.3); border-radius: 999px; }
    .po-saving { position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; font-size: 12px; color: rgba(255,255,255,0.6); }

    /* Premium TOS */
    .po-tos-premium { position: relative; max-height: 300px; background: linear-gradient(180deg, rgba(168,85,247,0.08), rgba(56,189,248,0.04)); border: 1px solid rgba(168,85,247,0.25); box-shadow: inset 0 0 30px rgba(168,85,247,0.08), 0 8px 30px rgba(0,0,0,0.3); border-radius: 16px; padding: 18px 18px 22px; }
    .po-tos-shine { pointer-events: none; position: absolute; top: 0; left: 0; right: 0; height: 38px; background: linear-gradient(180deg, rgba(255,255,255,0.05), transparent); border-radius: 16px 16px 0 0; }
    .po-tos-premium .po-tos-text { color: rgba(255,255,255,0.82); line-height: 1.7; letter-spacing: 0.01em; }

    /* Avatar Cropper */
    .po-crop-overlay { position: fixed; inset: 0; z-index: 10000; background: rgba(7,7,11,0.85); backdrop-filter: blur(14px); display: flex; align-items: center; justify-content: center; padding: 20px; }
    .po-crop-shell { width: 100%; max-width: 360px; background: linear-gradient(180deg, rgba(20,18,30,0.95), rgba(10,9,16,0.98)); border: 1px solid rgba(168,85,247,0.3); border-radius: 22px; padding: 22px; display: flex; flex-direction: column; align-items: center; gap: 14px; box-shadow: 0 30px 80px rgba(168,85,247,0.25); }
    .po-crop-title { margin: 0; font-size: 18px; font-weight: 700; color: #fff; }
    .po-crop-hint { margin: 0; font-size: 12px; color: rgba(255,255,255,0.55); }
    .po-crop-viewport { position: relative; border-radius: 50%; overflow: hidden; background: #000; touch-action: none; user-select: none; cursor: grab; box-shadow: 0 0 0 2px rgba(168,85,247,0.45), 0 0 40px rgba(168,85,247,0.35); }
    .po-crop-viewport:active { cursor: grabbing; }
    .po-crop-img { position: absolute; top: 50%; left: 50%; max-width: none; pointer-events: none; }
    .po-crop-mask { position: absolute; inset: 0; border-radius: 50%; box-shadow: 0 0 0 9999px rgba(0,0,0,0.45); pointer-events: none; }
    .po-crop-zoom { width: 100%; accent-color: #a855f7; }
    .po-crop-actions { display: flex; gap: 10px; width: 100%; justify-content: space-between; }

    `}</style>
  );
}

/* ───── Gate helper ───── */
export function needsPremiumOnboarding(me: any): boolean {
  if (!me) return false;
  return me.is_onboarding_completed !== true;
}