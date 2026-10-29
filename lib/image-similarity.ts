/**
 * 👀 "ลายนิ้วมือภาพ" — จับรูปที่หน้าตาเหมือน/คล้ายกันแม้เป็นคนละไฟล์ (ย่อ · บันทึกใหม่ · export ใหม่ · ส่งผ่าน LINE)
 * ของกลาง ใช้ที่ components/product-image-router (📂 จัดรูปหลายโฟลเดอร์) + components/website-image-mass-upload (📸 ลงรูปเว็บทีละมาก) — ต่างจากลายนิ้วมือไฟล์ (SHA-256) ที่จับได้เฉพาะไฟล์เดียวกันเป๊ะ
 *
 * 2 ส่วน (ต้องใกล้กันทั้งคู่):
 *   รูปทรง = dHash 64 บิต (ย่อเหลือ 9×8 สีเทา แล้วเทียบความสว่างช่องติดกัน) — ทนการย่อ/บีบอัด
 *   สี     = ค่าเฉลี่ยสี 4×4 ช่อง — กันกรณี "ท่าเดียวกันคนละสี" (น้ำตาล/กรมท่า รูปทรงเหมือนกันเป๊ะ)
 * ผลทดลอง (2026-10-26 · รูปจำลอง 4,000px): รูปเดียวกันย่อ+บันทึกใหม่ = รูปทรงต่าง 0–3 · สี 0 · ถ่ายใหม่ขยับนิด = 6/5
 *   · ท่าเดียวกันคนละสี = 0/10 · คนละรูป = 18/25 · คำนวณ ~60–90 ms ต่อรูปถ่าย 4,000px (ส่วนใหญ่คือถอดรหัสรูป)
 * ⚠️ ใช้ "เตือนให้ดูด้วยตา" เท่านั้น ไม่ข้ามเอง — รูปถ่ายต่อกันหลายช็อต / สีใกล้กันมาก (ดำ-เทาเข้ม) อาจถูกนับว่าคล้าย
 */

export interface VisualPrint {
  /** dHash 64 ตัว ("0"/"1") */
  bits: string;
  /** ค่าเฉลี่ยสี RGB ของ 4×4 ช่อง (48 ค่า) */
  col: number[];
}
export type SimilarLevel = "same" | "near";
export const SIMILAR_LABEL: Record<SimilarLevel, string> = { same: "ภาพเหมือนกัน", near: "คล้ายมาก" };

/** จาก pixel (RGBA) ของภาพย่อ 9×8 + 4×4 → ลายนิ้วมือภาพ (pure) */
export function printFromPixels(d98: ArrayLike<number>, d44: ArrayLike<number>): VisualPrint {
  const lum = (i: number) => d98[i] * 0.3 + d98[i + 1] * 0.59 + d98[i + 2] * 0.11;
  let bits = "";
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = (y * 9 + x) * 4;
      bits += lum(p) > lum(p + 4) ? "1" : "0";
    }
  }
  const col: number[] = [];
  for (let i = 0; i < 64; i += 4) col.push(d44[i], d44[i + 1], d44[i + 2]);
  return { bits, col };
}

export function shapeDistance(a: VisualPrint, b: VisualPrint): number {
  let n = 0;
  for (let i = 0; i < 64; i++) if (a.bits[i] !== b.bits[i]) n++;
  return n;
}
export function colorDistance(a: VisualPrint, b: VisualPrint): number {
  let s = 0;
  for (let i = 0; i < a.col.length; i++) s += Math.abs(a.col[i] - (b.col[i] ?? 0));
  return s / Math.max(1, a.col.length);
}

/** เหมือน/คล้ายไหม — null = ไม่คล้าย (เกณฑ์จากผลทดลองข้างบน · รูปเรียบมาก เช่นพื้นขาวล้วน ต้องใกล้กว่าปกติ) */
export function similarity(a: VisualPrint, b: VisualPrint): SimilarLevel | null {
  const shape = shapeDistance(a, b);
  const color = colorDistance(a, b);
  const flat = (p: VisualPrint) => Math.min([...p.bits].filter((c) => c === "1").length, [...p.bits].filter((c) => c === "0").length) < 6;
  if (flat(a) || flat(b)) return shape <= 1 && color <= 2 ? "same" : null;
  if (shape <= 3 && color <= 3) return "same";
  if (shape <= 7 && color <= 6) return "near";
  return null;
}
export const similarRank = (l: SimilarLevel | null) => (l === "same" ? 2 : l === "near" ? 1 : 0);

/** จากรูปที่ถอดรหัสแล้ว (ImageBitmap / canvas ขนาดไหนก็ได้) — ย่อเป็น 64×64 ก่อน ให้ได้ค่าเท่ากับ visualPrintOf */
export function visualPrintFromSource(src: CanvasImageSource): VisualPrint | null {
  try {
    const canvas = (w: number, h: number) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true });
      if (x) x.imageSmoothingQuality = "high";
      return { c, x };
    };
    const base = canvas(64, 64);
    if (!base.x) return null;
    base.x.drawImage(src, 0, 0, 64, 64);
    const draw = (w: number, h: number) => {
      const { x } = canvas(w, h);
      if (!x) return null;
      x.drawImage(base.c, 0, 0, w, h);
      return x.getImageData(0, 0, w, h).data;
    };
    const d98 = draw(9, 8);
    const d44 = draw(4, 4);
    return d98 && d44 ? printFromPixels(d98, d44) : null;
  } catch {
    return null;
  }
}

/** คำนวณลายนิ้วมือภาพในเบราว์เซอร์ (ไฟล์ หรือรูปย่อที่โหลดมา) — อ่านไม่ได้ = null (ไม่เตือน) */
export async function visualPrintOf(src: Blob): Promise<VisualPrint | null> {
  try {
    const bm = await createImageBitmap(src, { resizeWidth: 64, resizeHeight: 64, resizeQuality: "high" });
    const vp = visualPrintFromSource(bm);
    bm.close();
    return vp;
  } catch {
    return null;
  }
}
