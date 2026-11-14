/**
 * ตัวช่วยฝั่งหน้าจอของแผงผ้า (Swatch) — ดูดสีจากพิกเซล · คลิกที่สี = ตีกรอบ · ย่อรูปส่ง AI · AI อ่านเลข/ชื่อสีให้กรอบ · อัปรูป
 * สูตรคิดล้วน (รหัส/กรอบ/ครอป/ไล่สี) อยู่ lib/sku-swatch.ts (ใช้ร่วมกับ API + มีเทสต์)
 */
import { apiFetch } from "@/lib/api";
import { loadImageEl } from "@/components/image-crop-picker";
import { uploadImagesWithDupCheck, type DuplicateCheckOptions } from "@/components/duplicate-upload";
import type { UploadProgressState } from "@/components/upload-progress";
import { averageHex, boxBlur3, floodFitRect, sortReadingOrder, type AiChipLabel, type AiSwatchRead, type FloodFit, type PctRect } from "@/lib/sku-swatch";

// ───────────────────────────── คลิกที่สี = ตีกรอบให้ ─────────────────────────────
/** พิกเซลของรูป (ย่อด้านยาว ≤ 900px + เบลอ 3×3 ลดลายผ้า) แคชตาม URL — คลิกหลายชิ้นไม่ต้องอ่านรูปใหม่ */
const pixelCache = new Map<string, Promise<{ px: Uint8ClampedArray; W: number; H: number }>>();
function pixelsOf(src: string) {
  let p = pixelCache.get(src);
  if (!p) {
    p = (async () => {
      const img = await loadImageEl(src);
      const k = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
      const W = Math.max(1, Math.round(img.naturalWidth * k)), H = Math.max(1, Math.round(img.naturalHeight * k));
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(img, 0, 0, W, H);
      return { px: boxBlur3(ctx.getImageData(0, 0, W, H).data, W, H), W, H };
    })();
    p.catch(() => pixelCache.delete(src));
    pixelCache.set(src, p);
    if (pixelCache.size > 12) pixelCache.delete(pixelCache.keys().next().value as string);
  }
  return p;
}
/** คลิกที่จุด (% ของรูป) → กรอบพอดีชิ้นสีเดียวกัน + สีเฉลี่ยทั้งชิ้น · tol = ความไวสี (ยิ่งมาก ยิ่งกินกว้าง) */
export async function fitAtPoint(src: string, pt: { x: number; y: number }, tol: number): Promise<FloodFit> {
  const { px, W, H } = await pixelsOf(src);
  return floodFitRect(px, W, H, (pt.x / 100) * W, (pt.y / 100) * H, { tol });
}

// ───────────────────────────── AI อ่านเลข + ชื่อสี ให้กรอบที่มีอยู่ ─────────────────────────────
/** วาดกรอบ + เลข 1..n (เรียงแบบอ่านหนังสือ) ลงบนรูป → JPEG data URL ส่งให้ AI */
export async function drawNumberedImage(src: string, rects: PctRect[], maxSide = 1600): Promise<string> {
  const img = await loadImageEl(src);
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const W = Math.max(1, Math.round(img.naturalWidth * k)), H = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, 0, 0, W, H);
  const fs = Math.max(14, Math.round(Math.max(W, H) * 0.016));
  ctx.lineWidth = Math.max(2, Math.round(fs / 7));
  ctx.font = `bold ${fs}px sans-serif`;
  ctx.textBaseline = "top";
  rects.forEach((r, i) => {
    const x = (r.x / 100) * W, y = (r.y / 100) * H, w = (r.w / 100) * W, h = (r.h / 100) * H;
    ctx.strokeStyle = "#00e676"; ctx.strokeRect(x, y, w, h);
    const t = String(i + 1), tw = ctx.measureText(t).width + fs * 0.4;
    ctx.fillStyle = "#c2185b"; ctx.fillRect(x, y, tw, fs * 1.2);
    ctx.fillStyle = "#ffffff"; ctx.fillText(t, x + fs * 0.2, y + fs * 0.1);
  });
  return canvas.toDataURL("image/jpeg", 0.88);
}
/** AI อ่านเลขที่พิมพ์ข้างชิ้น + ชื่อสี ให้ชิ้นบนรูปนี้ (ไม่แตะตำแหน่งกรอบ) → id ชิ้น → ผลอ่าน */
export async function readPhotoLabels(photo: DraftPhoto, chips: DraftChip[]): Promise<Map<string, AiChipLabel>> {
  const ordered = sortReadingOrder(chips.filter((c) => c.photo === photo.key));
  if (!ordered.length) return new Map();
  const image = await drawNumberedImage(photo.src, ordered);
  const j = await apiFetch("/api/sku-swatches/ai-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "label", count: ordered.length, image }) }).then((r) => r.json());
  if (j.error) throw new Error(j.error);
  const items = (j.data?.items ?? []) as AiChipLabel[];
  const out = new Map<string, AiChipLabel>();
  for (const it of items) { const c = ordered[it.n - 1]; if (c) out.set(c.id, it); }
  return out;
}
import type { SwatchSpot } from "@/app/api/sku-swatches/route";

/** รูปในหน้าจอ (ยังไม่บันทึก/บันทึกแล้ว) — key = ไอดีในหน้าจอ · id = แถวในฐานข้อมูล · file = รูปที่ยังไม่อัป */
export type DraftPhoto = { key: string; id: string | null; image_key: string | null; src: string; file: Blob | null; w: number; h: number };
/** ชิ้นในหน้าจอ — photo = DraftPhoto.key · code ว่าง = ชิ้นใหม่ (ระบบออกรหัสตอนบันทึก) */
export type DraftChip = PctRect & {
  id: string; photo: string; code: string | null; name: string | null; label: string | null; color_hex: string | null;
  source: "manual" | "ai"; unsure?: boolean; sku_id: string | null; sku: SwatchSpot["sku"];
};

let seq = 0;
export const tempId = (p = "new") => `${p}-${Date.now().toString(36)}-${++seq}`;

/** ขนาดรูป (px) จาก URL */
export function imageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve({ w: im.naturalWidth || 0, h: im.naturalHeight || 0 });
    im.onerror = () => resolve({ w: 0, h: 0 });
    im.src = src;
  });
}

