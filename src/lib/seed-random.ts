// Random generator cho FWB Seed Accounts (admin tool).
// 100% Female. Bio mix: 90% VN · 5% CN · 5% KR/JP/PL.
// Tên đa phong cách (VN có/không dấu, icon ✨🎀🧸, nick CN/JP/KR/EN).
// Avatar: nữ đẹp (ưu tiên), anime nữ, douyin/aesthetic, scenic.

import femaleAvatar1 from "@/assets/default-avatars/gioitinhnu1.jpg";
import femaleAvatar2 from "@/assets/default-avatars/gioitinhnu2.jpg";
import femaleAvatar3 from "@/assets/default-avatars/gioitinhnu3.jpg";
import femaleAvatar4 from "@/assets/default-avatars/gioitinhnu4.jpg";
import femaleAvatar5 from "@/assets/default-avatars/gioitinhnu5.jpg";

const LOCAL_FEMALE_AVATARS = [femaleAvatar1, femaleAvatar2, femaleAvatar3, femaleAvatar4, femaleAvatar5];

// =====================================================================
// NAMES
// =====================================================================
const VN_FIRST = [
  "Ngọc", "Bích", "Khả", "Thanh", "Mỹ", "Thiên", "Hà", "Thu", "Quỳnh", "Minh",
  "Phương", "Bảo", "Hoàng", "Kim", "Tú", "Diệu", "Thảo", "Nhật", "An", "Cẩm",
  "Linh", "Trúc", "Yến", "Hạnh", "Trang", "Vy", "Ý", "Tâm", "Nga", "Lan",
];
const VN_LAST = [
  "Anh", "Diệu", "Hân", "Xuân", "Linh", "Kim", "My", "Trang", "Như", "Châu",
  "Trân", "Yến", "Ngân", "Quyên", "Vy", "Hạ", "Nhiên", "Tú", "Thy", "Phụng",
  "Khuê", "Đan", "Chi", "Quyên", "Tiên", "Hằng", "Băng", "Nhi", "Khanh", "Vân",
];
const VN_NICKS = [
  "bé thỏ", "mèo lười", "bánh bao", "kem dâu", "miu miu",
  "bé na", "su su", "bí ngô", "bông", "kẹo ngọt", "su kem", "bơ sữa",
];
const CN_NAMES = [
  "Tiểu Hy", "Bạch Lộc", "Tư Vũ", "Tiểu Nhu", "Lâm Y", "Mạn Ngọc",
  "An Nhiên", "Thư Đồng", "Lăng Tuyết", "Mộc Hi", "Tiểu Yên", "Vân Khê",
];
const KR_NAMES = ["Yuna", "Sujin", "Minji", "Ara", "Hayoon", "Seri", "Jiwon", "Chaeyoung", "Hyeri", "Soobin"];
const JP_NAMES = ["Yuki", "Hana", "Airi", "Sakura", "Rin", "Aoi", "Mei", "Hina", "Nana", "Yui"];
const EN_NAMES = ["Emily", "Anna", "Bella", "Chloe", "Daisy", "Ivy", "Luna", "Mia", "Lily", "Sophie"];
const PL_NAMES = ["Zofia", "Lena", "Maja", "Hania", "Julka"];

const DECOR_TAILS = [" ✨", " 🎀", " 🧸", " 🌸", " ♡", " 🌷", " 🐰", " ✿", " 🍓", " ☁︎"];
const DECOR_HEADS = ["✨ ", "🎀 ", "🌸 ", "♡ ", "🧸 "];

function removeDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Tên với độ đa dạng cao theo spec. */
function randomName(): { display: string; lastWord: string } {
  const r = Math.random();
  let display: string;
  let lastWord: string;
  if (r < 0.35) {
    // VN có dấu
    const first = pick(VN_FIRST);
    lastWord = pick(VN_LAST);
    display = `${first} ${lastWord}`;
  } else if (r < 0.55) {
    // VN không dấu
    const first = removeDiacritics(pick(VN_FIRST));
    lastWord = removeDiacritics(pick(VN_LAST));
    display = `${first} ${lastWord}`;
  } else if (r < 0.70) {
    // VN + icon
    const first = pick(VN_FIRST);
    lastWord = pick(VN_LAST);
    const head = Math.random() < 0.3 ? pick(DECOR_HEADS) : "";
    const tail = Math.random() < 0.7 ? pick(DECOR_TAILS) : "";
    display = `${head}${first} ${lastWord}${tail}`.trim();
  } else if (r < 0.78) {
    // Nickname VN
    const nick = pick(VN_NICKS);
    lastWord = nick.split(" ").pop() || nick;
    display = nick + (Math.random() < 0.5 ? pick(DECOR_TAILS) : "");
  } else if (r < 0.86) {
    const cn = pick(CN_NAMES); lastWord = cn.split(" ").pop() || cn; display = cn;
  } else if (r < 0.92) {
    const kr = pick(KR_NAMES); lastWord = kr; display = kr;
  } else if (r < 0.97) {
    const jp = pick(JP_NAMES); lastWord = jp; display = jp;
  } else {
    const en = pick(EN_NAMES.concat(PL_NAMES)); lastWord = en; display = en;
  }
  return { display: display.trim(), lastWord: lastWord.toLowerCase() };
}

