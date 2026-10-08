/**
 * ตรวจว่า SKU ถูกใช้ที่ไหนบ้าง (ของกลาง ฝั่ง server) — ก่อน "ลบถาวร" SKU
 *
 * ทำไมต้องมี: skus_v2 ถูกอ้างอิงจากเอกสารหลายตาราง ทั้งที่มี FK (DB กันลบให้) และ **ไม่มี FK**
 * (เช่น purchase_order_lines_v2.item_sku_id · ใบขาย/ใบสั่งผลิตเก็บเป็น "รหัส") → ลบถาวรแล้วเอกสารกลายเป็นกำพร้าเงียบ ๆ
 * และบางตารางเป็น CASCADE (สต๊อกคงเหลือ/ราคาร้านค้า/Bundle) → ลบแล้วข้อมูลพวกนั้นหายตาม
 *
 * ใช้: const u = await skuUsage(admin, { id, code }); if (u.used) → ห้ามลบถาวร ให้ "ปิดใช้" แทน
 * ยิง count เป็นชุดละ 6 (ไม่ยิง 30 เส้นพร้อมกัน) · ตารางที่ไม่มี/นับไม่ได้ = ข้าม (ไม่ล้ม)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

type Ref = { table: string; column: string; by: "id" | "code"; label: string };

// ลำดับ = ลำดับที่โชว์ให้ผู้ใช้ (เอกสารสำคัญก่อน)
const REFS: Ref[] = [
  { table: "sku_stock_movements", column: "sku_id", by: "id", label: "เคลื่อนไหวสต๊อก" },
  { table: "purchase_order_lines_v2", column: "item_sku_id", by: "id", label: "ใบสั่งซื้อ" },
  { table: "goods_receipt_lines_v2", column: "item_sku_id", by: "id", label: "ใบรับของ" },
  { table: "purchase_voucher_lines_v2", column: "item_sku_id", by: "id", label: "ใบซื้อ/ใบสำคัญรับ" },
  { table: "purchase_requests_v2", column: "item_sku_id", by: "id", label: "ใบขอซื้อ" },
  { table: "erp_playground_so_lines", column: "sku", by: "code", label: "ใบขาย" },
  { table: "so_order_lines", column: "sku", by: "code", label: "ใบสั่งขาย" },
  { table: "erp_playground_quote_lines", column: "sku", by: "code", label: "ใบเสนอราคา" },
  { table: "erp_playground_delivery_note_lines", column: "sku", by: "code", label: "ใบส่งสินค้า" },
  { table: "erp_playground_credit_note_lines", column: "sku", by: "code", label: "ใบลดหนี้" },
  { table: "manufacturing_orders", column: "product_sku", by: "code", label: "ใบสั่งผลิต" },
  { table: "mo_work_orders", column: "product_sku", by: "code", label: "ใบงานผลิต" },
  { table: "qc_warehouse_items", column: "sku", by: "code", label: "โกดัง QC" },
  { table: "stock_lots", column: "item_sku", by: "code", label: "ล็อตสต๊อก" },
  { table: "material_requirements", column: "item_sku", by: "code", label: "ความต้องการวัตถุดิบ" },
  { table: "supplier_items", column: "item_sku_id", by: "id", label: "ราคาร้านค้า" },
  { table: "platform_catalog_listings", column: "sku_code", by: "code", label: "ลงขายแพลตฟอร์ม" },
  { table: "platform_order_items", column: "sku_code", by: "code", label: "ออเดอร์แพลตฟอร์ม" },
  { table: "store_order_items", column: "sku_id", by: "id", label: "ออเดอร์หน้าร้าน" },
  { table: "offer_sheet_items", column: "sku_id", by: "id", label: "ใบเสนอสินค้า" },
  { table: "design_sheet_cost_lines", column: "item_sku_id", by: "id", label: "ตีราคาใบงานออกแบบ" },
  { table: "erp_creative_tasks", column: "sku_id", by: "id", label: "งาน Creative" },
  { table: "erp_creative_content", column: "sku_id", by: "id", label: "คอนเทนต์" },
  { table: "sku_bundle_items", column: "sku_id", by: "id", label: "Bundle" },
  { table: "carton_labels", column: "sku_id", by: "id", label: "ใบปะหน้ากล่อง" },
];

export type SkuUsage = {
  used: boolean;            // มีที่ใช้อย่างน้อย 1 ที่ (หรือมีสต๊อกคงเหลือ)
  total: number;            // จำนวนรายการอ้างอิงรวม
  stock_qty: number;        // สต๊อกคงเหลือ (sku_stock_balances.qty_on_hand)
  refs: { label: string; count: number }[];   // เฉพาะที่ count > 0
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export async function skuUsage(admin: Admin, sku: { id: string; code: string | null }): Promise<SkuUsage> {
  const refs: { label: string; count: number }[] = [];
  const batch = 6;
  for (let i = 0; i < REFS.length; i += batch) {
    const part = REFS.slice(i, i + batch).filter((r) => r.by === "id" || (sku.code && sku.code.trim()));
    const results = await Promise.all(part.map(async (r) => {
      try {
        const val = r.by === "id" ? sku.id : (sku.code as string).trim();
        const { count, error } = await admin.from(r.table).select("*", { count: "exact", head: true }).eq(r.column, val);
        if (error) return null;   // ตารางไม่มี/สิทธิ์ไม่ถึง → ข้าม
        return { label: r.label, count: count ?? 0 };
      } catch { return null; }
    }));
    for (const x of results) if (x && x.count > 0) refs.push(x);
  }
  let stockQty = 0;
  try {
    const { data } = await admin.from("sku_stock_balances").select("qty_on_hand").eq("sku_id", sku.id).maybeSingle();
    stockQty = Number((data as { qty_on_hand?: number } | null)?.qty_on_hand ?? 0) || 0;
  } catch { /* ไม่มีตาราง */ }
  const total = refs.reduce((n, r) => n + r.count, 0);
  return { used: total > 0 || stockQty !== 0, total, stock_qty: stockQty, refs };
}
