/**
 * 🧱 บล็อกพิมพ์ — คลังสัญลักษณ์ (สูตรล้วน) · เจ้าของเลือกใน widget 2026-11-24 (ข้อเสนอ 2-4)
 *   สัญลักษณ์ = เส้นเวกเตอร์ (เก็บในฐานข้อมูล ไม่เก็บไฟล์รูป) + ชื่อ + หมวด + ขนาดที่ใช้บ่อย
 *   รูปตัวอย่าง/ไฟล์ SVG วาดจากเส้นตอนใช้ · บันทึกจากชิ้นในงาน · ใส่ไฟล์ SVG/AI เข้าคลังตรง · เลือกไปใช้ในงาน/ในบล็อก
 *
 * ใช้ที่: app/api/block-print/symbols · components/block-print/symbol-picker.tsx · symbols-page.tsx · editor.tsx · layout-editor.tsx
 */
import { eachOp, mapOps, opsBox, pieceShapes, buildPiece, type BlockPiece, type DrawOps, type FillRule } from "@/lib/block-print";
import { inkSvg } from "@/lib/block-print-layout";

export type SymbolPart = { d: DrawOps; fill: FillRule };
export type SymbolInput = {
  name: string; category: string | null;
  /** เส้น (มม.) เทียบมุมซ้ายบน 0,0 ที่ขนาดเดิม ow×oh */ parts: SymbolPart[];
  ow: number; oh: number;
  /** ขนาดที่ใช้บ่อย (ตอนหยิบไปใช้) */ w: number; h: number;
  source_file_name?: string | null;
};
export type BlockSymbol = SymbolInput & {
  id: string; code: string; is_active: boolean; created_at: string; updated_at: string; deleted_at: string | null;
};

export const SYMBOL_LIMITS = { batch: 200, parts: 5000, points: 300_000, name: 80, category: 40 };
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** ชิ้นในงาน → สัญลักษณ์ (ขนาดที่ใช้บ่อย = ขนาดที่ตั้งไว้) */
export function symbolFromPiece(p: BlockPiece, category: string | null = null, name?: string): SymbolInput {
  return {
    name: (name ?? p.name).trim().slice(0, SYMBOL_LIMITS.name) || "สัญลักษณ์",
    category: category?.trim().slice(0, SYMBOL_LIMITS.category) || null,
    parts: pieceShapes(p).map((s) => ({ d: s.d, fill: s.fill })),
    ow: p.ow, oh: p.oh, w: p.w, h: p.h,
  };
}

/**
 * สัญลักษณ์ → ชิ้นในงาน (วางที่ ax/ay) · หลายเส้น = ชิ้นรวม (แยกคืนได้ในหน้าเลือกชิ้น) · ขนาด = ขนาดที่ใช้บ่อย
 *   idPrefix ต้องไม่ซ้ำกับชิ้นที่มีอยู่
 */
export function pieceFromSymbol(s: Pick<SymbolInput, "name" | "parts" | "w" | "h">, idPrefix: string, ax: number, ay: number): BlockPiece | null {
  const atoms: BlockPiece[] = [];
  s.parts.forEach((part, i) => {
    const b = opsBox(part.d);
    if (!b || b.w <= 0 || b.h <= 0) return;
    atoms.push({
      id: `${idPrefix}-${i + 1}`, name: s.name, fill: part.fill, on: true,
      d: mapOps(part.d, (x, y) => [r3(x - b.x), r3(y - b.y)]),
      ow: r3(b.w), oh: r3(b.h), w: r3(b.w), h: r3(b.h), ax: r3(ax + b.x), ay: r3(ay + b.y),
    });
  });
  if (!atoms.length) return null;
  const p = atoms.length === 1 ? { ...atoms[0], id: idPrefix } : buildPiece(atoms, idPrefix, s.name);
  return { ...p, name: s.name, w: r3(s.w), h: r3(s.h), on: true };
}

/** SVG ขนาดจริง (ขนาดที่ใช้บ่อย) */
export function symbolSvg(s: Pick<SymbolInput, "name" | "parts" | "ow" | "oh" | "w" | "h">): string {
  const sx = s.w / s.ow, sy = s.h / s.oh;
  return inkSvg(s.parts.map((p) => ({ d: mapOps(p.d, (x, y) => [r3(x * sx), r3(y * sy)]), mode: "fill" as const, rule: p.fill })), s.w, s.h, { title: s.name });
}

/** ตรวจ/ทำความสะอาดก่อนบันทึก */
export function cleanSymbolInput(raw: unknown): { ok: true; symbol: SymbolInput } | { ok: false; error: string } {
  const o = (raw ?? {}) as Record<string, unknown>;
  const name = String(o.name ?? "").trim().slice(0, SYMBOL_LIMITS.name);
  if (!name) return { ok: false, error: "ต้องใส่ชื่อสัญลักษณ์" };
  const category = String(o.category ?? "").trim().slice(0, SYMBOL_LIMITS.category) || null;
  const parts = Array.isArray(o.parts) ? o.parts : [];
  if (!parts.length || parts.length > SYMBOL_LIMITS.parts) return { ok: false, error: "เส้นของสัญลักษณ์ไม่ถูกต้อง" };
  let points = 0;
  const clean: SymbolPart[] = [];
  for (const p of parts as Record<string, unknown>[]) {
    const d = Array.isArray(p?.d) ? (p.d as unknown[]).map(Number) : [];
    if (!d.length || !d.every(Number.isFinite)) return { ok: false, error: "เส้นของสัญลักษณ์ไม่ถูกต้อง" };
    try { eachOp(d, () => undefined); } catch { return { ok: false, error: "เส้นของสัญลักษณ์ไม่ถูกต้อง" }; }
    points += d.length;
    clean.push({ d, fill: p.fill === "evenodd" ? "evenodd" : "nonzero" });
  }
  if (points > SYMBOL_LIMITS.points) return { ok: false, error: "สัญลักษณ์มีจุดเส้นเยอะเกินไป" };
  const [ow, oh, w, h] = ["ow", "oh", "w", "h"].map((k) => Number(o[k]));
  if (![ow, oh, w, h].every((v) => Number.isFinite(v) && v > 0 && v <= 2000)) return { ok: false, error: "ขนาดสัญลักษณ์ไม่ถูกต้อง" };
  const source = String(o.source_file_name ?? "").trim().slice(0, 200) || null;
  return { ok: true, symbol: { name, category, parts: clean, ow, oh, w, h, source_file_name: source } };
}
