// Sinh danh sách "Cộng đồng VIP Zalo" theo tỉnh — random phía client, không cần DB/API.
import { districtsOf } from "./vn-districts";

export interface VipCommunity {
  index: number;
  name: string;
  members: number;
  male: number;
  female: number;
}

export interface VipCommunitySet {
  region: string;
  title: string;
  communities: VipCommunity[];
  admins: number;
}

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

const rnd = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export function generateVipCommunities(region?: string | null): VipCommunitySet {
  const r = (region || "").trim() || "Việt Nam";
  const districts = districtsOf(r);
  const usedDistricts = new Set<string>();
  let provinceSeq = 0;

  const communities: VipCommunity[] = Array.from({ length: 6 }, (_, i) => {
    const useProvince = Math.random() < 0.7 || districts.length === 0;
    let name: string;
    if (useProvince) {
      provinceSeq += 1;
      name = `Cộng Đồng VIP Zalo ${r} ${provinceSeq}`;
    } else {
      const pool = districts.filter((d) => !usedDistricts.has(d));
      const d = (pool.length ? pool : districts)[rnd(0, (pool.length ? pool : districts).length - 1)];
      usedDistricts.add(d);
      name = `Cộng Đồng VIP Zalo ${d}`;
    }
    const members = rnd(500, 1200);
    const male = Math.min(rnd(150, 650), members - 1);
    return { index: i, name, members, male, female: members - male };
  });

  return {
    region: r,
    title: `CỘNG ĐỒNG VIP ZALO ${r.toUpperCase()}`,
    communities,
    admins: rnd(1, 10),
  };
}

export function circledNumber(i: number): string {
  return CIRCLED[i] ?? `${i + 1}.`;
}

export function communitySetToText(set: VipCommunitySet): string {
  const lines = [set.title, ""];
  set.communities.forEach((c, i) => {
    lines.push(`${circledNumber(i)} ${c.name}`);
    lines.push(`${c.members} thành viên`);
    lines.push(`Nam ${c.male}`);
    lines.push(`Nữ ${c.female}`);
    lines.push("");
  });
  lines.push(`Hiện có ${set.admins} Admin hỗ trợ khu vực ${set.region}.`);
  return lines.join("\n");
}
