/**
 * "ใช้ต่อใบ" ของกลุ่มบรรทัดตีราคา (โชว์ที่หัวกลุ่มของตาราง) — เจ้าของขอ 2026-10-26 "คำนวณให้ดูว่าใช้ผ้าเท่าไหร่ต่อใบ"
 *   • วัสดุที่ซื้อเป็นผืน/แผ่น (ผ้า (ชิ้น) / ลายพิมพ์ / ตัวเสริม) — ปริมาณในบรรทัดเป็น cm² (รวมเผื่อเสียแล้ว)
 *     → แปลงเป็น "กี่ผืน" = cm² ÷ พื้นที่ผืนเต็ม (กว้าง×ยาว ในทะเบียนวัสดุตีราคา)
 *   • วัสดุอื่น — รวมปริมาณตามหน่วยของบรรทัด (เช่น 0.85 หลา)
 * บรรทัดตีราคา = ต้นทุนต่อ 1 ใบ → ผลรวม = ใช้ต่อใบ
 * pure → เทสที่ lib/__tests__/cost-usage.test.ts
 */
import { sheetUnitFor } from "@/lib/bom-calc";

export type UsageLine = { item_id: string | null; group_name: string | null; qty: number | null; uom: string | null; piece: boolean };
export type SheetSize = { width_cm: number | null; length_cm: number | null };

export type CostUsage = {
  /** วัสดุแบบผืน/แผ่น: ใช้กี่ผืนต่อใบ · size = ขนาดผืน (เฉพาะทุกบรรทัดขนาดเดียวกัน) · perSheet = 1 ผืนทำได้กี่ใบ */
  sheets: { qty: number; unit: string; size: string | null; area: number; perSheet: number | null } | null;
  /** บรรทัดแบบผืนที่วัสดุยังไม่มีขนาดผืน (คิดเป็นผืนไม่ได้) */
  missingSize: number;
  /** วัสดุอื่น: รวมตามหน่วย */
  byUom: { uom: string; qty: number }[];
};

const fmtCm = (n: number) => String(Math.round(n * 100) / 100);

export function costUsagePerUnit(lines: UsageLine[], sheetOf: (itemId: string) => SheetSize | null | undefined): CostUsage {
  let sheetQty = 0, area = 0, missingSize = 0;
  const sizes = new Set<string>();
  const units = new Set<string>();
  const byUom = new Map<string, number>();
  for (const l of lines) {
    const q = Number(l.qty) || 0;
    if (q <= 0) continue;
    if (l.piece) {
      const s = l.item_id ? sheetOf(l.item_id) : null;
      const sheetArea = s?.width_cm && s?.length_cm ? s.width_cm * s.length_cm : 0;
      if (!s || !sheetArea) { missingSize++; continue; }
      sheetQty += q / sheetArea;
      area += q;
      sizes.add(`${fmtCm(s.width_cm!)}×${fmtCm(s.length_cm!)}`);
      units.add(sheetUnitFor(l.group_name));
    } else {
      const u = (l.uom ?? "").trim();
      if (u) byUom.set(u, (byUom.get(u) ?? 0) + q);
    }
  }
  const size = sizes.size === 1 ? [...sizes][0] : null;
  return {
    sheets: sheetQty > 0 ? {
      qty: sheetQty,
      unit: units.size === 1 ? [...units][0] : "ผืน/แผ่น",
      size,
      area,
      // 1 ผืนทำได้กี่ใบ — คิดเฉพาะผืนขนาดเดียวกันและใช้ไม่เกิน 1 ผืนต่อใบ (ประมาณจากพื้นที่ ยังไม่รวมการวางแบบจริง)
      perSheet: size && sheetQty <= 1 ? Math.floor(1 / sheetQty + 1e-9) : null,
    } : null,
    missingSize,
    byUom: [...byUom.entries()].map(([uom, qty]) => ({ uom, qty })),
  };
}
