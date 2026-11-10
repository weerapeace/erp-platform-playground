/**
 * 👜→💰 ส่งชิ้นจากสตูดิโอแพทเทิร์นไป "ตีราคา" ของใบงานออกแบบ (สูตรบริสุทธิ์ ไม่มีหน้าจอ ไม่แตะฐานข้อมูล)
 *   เจ้าของสั่ง 2026-11-10 "วัสดุ + ส่งตีราคา"
 *
 *   กติกาเดียวกับแบบวาดในแท็บตีราคา: 1 ชิ้น × 1 วัสดุ = 1 บรรทัด · กว้าง×ยาว = ขนาดตัด (รวมเผื่อ) · จำนวนชิ้น = จำนวนตัด
 *   planCostingSend = เทียบชิ้นของแพทเทิร์นกับบรรทัดเดิมของแท็บนั้น แล้วบอกว่าต้อง "เพิ่ม" / "อัปเดต" บรรทัดไหน
 *     • บรรทัดเดิมจับคู่ด้วยรหัสชิ้น (shape.pid) + วัสดุ → ส่งซ้ำ = อัปเดตขนาด/รูปทรง ราคาและหมายเหตุของบรรทัดอยู่ครบ
 *     • **ไม่ลบบรรทัดไหนเลย** — บรรทัดของชิ้นนี้ที่วัสดุไม่ตรงแล้ว นับเป็น stale ให้ผู้ใช้ไปลบเองในตีราคา
 *     • ชิ้นที่ยังไม่เลือกวัสดุ → บรรทัดเปล่า (เลือกวัสดุในตีราคาทีหลัง) · ส่งซ้ำ = อัปเดตทุกบรรทัดของชิ้นนั้น
 *
 * ใช้ที่: app/api/pattern-projects/[id]/costing · เทสต์ lib/__tests__/pattern-costing.test.ts
 */
import { costLineFromItem, recomputeCostLine, type CostItemLike } from "@/lib/design-sheet-cost-row";
import { cleanLineShape, normalizePiece, pieceGeometry, type LineShape } from "@/lib/pattern-shape";
import type { ProjectPiece } from "@/lib/pattern-project";

/** บรรทัดตีราคาเดิมของใบงาน (เฉพาะช่องที่ใช้) */
export type ExistingCostLine = {
  id: string; parent_code: string | null; sort_order: number | null;
  item_id: string | null; item_name: string | null; item_sku_code?: string | null;
  group_code?: string | null; group_name: string | null; calc_method: string | null;
  width_cm: number | null; length_cm: number | null; pieces: number | null;
  face_width_cm: number | null; waste_percent: number | null; divisor: number | null;
  qty: number | null; uom?: string | null; unit_price: number | null; amount: number | null;
  shape?: unknown;
};
/** บรรทัดใหม่ที่จะเพิ่ม (ยังไม่มี sheet_id — API เติมเอง) */
export type CostingInsert = {
  parent_code: string | null; sort_order: number;
  item_id: string | null; item_name: string | null; group_name: string | null; group_code: string | null; calc_method: string | null;
  width_cm: number | null; length_cm: number | null; pieces: number | null;
  face_width_cm: number | null; waste_percent: number | null; divisor: number | null;
  qty: number | null; uom: string | null; unit_price: number | null; amount: number | null; note: string | null;
  shape: LineShape;
};
export type CostingUpdate = { id: string; patch: Partial<Omit<CostingInsert, "parent_code" | "sort_order">> };
export type CostingPlan = {
  inserts: CostingInsert[]; updates: CostingUpdate[];
  /** บรรทัดเดิมของชิ้นในแพทเทิร์นนี้ที่วัสดุไม่ตรงแล้ว (ไม่แตะ — ให้ลบเองในตีราคา) */
  stale: number;
  /** ชิ้นที่ยังไม่ได้เลือกวัสดุ */
  noMaterial: number;
  /** วัสดุที่เลือกไว้แต่ไม่อยู่ในรายการวัสดุตีราคาแล้ว (ส่งเป็นชื่ออย่างเดียว ไม่มีราคา) */
  missingItems: string[];
  /** ยอดเงินของบรรทัดที่เพิ่ม/อัปเดต (หลังส่ง) */
  amount: number;
};

const pkey = (s: string | null | undefined) => s ?? "";
const r2 = (v: number) => Math.round(v * 100) / 100;

