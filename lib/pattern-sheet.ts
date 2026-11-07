/**
 * ✂ หน้าแพทเทิร์นจากตีราคา (ส่วนคิดเลข — ไม่มีหน้าจอ) · เจ้าของขอ 2026-11-07
 *   "อยากลองทำแบบเป็นหน้าแบบ pattern ที่สร้างจากตรงนี้ได้เอง" (ตารางตีราคาในใบงานออกแบบ)
 *
 *   • patternPieces  — บรรทัดที่มี กว้าง×ยาว → ชิ้นแพทเทิร์น (P1, P2, …) 1 แบบต่อบรรทัด + ตัดกี่ชิ้น
 *   • shelfLayout    — วางชิ้นเรียงเป็นแถวบนแผ่นกว้างที่กำหนด (ซม.) → ตำแหน่งแต่ละชิ้น
 *   • tilePages      — แบ่งแผ่นใหญ่เป็นหน้า A4 (พิมพ์ขนาดจริง 1:1 แล้วต่อกัน)
 *   • buildPatternDxf / buildPatternSvg — ไฟล์ส่งเครื่องตัด (DXF หน่วยมม. ข้อความ ASCII) / ไฟล์ภาพเวกเตอร์
 *
 *   ชิ้นเป็นสี่เหลี่ยมตาม กว้าง×ยาว ในตาราง (ยังไม่มีรูปทรงโค้ง — รอขั้นนำเข้าไฟล์ DXF/SVG)
 * คู่มือ: docs/pattern-sheet.md · หน้าจอ: components/pattern-sheet · หน้าพิมพ์: app/print/design-sheet/[id]/pattern
 */

export type PatternLineInput = {
  key?: string | null;
  item_name?: string | null;
  group_name?: string | null;
  width_cm?: number | null;
  length_cm?: number | null;
  pieces?: number | null;
  face_width_cm?: number | null;
  note?: string | null;
};

export type PatternPiece = {
  id: string;          // P1, P2, …
  name: string;        // ชื่อวัสดุ
  group: string;       // ชนิด (ผ้า / ตัวเสริม …) — ใช้แยกสี
  w: number;           // กว้าง (ซม.)
  h: number;           // ยาว (ซม.)
  count: number;       // ตัดกี่ชิ้นต่อ 1 ใบ
  faceWidth: number | null;   // หน้าผ้า (ซม.) ถ้ามี
  note: string | null;
};

export type PlacedPiece = PatternPiece & { x: number; y: number };
export type PatternLayout = { placed: PlacedPiece[]; width: number; height: number };
export type PatternPage = { row: number; col: number; x: number; y: number; w: number; h: number };

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r1 = (v: number) => Math.round(v * 10) / 10;

/** บรรทัดตีราคา → ชิ้นแพทเทิร์น (เฉพาะบรรทัดที่มีทั้งกว้างและยาว) · ชิ้น = 0/ว่าง ถือเป็น 1 */
export function patternPieces(lines: PatternLineInput[]): PatternPiece[] {
  const out: PatternPiece[] = [];
  for (const l of lines) {
    const w = num(l.width_cm), h = num(l.length_cm);
    if (!(w > 0) || !(h > 0)) continue;
    out.push({
      id: `P${out.length + 1}`,
      name: (l.item_name ?? "").trim() || "ไม่ระบุวัสดุ",
      group: (l.group_name ?? "").trim() || "ไม่ระบุชนิด",
      w: r1(w), h: r1(h),
      count: Math.max(1, Math.round(num(l.pieces)) || 1),
      faceWidth: num(l.face_width_cm) > 0 ? num(l.face_width_cm) : null,
      note: (l.note ?? "").trim() || null,
    });
  }
  return out;
}

/** วางชิ้นเรียงเป็นแถวบนแผ่นกว้าง maxWidth (ซม.) — ชิ้นสูงก่อน · ชิ้นที่กว้างกว่าแผ่นได้แถวของตัวเอง */
export function shelfLayout(pieces: PatternPiece[], maxWidth: number, gap = 2): PatternLayout {
  const sorted = [...pieces].sort((a, b) => b.h - a.h || b.w - a.w);
  const placed: PlacedPiece[] = [];
  let x = 0, y = 0, rowH = 0, width = 0;
  for (const p of sorted) {
    if (x > 0 && x + p.w > maxWidth) { x = 0; y += rowH + gap; rowH = 0; }
    placed.push({ ...p, x, y });
    width = Math.max(width, x + p.w);
    x += p.w + gap;
    rowH = Math.max(rowH, p.h);
  }
  // คืนลำดับเดิม (P1, P2, …) ให้ตารางรายการตรงกับภาพ
  placed.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  return { placed, width: r1(width), height: r1(placed.length ? y + rowH : 0) };
}

