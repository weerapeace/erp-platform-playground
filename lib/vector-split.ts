// ============================================================
// vector-split — ตรรกะล้วนของตัวแยกชิ้นจากไฟล์ออกแบบ (components/vector-splitter)
//
// งาน: ไฟล์ .ai/.pdf/.svg ที่มีหลายชิ้นในแผ่นเดียว (เช่น หัวใจ 16 แบบ) → หา "ชิ้น" อัตโนมัติจากพื้นที่ว่างระหว่างชิ้น
//   → ผู้ใช้ติ๊ก/รวม/ลากกรอบเอง → แปลงแต่ละชิ้นเป็น PNG พื้นใส (วาดจากเส้นเวกเตอร์ใหม่ตามขนาดที่เลือก จึงคมทุกขนาด)
// หน่วยกรอบ (Box) = หน่วยของไฟล์ (PDF = point · SVG = px ของรูป) — หน้าจอคูณสเกลเอง
// ไม่แตะ DOM / canvas ที่นี่ (เทสต์ได้) · เทสต์: lib/__tests__/vector-split.test.ts
// ============================================================

export type Box = { x: number; y: number; w: number; h: number };

/** นามสกุล/ชนิดที่ตัวแยกชิ้นรับ (.eps รับเข้ามาเพื่อบอกวิธีแปลง) */
export const VECTOR_ACCEPT = ".ai,.pdf,.svg,.eps,application/pdf,application/postscript,application/illustrator,image/svg+xml";
export function isVectorFile(f: { name: string; type?: string }): boolean {
  return /\.(ai|pdf|svg|eps)$/i.test(f.name) || f.type === "application/pdf" || f.type === "image/svg+xml" || f.type === "application/postscript";
}
export const isSvgName = (name: string, type?: string) => /\.svg$/i.test(name) || type === "image/svg+xml";

/**
 * ไบต์แรกของไฟล์ → ข้อความบอกวิธีแก้ (ภาษาคน) หรือ null = เปิดได้
 * .ai แบบ PDF Compatible / .pdf = ข้างในเป็น PDF (pdf.js อ่านได้) · .eps / .ai รุ่นเก่า = PostScript อ่านในเว็บไม่ได้
 */
export function vectorFileProblem(head: Uint8Array, name: string, type?: string): string | null {
  if (isSvgName(name, type)) return null;
  const s = new TextDecoder("latin1").decode(head.slice(0, 2048));
  if (s.includes("%PDF-")) return null;
  const eps = /\.eps$/i.test(name) || (head[0] === 0xc5 && head[1] === 0xd0 && head[2] === 0xd3 && head[3] === 0xc6);
  if (eps || s.startsWith("%!PS"))
    return eps
      ? "ไฟล์ .eps เปิดในเว็บตรง ๆ ไม่ได้ — เปิดใน Illustrator แล้ว Save As เป็น .ai (ติ๊ก \"Create PDF Compatible File\") หรือ .pdf แล้วโยนไฟล์ใหม่"
      : "ไฟล์ .ai นี้บันทึกแบบไม่ติ๊ก \"Create PDF Compatible File\" — เปิดใน Illustrator แล้ว Save As ใหม่ (ติ๊กช่องนี้) แล้วโยนอีกครั้ง";
  return "เปิดได้เฉพาะไฟล์ .ai (แบบ PDF Compatible) · .pdf · .svg";
}

/** ใกล้ขาวพอจะนับเป็น "พื้นขาว" */
const isWhite = (r: number, g: number, b: number, threshold: number) => r >= threshold && g >= threshold && b >= threshold;

/**
 * พิกเซลพื้นขาวที่ต่อกับขอบภาพ (flood fill จากขอบ) → คืน mask 1 = พื้นหลังที่ควรลบ
 * พื้นขาว "ข้างใน" ชิ้น (เช่น ไฮไลต์ขาวกลางหัวใจ) ไม่โดน เพราะไม่ต่อกับขอบ
 */
