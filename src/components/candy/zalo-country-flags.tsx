/**
 * Quốc kỳ vẽ bằng SVG (không dùng ảnh/emoji) cho menu 5 quốc gia của Popup Zalo.
 * Mỗi cờ full-bleed trong viewBox 60x40, được crop tròn bởi cha (rounded-full + overflow-hidden).
 */

function FlagVN() {
  return (
    <svg viewBox="0 0 60 40" className="block h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="60" height="40" fill="#DA251D" />
      <polygon
        transform="translate(30 20) scale(1.25)"
        fill="#FFFF00"
        points="0,-9 2.02,-2.78 8.56,-2.78 3.27,1.06 5.29,7.28 0,3.44 -5.29,7.28 -3.27,1.06 -8.56,-2.78 -2.02,-2.78"
      />
    </svg>
  );
}

function FlagTW() {
  return (
    <svg viewBox="0 0 60 40" className="block h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="60" height="40" fill="#FE0000" />
      <rect width="30" height="20" fill="#000095" />
      <g fill="#FFFFFF">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M15 1.4 L13.6 5.4 L16.4 5.4 Z" transform={`rotate(${i * 30} 15 10)`} />
        ))}
        <circle cx="15" cy="10" r="4.4" />
      </g>
    </svg>
  );
}

function FlagJP() {
  return (
    <svg viewBox="0 0 60 40" className="block h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="60" height="40" fill="#FFFFFF" />
      <circle cx="30" cy="20" r="12" fill="#BC002D" />
    </svg>
  );
}

/** Một cụm 3 vạch của quẻ Kinh Dịch (broken = vạch đứt giữa). */
function Trigram({ x, y, rot, pattern }: { x: number; y: number; rot: number; pattern: [boolean, boolean, boolean] }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`} fill="#1A1A1A">
      {pattern.map((solid, i) => {
        const yy = -2.7 + i * 2.3;
        return solid ? (
          <rect key={i} x="-6.5" y={yy} width="13" height="1.7" rx="0.8" />
        ) : (
          <g key={i}>
            <rect x="-6.5" y={yy} width="5.7" height="1.7" rx="0.8" />
            <rect x="0.8" y={yy} width="5.7" height="1.7" rx="0.8" />
          </g>
        );
      })}
    </g>
  );
}

function FlagKR() {
  return (
    <svg viewBox="0 0 60 40" className="block h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="60" height="40" fill="#FFFFFF" />
      {/* Thái cực đồ */}
      <g transform="translate(30 20)">
        <path d="M-10 0 A10 10 0 0 1 10 0 Z" fill="#C60C30" />
        <path d="M-10 0 A10 10 0 0 0 10 0 Z" fill="#003478" />
        <circle cx="-5" cy="0" r="5" fill="#C60C30" />
        <circle cx="5" cy="0" r="5" fill="#003478" />
      </g>
      {/* 4 quẻ:☰(góc trên trái) · ☵(trên phải) · ☲(dưới trái) · ☷(dưới phải) */}
      <Trigram x={17.4} y={11.6} rot={-56} pattern={[true, true, true]} />
      <Trigram x={42.6} y={11.6} rot={56} pattern={[false, true, false]} />
      <Trigram x={17.4} y={28.4} rot={56} pattern={[true, false, true]} />
      <Trigram x={42.6} y={28.4} rot={-56} pattern={[false, false, false]} />
    </svg>
  );
}

function FlagUS() {
  const stripeH = 40 / 13;
  const stars: { x: number; y: number }[] = [];
  for (let row = 0; row < 5; row++) {
    const y = 3.4 + row * 3.8;
    const cols = row % 2 === 0 ? 5 : 4;
    const offset = row % 2 === 0 ? 0 : 2.6;
    for (let col = 0; col < cols; col++) stars.push({ x: 3 + offset + col * 5, y });
  }
  return (
    <svg viewBox="0 0 60 40" className="block h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="60" height="40" fill="#FFFFFF" />
      {[0, 2, 4, 6, 8, 10, 12].map((i) => (
        <rect key={i} y={i * stripeH} width="60" height={stripeH} fill="#B22234" />
      ))}
      <rect width="26" height={stripeH * 7} fill="#3C3B6E" />
      <g fill="#FFFFFF">
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r="1" />
        ))}
      </g>
    </svg>
  );
}

export type CountryFlagId = "vn" | "tw" | "jp" | "kr" | "us";

const FLAGS: Record<CountryFlagId, () => React.JSX.Element> = {
  vn: FlagVN,
  tw: FlagTW,
  jp: FlagJP,
  kr: FlagKR,
  us: FlagUS,
};

/** Cờ quốc gia render trong avatar tròn (cha lo crop tròn + viền). */
export function CountryFlag({ id }: { id: CountryFlagId }) {
  const Flag = FLAGS[id] ?? FlagVN;
  return <Flag />;
}
