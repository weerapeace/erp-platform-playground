/**
 * 👜 หูหิ้วม้วน + ห่วงยึด (Bag CAD รอบ J2) — สูตรบริสุทธิ์ ไม่มีหน้าจอ
 *   แบบหู: แบน (แผ่นโค้ง) · ม้วนกลม (ท่อทั้งเส้น) · ม้วนกลาง ปลายแบน (ตั้งต้น — ปลายแบนไว้เย็บติดตัวกระเป๋า)
 *   ไส้เชือก: 0 / 8 / 10 / 12 มม. → โตของหูม้วน · ความยาวเชือกต่อใบ (รายการวัสดุ)
 *   จุดติดหู: เส้นในชื่อ "จุดติดหู" (จากหน้าตรวจหลังนำเข้า รอบ J1) → จับคู่ซ้าย-ขวาแถวเดียวกัน = ปลายหู 2 ข้าง
 *   ชิ้นหู: ประกบ 2 ชิ้นเป็น 1 หู (นอก + ใน) ได้ · ห่วง/แถบ: แถบห่วง D · แถบกระดุมปิด · ห่วงยึดสายสะพาย
 *
 * ใช้ที่: components/pattern-studio/assembly-view (แผงหูหิ้วและห่วง) · components/pattern-3d (รูปหู/ห่วง) · หน้าพิมพ์ (ใบสเปก)
 * เทสต์: lib/__tests__/pattern-handles.test.ts · คู่มือ: docs/pattern-studio.md (รอบ J2)
 */
import { shapeBox, type InnerLine, type Pt, type Shape } from "./pattern-shape";

export type HandleStyle = "flat" | "roll" | "mix";
export const HANDLE_STYLES: { key: HandleStyle; th: string; en: string }[] = [
  { key: "flat", th: "แบน", en: "Flat" }, { key: "roll", th: "ม้วนกลม", en: "Rolled" }, { key: "mix", th: "ม้วนกลาง ปลายแบน", en: "Rolled, flat ends" },
];
export const DEFAULT_HANDLE_STYLE: HandleStyle = "mix";
export const CORD_MM = [0, 8, 10, 12];
export type TabKind = "dring" | "snap" | "strap";
export const TAB_KINDS: { key: TabKind; th: string; en: string }[] = [
  { key: "dring", th: "แถบห่วง D", en: "D-ring tab" }, { key: "snap", th: "แถบกระดุมปิด", en: "Snap tab" }, { key: "strap", th: "ห่วงยึดสายสะพาย", en: "Strap loop" },
];
export const SPOT_NAMES = ["จุดติดหู", "Handle spot"];

/** โตของหูม้วน (ซม.): มีไส้เชือก = เชือก + หนัง 2 ชั้น (≈ 1.5 มม.) · ไม่มี = แผ่นกว้าง w ม้วนเป็นวง (w ÷ π) */
export function rolledDiameter(w: number, cordMm = 0): number {
  const d = cordMm > 0 ? cordMm / 10 + 0.15 : w / Math.PI;
  return Math.round(Math.max(0.3, d) * 100) / 100;
}

/** จุดกึ่งกลางของเส้นในที่ชื่อ "จุดติดหู" — พิกัดเทียบมุมซ้ายบนของกรอบชิ้น (แบบเดียวกับจุดติดหู Attach.a/b) */
export function spotCenters(p: { shape: Shape; inner?: InnerLine[] | null }): Pt[] {
  const b = shapeBox(p.shape);
  return (p.inner ?? []).filter((l) => l.name && SPOT_NAMES.includes(l.name) && l.pts.length >= 2).map((l) => {
    const xs = l.pts.map((q) => q[0]), ys = l.pts.map((q) => q[1]);
    return [Math.round(((Math.min(...xs) + Math.max(...xs)) / 2 - b.x) * 1000) / 1000, Math.round((Math.min(...ys) - b.y) * 1000) / 1000] as Pt;   // บนสุดของกรอบ = ตำแหน่งโคนหู
  });
}

