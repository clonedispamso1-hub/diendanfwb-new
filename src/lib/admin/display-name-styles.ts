// Kiểu tên hiển thị cho "Tạo tài khoản hàng loạt".
// Sinh full_name theo nhiều phong cách khác nhau (thuần frontend, không đụng DB).

export type NameStyle =
  | "full"
  | "two_words"
  | "one_word"
  | "vi_plus_cn"
  | "korean"
  | "japanese"
  | "vi_plus_foreign"
  | "with_icon"
  | "random_all"
  | "artistic";

export const NAME_STYLE_OPTIONS: Array<{ value: NameStyle; label: string }> = [
  { value: "full", label: "Họ và tên đầy đủ" },
  { value: "two_words", label: "Hai từ" },
  { value: "one_word", label: "Một từ" },
  { value: "vi_plus_cn", label: "Tiếng Việt + 1 ký tự Trung" },
  { value: "korean", label: "Tên tiếng Hàn" },
  { value: "japanese", label: "Tên tiếng Nhật" },
  { value: "vi_plus_foreign", label: "Tiếng Việt + 1–3 ký tự nước ngoài" },
  { value: "with_icon", label: "Tên có icon" },
  { value: "artistic", label: "Tên nghệ thuật / ký tự đẹp" },
  { value: "random_all", label: "Random tất cả" },
];

const LAST = ["Nguyễn","Trần","Lê","Phạm","Hoàng","Huỳnh","Phan","Vũ","Võ","Đặng","Bùi","Đỗ","Hồ","Ngô","Dương","Lý"];
const MID_M = ["Văn","Hữu","Minh","Quang","Đình","Ngọc","Thanh","Bá"];
const MID_F = ["Thị","Ngọc","Thanh","Kim","Hoài","Bảo","Diễm","Mỹ"];
const FIRST_M = ["Bảo","Duy","Huy","Khánh","Minh","Nam","Phúc","Quân","Sơn","Trung","Tuấn","Việt","Hải","Long","Phong","Đạt"];
const FIRST_F = ["Nhiên","Chi","Hà","Hạnh","Linh","Mai","Ngọc","Quyên","Thảo","Trang","Anh","Uyên","Yến","Vy","Lan","Diệp"];

const CN_CHARS = ["軒","雨","嵐","琳","晴","楓","月","星","蘭","雲","玥","柔","翊","涵","璇","梦"];
const KO_LAST = ["Kim","Lee","Park","Choi","Jung","Kang","Cho","Yoon","Jang","Lim"];
const KO_FIRST = ["Ji Woo","Min Ho","Seo Yeon","Hye Jin","Soo Ah","Tae Yang","Ha Eun","Joon Young","Da Hyun","Eun Woo"];
const JP_LAST = ["Sakura","Yamada","Takahashi","Kobayashi","Nakamura","Fujimoto","Kurosawa","Hoshino"];
const JP_FIRST = ["Haruto","Yuki","Aoi","Rin","Sora","Hina","Kaito","Mei","Riko","Ren"];
const FOREIGN = ["ッ","ღ","ᴬ","ᵛ","ヅ","ヅ","ッ","ジ","ㅤ","乇","丂","刀"];
const ICONS = ["🌸","✨","🌙","🍀","💫","🦋","🌷","🔥","🎀","🌈","💎","🍒"];
const ART_DECOR = ["༄", "彡", "꧁", "꧂", "★", "☆", "⚡", "๛"];

function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

function toFancy(s: string): string {
  // Ký tự "đẹp" (small caps / fullwidth-ish) chỉ áp cho a-z ASCII, giữ nguyên dấu.
  const map: Record<string, string> = {
    a:"ᴀ",b:"ʙ",c:"ᴄ",d:"ᴅ",e:"ᴇ",f:"ғ",g:"ɢ",h:"ʜ",i:"ɪ",j:"ᴊ",k:"ᴋ",l:"ʟ",m:"ᴍ",
    n:"ɴ",o:"ᴏ",p:"ᴘ",q:"ǫ",r:"ʀ",s:"s",t:"ᴛ",u:"ᴜ",v:"ᴠ",w:"ᴡ",x:"x",y:"ʏ",z:"ᴢ",
  };
  return s.split("").map((c) => map[c.toLowerCase()] ?? c).join("");
}

function viFull(gender: "male" | "female"): string {
  const mid = gender === "male" ? pick(MID_M) : pick(MID_F);
  const first = gender === "male" ? pick(FIRST_M) : pick(FIRST_F);
  return `${pick(LAST)} ${mid} ${first}`;
}

function viTwo(gender: "male" | "female"): string {
  return `${pick(LAST)} ${gender === "male" ? pick(FIRST_M) : pick(FIRST_F)}`;
}

function viOne(gender: "male" | "female"): string {
  return gender === "male" ? pick(FIRST_M) : pick(FIRST_F);
}

const CONCRETE: NameStyle[] = [
  "full","two_words","one_word","vi_plus_cn","korean","japanese","vi_plus_foreign","with_icon","artistic",
];

/** Sinh tên hiển thị theo kiểu đã chọn. */
export function generateDisplayName(style: NameStyle, gender: "male" | "female"): string {
  if (style === "random_all") return generateDisplayName(pick(CONCRETE), gender);

  switch (style) {
    case "full":
      return viFull(gender);
    case "two_words":
      return viTwo(gender);
    case "one_word":
      return viOne(gender);
    case "vi_plus_cn":
      return `${viTwo(gender)} ${pick(CN_CHARS)}`;
    case "korean":
      return `${pick(KO_LAST)} ${pick(KO_FIRST)}`;
    case "japanese":
      return `${pick(JP_LAST)} ${pick(JP_FIRST)}`;
    case "vi_plus_foreign": {
      const n = 1 + Math.floor(Math.random() * 3);
      let tail = "";
      for (let i = 0; i < n; i++) tail += pick(FOREIGN);
      return `${viTwo(gender)}${tail}`;
    }
    case "with_icon": {
      const name = viTwo(gender);
      return Math.random() < 0.5 ? `${pick(ICONS)} ${name}` : `${name} ${pick(ICONS)}`;
    }
    case "artistic": {
      const name = toFancy(viTwo(gender));
      return `${pick(ART_DECOR)}${name}${pick(ART_DECOR)}`;
    }
    default:
      return viTwo(gender);
  }
}
