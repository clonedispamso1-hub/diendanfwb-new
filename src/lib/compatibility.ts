/**
 * Compatibility scoring for chat popup-style header.
 * Pure function — no side effects, safe for SSR.
 */

export interface CompatProfile {
  age?: number | null;
  city?: string | null;
  province?: string | null;
  location?: string | null;
  zodiac?: string | null;
  mbti?: string | null;
  interests?: string[] | null;
  gender?: string | null;
}

const EXTROVERT = new Set(["E", "ENFP", "ENFJ", "ENTP", "ENTJ", "ESFP", "ESFJ", "ESTP", "ESTJ"]);
const INTROVERT = new Set(["I", "INFP", "INFJ", "INTP", "INTJ", "ISFP", "ISFJ", "ISTP", "ISTJ"]);

function cityOf(p: CompatProfile): string {
  return (p.city || p.province || p.location || "").trim().toLowerCase();
}

function isExtro(mbti?: string | null) {
  if (!mbti) return false;
  return EXTROVERT.has(mbti.toUpperCase()) || mbti.toUpperCase().startsWith("E");
}
function isIntro(mbti?: string | null) {
  if (!mbti) return false;
  return INTROVERT.has(mbti.toUpperCase()) || mbti.toUpperCase().startsWith("I");
}

export function calculateCompatibility(a: CompatProfile, b: CompatProfile): number {
  let score = 50;

  // Age
  if (a.age && b.age) {
    const diff = Math.abs(a.age - b.age);
    if (diff <= 2) score += 15;
    else if (diff <= 5) score += 10;
  }

  // Same city/province
  const ca = cityOf(a);
  const cb = cityOf(b);
  if (ca && cb && ca === cb) score += 20;

  // Same zodiac
  if (a.zodiac && b.zodiac && a.zodiac.trim().toLowerCase() === b.zodiac.trim().toLowerCase()) {
    score += 15;
  }

  // Interests overlap (+5 each, cap 20)
  const ia = (a.interests || []).map((s) => s.toLowerCase());
  const ib = new Set((b.interests || []).map((s) => s.toLowerCase()));
  const shared = ia.filter((x) => ib.has(x)).length;
  score += Math.min(20, shared * 5);

  // Personality complement
  if ((isIntro(a.mbti) && isExtro(b.mbti)) || (isExtro(a.mbti) && isIntro(b.mbti))) {
    score += 15;
  }
  // Iconic pair ENFP-INFJ
  const ma = a.mbti?.toUpperCase();
  const mb = b.mbti?.toUpperCase();
  if ((ma === "ENFP" && mb === "INFJ") || (ma === "INFJ" && mb === "ENFP")) {
    score += 5;
  }

  if (score < 0) score = 0;
  if (score > 99) score = 99;
  return Math.round(score);
}

/** Compute western zodiac sign from birthday (YYYY-MM-DD or Date). */
export function zodiacFromDate(input?: string | Date | null): string | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const signs: Array<[string, number, number]> = [
    ["Ma Kết", 12, 22], ["Bảo Bình", 1, 20], ["Song Ngư", 2, 19],
    ["Bạch Dương", 3, 21], ["Kim Ngưu", 4, 20], ["Song Tử", 5, 21],
    ["Cự Giải", 6, 21], ["Sư Tử", 7, 23], ["Xử Nữ", 8, 23],
    ["Thiên Bình", 9, 23], ["Bọ Cạp", 10, 23], ["Nhân Mã", 11, 22],
  ];
  if ((m === 12 && day >= 22) || (m === 1 && day <= 19)) return "Ma Kết";
  if ((m === 1 && day >= 20) || (m === 2 && day <= 18)) return "Bảo Bình";
  if ((m === 2 && day >= 19) || (m === 3 && day <= 20)) return "Song Ngư";
  if ((m === 3 && day >= 21) || (m === 4 && day <= 19)) return "Bạch Dương";
  if ((m === 4 && day >= 20) || (m === 5 && day <= 20)) return "Kim Ngưu";
  if ((m === 5 && day >= 21) || (m === 6 && day <= 20)) return "Song Tử";
  if ((m === 6 && day >= 21) || (m === 7 && day <= 22)) return "Cự Giải";
  if ((m === 7 && day >= 23) || (m === 8 && day <= 22)) return "Sư Tử";
  if ((m === 8 && day >= 23) || (m === 9 && day <= 22)) return "Xử Nữ";
  if ((m === 9 && day >= 23) || (m === 10 && day <= 22)) return "Thiên Bình";
  if ((m === 10 && day >= 23) || (m === 11 && day <= 21)) return "Bọ Cạp";
  return "Nhân Mã";
}