export function edgeWhiteMask(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, threshold = 242): Uint8Array {
  const bg = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (i: number) => {
    if (bg[i]) return;
    const p = i * 4;
    if (rgba[p + 3] < 16 || isWhite(rgba[p], rgba[p + 1], rgba[p + 2], threshold)) { bg[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w, y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  return bg;
}

/** ลบพื้นขาวที่ต่อกับขอบ (ทำให้โปร่งใส) — ใช้กับ PNG ที่ตัดออกมาแล้ว · แก้ rgba ในที่ */
export function clearEdgeWhite(rgba: Uint8ClampedArray, w: number, h: number, threshold = 242): void {
  const bg = edgeWhiteMask(rgba, w, h, threshold);
  for (let i = 0; i < bg.length; i++) if (bg[i]) rgba[i * 4 + 3] = 0;
}

/** ภาพ → mask ของ "มีของ" (1) · removeWhite = ไม่นับพื้นขาวที่ต่อกับขอบ (ไฟล์ที่มีแผ่นขาวรองพื้น) */
export function inkMask(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, removeWhite: boolean): Uint8Array {
  const m = new Uint8Array(w * h);
  const bg = removeWhite ? edgeWhiteMask(rgba, w, h) : null;
  for (let i = 0; i < m.length; i++) m[i] = rgba[i * 4 + 3] >= 16 && !(bg && bg[i]) ? 1 : 0;
  return m;
}

const overlaps = (a: Box, b: Box, pad = 0) =>
  a.x - pad < b.x + b.w && b.x - pad < a.x + a.w && a.y - pad < b.y + b.h && b.y - pad < a.y + a.h;

/** รวมกรอบหลายอันเป็นกรอบเดียว (ครอบทั้งหมด) */
export function unionBox(boxes: readonly Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x)), y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w)), y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/** กรอบที่ทับกัน → รวมจนไม่มีคู่ไหนทับ */
export function mergeOverlapping(boxes: readonly Box[]): Box[] {
  let out = boxes.map((b) => ({ ...b }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++)
      for (let j = i + 1; j < out.length; j++)
        if (overlaps(out[i], out[j])) {
          out[i] = unionBox([out[i], out[j]]);
          out.splice(j, 1);
          changed = true;
          break outer;
        }
  }
  return out;
}

