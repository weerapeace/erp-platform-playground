/**
 * โหลดออเดอร์แพลตฟอร์ม + รายการสินค้า สำหรับหน้ารายงานยอดขาย (ของกลาง · server เท่านั้น)
 * --------------------------------------------------------------------------
 * ใช้ที่: /api/platform-dashboard (แดชบอร์ดช่องทางขาย) · /api/marketing/overview (ภาพรวมการตลาด) · /api/cron/marketing-alert
 * ทำไมต้องมีตัวกลาง: PostgREST ตัดที่ 1,000 แถวเงียบ ๆ → ต้องไล่ทีละหน้า (fetchAllPages) + รายการสินค้าต้องถามทีละชุด id
 *   (URL ไม่ยาวเกิน) — เดิมเขียนอยู่ในแดชบอร์ดช่องทางขายที่เดียว ย้ายมาที่นี่ตอนทำหน้าการตลาด (2026-11-23) จะได้ไม่เขียนซ้ำ
 * สูตรยอด (มูลค่าสินค้า · ยอดลูกค้าจ่าย) = lib/platform-dashboard-calc · กติกานับเป็นยอดขาย = lib/platform-order-status countsAsSale
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { bkkStartIso, shiftYmd, type ItemLite } from "@/lib/platform-dashboard-calc";

type Admin = ReturnType<typeof supabaseAdmin>;

export type SalesOrderLite = { id: string; platform_id: string | null; status: string; platform_status: string | null; source: string | null; total: number | null; ordered_at?: string | null; brand_id?: string | null };

// ➕ brand_id (2026-11-25 แท็บโปรโมชั่น — แยกยอดรายวันต่อร้าน · เดิมถามแยกทีละ 500 ใบ ช้า 37 วินาที)
const ORDER_COLS = "id, platform_id, brand_id, status, platform_status, source, total, ordered_at";
const ITEM_COLS = "id, order_id, matched_sku_id, sku_code, name, qty, price";
const ITEM_CHUNK = 200;   // id ออเดอร์ต่อคำขอรายการสินค้า (URL ไม่ยาวเกิน · แถวไม่ถึงเพดาน 1,000)

/** ออเดอร์ตามฟิลเตอร์ ตั้งแต่วันไทย fromYmd (ไม่ใส่ = ทั้งหมด) ถึงสิ้นวันไทย toYmd (ไม่ใส่ = ล่าสุด) */
export async function loadPlatformOrders(admin: Admin, f: { platformId?: string | null; brandId?: string | null; fromYmd?: string | null; toYmd?: string | null }): Promise<SalesOrderLite[]> {
  return fetchAllPages<SalesOrderLite>((a, b) => {
    let q = admin.from("platform_orders").select(ORDER_COLS);
    if (f.platformId) q = q.eq("platform_id", f.platformId);
    if (f.brandId) q = q.eq("brand_id", f.brandId);
    if (f.fromYmd) q = q.gte("ordered_at", bkkStartIso(f.fromYmd));
    if (f.toYmd) q = q.lt("ordered_at", bkkStartIso(shiftYmd(f.toYmd, 1)));
    return q.order("id", { ascending: true }).range(a, b);
  });
}

/** รายการสินค้าของออเดอร์ (ถามทีละ 200 ใบ พร้อมกันทีละ 4 ชุด) */
export async function loadOrderItems(admin: Admin, orderIds: readonly string[]): Promise<ItemLite[]> {
  const ids = [...new Set(orderIds)];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += ITEM_CHUNK) chunks.push(ids.slice(i, i + ITEM_CHUNK));
  const items: ItemLite[] = [];
  for (let i = 0; i < chunks.length; i += 4) {
    const got = await Promise.all(chunks.slice(i, i + 4).map((part) => fetchAllPages<ItemLite>((a, b) =>
      admin.from("platform_order_items").select(ITEM_COLS).in("order_id", part).order("id", { ascending: true }).range(a, b))));
    for (const g of got) items.push(...g);
  }
  return items;
}