/** รูปทรงของชิ้น → ช่อง shape ของบรรทัดตีราคา (รูปเลื่อนให้เริ่มที่ 0,0 · at = ตำแหน่งบนกระดาน) */
export function pieceLineShape(p: ProjectPiece, basis: "box" | "area"): LineShape {
  const n = normalizePiece(p.shape, p.holes, { grain: p.grain, notches: p.notches });
  return {
    v: 1, shape: n.shape, basis, pid: p.pid, at: p.at,
    ...(n.holes.length ? { holes: n.holes } : {}), ...(p.allow ? { allow: p.allow } : {}), ...(p.allowEdges ? { allowEdges: p.allowEdges } : {}), ...(p.foldEdges ? { foldEdges: p.foldEdges } : {}),
    ...(p.name ? { name: p.name } : {}),
    ...(n.grain && n.grain.length === 2 ? { grain: [n.grain[0], n.grain[1]] as NonNullable<LineShape["grain"]> } : {}),
    ...(n.notches?.length ? { notches: n.notches } : {}),
  };
}

export function planCostingSend(
  pieces: ProjectPiece[], basis: "box" | "area", existing: ExistingCostLine[], parentCode: string | null, items: Map<string, CostItemLike>,
): CostingPlan {
  const tab = existing.filter((r) => pkey(r.parent_code) === pkey(parentCode));
  const pool = tab.map((r) => ({ row: r, pid: cleanLineShape(r.shape)?.pid ?? null, refs: cleanLineShape(r.shape)?.refs }));
  const taken = new Set<string>();
  let sort = existing.reduce((m, r) => Math.max(m, r.sort_order ?? 0), 0);
  const plan: CostingPlan = { inserts: [], updates: [], stale: 0, noMaterial: 0, missingItems: [], amount: 0 };
  const isBlank = (r: ExistingCostLine) => !r.item_id && !r.item_sku_code && !r.item_name;

  for (const p of pieces) {
    const g = pieceGeometry({ shape: p.shape, holes: p.holes, allow: p.allow, allowEdges: p.allowEdges });
    const size = { width_cm: r2(g.cutBox.w), length_cm: r2(g.cutBox.h), pieces: p.count };
    const ls = pieceLineShape(p, basis);
    const mine = pool.filter((x) => x.pid === p.pid);
    const update = (x: (typeof mine)[number], extra: Partial<CostingInsert> = {}) => {
      taken.add(x.row.id);
      const shape: LineShape = x.refs?.length ? { ...ls, refs: x.refs } : ls;   // รูปอ้างอิงของแท็บ (เก็บซ้ำทุกบรรทัด) ต้องอยู่ต่อ
      const next = recomputeCostLine({ ...x.row, ...extra, ...size, shape });
      plan.updates.push({ id: x.row.id, patch: { ...extra, ...size, shape, qty: next.qty, amount: next.amount } });
      plan.amount += next.amount ?? 0;
    };
    const insert = (base: Omit<CostingInsert, "parent_code" | "sort_order" | "shape" | "width_cm" | "length_cm" | "pieces">) => {
      const next = recomputeCostLine({ ...base, ...size, shape: ls });
      plan.inserts.push({ ...next, parent_code: parentCode || null, sort_order: ++sort });
      plan.amount += next.amount ?? 0;
    };
    const blankBase = (name: string | null) => ({
      item_id: null, item_name: name, group_name: null, group_code: null, calc_method: null,
      face_width_cm: null, waste_percent: null, divisor: null, qty: null, uom: null, unit_price: null, amount: null, note: null,
    });

    const mats = p.mats ?? [];
    if (!mats.length) {
      plan.noMaterial++;
      if (mine.length) mine.forEach((x) => update(x));          // เคยส่งแล้ว (อาจเลือกวัสดุในตีราคาไปแล้ว) → อัปเดตขนาดทุกบรรทัดของชิ้น
      else insert(blankBase(null));
      continue;
    }
    for (const m of mats) {
      const it = items.get(m.id);
      if (!it && !plan.missingItems.includes(m.name)) plan.missingItems.push(m.name);
      const hit = mine.find((x) => !taken.has(x.row.id) && (it ? x.row.item_id === m.id : !x.row.item_id && x.row.item_name === m.name));
      if (hit) { update(hit); continue; }
      const blank = mine.find((x) => !taken.has(x.row.id) && isBlank(x.row));   // บรรทัดเปล่าของชิ้นนี้ (ส่งตอนยังไม่เลือกวัสดุ) → เติมวัสดุให้
      const { sort_order: _s, ...fromItem } = it ? costLineFromItem(it, 0) : { sort_order: 0, ...blankBase(m.name) };
      void _s;
      const { width_cm: _w, length_cm: _l, pieces: _p, ...mat } = fromItem as typeof fromItem & { width_cm?: unknown; length_cm?: unknown; pieces?: unknown };
      void _w; void _l; void _p;
      if (blank) update(blank, mat);
      else insert(mat);
    }
    plan.stale += mine.filter((x) => !taken.has(x.row.id)).length;
  }
  plan.amount = r2(plan.amount);
  return plan;
}
