/**
 * ต้นทุนวัตถุดิบ/ชิ้น จากบรรทัดสูตร (BOM) — ของกลาง (pure + เทสต์ lib/__tests__/cost-inputs.test.ts)
 *   สูตร: Σ (ใช้/ชิ้น × standard_price ของวัตถุดิบ) · ปัดทศนิยม 4 ตำแหน่งต่อบรรทัดและผลรวม
 *   วัตถุดิบที่ไม่มีราคา (≤ 0) = นับเป็น missing_price (หน้าจอเตือน "ยังไม่มีราคา")
 * ใช้ที่: GET /api/product-costings (เครื่องคิดต้นทุน · ต้นทุนมาตรฐาน) และ GET /api/parent-skus/[id]/prices (แท็บราคา)
 *   → แหล่งเดียว ห้ามคิดต้นทุนวัตถุดิบแยกเองในหน้าอื่น (CLAUDE.md §37)
 * ต่อจากนี้ไปคิดต้นทุนเต็ม/กำไร = deriveCost ใน lib/cost-calc
 */
import type { MoCostMaterial } from "@/app/api/mo/[id]/cost/route";

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export type BomCostLine = { component_sku?: unknown; component_name?: unknown; material_type?: unknown; uom?: unknown; qty?: unknown };

export function bomMaterialCost(lines: BomCostLine[], stdPriceOf: Map<string, number>): { materials: MoCostMaterial[]; material_cost_pp: number; missing_price: number } {
  let total = 0; let missing = 0;
  const materials: MoCostMaterial[] = lines.map((x) => {
    const csku = x.component_sku ? String(x.component_sku) : null;
    const qp = num(x.qty);
    const unit = csku ? (stdPriceOf.get(csku) ?? 0) : 0;
    const line = r4(unit * qp);
    const has = unit > 0; if (!has) missing += 1; total += line;
    return {
      sku: csku, name: x.component_name == null ? null : String(x.component_name),
      material_type: x.material_type == null ? null : String(x.material_type), uom: x.uom == null ? null : String(x.uom),
      qty_per: qp, unit_cost: unit, line_pp: line, has_price: has,
    } as MoCostMaterial;
  });
  return { materials, material_cost_pp: r4(total), missing_price: missing };
}
