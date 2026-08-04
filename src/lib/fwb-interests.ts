export interface InterestOption {
  key: string;
  label: string;
  emoji: string;
}

export const FWB_INTERESTS: InterestOption[] = [
  { key: "game", label: "Game", emoji: "🎮" },
  { key: "music", label: "Âm nhạc", emoji: "🎵" },
  { key: "movie", label: "Phim", emoji: "🎬" },
  { key: "book", label: "Đọc sách", emoji: "📚" },
  { key: "gym", label: "Gym", emoji: "🏋️" },
  { key: "travel", label: "Du lịch", emoji: "✈️" },
  { key: "photo", label: "Chụp ảnh", emoji: "📷" },
  { key: "food", label: "Ăn uống", emoji: "🍜" },
  { key: "pet", label: "Thú cưng", emoji: "🐶" },
  { key: "car", label: "Xe cộ", emoji: "🚗" },
  { key: "tech", label: "Công nghệ", emoji: "💻" },
  { key: "football", label: "Bóng đá", emoji: "⚽" },
  { key: "basketball", label: "Bóng rổ", emoji: "🏀" },
  { key: "karaoke", label: "Karaoke", emoji: "🎤" },
  { key: "cafe", label: "Cafe", emoji: "☕" },
  { key: "night", label: "Tâm sự đêm", emoji: "🌙" },
  { key: "serious", label: "Dating nghiêm túc", emoji: "💎" },
  { key: "art", label: "Nghệ thuật", emoji: "🎨" },
  { key: "biz", label: "Kinh doanh", emoji: "📈" },
  { key: "manga", label: "Manga", emoji: "📖" },
  { key: "anime", label: "Anime", emoji: "🌸" },
  { key: "esports", label: "Esports", emoji: "🎯" },
  { key: "shopping", label: "Shopping", emoji: "🛍" },
  { key: "cooking", label: "Nấu ăn", emoji: "🍳" },
  { key: "fishing", label: "Câu cá", emoji: "🎣" },
  { key: "camping", label: "Camping", emoji: "🏕" },
];

export const MAX_INTERESTS = 3;

export function findInterest(key: string): InterestOption | null {
  return FWB_INTERESTS.find((i) => i.key === key) || null;
}

export function labelToKey(label: string): string | null {
  const found = FWB_INTERESTS.find((i) =>
    i.label.toLowerCase() === label.toLowerCase() ||
    `${i.emoji} ${i.label}`.toLowerCase() === label.toLowerCase()
  );
  return found ? found.key : null;
}
