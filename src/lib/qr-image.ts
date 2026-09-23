/**
 * Xử lý ảnh QR trước khi lưu — ưu tiên ĐỘ CHÍNH XÁC & khả năng quét.
 *
 * • Tự tìm vùng chứa QR (bounding box các pixel tối) rồi crop gọn.
 * • LUÔN chừa quiet zone trắng quanh QR → không mất góc, vẫn quét được.
 * • Không resize, không nén mất dữ liệu: xuất PNG lossless ở đúng độ phân giải gốc.
 * • Nếu không nhận diện được vùng QR → trả lại file gốc, không can thiệp.
 */

const DARK_THRESHOLD = 140; // luminance dưới ngưỡng này coi là "mực" của QR

async function loadBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fallback dưới */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Không đọc được ảnh QR."));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

function canvasToPngFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Không tạo được ảnh QR."));
      resolve(new File([blob], name, { type: "image/png" }));
    }, "image/png"); // PNG = lossless, không blur/nén
  });
}

/**
 * Crop gọn vào QR nhưng giữ đủ 4 góc + vùng trắng. Trả PNG lossless.
 * Ảnh đầu vào không nhận diện được → trả nguyên file gốc.
 */
export async function prepareQrImage(file: File | Blob): Promise<File> {
  const baseName = ((file as File).name || "qr").replace(/\.[^./\\]+$/, "");
  const fallback =
    file instanceof File ? file : new File([file], `${baseName}.png`, { type: file.type || "image/png" });

  try {
    const bmp = await loadBitmap(file);
    const w = "width" in bmp ? Number(bmp.width) : 0;
    const h = "height" in bmp ? Number(bmp.height) : 0;
    if (!w || !h) return fallback;

    const src = document.createElement("canvas");
    src.width = w;
    src.height = h;
    const sctx = src.getContext("2d", { willReadFrequently: true });
    if (!sctx) return fallback;
    sctx.imageSmoothingEnabled = false;
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, w, h);
    sctx.drawImage(bmp as CanvasImageSource, 0, 0);

    const { data } = sctx.getImageData(0, 0, w, h);
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = data[i + 3]!;
        if (a < 32) continue;
        const lum = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
        if (lum > DARK_THRESHOLD) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0 || maxY < 0) return fallback;

    let boxW = maxX - minX + 1;
    let boxH = maxY - minY + 1;
    // Vùng tối quá nhỏ / gần như toàn ảnh → không crop để tránh cắt sai.
    if (boxW < 40 || boxH < 40) return fallback;

    // Ép về hình vuông quanh tâm vùng QR (QR luôn vuông) + quiet zone 8%.
    const side = Math.max(boxW, boxH);
    const quiet = Math.max(12, Math.round(side * 0.08));
    const out = side + quiet * 2;
    const cx = minX + boxW / 2;
    const cy = minY + boxH / 2;
    const sx = cx - out / 2;
    const sy = cy - out / 2;

    const dst = document.createElement("canvas");
    dst.width = out;
    dst.height = out;
    const dctx = dst.getContext("2d");
    if (!dctx) return fallback;
    dctx.imageSmoothingEnabled = false;
    dctx.fillStyle = "#ffffff"; // quiet zone luôn trắng
    dctx.fillRect(0, 0, out, out);
    // Vẽ 1:1, không scale → giữ nguyên độ phân giải gốc của QR.
    dctx.drawImage(src, sx, sy, out, out, 0, 0, out, out);

    boxW = boxH = 0;
    return await canvasToPngFile(dst, `${baseName}-qr.png`);
  } catch {
    return fallback;
  }
}
