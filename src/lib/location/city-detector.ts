/**
 * PHASE 3 — Tìm quanh đây.
 * Suy ra "city hiển thị" từ toạ độ.
 *
 * Yêu cầu: chỉ hiển thị 1 trong 3 khu vực:
 *   - "TP. Hồ Chí Minh"
 *   - "Hà Nội"
 *   - "Đà Nẵng"
 * Nếu không thuộc 3 khu vực → trả về null.
 *
 * Dùng bounding box rộng để bao trùm vùng đô thị + ngoại thành.
 * KHÔNG dùng API bên ngoài để không lộ toạ độ chính xác.
 */

type CityKey = "TP. Hồ Chí Minh" | "Hà Nội" | "Đà Nẵng";

interface CityBox {
  name: CityKey;
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const CITY_BOXES: CityBox[] = [
  // TP.HCM + ngoại thành (Củ Chi → Cần Giờ, Hóc Môn → Nhà Bè)
  { name: "TP. Hồ Chí Minh", minLat: 10.35, maxLat: 11.20, minLng: 106.30, maxLng: 107.05 },
  // Hà Nội (mở rộng sau sáp nhập)
  { name: "Hà Nội",          minLat: 20.55, maxLat: 21.40, minLng: 105.30, maxLng: 106.05 },
  // Đà Nẵng
  { name: "Đà Nẵng",         minLat: 15.90, maxLat: 16.25, minLng: 107.95, maxLng: 108.40 },
];

export function detectCity(latitude: number, longitude: number): CityKey | null {
  for (const box of CITY_BOXES) {
    if (
      latitude  >= box.minLat && latitude  <= box.maxLat &&
      longitude >= box.minLng && longitude <= box.maxLng
    ) {
      return box.name;
    }
  }
  return null;
}

export type { CityKey };