/**
 * ImageMarkup — ชนิดข้อมูล + ตัวทำความสะอาด + สูตรย้าย/ขยาย "สิ่งที่วาดบนรูป" (pure · ใช้ทั้ง API และหน้าจอ · ห้าม "use client")
 *
 * พิกัดทุกตัวเป็น % ของรูป (0-100) เหมือน ImageRegions → ตรงตำแหน่งทุกขนาดจอ / ซูม / ตอนพิมพ์
 * ตัววาดบนจอ = components/image-markup · doc docs/image-markup.md
 * v2 (2026-11-06 เจ้าของขอ "ปรับได้เหมือนกระดาน"): ลูกศร · ปากกาเน้น · ความหนาเส้น · เส้นประ · พื้นจาง · พื้นหลังข้อความ · ขยาย/ย่อด้วยจุดมุม
 */

export type MarkupTool = "select" | "rect" | "circle" | "arrow" | "text" | "draw" | "hl" | "pin";

/** หน้าตาเส้น (ของที่วาดใหม่ใช้ค่านี้ · ของที่เลือกอยู่ก็ปรับด้วยค่านี้) */
export type MarkupStyle = { color: string; sw: number; dash: boolean; fill: boolean };

export type MarkupShape =
  | { id: string; t: "rect" | "circle"; x: number; y: number; w: number; h: number; color: string; sw?: number; dash?: boolean; fill?: boolean }
  | { id: string; t: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; sw?: number; dash?: boolean }
  | { id: string; t: "text"; x: number; y: number; text: string; size: number; color: string; bg?: boolean }
  | { id: string; t: "draw"; pts: [number, number][]; color: string; sw?: number; dash?: boolean; hl?: boolean };

/** ป้ายชื่อข้างหมุด (เช่น ส่วนประกอบ + วัตถุดิบ + รูปเล็ก) */
export type MarkupPinLabel = { title: string; sub?: string | null; imageUrl?: string | null };
/** หมุดเลขบนรูป (ข้อมูลที่ผูกกับหมุด เช่น SKU อยู่ที่หน้าเจ้าของ — ตัววาดรู้แค่ตำแหน่ง+ป้าย) · ldx/ldy = ป้ายห่างจากหมุด (% ของรูป) */
export type MarkupPin = { id: string; x: number; y: number; label: string; muted?: boolean; tag?: MarkupPinLabel | null; ldx?: number | null; ldy?: number | null };

export type MarkupSelection = { kind: "shape" | "pin"; id: string };
/** จุดดึง: มุมกรอบ (nw/ne/sw/se) · ปลายลูกศร (p1/p2) · มุมข้อความ (se = ปรับขนาดตัวอักษร) */
export type MarkupHandle = "nw" | "ne" | "sw" | "se" | "p1" | "p2";

export const MARKUP_COLORS = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#0f172a", "#ffffff"] as const;
export const MARKUP_WIDTHS = [{ v: 1.5, label: "บาง" }, { v: 2.5, label: "กลาง" }, { v: 4, label: "หนา" }] as const;
export const MARKUP_LIMITS = { shapes: 300, points: 1500, text: 200 } as const;
export const MARKUP_TEXT_SIZE = 3;      // ขนาดตัวอักษร = % ของความกว้างรูป
export const MARKUP_HL_WIDTH = 14;      // ปากกาเน้น (px บนจอ)
export const MARKUP_PIN_LABEL_OFFSET = { ldx: 3, ldy: -9 };   // ป้ายหมุดตั้งต้น: ขวาบนของหมุด
export const DEFAULT_MARKUP_STYLE: MarkupStyle = { color: MARKUP_COLORS[0], sw: 2.5, dash: false, fill: false };

export const newMarkupId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const r2 = (n: number) => Math.round(n * 100) / 100;
const cl = (n: number, lo = 0, hi = 100) => r2(Math.min(hi, Math.max(lo, n)));
const pct = (v: unknown, lo = 0, hi = 100): number | null => {
  const n = Number(v);
  return v == null || v === "" || !Number.isFinite(n) ? null : cl(n, lo, hi);
};
const okColor = (c: unknown): string => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : MARKUP_COLORS[0]);
const okId = (v: unknown): string => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : newMarkupId());
const sw = (v: unknown): number | undefined => { const n = pct(v, 0.5, 12); return n == null ? undefined : n; };
const flag = (v: unknown): true | undefined => (v === true ? true : undefined);

/** ทำความสะอาดรายการสิ่งที่วาด — ตัดของผิดรูป/เกินขนาด ทิ้งเงียบ ๆ (ข้อมูลจาก client ไว้ใจไม่ได้) */
export function cleanMarkupShapes(raw: unknown): MarkupShape[] {
  const out: MarkupShape[] = [];
  for (const s of (Array.isArray(raw) ? raw : []).slice(0, MARKUP_LIMITS.shapes)) {
    const o = (s ?? {}) as Record<string, unknown>;
    const id = okId(o.id), color = okColor(o.color);
    if (o.t === "rect" || o.t === "circle") {
      const x = pct(o.x), y = pct(o.y), w = pct(o.w), h = pct(o.h);
      if (x == null || y == null || !w || !h) continue;
      out.push({ id, t: o.t, x, y, w, h, color, sw: sw(o.sw), dash: flag(o.dash), fill: flag(o.fill) });
    } else if (o.t === "arrow") {
      const x1 = pct(o.x1), y1 = pct(o.y1), x2 = pct(o.x2), y2 = pct(o.y2);
      if (x1 == null || y1 == null || x2 == null || y2 == null || (x1 === x2 && y1 === y2)) continue;
      out.push({ id, t: "arrow", x1, y1, x2, y2, color, sw: sw(o.sw), dash: flag(o.dash) });
    } else if (o.t === "text") {
      const x = pct(o.x), y = pct(o.y);
      const text = String(o.text ?? "").trim().slice(0, MARKUP_LIMITS.text);
      if (x == null || y == null || !text) continue;
      out.push({ id, t: "text", x, y, text, size: pct(o.size, 1, 15) ?? MARKUP_TEXT_SIZE, color, bg: flag(o.bg) });
    } else if (o.t === "draw") {
      const pts: [number, number][] = [];
      for (const p of (Array.isArray(o.pts) ? o.pts : []).slice(0, MARKUP_LIMITS.points)) {
        const px = Array.isArray(p) ? pct(p[0]) : null, py = Array.isArray(p) ? pct(p[1]) : null;
        if (px != null && py != null) pts.push([px, py]);
      }
      if (pts.length >= 2) out.push({ id, t: "draw", pts, color, sw: sw(o.sw), dash: flag(o.dash), hl: flag(o.hl) });
    }
  }
  return out;
}

