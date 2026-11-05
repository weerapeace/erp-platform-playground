/**
 * ImageMarkup — ชนิดข้อมูล + ตัวทำความสะอาด "สิ่งที่วาดบนรูป" (pure · ใช้ทั้ง API และหน้าจอ · ห้าม "use client")
 *
 * พิกัดทุกตัวเป็น % ของรูป (0-100) เหมือน ImageRegions → ตรงตำแหน่งทุกขนาดจอ / ตอนพิมพ์
 * ตัววาดบนจอ = components/image-markup · doc docs/image-markup.md
 */

export type MarkupTool = "select" | "rect" | "circle" | "text" | "draw" | "pin";

export type MarkupShape =
  | { id: string; t: "rect" | "circle"; x: number; y: number; w: number; h: number; color: string }
  | { id: string; t: "text"; x: number; y: number; text: string; size: number; color: string }
  | { id: string; t: "draw"; pts: [number, number][]; color: string };

/** หมุดเลขบนรูป (ข้อมูลที่ผูกกับหมุด เช่น SKU อยู่ที่หน้าเจ้าของ — ตัววาดรู้แค่ตำแหน่ง+ป้าย) */
export type MarkupPin = { id: string; x: number; y: number; label: string; muted?: boolean };

export type MarkupSelection = { kind: "shape" | "pin"; id: string };

export const MARKUP_COLORS = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#0f172a", "#ffffff"] as const;
export const MARKUP_LIMITS = { shapes: 300, points: 1500, text: 200 } as const;
export const MARKUP_TEXT_SIZE = 3;   // ขนาดตัวอักษร = % ของความกว้างรูป

export const newMarkupId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (v: unknown, lo = 0, hi = 100): number | null => {
  const n = Number(v);
  return v == null || v === "" || !Number.isFinite(n) ? null : r2(Math.min(hi, Math.max(lo, n)));
};
const okColor = (c: unknown): string => (typeof c === "string" && /^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : MARKUP_COLORS[0]);
const okId = (v: unknown): string => (typeof v === "string" && v.length > 0 && v.length <= 64 ? v : newMarkupId());

/** ทำความสะอาดรายการสิ่งที่วาด — ตัดของผิดรูป/เกินขนาด ทิ้งเงียบ ๆ (ข้อมูลจาก client ไว้ใจไม่ได้) */
export function cleanMarkupShapes(raw: unknown): MarkupShape[] {
  const out: MarkupShape[] = [];
  for (const s of (Array.isArray(raw) ? raw : []).slice(0, MARKUP_LIMITS.shapes)) {
    const o = (s ?? {}) as Record<string, unknown>;
    const id = okId(o.id), color = okColor(o.color);
    if (o.t === "rect" || o.t === "circle") {
      const x = pct(o.x), y = pct(o.y), w = pct(o.w), h = pct(o.h);
      if (x == null || y == null || !w || !h) continue;
      out.push({ id, t: o.t, x, y, w, h, color });
    } else if (o.t === "text") {
      const x = pct(o.x), y = pct(o.y);
      const text = String(o.text ?? "").trim().slice(0, MARKUP_LIMITS.text);
      if (x == null || y == null || !text) continue;
      out.push({ id, t: "text", x, y, text, size: pct(o.size, 1, 12) ?? MARKUP_TEXT_SIZE, color });
    } else if (o.t === "draw") {
      const pts: [number, number][] = [];
      for (const p of (Array.isArray(o.pts) ? o.pts : []).slice(0, MARKUP_LIMITS.points)) {
        const px = Array.isArray(p) ? pct(p[0]) : null, py = Array.isArray(p) ? pct(p[1]) : null;
        if (px != null && py != null) pts.push([px, py]);
      }
      if (pts.length >= 2) out.push({ id, t: "draw", pts, color });
    }
  }
  return out;
}

/** เลื่อนสิ่งที่วาดไป dx/dy (%) — ไม่ให้หลุดขอบรูป */
export function moveMarkupShape(s: MarkupShape, dx: number, dy: number): MarkupShape {
  const cl = (v: number) => r2(Math.min(100, Math.max(0, v)));
  if (s.t === "draw") return { ...s, pts: s.pts.map(([x, y]) => [cl(x + dx), cl(y + dy)] as [number, number]) };
  if (s.t === "text") return { ...s, x: cl(s.x + dx), y: cl(s.y + dy) };
  return { ...s, x: r2(Math.min(100 - s.w, Math.max(0, s.x + dx))), y: r2(Math.min(100 - s.h, Math.max(0, s.y + dy))) };
}

/** กรอบล้อม (%) ไว้วาดเส้นบอกว่ากำลังเลือก */
export function markupShapeBox(s: MarkupShape): { x: number; y: number; w: number; h: number } {
  if (s.t === "draw") {
    const xs = s.pts.map((p) => p[0]), ys = s.pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  if (s.t === "text") return { x: s.x, y: s.y, w: 0, h: 0 };
  return { x: s.x, y: s.y, w: s.w, h: s.h };
}