/** ดูดสีจริงของแต่ละกรอบ (ใช้กลางกรอบ 60% กันขอบ/เงา) — รูปเปิดไม่ได้ = null ทั้งชุด */
export async function sampleColors(src: string, rects: PctRect[]): Promise<(string | null)[]> {
  if (!rects.length) return [];
  try {
    const img = await loadImageEl(src);
    const W = Math.min(1200, img.naturalWidth), H = Math.round((W / img.naturalWidth) * img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return rects.map(() => null);
    ctx.drawImage(img, 0, 0, W, H);
    return rects.map((r) => {
      const x = Math.round(((r.x + r.w * 0.2) / 100) * W), y = Math.round(((r.y + r.h * 0.2) / 100) * H);
      const w = Math.max(1, Math.round(((r.w * 0.6) / 100) * W)), h = Math.max(1, Math.round(((r.h * 0.6) / 100) * H));
      try { return averageHex(ctx.getImageData(x, y, Math.min(w, W - x), Math.min(h, H - y)).data); } catch { return null; }
    });
  } catch { return rects.map(() => null); }
}

/** ย่อรูปเป็น JPEG data URL (ด้านยาว ≤ maxSide) — ส่งให้ AI อ่าน */
export async function toAiDataUrl(src: string, maxSide = 1600): Promise<string> {
  const img = await loadImageEl(src);
  const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * k));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** อ่านจากรูป 1 รูป → ชิ้นใหม่ (มีสีจริงจากพิกเซลแล้ว) · throw ข้อความไทยเมื่อพลาด */
export async function readPhotoChips(photo: DraftPhoto): Promise<{ header: string | null; chips: DraftChip[] }> {
  const image = await toAiDataUrl(photo.src);
  const j = await apiFetch("/api/sku-swatches/ai-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image }) }).then((r) => r.json());
  if (j.error) throw new Error(j.error);
  const read = j.data as AiSwatchRead;
  const colors = await sampleColors(photo.src, read.chips);
  return {
    header: read.header,
    chips: read.chips.map((c, i) => ({
      id: tempId(), photo: photo.key, x: c.x, y: c.y, w: c.w, h: c.h, code: null, name: c.name, label: c.label,
      color_hex: colors[i], source: "ai", unsure: c.unsure, sku_id: null, sku: null,
    })),
  };
}

/** อัปรูปที่ยังไม่อัป (ครอปแล้ว/ใหม่) ทีละรูป — คืน image_key ต่อ photo.key · null = ผู้ใช้กดยกเลิก
 *  onProgress = สถานะสำหรับ <UploadProgress> (ของกลาง) — ขั้นย่อรูป/ตรวจรูปซ้ำ/อัปโหลด + "รูป 2/5" */
export async function uploadPendingPhotos(photos: DraftPhoto[], dup: DuplicateCheckOptions, onProgress?: (p: UploadProgressState | null) => void): Promise<Map<string, string> | null> {
  const out = new Map<string, string>();
  const pending = photos.filter((p) => p.file);
  try {
    for (const [i, p] of pending.entries()) {
      const errs: Error[] = [];
      const file = p.file instanceof File ? p.file : new File([p.file as Blob], `swatch-${i + 1}.jpg`, { type: (p.file as Blob).type || "image/jpeg" });
      const up = await uploadImagesWithDupCheck([file], {
        folder: "swatches", max: 2400, ...dup, onError: (_, e) => errs.push(e),
        onProgress: (s) => onProgress?.({ ...s, count: pending.length > 1 ? { current: i + 1, total: pending.length } : s.count }),
      });
      if (errs[0]) throw errs[0];
      const key = up?.keys[0];
      if (!key) return null;
      out.set(p.key, key);
    }
  } finally { onProgress?.(null); }
  return out;
}

/** ชิ้นในหน้าจอ → แถวที่ส่ง API (image_index = ลำดับรูป) */
export function chipsToApi(chips: DraftChip[], photos: DraftPhoto[]) {
  const order = photos.map((p) => p.key);
  return chips.filter((c) => order.includes(c.photo)).map((c) => ({
    id: c.id.startsWith("new-") ? undefined : c.id, image_index: order.indexOf(c.photo),
    x: c.x, y: c.y, w: c.w, h: c.h, label: c.label, name: c.name, color_hex: c.color_hex, source: c.source, sku_id: c.sku_id,
  }));
}
