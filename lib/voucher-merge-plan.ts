/**
 * 🧾 ออกใบสำคัญรับจากหลายใบรับ — "รวม" หรือ "แยก" (pure)
 * เจ้าของถาม 2026-11-05: "ตอนใส่ตะกร้าแล้วไปเปิดใบสำคัญ อยากให้เลือกได้ว่าจะแยก (งงว่าแยกจากอะไร) หรือรวม"
 *   ที่มาของ "แยก": รับของ 1 ครั้ง (ชุด RB-…) ระบบออกใบรับ 1 ใบต่อใบสั่งซื้อ 1 ใบ → ได้หลายใบรับ
 *   รวม = ร้านเดียวกัน + สกุลเงินเดียวกัน = ใบสำคัญ 1 ใบ (API ไม่ยอมรวมคนละสกุล) · แยก = 1 ใบรับ = 1 ใบสำคัญ
 * ใช้ที่ app/purchasing/vouchers (ป๊อปก่อนสร้าง) · ทดสอบ lib/__tests__/voucher-merge-plan.test.ts
 */

export type MergeGr = { id: string; gr_no: string; po_no: string; seller_name: string; currency: string };
export type VoucherPlanGroup = { key: string; seller_name: string; currency: string; grs: MergeGr[] };

const curKey = (c: string) => { const u = String(c || "THB").toUpperCase(); return u === "YUAN" || u === "CNY" ? "RMB" : u; };

export function planVoucherGroups(grs: MergeGr[], mode: "merge" | "split"): VoucherPlanGroup[] {
  if (mode === "split") return grs.map((g) => ({ key: g.id, seller_name: g.seller_name, currency: curKey(g.currency), grs: [g] }));
  const map = new Map<string, VoucherPlanGroup>();
  for (const g of grs) {
    const key = `${g.seller_name.trim()}|${curKey(g.currency)}`;
    const e = map.get(key) ?? { key, seller_name: g.seller_name, currency: curKey(g.currency), grs: [] };
    e.grs.push(g);
    map.set(key, e);
  }
  return [...map.values()];
}

/** ร้านที่มีใบรับหลายสกุลในชุดที่เลือก (รวมเป็นใบเดียวไม่ได้ — แก้สกุลที่ใบสั่งซื้อก่อนถ้าตั้งผิด) */
export function mixedCurrencyShops(grs: MergeGr[]): string[] {
  const by = new Map<string, Set<string>>();
  for (const g of grs) { const s = by.get(g.seller_name) ?? new Set<string>(); s.add(curKey(g.currency)); by.set(g.seller_name, s); }
  return [...by.entries()].filter(([, s]) => s.size > 1).map(([n]) => n);
}
