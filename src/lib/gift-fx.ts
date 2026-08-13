/**
 * gift-fx — hiệu ứng siêu nhẹ cho Gift System V2 (CSS thuần, không lib).
 *
 *  • flyCoinsToWallet()  — xu vàng bay từ nút "Nhận quà" về icon ví trên header.
 *  • sparkleBurst()      — vài đốm sparkle nhỏ toả ra tại một điểm.
 *  • flyGiftToPost()     — icon quà phóng to nhẹ rồi bay về phía bài viết.
 */

type Point = { x: number; y: number };

function ensureLayer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let layer = document.getElementById("gift-fx-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.id = "gift-fx-layer";
    layer.className = "gfx-layer";
    document.body.appendChild(layer);
  }
  return layer;
}

function walletPoint(): Point {
  const el = document.querySelector(".hdr-wallet-btn") as HTMLElement | null;
  if (el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: window.innerWidth - 60, y: 40 };
}

function spawn(layer: HTMLElement, node: HTMLElement, ms: number) {
  layer.appendChild(node);
  window.setTimeout(() => node.remove(), ms);
}

/** Xu vàng bay từ `from` về icon ví. */
export function flyCoinsToWallet(from: Point, count = 7) {
  const layer = ensureLayer();
  if (!layer) return;
  const to = walletPoint();
  for (let i = 0; i < count; i++) {
    const coin = document.createElement("span");
    coin.className = "gfx-coin";
    coin.textContent = "🪙";
    const jitterX = (Math.random() - 0.5) * 46;
    const jitterY = (Math.random() - 0.5) * 26;
    coin.style.left = `${from.x + jitterX}px`;
    coin.style.top = `${from.y + jitterY}px`;
    coin.style.setProperty("--gfx-dx", `${to.x - from.x - jitterX}px`);
    coin.style.setProperty("--gfx-dy", `${to.y - from.y - jitterY}px`);
    coin.style.animationDelay = `${i * 55}ms`;
    spawn(layer, coin, 1400 + i * 55);
  }
  const wallet = document.querySelector(".hdr-wallet-btn") as HTMLElement | null;
  if (wallet) {
    window.setTimeout(() => {
      wallet.classList.add("gfx-wallet-pop");
      window.setTimeout(() => wallet.classList.remove("gfx-wallet-pop"), 600);
    }, 520);
  }
}

/**
 * Hiện text "+168.400 xu" bay lên rồi biến mất ngay cạnh icon ví.
 * Dùng cho luồng "Nhận tất cả" — chỉ hiện 1 lần cho tổng số xu.
 */
export function showCoinGain(amount: number, delay = 620) {
  const layer = ensureLayer();
  if (!layer || !amount || amount <= 0) return;
  const to = walletPoint();
  window.setTimeout(() => {
    const node = document.createElement("span");
    node.className = "gfx-gain";
    node.textContent = `+${amount.toLocaleString("vi-VN")} xu`;
    node.style.left = `${to.x}px`;
    node.style.top = `${to.y + 18}px`;
    spawn(layer, node, 1600);
  }, delay);
}


/** Vài đốm sparkle nhỏ toả ra quanh một điểm. */
export function sparkleBurst(at: Point, count = 6) {
  const layer = ensureLayer();
  if (!layer) return;
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "gfx-sparkle";
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 26 + Math.random() * 26;
    s.style.left = `${at.x}px`;
    s.style.top = `${at.y}px`;
    s.style.setProperty("--gfx-dx", `${Math.cos(angle) * dist}px`);
    s.style.setProperty("--gfx-dy", `${Math.sin(angle) * dist}px`);
    spawn(layer, s, 700);
  }
}

/**
 * Quà phóng lên (scale + opacity + sparkle) rồi bay về phía bài viết.
 * `postId` dùng để tìm phần tử `#post-<id>`; nếu không có thì bay lên trên.
 */
export function flyGiftToPost(emoji: string, from: Point, postId?: string) {
  const layer = ensureLayer();
  if (!layer) return;
  let to: Point = { x: from.x, y: from.y - 180 };
  if (postId) {
    const el = document.getElementById(`post-${postId}`);
    if (el) {
      const r = el.getBoundingClientRect();
      to = { x: r.left + r.width / 2, y: r.top + Math.min(120, r.height / 2) };
    }
  }
  const node = document.createElement("span");
  node.className = "gfx-gift";
  node.textContent = emoji || "🎁";
  node.style.left = `${from.x}px`;
  node.style.top = `${from.y}px`;
  node.style.setProperty("--gfx-dx", `${to.x - from.x}px`);
  node.style.setProperty("--gfx-dy", `${to.y - from.y}px`);
  spawn(layer, node, 1100);
  sparkleBurst(from, 6);
  window.setTimeout(() => sparkleBurst(to, 5), 620);
}
