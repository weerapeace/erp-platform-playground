/**
 * ใบสั่งขาย — ตัวช่วยหน้า "ดูใบ" (จัดกลุ่มตามรุ่น / ชุดหลัก) · ไม่แตะ DB
 * ใช้: app/sales/orders/order-read-view.tsx · เทสต์ lib/__tests__/so-order-view.test.ts
 */

/** รหัสรุ่น = ส่วนหน้าของ SKU ก่อน "-" ตัวแรก (CTL008S-01-1 → CTL008S · CTL055-B-02 → CTL055) · ไม่มีรหัส = "" */
export const modelKeyOf = (sku: string | null | undefined): string => {
  const s = String(sku ?? "").trim();
  return s ? s.split("-")[0] : "";
};

/** ชื่อรุ่นจากชื่อสินค้าในกลุ่ม = ส่วนที่เหมือนกันด้านหน้า ตัดที่ช่องว่างสุดท้าย ("…Raffia สีน้ำตาล" + "…Raffia สีครีม" → "…Raffia") */
export function commonNamePrefix(names: string[]): string {
  const list = names.map((n) => n.trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  let p = list[0];
  for (const n of list.slice(1)) {
    let i = 0;
    while (i < p.length && i < n.length && p[i] === n[i]) i++;
    p = p.slice(0, i);
  }
  const whole = list.every((n) => n === p || n.startsWith(p + " "));
  const cut = whole ? p : p.slice(0, Math.max(0, p.lastIndexOf(" ")));
  return cut.trim() || list[0];
}

export type ModelGroup<T> = { key: string; label: string; items: T[]; qty: number; total: number };

/** จัดกลุ่มรายการตามรุ่น — ลำดับกลุ่มตามที่เจอครั้งแรกในใบ · รายการไม่มีรหัสอยู่กลุ่ม "" ท้ายสุด */
export function groupByModel<T extends { sku: string | null; product_name: string; qty: number }>(
  lines: T[], amountOf: (l: T) => number,
): ModelGroup<T>[] {
  const map = new Map<string, ModelGroup<T>>();
  for (const l of lines) {
    const key = modelKeyOf(l.sku);
    const g = map.get(key) ?? { key, label: "", items: [], qty: 0, total: 0 };
    g.items.push(l); g.qty += Number(l.qty) || 0; g.total += amountOf(l);
    map.set(key, g);
  }
  const out = [...map.values()].map((g) => ({ ...g, label: g.key ? commonNamePrefix(g.items.map((i) => i.product_name)) : "ไม่มีรหัสสินค้า" }));
  return [...out.filter((g) => g.key), ...out.filter((g) => !g.key)];
}

/** ชุดที่รายการส่วนใหญ่อยู่ (ใช้บอกครั้งเดียวด้านบนแทนการโชว์ทุกบรรทัด) · ไม่มีชุดเลย = null */
export function majorityGroup<G extends { id: string | null; name: string }>(groups: (G | null | undefined)[]): { group: G; count: number } | null {
  const count = new Map<string, { group: G; count: number }>();
  // ชุดใหม่ที่ยังไม่บันทึก (id ว่าง) นับตามชื่อ
  for (const g of groups) {
    if (!g) continue;
    const k = g.id || `new:${g.name}`;
    count.set(k, { group: g, count: (count.get(k)?.count ?? 0) + 1 });
  }
  return [...count.values()].sort((a, b) => b.count - a.count)[0] ?? null;
}
