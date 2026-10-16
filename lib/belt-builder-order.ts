/**
 * Belt Builder ก้อน 4 — แปลง "แบบเข็มขัดที่ลูกค้าบันทึก" (belt_designs) เป็นรายการในออเดอร์เว็บ (pure · มี test)
 *
 * ใช้ใน lib/website-orders.ts: รายการที่ส่ง beltDesignId แทน productId
 * กฎ: แบบต้องเป็นของร้านเดียวกัน (ผู้เรียกกรองด้วย shop_id แล้ว) · ยังไม่ถูกสั่ง (status ≠ ordered) · มีราคา > 0
 *      ราคา = total_price ที่คิดไว้ตอนบันทึกแบบ (ฝั่งเซิร์ฟเวอร์) — ไม่รับราคาจากหน้าเว็บ
 */

export type BeltDesignRow = {
  id: string;
  status: string;
  total_price: number | string | null;
  selections: unknown;
  order_ref: string | null;
};

export type BeltOrderLine = {
  sku_id: null;
  sku_code: null;
  parent_code: null;
  name: string;
  variant_label: string | null;
  unit_price: number;
  qty: number;
  line_total: number;
  personalize: null;
  belt_design_id: string;
};

/** รหัสแบบที่โชว์ลูกค้า = 8 ตัวแรกของ id (ตัวใหญ่) — ชุดเดียวกับ API belt-designs */
export const beltDesignCode = (id: string) => String(id).slice(0, 8).toUpperCase();

/** ข้อความสรุปแบบ (สาย · หัว · หู · สลัก · ไซซ์) สำหรับ variant_label / แท็บออเดอร์ */
export function beltDesignSummary(selections: unknown): string {
  const s = (selections && typeof selections === "object" ? selections : {}) as Record<string, unknown>;
  const labels = (s.labels && typeof s.labels === "object" ? s.labels : {}) as Record<string, unknown>;
  const e = (s.engraving && typeof s.engraving === "object" ? s.engraving : null) as Record<string, unknown> | null;
  const parts: string[] = [];
  if (labels.strap) parts.push(String(labels.strap));
  if (labels.buckle) parts.push(String(labels.buckle));
  if (labels.keeper) parts.push(String(labels.keeper));
  if (e?.text) parts.push(`สลัก "${String(e.text)}"`);
  if (s.waist_in) parts.push(`${s.gender === "women" ? "หญิง" : s.gender === "men" ? "ชาย" : ""} เอว ${s.waist_in}″${s.strap_cm ? ` (ตัดหนัง ${s.strap_cm} ซม.)` : ""}`.trim());
  return parts.join(" · ");
}

export function beltDesignLine(design: BeltDesignRow | null, qty: number): { ok: true; line: BeltOrderLine } | { ok: false; error: string } {
  if (!design) return { ok: false, error: "ไม่พบแบบเข็มขัดที่เลือก (อาจถูกลบ) กรุณาออกแบบใหม่" };
  if (design.status === "ordered") return { ok: false, error: `แบบเข็มขัด ${beltDesignCode(design.id)} ถูกสั่งไปแล้ว (ออเดอร์ ${design.order_ref ?? "-"}) — กรุณาบันทึกแบบใหม่อีกครั้ง` };
  const price = Math.round((Number(design.total_price) || 0) * 100) / 100;
  if (price <= 0) return { ok: false, error: "แบบเข็มขัดนี้ยังไม่มีราคา (ร้านยังไม่ตั้งราคาฐาน) กรุณาติดต่อร้าน" };
  const q = Math.max(1, Math.min(99, Math.floor(qty) || 1));
  const lineTotal = Math.round(price * q * 100) / 100;
  return {
    ok: true,
    line: {
      sku_id: null, sku_code: null, parent_code: null,
      name: `เข็มขัดสั่งทำ · รหัสแบบ ${beltDesignCode(design.id)}`,
      variant_label: beltDesignSummary(design.selections) || null,
      unit_price: price, qty: q, line_total: lineTotal,
      personalize: null,
      belt_design_id: design.id,
    },
  };
}
