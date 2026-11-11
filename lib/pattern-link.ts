/**
 * 🔗 ชิ้นคู่ผูกกัน — สูตรบริสุทธิ์ ไม่มีหน้าจอ · สตูดิโอแพทเทิร์น (เจ้าของสั่ง 2026-11-11 "ทำต่อเลย" — ข้อ "แก้ตัวนอกแล้วซับในตาม")
 *
 *   ชิ้นที่มี link = "ชิ้นตาม": รูปเส้นรอบของมันมาจาก "ชิ้นต้นแบบ" (link.to) เสมอ — แก้ต้นแบบ (ลากจุด ย่อขยาย พิมพ์ความยาวขอบ) ชิ้นตามเปลี่ยนตามทันที
 *     • ตามเฉพาะ "รูปเส้นรอบ" · ของตัวเองยังเป็นของตัวเอง: ตำแหน่งบนกระดาน ชื่อ วัสดุ ชนิดชิ้น จำนวนตัด เผื่อเย็บ รูเจาะ รอยบาก เส้นใน (ช่องใส่ของบนซับใน ไม่ไปโผล่บนตัวนอก)
 *     • ชิ้นตามอยู่กับที่: มุมซ้ายบนของกรอบเส้นเย็บของมันไม่ขยับ (ย้ายชิ้นตามเองได้ตามปกติ)
 *     • mirror "x" = กลับซ้ายขวา (ชิ้นคู่ซ้าย/ขวา)
 *     • ห้ามผูกเป็นทอด (ชิ้นตามเป็นต้นแบบของชิ้นอื่นไม่ได้) · ต้นแบบถูกลบ = ชิ้นตามกลับเป็นชิ้นอิสระ (เลิกผูกเอง รูปคงเดิม)
 *   ตะเข็บไม่ได้ผูกตาม — แต่ตะเข็บอ้างขอบตามลำดับ ชิ้นตามมีจำนวนขอบเท่าต้นแบบเสมอ จึงยังใช้ได้และยาวเท่ากันตามต้นแบบ
 *
 * ใช้ที่: components/pattern-sheet/shape-editor (prop pieceLinks) · lib/pattern-project · เทสต์ lib/__tests__/pattern-link.test.ts
 * คู่มือ: docs/pattern-studio.md
 */
import { mirrorShape, moveShape, shapeBox, type Shape } from "@/lib/pattern-shape";

export type PieceLink = { to: string; mirror?: "x" };

export function cleanPieceLink(raw: unknown): PieceLink | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.to !== "string" || !/^[\w-]{1,48}$/.test(r.to)) return null;
  return r.mirror === "x" ? { to: r.to, mirror: "x" } : { to: r.to };
}

/** รูปของชิ้นตาม: รูปของต้นแบบ (กลับซ้ายขวาถ้าตั้งไว้) ย้ายมาให้มุมซ้ายบนของกรอบอยู่ที่ at */
export function linkedShape(master: Shape, link: PieceLink, at: { x: number; y: number }): Shape {
  const b0 = shapeBox(master);
  const s = link.mirror === "x" ? mirrorShape(master, "x", b0.x + b0.w / 2) : master;
  const b = shapeBox(s);
  return moveShape(s, at.x - b.x, at.y - b.y);
}

const near = (a: number | undefined, b: number | undefined) => Math.abs((a ?? 0) - (b ?? 0)) < 1e-6;
/** รูปสองรูปเหมือนกัน (คลาดได้นิดเดียว) — กันวนอัปเดตไม่จบจากเศษทศนิยม */
export function shapesClose(a: Shape, b: Shape): boolean {
  if (a.k !== b.k) return false;
  if (a.k !== "path" && b.k !== "path") return near(a.x, b.x) && near(a.y, b.y) && near(a.w, b.w) && near(a.h, b.h);
  if (a.k !== "path" || b.k !== "path" || a.nodes.length !== b.nodes.length) return false;
  return a.nodes.every((p, i) => { const q = b.nodes[i]; return near(p.x, q.x) && near(p.y, q.y) && near(p.ix, q.ix) && near(p.iy, q.iy) && near(p.ox, q.ox) && near(p.oy, q.oy); });
}

type Linkable = { pid: string; shape: Shape; link?: PieceLink | null };
/** ชิ้นที่เป็นต้นแบบของชิ้นนี้ได้: ไม่ใช่ตัวเอง · ไม่ใช่ชิ้นตามของใคร · ไม่ใช่ชิ้นที่ตามชิ้นนี้อยู่ (กันผูกวน/ผูกเป็นทอด) */
export function linkTargets<T extends Linkable>(pieces: T[], pid: string): T[] {
  if (pieces.some((p) => p.link?.to === pid)) return [];           // ชิ้นนี้เป็นต้นแบบของชิ้นอื่นอยู่ → เป็นชิ้นตามไม่ได้
  return pieces.filter((p) => p.pid !== pid && !p.link);
}

/**
 * ทำให้ชิ้นตามทุกชิ้นมีรูปตรงกับต้นแบบ — คืนรายการเดิม (ตัวเดิมเป๊ะ) ถ้าไม่มีอะไรต้องเปลี่ยน
 * ต้นแบบหาย / ผูกเป็นทอด / ผูกกับตัวเอง = เลิกผูกชิ้นนั้น (รูปคงเดิม)
 */
export function applyLinks<T extends Linkable>(pieces: T[]): T[] {
  if (!pieces.some((p) => p.link)) return pieces;
  const byPid = new Map(pieces.map((p) => [p.pid, p]));
  let changed = false;
  const out = pieces.map((p) => {
    if (!p.link) return p;
    const m = byPid.get(p.link.to);
    if (!m || m.pid === p.pid || m.link) { changed = true; const { link: _l, ...rest } = p; void _l; return rest as T; }
    const b = shapeBox(p.shape), ns = linkedShape(m.shape, p.link, b);
    if (shapesClose(ns, p.shape)) return p;
    changed = true;
    return { ...p, shape: ns };
  });
  return changed ? out : pieces;
}