/** จับคู่จุดติดหูเป็นปลายหู 2 ข้าง: แถวเดียวกัน (สูงต่างกันไม่เกิน 3 ซม.) คู่นอกสุดก่อน · เหลือเดี่ยว = ไม่ใช้ */
export function pairSpots(spots: Pt[]): [Pt, Pt][] {
  const rows: Pt[][] = [];
  for (const s of [...spots].sort((a, b) => a[1] - b[1])) {
    const r = rows.find((x) => Math.abs(x[0][1] - s[1]) <= 3);
    if (r) r.push(s); else rows.push([s]);
  }
  const out: [Pt, Pt][] = [];
  for (const r of rows) {
    const s = [...r].sort((a, b) => a[0] - b[0]);
    for (let i = 0, j = s.length - 1; i < j; i++, j--) out.push([s[i], s[j]]);
  }
  return out;
}

/** ชิ้นหูเป็นคู่ (นอก + ใน): เรียงตามความยาว จับคู่ติดกันที่ยาว/กว้างต่างไม่เกิน 3% · เหลือเดี่ยว = หูชั้นเดียว */
export function pairHandlePieces<T extends { pid: string; shape: Shape }>(list: T[]): { main: T; inner?: T }[] {
  const dim = (p: T) => { const b = shapeBox(p.shape); return [Math.max(b.w, b.h), Math.min(b.w, b.h)]; };
  const s = [...list].sort((a, b) => dim(b)[0] - dim(a)[0]), out: { main: T; inner?: T }[] = [];
  for (let i = 0; i < s.length; i++) {
    const a = s[i], b = s[i + 1];
    if (b) { const [la, wa] = dim(a), [lb, wb] = dim(b); if (Math.abs(la - lb) <= la * 0.03 && Math.abs(wa - wb) <= Math.max(0.2, wa * 0.03)) { out.push({ main: a, inner: b }); i++; continue; } }
    out.push({ main: a });
  }
  return out;
}

/** ความยาว/กว้างหูจากชิ้นหู: ยาวโผล่ = ยาวชิ้น − ปลายเย็บติด 2 ข้าง · กว้าง = ด้านสั้นของชิ้น (แบน) */
export function handleDims(shape: Shape, tail = 4): { len: number; w: number } {
  const b = shapeBox(shape), long = Math.max(b.w, b.h), short = Math.min(b.w, b.h);
  return { len: Math.max(8, Math.round((long - 2 * tail) * 10) / 10), w: Math.max(0.5, Math.round(short * 10) / 10) };
}

/** ไส้เชือกต่อ 1 ใบ (ซม.) = ผลรวมยาวหูม้วน (ไม่นับปลายแบน) */
export function cordLength(handles: { len: number; style?: HandleStyle; cord?: number }[]): number {
  return Math.round(handles.reduce((s, h) => s + ((h.style ?? "flat") !== "flat" && (h.cord ?? 0) > 0 ? h.len : 0), 0) * 10) / 10;
}

/** รูปตัดหูม้วน (ใบสเปก): โต · ผิวหนังรอบ · แนวเดินด้าย (ห่างขอบม้วน 2 มม.) · ปลายแบนยาว */
export function rollSection(w: number, cordMm: number, tail: number): { dia: number; cord: number; wrap: number; seamOffset: number; tail: number } {
  const dia = rolledDiameter(w, cordMm);
  return { dia, cord: cordMm / 10, wrap: Math.round(Math.PI * dia * 10) / 10, seamOffset: 0.2, tail };
}

/** ความยาวหูโผล่ (ซม.) ที่ให้หูสูงพ้นโคน h เมื่อโคนห่างกัน gap: สูงกว่าครึ่งวง = ตรง 2 ข้าง + ครึ่งวงกลม · ต่ำกว่า = ครึ่งวงรี */
export function lenForHeight(gap: number, h: number): number {
  const r = Math.max(0.5, gap / 2), hh = Math.max(1, h);
  const len = hh >= r ? 2 * (hh - r) + Math.PI * r : Math.PI * Math.sqrt((r * r + hh * hh) / 2);
  return Math.round(len * 10) / 10;
}
/** กลับกัน: หูยาว len โคนห่าง gap → สูงพ้นโคนเท่าไร */
export function heightForLen(gap: number, len: number): number {
  const r = Math.max(0.5, gap / 2);
  if (len >= Math.PI * r) return Math.round(((len - Math.PI * r) / 2 + r) * 10) / 10;
  const k = len / Math.PI;
  return Math.round(Math.sqrt(Math.max(1, 2 * k * k - r * r)) * 10) / 10;
}