// =====================================================================
// BIO — 90% VN / 5% CN / 5% KR-JP-PL
// =====================================================================
const BIO_VN = [
  "đang buồn chán, ai chat cùng không 🥺",
  "tìm người tâm sự cuối tuần",
  "cafe tối nay có ai không nè",
  "tìm FWB kín đáo, nghiêm túc",
  "cần người nói chuyện tối khuya",
  "online khuya, lười ngủ ghê",
  "chill cuối tuần, hỏi gì cũng trả lời",
  "mệt mỏi, ai bao ăn không 🍜",
  "muốn có người đi xem phim",
  "đang rảnh, ai rảnh giống mình hơm",
  "yêu một người không yêu mình mệt thật ✨",
  "một mình cũng được, có đôi càng vui 🎀",
  "đời con gái như chiếc lá thu 🍂",
  "tâm hồn ăn uống, tìm bạn đi ăn đêm 🍢",
  "thích người biết lắng nghe hơn người nói nhiều",
  "ai hợp gu thì nhắn nha, hong hợp đừng làm phiền",
  "đang tìm người chữa lành 🌷",
  "mình thích yên tĩnh, thích trà sữa, thích bạn 🧋",
  "thật lòng tìm người tử tế ♡",
  "không drama, không thị phi, chỉ cần bình yên",
];
const BIO_CN = [
  "想找一个聊得来的人",
  "晚安, 想被宠爱 ✨",
  "孤独的夜想要陪伴",
  "喜欢温柔的男生",
  "下雨天最适合恋爱",
];
const BIO_KR_JP_PL = [
  "오늘도 외로워요 🌙",
  "사랑이 필요해 ♡",
  "誰か一緒に話さない?",
  "夜は長い、誰かと一緒に",
  "Szukam kogoś szczerego ♡",
];

function randomBio(): string {
  const r = Math.random();
  if (r < 0.9) return pick(BIO_VN);
  if (r < 0.95) return pick(BIO_CN);
  return pick(BIO_KR_JP_PL);
}

// =====================================================================
// AVATAR — beauty (highest), anime, douyin/aesthetic, scenic
// =====================================================================
const AVATAR_BEAUTY = [
  "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=400",
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400",
  "https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?w=400",
  "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400",
  "https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=400",
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400",
  "https://images.unsplash.com/photo-1463453091185-61582044d556?w=400",
  "https://images.unsplash.com/photo-1499887142886-791eca5918cd?w=400",
  "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=400",
];
const AVATAR_ANIME = [
  "https://i.pinimg.com/736x/8e/0a/57/8e0a577f7a4f8f9f8e9c4a4a4b4c4d4e.jpg",
  "https://i.pravatar.cc/400?img=47",
  "https://i.pravatar.cc/400?img=48",
  "https://i.pravatar.cc/400?img=49",
];
const AVATAR_DOUYIN = [
  "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=400",
  "https://images.unsplash.com/photo-1496440737103-cd596325d314?w=400",
  "https://images.unsplash.com/photo-1542596594-649edbc13630?w=400",
  "https://images.unsplash.com/photo-1485875437342-9b39470b3d95?w=400",
];
const AVATAR_SCENIC = [
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
  "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400",
  "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=400",
];

function randomAvatar(): string {
  const r = Math.random();
  if (r < 0.55) return pick(AVATAR_BEAUTY);     // 55% nữ đẹp
  if (r < 0.75) return pick(AVATAR_DOUYIN);     // 20% douyin
  if (r < 0.88) return pick(AVATAR_ANIME);      // 13% anime
  if (r < 0.95) return pick(AVATAR_SCENIC);     // 7% scenic
  return pick(LOCAL_FEMALE_AVATARS);            // 5% local fallback
}

// =====================================================================
// TAGS / PROVINCE
// =====================================================================
const TAGS = ["FWB", "Tâm sự", "Cafe tối", "Đi chơi", "Hẹn hò", "Bạn bè", "Online khuya", "Chia sẻ"];

const VN_PROVINCES_CORE = [
  "TP Hồ Chí Minh", "Hà Nội", "Đà Nẵng", "Cần Thơ", "Hải Phòng",
  "Bình Dương", "Đồng Nai", "Khánh Hòa", "Lâm Đồng", "Huế",
];

// =====================================================================
// EXPORT
// =====================================================================
export interface RandomSeedDraft {
  username: string;
  display_name: string;
  avatar_url: string;
  bio: string;
  tag: string;
  age: number;
  vip_level: number;
  province: string | null;
  gender: "female";
}

const USED_LASTS = new Set<string>();

function randomUsername(name: string): string {
  const slug = removeDiacritics(name).replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "girl";
  return `${slug}${Math.floor(Math.random() * 9000 + 1000)}`;
}

export function generateRandomSeed(): RandomSeedDraft {
  // bảo đảm không trùng "last word" trong cùng phiên batch
  let attempt = 0;
  let nm = randomName();
  while (USED_LASTS.has(nm.lastWord) && attempt < 12) {
    nm = randomName();
    attempt++;
  }
  USED_LASTS.add(nm.lastWord);

  return {
    username: randomUsername(nm.display),
    display_name: nm.display,
    avatar_url: randomAvatar(),
    bio: randomBio(),
    tag: pick(TAGS),
    age: 19 + Math.floor(Math.random() * 12),
    vip_level: Math.random() < 0.18 ? (Math.random() < 0.5 ? 2 : 3) : 1,
    province: Math.random() < 0.55 ? null : pick(VN_PROVINCES_CORE),
    gender: "female",
  };
}

export function generateRandomSeedBatch(count: number): RandomSeedDraft[] {
  // reset trùng theo từng batch
  USED_LASTS.clear();
  return Array.from({ length: count }, () => generateRandomSeed());
}
