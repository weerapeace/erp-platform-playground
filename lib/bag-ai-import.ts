/**
 * 🤝 ใช้ AI ของผู้ใช้เอง (ChatGPT / Claude / Gemini …) ร่างชิ้นแพทเทิร์นจากรูปกระเป๋า — แบบ "คัดลอกคำสั่ง → วางคำตอบกลับ" (เจ้าของขอ 2026-11-10)
 *   ไม่เรียก AI จากระบบเรา ไม่เสียเงินในระบบ ไม่ส่งรูปออกจากระบบ — ผู้ใช้เอาคำสั่งไปวางใน AI ที่ตัวเองใช้ พร้อมรูปหลายมุม
 *   AI ตอบเป็น JSON รูปแบบ "bagpattern/1" → parseAiPattern ตรวจทุกช่อง แล้วแปลงเป็นชิ้นของตัววาด (+ ตะเข็บตั้งต้น)
 *
 *   AI_PATTERN_PROMPT  — คำสั่งให้คัดลอก (แก้ที่นี่ที่เดียว หน้าจออ่านจากตรงนี้)
 *   parseAiPattern     — ข้อความที่ AI ตอบ (มีข้อความอื่นปน/ครอบด้วย ``` ได้) → ชิ้น + ตะเข็บ หรือข้อความบอกว่าผิดตรงไหน (ภาษาคน)
 *     • ชิ้นที่รูปทรง/ขนาดใช้ไม่ได้ = ข้าม (บอกชื่อ) ไม่เดาให้ · ตะเข็บที่อ้างชิ้น/ขอบไม่ได้ = ข้าม (นับจำนวน)
 *     • ชิ้นวางเรียงเป็นแถวบนกระดาน (at) · เผื่อเย็บ = seam_allowance ค่าเดียวทั้งชิ้น
 *   ข้อจำกัด: AI วัดขนาดจากรูปไม่ได้จริง — ผลเป็นร่างแรกให้ช่างตรวจ · โค้งซับซ้อนมาเป็นรูปหลายเหลี่ยม
 *
 * ใช้ที่: components/pattern-studio/photo-modal · เทสต์ lib/__tests__/bag-ai-import.test.ts
 */
import { cleanAllow, cleanShape, roundCorners, type Shape } from "@/lib/pattern-shape";

export const AI_PATTERN_FORMAT = "bagpattern/1";

export const AI_PATTERN_PROMPT = `คุณคือช่างทำแพทเทิร์นกระเป๋า ผมแนบรูปกระเป๋า 1 ใบ (หลายมุม) มาให้
งานของคุณ: แตกกระเป๋าใบนี้ออกเป็น "ชิ้นแพทเทิร์นแบน" ที่ต้องตัด พร้อมขนาดเป็นเซนติเมตร

กติกา
1) ถ้าผมยังไม่ได้บอกขนาดจริง ให้ถามผมก่อน อย่างน้อย กว้าง สูง หนา ของกระเป๋า แล้วค่อยตอบ
2) ขนาดของชิ้น = ขนาดสำเร็จ (เส้นเย็บ) ยังไม่รวมเผื่อเย็บ ใส่เผื่อเย็บแยกในช่อง seam_allowance
3) ขอบที่ต้องเย็บติดกันต้องยาวเท่ากัน ตรวจเองก่อนตอบ
4) ส่วนที่มองไม่เห็นในรูป (ก้น ด้านใน ซับใน) ให้เดาแบบที่ช่างทำทั่วไป แล้วเขียนบอกใน notes ว่าเดาอะไรไว้
5) ชิ้นที่เหมือนกัน (เช่น หู 2 เส้น) ให้ใส่ครั้งเดียว แล้วใส่จำนวนใน count
6) ตอบเป็น JSON อย่างเดียว ไม่ต้องมีคำอธิบายอื่น ตามโครงนี้

{
  "format": "bagpattern/1",
  "name": "ชื่อกระเป๋า",
  "notes": "สิ่งที่เดา หรือสิ่งที่ช่างควรตรวจ",
  "pieces": [
    { "id": "front", "name": "ตัวหน้า", "count": 1,
      "shape": { "type": "rect", "w": 30, "h": 25, "corner": 0 },
      "seam_allowance": 1, "material": "หนัง PU" }
  ],
  "seams": [
    { "a": { "piece": "front", "edge": "bottom" }, "b": { "piece": "base", "edge": "top" } }
  ]
}

shape.type ใช้ได้ 3 แบบ
- "rect"    : w, h, corner (รัศมีมุมมน 0 = เหลี่ยม)
- "circle"  : w, h (วงกลมหรือวงรี)
- "polygon" : points = [[x,y], ...] เรียงตามเข็ม มุมซ้ายบนของชิ้น = 0,0 แกน y ชี้ลง
edge ของ rect = "top" "right" "bottom" "left" · circle = "all" · polygon = เลขลำดับขอบ เริ่มที่ 0 (ขอบที่ 0 = จากจุดแรกไปจุดที่สอง)`;

