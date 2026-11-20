/**
 * 📑 รวม PDF — กฎล้วน (ของกลาง · ไม่มี "use client" เทสต์ import ได้)
 *
 * แนวคิด: งานรวมไฟล์ = "รายการหน้า" เรียงต่อกันแถวเดียว (MergePage[]) แต่ละหน้าจำว่ามาจากไฟล์ไหน หน้าที่เท่าไร หมุนกี่องศา
 *   - โหมด "ทีละไฟล์" = จับหน้าที่ติดกันจากไฟล์เดียวกันเป็นการ์ด 1 ใบ (groupRuns) · ลากการ์ด = ย้ายทั้งก้อน (moveRun)
 *   - โหมด "ทีละหน้า" = ลาก/ลบ/หมุนหน้าเดี่ยวได้ทุกหน้า (moveItem ของ components/sortable-list)
 *   - ถ้าแยกหน้าของไฟล์เดียวไปไว้คนละที่ โหมดทีละไฟล์จะโชว์เป็นหลายการ์ด (บอก "หน้า 1–2", "หน้า 3")
 * ตัวรวมจริง (โหลดไลบรารีจาก public/vendor) อยู่ lib/pdf-merge-engine · หน้าจอ components/pdf-merge · คู่มือ docs/pdf-merge.md
 */

export type Rotation = 0 | 90 | 180 | 270;
export type MergeSourceKind = "pdf" | "image";

/** ไฟล์ต้นทาง 1 ไฟล์ (ตัวไฟล์จริงเก็บแยก — ตรงนี้แค่ข้อมูล) */
export type MergeFileMeta = {
  id: string;
  name: string;
  kind: MergeSourceKind;
  /** ชนิดไฟล์ (mime) เช่น application/pdf, image/jpeg */
  type: string;
  size: number;
  pageCount: number;
};

/** หน้า 1 หน้าในผลลัพธ์ */
export type MergePage = {
  id: string;
  fileId: string;
  /** หน้าที่เท่าไรในไฟล์ต้นทาง (เริ่ม 0) */
  index: number;
  /** หมุนเพิ่มจากของเดิม (องศา ตามเข็มนาฬิกา) */
  rotation: Rotation;
};

/** ก้อนหน้าที่ติดกันจากไฟล์เดียวกัน = การ์ด 1 ใบในโหมดทีละไฟล์ */
export type PageRun = {
  key: string;
  fileId: string;
  /** ตำแหน่งในรายการหน้า [start, end) */
  start: number;
  end: number;
};

const PDF_EXT = /\.pdf$/i;
const IMG_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i;

/** ไฟล์นี้รวมได้ไหม · ได้ = pdf / image · ไม่ได้ = null (เช็กทั้งชนิดไฟล์และนามสกุล เพราะบางเครื่องไม่บอกชนิด) */
export function sourceKindOf(name: string, type: string): MergeSourceKind | null {
  const t = (type || "").toLowerCase();
  if (t === "application/pdf" || PDF_EXT.test(name)) return "pdf";
  if (t.startsWith("image/") || IMG_EXT.test(name)) return "image";
  return null;
}

/** หน้าทั้งหมดของไฟล์ (ตอนเพิ่มไฟล์เข้ามา) */
export function pagesForFile(fileId: string, pageCount: number): MergePage[] {
  return Array.from({ length: Math.max(0, pageCount) }, (_, i) => ({ id: `${fileId}:${i}`, fileId, index: i, rotation: 0 as Rotation }));
}

/** หมุนต่อ (ค่าเริ่ม +90 ตามเข็ม) */
export function rotateBy(r: number, delta = 90): Rotation {
  return ((((r + delta) % 360) + 360) % 360) as Rotation;
}

/** มุมสุดท้ายที่เขียนลง PDF = มุมเดิมในไฟล์ + ที่ผู้ใช้หมุนเพิ่ม (ปัดเป็นทีละ 90) */
export function finalRotation(original: number, added: number): Rotation {
  return rotateBy(Math.round((original || 0) / 90) * 90, added);
}

/** จับหน้าที่ติดกันจากไฟล์เดียวกันเป็นก้อน */
export function groupRuns(pages: MergePage[]): PageRun[] {
  const runs: PageRun[] = [];
  pages.forEach((p, i) => {
    const last = runs[runs.length - 1];
    if (last && last.fileId === p.fileId) last.end = i + 1;
    else runs.push({ key: p.id, fileId: p.fileId, start: i, end: i + 1 });
  });
  return runs;
}

