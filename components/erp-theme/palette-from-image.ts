"use client";
// ดูดสีจากรูปในคลัง (R2 key) — ย่อเหลือ 120px แล้วส่งพิกเซลให้ paletteFromPixels (lib/erp-theme-config)
// ⚠️ รูปผ่าน /api/r2-image ถูก redirect ไปตัวเสิร์ฟรูปคนละโดเมน → ต้อง crossOrigin ไม่งั้นอ่านพิกเซลไม่ได้
import { paletteFromPixels } from "@/lib/erp-theme-config";
import { swatchesFromPixels } from "@/lib/erp-theme-palettes";

async function pixelsFromImageKey(key: string): Promise<Uint8ClampedArray | null> {
  const im = new Image();
  im.crossOrigin = "anonymous";
  im.src = `/api/r2-image?key=${encodeURIComponent(key)}&w=200`;
  await im.decode();
  const w = 120, h = Math.max(1, Math.round((im.naturalHeight / im.naturalWidth) * w));
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(im, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

export async function paletteFromImageKey(key: string): Promise<ReturnType<typeof paletteFromPixels>> {
  const d = await pixelsFromImageKey(key);
  return d ? paletteFromPixels(d) : null;
}

/** ดูดสีเด่นจากรูป n สี (แผงสี › ชุดสี › ดูดสีจากรูป) */
export async function swatchesFromImageKey(key: string, n = 5): Promise<string[]> {
  const d = await pixelsFromImageKey(key);
  return d ? swatchesFromPixels(d, n) : [];
}