export type AiPiece = { key: string; name: string; count: number; allow: number; shape: Shape; at: [number, number]; material: string | null; w: number; h: number };
/** ด้านของตะเข็บ: ชิ้นลำดับที่ piece (ในรายการ pieces ที่อ่านได้) · ขอบเริ่มที่ from จำนวน count · ชิ้นนั้นมี n ขอบ */
export type AiSeamSide = { piece: number; from: number; count: number; n: number };
export type AiSeam = { a: AiSeamSide; b: AiSeamSide };
export type AiImport =
  | { ok: true; name: string; notes: string; pieces: AiPiece[]; seams: AiSeam[]; skipped: string[]; seamsSkipped: number }
  | { ok: false; error: string };

const MAX_PIECES = 40, MIN = 0.3, MAX = 300;
const size = (v: unknown): number | null => { const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN; return Number.isFinite(n) && n >= MIN && n <= MAX ? Math.round(n * 100) / 100 : null; };
const RECT_EDGE: Record<string, number> = { top: 0, right: 1, bottom: 2, left: 3 };

/** รูปทรงจากคำตอบ AI → รูปของตัววาด + จำนวนขอบที่อ้างถึงได้ (edges = null → ขอบของชิ้นนี้อ้างเป็นตะเข็บไม่ได้ เช่น สี่เหลี่ยมมุมมน) */
function toShape(raw: unknown): { shape: Shape; w: number; h: number; kind: "rect" | "circle" | "polygon"; edges: number | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  if (s.type === "rect" || s.type === "circle") {
    const w = size(s.w), h = size(s.h);
    if (w == null || h == null) return null;
    if (s.type === "circle") { const shape = cleanShape({ k: "ellipse", x: 0, y: 0, w, h }); return shape ? { shape, w, h, kind: "circle", edges: 1 } : null; }
    const corner = Math.min(Number(s.corner) > 0 ? Number(s.corner) : 0, w / 2, h / 2);
    const rect: Shape = { k: "rect", x: 0, y: 0, w, h };
    const shape = cleanShape(corner > 0.05 ? roundCorners(rect, corner) : rect);
    return shape ? { shape, w, h, kind: "rect", edges: corner > 0.05 ? null : 4 } : null;
  }
  if (s.type === "polygon" && Array.isArray(s.points) && s.points.length >= 3 && s.points.length <= 200) {
    const pts: [number, number][] = [];
    for (const p of s.points) {
      if (!Array.isArray(p) || p.length < 2) return null;
      const x = Number(p[0]), y = Number(p[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      pts.push([x, y]);
    }
    const x0 = Math.min(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1]));
    const nodes = pts.map(([x, y]) => ({ x: Math.round((x - x0) * 100) / 100, y: Math.round((y - y0) * 100) / 100 }));
    const w = size(Math.max(...nodes.map((q) => q.x))), h = size(Math.max(...nodes.map((q) => q.y)));
    if (w == null || h == null) return null;
    const shape = cleanShape({ k: "path", nodes });
    return shape && shape.k === "path" && shape.nodes.length === nodes.length ? { shape, w, h, kind: "polygon", edges: nodes.length } : null;
  }
  return null;
}