/** ย้ายก้อนที่ from ไปอยู่ตำแหน่งก้อนที่ to (แบบ "ย้ายไปแทรก" ไม่ใช่สลับคู่) */
export function moveRun(pages: MergePage[], from: number, to: number): MergePage[] {
  const runs = groupRuns(pages);
  if (from === to || from < 0 || to < 0 || from >= runs.length || to >= runs.length) return pages;
  const blocks = runs.map((r) => pages.slice(r.start, r.end));
  const [b] = blocks.splice(from, 1);
  blocks.splice(to, 0, b);
  return blocks.flat();
}

/** เอาก้อนที่ i ออก */
export function removeRun(pages: MergePage[], i: number): MergePage[] {
  const r = groupRuns(pages)[i];
  return r ? [...pages.slice(0, r.start), ...pages.slice(r.end)] : pages;
}

/** หมุนทุกหน้าในก้อนที่ i */
export function rotateRun(pages: MergePage[], i: number, delta = 90): MergePage[] {
  const r = groupRuns(pages)[i];
  if (!r) return pages;
  return pages.map((p, k) => (k >= r.start && k < r.end ? { ...p, rotation: rotateBy(p.rotation, delta) } : p));
}

/** ป้ายช่วงหน้าของก้อน เช่น "ทั้งไฟล์ · 5 หน้า" / "หน้า 2–4 จาก 5" / "หน้า 3 จาก 5" (นับหน้าตามไฟล์ต้นทาง) */
export function runPageLabel(pages: MergePage[], run: PageRun, total: number): string {
  const idx = pages.slice(run.start, run.end).map((p) => p.index + 1);
  const n = idx.length;
  const contiguous = idx.every((v, k) => k === 0 || v === idx[k - 1] + 1);
  if (n === total && contiguous && idx[0] === 1) return total === 1 ? "1 หน้า" : `ทั้งไฟล์ · ${total} หน้า`;
  if (n === 1) return `หน้า ${idx[0]} จาก ${total}`;
  if (contiguous) return `หน้า ${idx[0]}–${idx[n - 1]} จาก ${total}`;
  return `${n} หน้า จาก ${total}`;
}

/** ไฟล์ที่ยังมีหน้าอยู่ในรายการ (ไว้เก็บ/ล้างไฟล์ที่ไม่ใช้แล้ว) */
export function usedFileIds(pages: MergePage[]): Set<string> {
  return new Set(pages.map((p) => p.fileId));
}

/** ชื่อไฟล์ผลลัพธ์: ตัดอักขระที่ใช้ตั้งชื่อไฟล์ไม่ได้ · ว่าง = fallback · ต่อ .pdf ให้เสมอ */
export function mergedFileName(raw: string, fallback = "รวมเอกสาร"): string {
  const clean = (raw || "")
    .replace(/\.pdf$/i, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\-\s]+|[.\-\s]+$/g, "")
    .slice(0, 120);
  return `${clean || fallback}.pdf`;
}

/** ชื่อเริ่มต้น "รวมเอกสาร-2026-11-20" (ตามวันที่ในเครื่อง) */
export function defaultMergeName(now = new Date(), prefix = "รวมเอกสาร"): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** A4 (หน่วย point) */
export const A4 = { w: 595.28, h: 841.89 };

/**
 * วางรูปบนหน้า A4: หันกระดาษตามรูป (รูปแนวนอน = กระดาษแนวนอน) แล้วย่อให้พอดีในขอบ margin โดยไม่ขยายเกินขนาดจริงจนแตก
 * คืน ขนาดหน้า + ตำแหน่ง/ขนาดรูป (หน่วย point · มุมซ้ายล่างตามแบบ PDF)
 */
export function fitImageOnA4(imgW: number, imgH: number, margin = 18) {
  const landscape = imgW > imgH;
  const pageW = landscape ? A4.h : A4.w;
  const pageH = landscape ? A4.w : A4.h;
  const boxW = pageW - margin * 2;
  const boxH = pageH - margin * 2;
  const s = Math.min(boxW / Math.max(1, imgW), boxH / Math.max(1, imgH));
  const w = imgW * s;
  const h = imgH * s;
  return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

/** สรุปสั้น ๆ ใต้รายการ */
export function mergeSummary(pages: MergePage[]): { files: number; pages: number } {
  return { files: usedFileIds(pages).size, pages: pages.length };
}
