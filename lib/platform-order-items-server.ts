/**
 * 🖼 รายการสินค้าของออเดอร์ + รูป/สี/กล่อง/น้ำหนัก (ศูนย์ออเดอร์ · 2026-11-19) — ฝั่งเซิร์ฟเวอร์เท่านั้น
 * รูป = รูปของ SKU ก่อน → ไม่มีใช้รูป Parent SKU (แบบเดียวกับสถานีแพ็ก /api/packing)
 * ใช้ที่: /api/platform-orders (รายการ = คอลัมน์สินค้า · รายละเอียด = ลิ้นชัก)
 */
type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export type OrderItemMedia = {
  id: string; order_id: string; sku_code: string | null; name: string | null; qty: number; price: number | null;
  matched_sku_id: string | null; matched_parent_sku_id: string | null;
  image_key: string | null; color: string | null; box_name: string | null; weight_g: number | null;
};

const CHUNK = 150;
async function inChunks<T>(ids: string[], run: (part: string[]) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await run(ids.slice(i, i + CHUNK));
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

/** รายการสินค้าของหลายออเดอร์ (เรียงตามลำดับเดิม) → Map order_id → รายการ */
export async function orderItemsWithMedia(admin: Admin, orderIds: string[]): Promise<Map<string, OrderItemMedia[]>> {
  const out = new Map<string, OrderItemMedia[]>();
  if (!orderIds.length) return out;
  type It = { id: string; order_id: string; sku_code: string | null; name: string | null; qty: number | string | null; price: number | string | null; matched_sku_id: string | null; matched_parent_sku_id: string | null };
  const items = await inChunks<It>(orderIds, (p) => admin.from("platform_order_items").select("id, order_id, sku_code, name, qty, price, matched_sku_id, matched_parent_sku_id").in("order_id", p));
  const skuIds = [...new Set(items.map((i) => i.matched_sku_id).filter((x): x is string => !!x))];
  type Sku = { id: string; cover_image_r2_key: string | null; parent_sku_id: string | null; color_th: string | null; color: string | null };
  const skus = await inChunks<Sku>(skuIds, (p) => admin.from("skus_v2").select("id, cover_image_r2_key, parent_sku_id, color_th, color").in("id", p));
  const skuById = new Map(skus.map((s) => [s.id, s]));
  const parentIds = [...new Set(items.map((i) => (i.matched_sku_id ? skuById.get(i.matched_sku_id)?.parent_sku_id : null) ?? i.matched_parent_sku_id).filter((x): x is string => !!x))];
  type Par = { id: string; cover_image_r2_key: string | null; weight_g: number | null; parcel_size_id: string | null };
  const parents = await inChunks<Par>(parentIds, (p) => admin.from("parent_skus_v2").select("id, cover_image_r2_key, weight_g, parcel_size_id").in("id", p));
  const parentById = new Map(parents.map((p) => [p.id, p]));
  const boxIds = [...new Set(parents.map((p) => p.parcel_size_id).filter((x): x is string => !!x))];
  const boxes = await inChunks<{ id: string; name: string | null }>(boxIds, (p) => admin.from("parcel_sizes").select("id, name").in("id", p));
  const boxName = new Map(boxes.map((b) => [b.id, b.name]));

  for (const i of items) {
    const sku = i.matched_sku_id ? skuById.get(i.matched_sku_id) : undefined;
    const par = parentById.get(sku?.parent_sku_id ?? i.matched_parent_sku_id ?? "");
    const row: OrderItemMedia = {
      id: i.id, order_id: i.order_id, sku_code: i.sku_code, name: i.name, qty: Number(i.qty) || 0, price: i.price == null ? null : Number(i.price),
      matched_sku_id: i.matched_sku_id, matched_parent_sku_id: i.matched_parent_sku_id,
      image_key: sku?.cover_image_r2_key || par?.cover_image_r2_key || null,
      color: sku?.color_th || sku?.color || null,
      box_name: par?.parcel_size_id ? boxName.get(par.parcel_size_id) ?? null : null,
      weight_g: par?.weight_g ? Number(par.weight_g) : null,
    };
    (out.get(i.order_id) ?? out.set(i.order_id, []).get(i.order_id)!).push(row);
  }
  return out;
}

/** สรุปสินค้าสำหรับคอลัมน์ในรายการ: 3 รายการแรก (ชิ้นมากสุดก่อน) + จำนวนรายการทั้งหมด */
export function productSummary(items: Pick<OrderItemMedia, "sku_code" | "name" | "qty" | "image_key">[]): { products: { sku_code: string | null; name: string | null; qty: number; image_key: string | null }[]; item_count: number } {
  const sorted = [...items].sort((a, b) => b.qty - a.qty);
  return { products: sorted.slice(0, 3).map(({ sku_code, name, qty, image_key }) => ({ sku_code, name, qty, image_key })), item_count: items.length };
}

/** คำค้น → id ออเดอร์ที่มีสินค้าชื่อ/รหัสตรง (สูงสุด 150 ใบล่าสุด — กัน URL ยาวเกิน) */
export async function orderIdsByProduct(admin: Admin, q: string): Promise<string[]> {
  if (q.length < 2) return [];
  const { data } = await admin.from("platform_order_items").select("order_id").or(`name.ilike.*${q}*,sku_code.ilike.*${q}*`).limit(600);
  return [...new Set(((data ?? []) as { order_id: string }[]).map((r) => r.order_id))].slice(0, 150);
}
