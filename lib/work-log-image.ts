/**
 * 📝 ใบจดผลงาน — งานรูปฝั่งเบราว์เซอร์ (ห้ามเรียกจากเซิร์ฟเวอร์)
 *   prepareWorkLogPhoto : หมุนตาม EXIF + ย่อเหลือด้านยาว ≤ 2400px (JPEG) → อัปเร็ว AI อ่านเร็ว ลายมือยังชัด
 *   decodeWorkLogQr     : หา QR บนใบ (มุมขวาบน) — ลองทั้งรูป แล้วซูมทีละมุม (เผื่อถ่ายกลับหัว) · ไม่เจอ = null
 */
const MAX_SIDE = 2400;

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try { return await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { return await createImageBitmap(file); }
}

export async function prepareWorkLogPhoto(file: File): Promise<File> {
  const bmp = await loadBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.88));
  if (!blob) return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "work-log";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

type Region = [number, number, number, number]; // x, y, w, h (สัดส่วน 0–1)
const REGIONS: Region[] = [
  [0, 0, 1, 1],              // ทั้งรูป
  [0.55, 0, 0.45, 0.35],     // มุมขวาบน (ตำแหน่ง QR บนใบ)
  [0, 0.65, 0.45, 0.35],     // มุมซ้ายล่าง (ถ่ายกลับหัว)
  [0.5, 0, 0.5, 0.5], [0, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], [0, 0.5, 0.5, 0.5],
];

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export async function decodeWorkLogQr(file: Blob): Promise<string | null> {
  const bmp = await loadBitmap(file);
  try {
    const Ctor = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    let detector: Detector | null = null;
    if (Ctor) { try { detector = new Ctor({ formats: ["qr_code"] }); } catch { detector = null; } }
    const jsQR = detector ? null : (await import("jsqr")).default;
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    for (const [rx, ry, rw, rh] of REGIONS) {
      const sx = rx * bmp.width, sy = ry * bmp.height, sw = rw * bmp.width, sh = rh * bmp.height;
      for (const target of [1200, 800, 1800]) {
        const scale = Math.min(target / sw, 2);
        c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
        ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
        try {
          if (detector) {
            const hit = (await detector.detect(c)).map((x) => x.rawValue).find((v) => v.startsWith("WL1|"));
            if (hit) return hit;
          } else if (jsQR) {
            const img = ctx.getImageData(0, 0, c.width, c.height);
            const hit = jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
            if (hit?.data.startsWith("WL1|")) return hit.data;
          }
        } catch { /* ลองขนาดถัดไป */ }
      }
    }
    return null;
  } finally {
    bmp.close();
  }
}