/** เรียงแบบอ่านหนังสือ: แถวบน→ล่าง (กรอบที่จุดกลางสูงใกล้กันถือเป็นแถวเดียว) แล้วซ้าย→ขวา */
export function readingOrder(boxes: readonly Box[]): Box[] {
  if (!boxes.length) return [];
  const hs = boxes.map((b) => b.h).sort((a, b) => a - b);
  const tol = hs[Math.floor(hs.length / 2)] / 2;
  const sorted = [...boxes].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: Box[][] = [];
  for (const b of sorted) {
    const cy = b.y + b.h / 2;
    const row = rows.find((r) => Math.abs(r[0].y + r[0].h / 2 - cy) <= tol);
    if (row) row.push(b); else rows.push([b]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

/**
 * mask → กรอบชิ้น (หน่วยพิกเซลของ mask)
 * gap = ช่องว่างกี่พิกเซลถึงนับเป็นคนละชิ้น (ชิ้นที่ห่างกันน้อยกว่านี้ = ชิ้นเดียว เช่น หัวใจ + ขีดรอบ ๆ)
 * minArea = ตัดชิ้นจิ๋วทิ้ง (สัดส่วนของพื้นที่กรอบใหญ่สุด)
 */
export function detectPieces(mask: Uint8Array, w: number, h: number, opts: { gap?: number; minFrac?: number } = {}): Box[] {
  const cell = Math.max(1, Math.round(opts.gap ?? Math.max(w, h) * 0.012));
  const cw = Math.ceil(w / cell), ch = Math.ceil(h / cell);
  const occ = new Uint8Array(cw * ch);
  for (let y = 0; y < h; y++) {
    const row = y * w, cy = Math.floor(y / cell) * cw;
    for (let x = 0; x < w; x++) if (mask[row + x]) occ[cy + Math.floor(x / cell)] = 1;
  }
  // กลุ่มช่องที่ติดกัน (8 ทิศ) = ชิ้นเดียว
  const label = new Int32Array(cw * ch).fill(-1);
  const comps: Box[] = [];
  for (let s = 0; s < occ.length; s++) {
    if (!occ[s] || label[s] >= 0) continue;
    const id = comps.length;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const stack = [s];
    label[s] = id;
    while (stack.length) {
      const c = stack.pop()!;
      const cx = c % cw, cy = (c - cx) / cw;
      if (cx < x1) x1 = cx; if (cx > x2) x2 = cx; if (cy < y1) y1 = cy; if (cy > y2) y2 = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const n = ny * cw + nx;
        if (occ[n] && label[n] < 0) { label[n] = id; stack.push(n); }
      }
    }
    comps.push({ x: x1, y: y1, w: x2, h: y2 });   // ชั่วคราว: ขอบเขตช่อง
  }
  if (!comps.length) return [];
  // กรอบพิกเซลจริงของแต่ละกลุ่ม (ไม่ใช่ขอบช่อง → ชิดชิ้นจริง)
  const bx1 = new Float64Array(comps.length).fill(Infinity), by1 = new Float64Array(comps.length).fill(Infinity);
  const bx2 = new Float64Array(comps.length).fill(-Infinity), by2 = new Float64Array(comps.length).fill(-Infinity);
  for (let y = 0; y < h; y++) {
    const row = y * w, cy = Math.floor(y / cell) * cw;
    for (let x = 0; x < w; x++) {
      if (!mask[row + x]) continue;
      const id = label[cy + Math.floor(x / cell)];
      if (x < bx1[id]) bx1[id] = x; if (x > bx2[id]) bx2[id] = x;
      if (y < by1[id]) by1[id] = y; if (y > by2[id]) by2[id] = y;
    }
  }
  let boxes: Box[] = comps.map((_, i) => ({ x: bx1[i], y: by1[i], w: bx2[i] - bx1[i] + 1, h: by2[i] - by1[i] + 1 }));
  boxes = mergeOverlapping(boxes);
  const biggest = Math.max(...boxes.map((b) => b.w * b.h));
  const minArea = biggest * (opts.minFrac ?? 0.002);
  return readingOrder(boxes.filter((b) => b.w * b.h >= minArea && b.w >= 2 && b.h >= 2));
}

/** ชื่อชิ้น: prefix + เลขเติมศูนย์ (heart_01 … heart_16 · เกิน 99 ชิ้น = 3 หลัก) */
export function pieceNames(prefix: string, n: number, start = 1): string[] {
  const p = prefix.trim() || "piece_";
  const digits = Math.max(2, String(start + n - 1).length);
  return Array.from({ length: n }, (_, i) => `${p}${String(start + i).padStart(digits, "0")}`);
}

/** ชื่อไฟล์ปลอดภัย (ตัดอักขระที่ใช้ในชื่อไฟล์ไม่ได้) */
export const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "piece";

export type SizeMode = 512 | 1024 | 2048 | "actual";
/** สเกลจากหน่วยไฟล์ → พิกเซลของ PNG · actual = 300 DPI (PDF 1 point = 1/72 นิ้ว) · จำกัดด้านยาวไม่เกิน maxPx */
export function exportScale(box: Box, mode: SizeMode, unitsPerInch = 72, maxPx = 4096): number {
  const long = Math.max(box.w, box.h) || 1;
  const s = mode === "actual" ? 300 / unitsPerInch : mode / long;
  return Math.min(s, maxPx / long);
}

/** กรอบจากการลากเมาส์ 2 จุด (ลากถอยหลังได้) */
export function boxFromDrag(x1: number, y1: number, x2: number, y2: number): Box {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}