/** แบ่งแผ่น (กว้าง×สูง ซม.) เป็นหน้า pageW×pageH (ซม.) · overlap = ส่วนทับกันไว้ต่อกระดาษ */
export function tilePages(width: number, height: number, pageW: number, pageH: number, overlap = 1): PatternPage[] {
  if (!(width > 0) || !(height > 0)) return [];
  const stepX = Math.max(1, pageW - overlap), stepY = Math.max(1, pageH - overlap);
  const cols = Math.max(1, Math.ceil((width - overlap) / stepX));
  const rows = Math.max(1, Math.ceil((height - overlap) / stepY));
  const pages: PatternPage[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pages.push({ row: r + 1, col: c + 1, x: c * stepX, y: r * stepY, w: pageW, h: pageH });
  return pages;
}

/** เฉพาะหน้าที่มีชิ้นอยู่ (หน้าว่างไม่ต้องพิมพ์ — ประหยัดกระดาษ) */
export function pagesWithPieces(pages: PatternPage[], layout: PatternLayout): PatternPage[] {
  return pages.filter((g) => layout.placed.some((p) => p.x < g.x + g.w && g.x < p.x + p.w && p.y < g.y + g.h && g.y < p.y + p.h));
}

/** กระดาษ A4 แนวตั้ง ขอบพิมพ์ 10 มม. → พื้นที่พิมพ์ 19 × 27.7 ซม. */
export const A4_PRINTABLE = { w: 19, h: 27.7 } as const;

/** หน้ากว้างแผ่นที่ใช้วาง (ซม.) — ให้พอดีจำนวนหน้า A4 เต็ม ๆ และไม่แคบกว่าชิ้นที่กว้างที่สุด */
export function patternSheetWidth(pieces: PatternPiece[], pageW = A4_PRINTABLE.w, overlap = 1, minCols = 2): number {
  const widest = pieces.reduce((m, p) => Math.max(m, p.w), 0);
  const step = pageW - overlap;
  const cols = Math.max(minCols, Math.ceil((widest + overlap) / step));
  return r1(cols * step + overlap);
}

// ── ไฟล์ส่งออก ──

/** ข้อความในไฟล์ DXF ใช้ตัวอักษรอังกฤษเท่านั้น (โปรแกรมเครื่องตัดหลายตัวอ่านภาษาไทยเพี้ยน) */
export const dxfLabel = (p: PatternPiece) => `${p.id} ${p.w}x${p.h}cm x${p.count}`;

/** DXF (R12) หน่วยมิลลิเมตร — เส้นตัด layer CUT · ป้าย layer LABEL · แกน Y กลับด้าน (DXF นับจากล่างขึ้นบน) */
export function buildPatternDxf(layout: PatternLayout): string {
  const mm = (cm: number) => Math.round(cm * 100) / 10;   // ซม. → มม. (ทศนิยม 1)
  const H = mm(layout.height);
  const out: string[] = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    out.push("0", "LINE", "8", "CUT", "10", String(x1), "20", String(y1), "30", "0", "11", String(x2), "21", String(y2), "31", "0");
  for (const p of layout.placed) {
    const x0 = mm(p.x), x1 = mm(p.x + p.w);
    const yTop = H - mm(p.y), yBot = H - mm(p.y + p.h);
    line(x0, yBot, x1, yBot); line(x1, yBot, x1, yTop); line(x1, yTop, x0, yTop); line(x0, yTop, x0, yBot);
    const textH = Math.max(3, Math.min(8, mm(Math.min(p.w, p.h)) / 8));
    out.push("0", "TEXT", "8", "LABEL", "10", String(Math.round((x0 + 2) * 10) / 10), "20", String(Math.round((yTop - textH - 2) * 10) / 10), "30", "0",
      "40", String(Math.round(textH * 10) / 10), "1", dxfLabel(p));
  }
  out.push("0", "ENDSEC", "0", "EOF");
  return out.join("\n") + "\n";
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c] as string));

/** SVG ขนาดจริง (หน่วยซม.) — เส้นตัด + ป้ายชื่อภาษาไทย · เปิดใน Illustrator / พิมพ์ / ส่งเครื่องตัดได้ */
export function buildPatternSvg(layout: PatternLayout): string {
  const W = Math.max(1, layout.width), H = Math.max(1, layout.height);
  const body = layout.placed.map((p) => {
    const fs = Math.max(0.8, Math.min(2.4, Math.min(p.w, p.h) / 6));
    return `<g><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="none" stroke="#000" stroke-width="0.05"/>`
      + `<text x="${r1(p.x + p.w / 2)}" y="${r1(p.y + p.h / 2)}" font-size="${r1(fs)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${esc(`${p.id} ${p.name}`)}</text>`
      + `<text x="${r1(p.x + p.w / 2)}" y="${r1(p.y + p.h / 2 + fs * 1.3)}" font-size="${r1(fs * 0.8)}" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif">${esc(`${p.w}×${p.h} ซม. · ตัด ×${p.count}`)}</text></g>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}cm" height="${H}cm" viewBox="0 0 ${W} ${H}">${body}</svg>\n`;
}
