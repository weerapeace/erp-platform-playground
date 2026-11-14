/**
 * ตัวช่วยฝั่งหน้าจอของแผงผ้า (Swatch) — ดูดสีจากพิกเซล · คลิกที่สี = ตีกรอบ · ย่อรูปส่ง AI · AI อ่านเลข/ชื่อสีให้กรอบ · อัปรูป
 * สูตรคิดล้วน (รหัส/กรอบ/ครอป/ไล่สี) อยู่ lib/sku-swatch.ts (ใช้ร่วมกับ API + มีเทสต์)
 */
import { apiFetch } from "@/lib/api";
import { loadImageEl } from "@/components/image-crop-picker";
import { uploadImagesWithDupCheck, type DuplicateCheckOptions } from "@/components/duplicate-upload";
import type { UploadProgressState } from "@/components/upload-progress";
import { averageHex, boxBlur3, floodFitRect, type AiChipLabel, type AiSwatchRead, type FloodFit, type LabelPosition, type PctRect, type Pt } from "@/lib/sku-swatch";

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
type Shape = PctRect & { points?: Pt[] | null };
/** วาดเส้นกรอบ (สี่เหลี่ยม หรือรูปทรงดัดมุม) บน canvas — พิกัด px */
function strokeShape(ctx: CanvasRenderingContext2D, r: Shape, W: number, H: number, ox = 0, oy = 0, k = 1) {
  ctx.beginPath();
  const pts: Pt[] = r.points?.length ? r.points : [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]];
  pts.forEach((p, i) => { const x = ((p[0] / 100) * W - ox) * k, y = ((p[1] / 100) * H - oy) * k; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  ctx.closePath(); ctx.stroke();
}
function numberTag(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, fs: number) {
  ctx.font = `bold ${fs}px sans-serif`; ctx.textBaseline = "top";
  const tw = ctx.measureText(t).width + fs * 0.4;
  ctx.fillStyle = "#c2185b"; ctx.fillRect(x, y, tw, fs * 1.2);
  ctx.fillStyle = "#ffffff"; ctx.fillText(t, x + fs * 0.2, y + fs * 0.1);
}
/** วาดกรอบ + เลข 1..n (ตามลำดับที่ส่งมา) ลงบนรูป → JPEG data URL ส่งให้ AI */
export async function drawNumberedImage(src: string, rects: Shape[], maxSide = 1600): Promise<string> {
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
  rects.forEach((r, i) => {
    ctx.strokeStyle = "#00e676"; strokeShape(ctx, r, W, H);
    numberTag(ctx, String(i + 1), (r.x / 100) * W, (r.y / 100) * H, fs);
  });
  return canvas.toDataURL("image/jpeg", 0.85);
}
/** ภาพซูมรอบแต่ละกรอบ (กรอบขยายออกรอบด้าน 60% ของด้านยาว) เรียงเป็นตาราง + เลขกรอบ — ให้ AI เห็นเลขตัวเล็กที่พิมพ์อยู่ข้าง/บน/ล่างชิ้น
 *  สูงสุด 48 กรอบ (เกินนี้ส่งแค่รูปเต็ม) · คืน null = ไม่ต้องส่ง */
export async function drawChipTiles(src: string, rects: Shape[], tile = 240): Promise<string | null> {
  if (!rects.length || rects.length > 48) return null;
  const img = await loadImageEl(src);
  const NW = img.naturalWidth, NH = img.naturalHeight;
  const cols = Math.min(6, Math.ceil(Math.sqrt(rects.length * 1.4)));
  const rows = Math.ceil(rects.length / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * tile; canvas.height = rows * tile;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const fs = Math.round(tile * 0.09);
  rects.forEach((r, i) => {
    const bw = (r.w / 100) * NW, bh = (r.h / 100) * NH, m = Math.max(bw, bh) * 0.6;
    let sx = (r.x / 100) * NW - m, sy = (r.y / 100) * NH - m, sw = bw + 2 * m, sh = bh + 2 * m;
    const side = Math.max(sw, sh); sx -= (side - sw) / 2; sy -= (side - sh) / 2; sw = sh = side;   // จัตุรัส ไม่บิดสัดส่วน
    const tx = (i % cols) * tile, ty = Math.floor(i / cols) * tile, k = (tile - 4) / side;
    ctx.save(); ctx.beginPath(); ctx.rect(tx + 2, ty + 2, tile - 4, tile - 4); ctx.clip();
    ctx.fillStyle = "#e5e7eb"; ctx.fillRect(tx, ty, tile, tile);
    ctx.drawImage(img, sx, sy, sw, sh, tx + 2, ty + 2, tile - 4, tile - 4);
    ctx.lineWidth = 2.5; ctx.strokeStyle = "#00e676";
    ctx.translate(tx + 2, ty + 2); strokeShape(ctx, r, NW, NH, sx, sy, k);
    ctx.restore();
    numberTag(ctx, String(i + 1), tx + 2, ty + 2, fs);
  });
  return canvas.toDataURL("image/jpeg", 0.85);
}
/** AI อ่านเลขที่พิมพ์ของแต่ละชิ้น + ชื่อสี ให้ชิ้นบนรูปนี้ (ไม่แตะตำแหน่งกรอบ) → id ชิ้น → ผลอ่าน · pos = เลขอยู่ตรงไหนของชิ้น */
export async function readPhotoLabels(photo: DraftPhoto, chips: DraftChip[], pos: LabelPosition = "auto"): Promise<Map<string, AiChipLabel>> {
  const ordered = chips.filter((c) => c.photo === photo.key);   // ลำดับเดียวกับรายการ (เลข 1..n)
  if (!ordered.length) return new Map();
  const tiles = await drawChipTiles(photo.src, ordered).catch(() => null);
  const image = await drawNumberedImage(photo.src, ordered, tiles ? 1400 : 1600);
  const j = await apiFetch("/api/sku-swatches/ai-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "label", count: ordered.length, image, tiles, pos }) }).then((r) => r.json());
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
  /** กรอบดัดมุม (null/ไม่มี = สี่เหลี่ยมตรง) */
  points?: Pt[] | null;
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
    x: c.x, y: c.y, w: c.w, h: c.h, points: c.points ?? null, label: c.label, name: c.name, color_hex: c.color_hex, source: c.source, sku_id: c.sku_id,
  }));
}