export function parseAiPattern(text: string): AiImport {
  const raw = String(text ?? "").trim();
  if (!raw) return { ok: false, error: "วางคำตอบของ AI ก่อน" };
  const i = raw.indexOf("{"), j = raw.lastIndexOf("}");
  let d: Record<string, unknown>;
  try { d = JSON.parse(i >= 0 && j > i ? raw.slice(i, j + 1) : raw) as Record<string, unknown>; }
  catch { return { ok: false, error: "อ่านคำตอบไม่ได้ — บอก AI ว่า \"ตอบเป็น JSON อย่างเดียว ตามโครงเดิม\" แล้ววางใหม่" }; }
  if (!d || typeof d !== "object" || d.format !== AI_PATTERN_FORMAT) return { ok: false, error: `คำตอบไม่ใช่รูปแบบ ${AI_PATTERN_FORMAT} — ส่งคำสั่งเดิมให้ AI อีกครั้ง แล้ววางคำตอบใหม่` };
  if (!Array.isArray(d.pieces) || !d.pieces.length) return { ok: false, error: "คำตอบไม่มีรายการชิ้น — ให้ AI ตอบใหม่" };

  const pieces: AiPiece[] = [], skipped: string[] = [], edgeInfo: { kind: "rect" | "circle" | "polygon"; edges: number | null }[] = [], idOf = new Map<string, number>();
  const gap = 3, rowMax = 110;
  let x = 0, y = 0, rowH = 0;
  for (const [k, item] of (d.pieces as unknown[]).slice(0, MAX_PIECES).entries()) {
    const p = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const name = String(p.name ?? "").trim().slice(0, 60) || `ชิ้น ${k + 1}`;
    const s = toShape(p.shape);
    if (!s) { skipped.push(name); continue; }
    const allow = cleanAllow(Number(p.seam_allowance) || 0), cw = s.w + 2 * allow, ch = s.h + 2 * allow;
    if (x > 0 && x + cw > rowMax) { x = 0; y += rowH + gap; rowH = 0; }
    const id = typeof p.id === "string" && p.id.trim() ? p.id.trim() : `#${k}`;
    if (!idOf.has(id)) idOf.set(id, pieces.length);
    pieces.push({
      key: id, name, shape: s.shape, allow, w: s.w, h: s.h,
      count: Math.min(99, Math.max(1, Math.round(Number(p.count)) || 1)),
      at: [Math.round((x + allow) * 100) / 100, Math.round((y + allow) * 100) / 100],
      material: typeof p.material === "string" && p.material.trim() ? p.material.trim().slice(0, 120) : null,
    });
    edgeInfo.push({ kind: s.kind, edges: s.edges });
    x += cw + gap; rowH = Math.max(rowH, ch);
  }
  if (!pieces.length) return { ok: false, error: "ขนาดหรือรูปทรงของทุกชิ้นใช้ไม่ได้ — ให้ AI ตอบใหม่ตามโครงเดิม" };

  const side = (v: unknown): AiSeamSide | null => {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    const pi = typeof o.piece === "string" ? idOf.get(o.piece.trim()) : undefined;
    if (pi === undefined) return null;
    const info = edgeInfo[pi];
    if (info.edges == null) return null;
    if (info.kind === "circle") return { piece: pi, from: 0, count: 1, n: 1 };
    const e = info.kind === "rect" ? RECT_EDGE[String(o.edge ?? "").trim().toLowerCase()] : typeof o.edge === "number" || (typeof o.edge === "string" && /^\d+$/.test(o.edge.trim())) ? Number(o.edge) : undefined;
    return e !== undefined && Number.isInteger(e) && e >= 0 && e < info.edges ? { piece: pi, from: e, count: 1, n: info.edges } : null;
  };
  const seams: AiSeam[] = [];
  let seamsSkipped = 0;
  for (const item of Array.isArray(d.seams) ? (d.seams as unknown[]).slice(0, 80) : []) {
    const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const a = side(o.a), b = side(o.b);
    if (a && b && !(a.piece === b.piece && a.from === b.from)) seams.push({ a, b }); else seamsSkipped++;
  }
  return { ok: true, name: String(d.name ?? "").trim().slice(0, 120), notes: String(d.notes ?? "").trim().slice(0, 600), pieces, seams, skipped, seamsSkipped };
}