/** เลื่อนสิ่งที่วาดไป dx/dy (%) — ไม่ให้หลุดขอบรูป */
export function moveMarkupShape(s: MarkupShape, dx: number, dy: number): MarkupShape {
  if (s.t === "draw") return { ...s, pts: s.pts.map(([x, y]) => [cl(x + dx), cl(y + dy)] as [number, number]) };
  if (s.t === "arrow") return { ...s, x1: cl(s.x1 + dx), y1: cl(s.y1 + dy), x2: cl(s.x2 + dx), y2: cl(s.y2 + dy) };
  if (s.t === "text") return { ...s, x: cl(s.x + dx), y: cl(s.y + dy) };
  return { ...s, x: r2(Math.min(100 - s.w, Math.max(0, s.x + dx))), y: r2(Math.min(100 - s.h, Math.max(0, s.y + dy))) };
}

/**
 * ลากจุดดึง → ขยาย/ย่อ (dx/dy = % ที่ลากไป)
 * กรอบ/วงกลม: มุมที่ลากขยับ มุมตรงข้ามอยู่กับที่ · ลูกศร: ย้ายปลายนั้น · ข้อความ: textW = ความกว้างข้อความตอนเริ่มลาก (%) → ขนาดตามสัดส่วน
 */
export function resizeMarkupShape(s: MarkupShape, h: MarkupHandle, dx: number, dy: number, textW = 10): MarkupShape {
  if (s.t === "arrow") {
    if (h === "p1") return { ...s, x1: cl(s.x1 + dx), y1: cl(s.y1 + dy) };
    if (h === "p2") return { ...s, x2: cl(s.x2 + dx), y2: cl(s.y2 + dy) };
    return s;
  }
  if (s.t === "text") {
    const k = Math.max(0.25, (textW + dx) / Math.max(1, textW));
    return { ...s, size: cl(s.size * k, 1, 15) };
  }
  if (s.t === "draw") return s;   // เส้นมือ: ย้ายได้อย่างเดียว
  const MIN = 1.2;
  let x1 = s.x, y1 = s.y, x2 = s.x + s.w, y2 = s.y + s.h;
  if (h === "nw" || h === "sw") x1 = cl(Math.min(x2 - MIN, x1 + dx));
  if (h === "ne" || h === "se") x2 = cl(Math.max(x1 + MIN, x2 + dx));
  if (h === "nw" || h === "ne") y1 = cl(Math.min(y2 - MIN, y1 + dy));
  if (h === "sw" || h === "se") y2 = cl(Math.max(y1 + MIN, y2 + dy));
  return { ...s, x: x1, y: y1, w: r2(x2 - x1), h: r2(y2 - y1) };
}

/** กรอบล้อม (%) ไว้วาดเส้นบอกว่ากำลังเลือก */
export function markupShapeBox(s: MarkupShape): { x: number; y: number; w: number; h: number } {
  if (s.t === "draw") {
    const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (s.t === "arrow") return { x: Math.min(s.x1, s.x2), y: Math.min(s.y1, s.y2), w: Math.abs(s.x2 - s.x1), h: Math.abs(s.y2 - s.y1) };
  if (s.t === "text") return { x: s.x, y: s.y, w: 0, h: 0 };
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}

/** ใส่หน้าตาเส้น (สี/หนา/ประ/พื้น) ให้ของที่วาด — ข้อความรับแค่สี · ปากกาเน้นไม่มีพื้น */
export function applyMarkupStyle(s: MarkupShape, st: Partial<MarkupStyle>): MarkupShape {
  if (s.t === "text") return st.color ? { ...s, color: st.color } : s;
  const next = { ...s, ...(st.color ? { color: st.color } : {}), ...(st.sw != null ? { sw: st.sw } : {}), ...(st.dash != null ? { dash: st.dash || undefined } : {}) } as MarkupShape;
  if ((next.t === "rect" || next.t === "circle") && st.fill != null) return { ...next, fill: st.fill || undefined };
  return next;
}

/** หัวลูกศร (พิกัดหน่วยเดียวกับเส้น เช่น px หรือ มม.) — ใช้ทั้งบนจอและใบพิมพ์ */
export function arrowHeadPoints(x1: number, y1: number, x2: number, y2: number, len: number): string {
  const a = Math.atan2(y2 - y1, x2 - x1), sp = Math.PI / 7;
  const p = (ang: number) => `${(x2 - len * Math.cos(a - ang)).toFixed(2)},${(y2 - len * Math.sin(a - ang)).toFixed(2)}`;
  return `${x2.toFixed(2)},${y2.toFixed(2)} ${p(sp)} ${p(-sp)}`;
}
