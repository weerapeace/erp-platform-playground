/**
 * ลูกค้าประจำแบรนด์ "หลายราย" (เจ้าของขอ 2026-11-07: "บางทีมีหลายสาขา")
 *
 *   brands.default_customer_ids uuid[]  = รายการลูกค้า (เรียงตามที่ตั้ง)
 *   brands.default_customer_id          = รายแรก (เขียนให้ตรงกันทุกครั้ง — ของเดิมที่อ่านช่องนี้ไม่พัง)
 *
 * ไฟล์ pure (ไม่แตะฐานข้อมูล) — ใช้ทั้ง API (/api/brands, app/api/mo/so-link) และหน้าจอ
 * ใช้ที่: หน้าแบรนด์ · ป๊อปสร้างใบสั่งผลิต (components/mo-so-link) · ป๊อปลงออเดอร์ (components/order-batch-entry)
 */

/** ลูกค้า 1 ราย (partners_v2) */
export type BrandCustomer = { id: string; code: string | null; name: string };

/** ตั้งได้สูงสุดกี่ราย (กันกดเพิ่มรัว ๆ) */
export const BRAND_CUSTOMER_MAX = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ล้างรายการรหัสลูกค้า: เอาเฉพาะ uuid · ตัดซ้ำ · คงลำดับ · ไม่เกิน BRAND_CUSTOMER_MAX */
export function cleanCustomerIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    const id = String(v ?? "").trim();
    if (UUID.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= BRAND_CUSTOMER_MAX) break;
  }
  return out;
}

/** รายการลูกค้าของแถวแบรนด์ (รายการใหม่มาก่อน · แถวเก่าที่มีแค่ช่องเดียวก็อ่านได้) */
export function brandCustomerIds(row: { default_customer_ids?: unknown; default_customer_id?: unknown } | null | undefined): string[] {
  if (!row) return [];
  const ids = cleanCustomerIds(row.default_customer_ids);
  if (ids.length) return ids;
  return cleanCustomerIds([row.default_customer_id]);
}

/** เพิ่มลูกค้า 1 รายท้ายรายการ (มีอยู่แล้ว = เหมือนเดิม) */
export function addCustomerId(ids: string[], id: string): string[] {
  return cleanCustomerIds([...ids, id]);
}

/** ค่าที่เขียนลงตาราง brands (2 ช่องให้ตรงกันเสมอ) */
export function brandCustomerColumns(ids: string[]): { default_customer_ids: string[]; default_customer_id: string | null } {
  const clean = cleanCustomerIds(ids);
  return { default_customer_ids: clean, default_customer_id: clean[0] ?? null };
}

/** เรียงลูกค้าตามรายการรหัส (ตัวที่หาไม่เจอ เช่น ถูกลบ = ข้าม) */
export function orderCustomers(ids: string[], byId: Map<string, BrandCustomer>): BrandCustomer[] {
  return ids.map((id) => byId.get(id)).filter((c): c is BrandCustomer => !!c);
}

