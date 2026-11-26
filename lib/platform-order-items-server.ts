/**
 * 🖼 รายการสินค้าของออเดอร์ + รูป/สี/กล่อง/น้ำหนัก (ศูนย์ออเดอร์ · 2026-11-19) — ฝั่งเซิร์ฟเวอร์เท่านั้น
 * รูป = รูปของ SKU ก่อน → ไม่มีใช้รูป Parent SKU (แบบเดียวกับสถานีแพ็ก /api/packing)
 * ใช้ที่: /api/platform-orders (รายการ = คอลัมน์สินค้า · รายละเอียด = ลิ้นชัก)
 */
import { bestGuess, shopCodeGuesses } from "@/lib/packing";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

export type LooseGuess = { skuId: string | null; parentId: string | null; by: "code" | "listing"; code: string | null };
type LooseItem = { id: string; sku_code: string | null; matched_sku_id: string | null; matched_parent_sku_id: string | null; raw?: unknown; platform_id?: string | null };

/**
 * 🔎 เดาสินค้าของบรรทัดที่ยังจับคู่ไม่ได้ (ของกลาง · แสดงผลอย่างเดียว ไม่บันทึกการจับคู่) — ใช้ที่สถานีแพ็ก + ศูนย์ออเดอร์
 *   1) รหัสร้านที่มีของต่อท้าย เช่น ไซซ์ "MGN369-01XXL" / "WK45-02D/2" → รหัสลูก/รหัสรุ่นที่ยาวที่สุดที่มีจริง (lib/packing shopCodeGuesses)
 *   2) listing ในร้านที่เคยจับคู่รุ่นไว้แล้ว (platform_catalog_listings) — ถ้ารหัสลูกที่เดาได้อยู่คนละรุ่นกับ listing เชื่อ listing
 *   item.platform_id = ร้านของออเดอร์ (ไม่ส่ง = ข้ามข้อ 2)
 */
export async function guessLooseItems(admin: Admin, items: LooseItem[]): Promise<Map<string, LooseGuess>> {
  const guess = new Map<string, LooseGuess>();
  const loose = items.filter((i) => !i.matched_sku_id && !i.matched_parent_sku_id);
  if (!loose.length) return guess;
  const s = (v: unknown) => (v == null || v === "" ? null : String(v));
  const itemIdOf = (i: LooseItem) => s((i.raw as Record<string, unknown> | null | undefined)?.item_id);
  const guessCodes = [...new Set(loose.flatMap((i) => shopCodeGuesses(s(i.sku_code))))];
  const byPlatform = new Map<string, string[]>();
  for (const i of loose) { const ext = itemIdOf(i); if (ext && i.platform_id) byPlatform.set(i.platform_id, [...(byPlatform.get(i.platform_id) ?? []), ext]); }
  type R = Record<string, unknown>;
  const [gs, gp, gl] = await Promise.all([
    inChunks<R>(guessCodes, (p) => admin.from("skus_v2").select("id, code, parent_sku_id").in("code", p)),
    inChunks<R>(guessCodes, (p) => admin.from("parent_skus_v2").select("id, code").in("code", p)),
    Promise.all([...byPlatform.entries()].map(([pid, ext]) => inChunks<R>([...new Set(ext)], (p) => admin.from("platform_catalog_listings").select("platform_id, external_product_id, matched_parent_sku_id").eq("platform_id", pid).in("external_product_id", p).not("matched_parent_sku_id", "is", null)))).then((x) => x.flat()),
  ]);
  const skuByCode = new Map(gs.map((r) => [String(r.code).toUpperCase(), r]));
  const parByCode = new Map(gp.map((r) => [String(r.code).toUpperCase(), r]));
  const listParent = new Map(gl.map((r) => [`${r.platform_id}|${r.external_product_id}`, String(r.matched_parent_sku_id)]));
  for (const i of loose) {
    const lp = listParent.get(`${i.platform_id ?? ""}|${itemIdOf(i) ?? ""}`) ?? null;
    const sc = bestGuess(s(i.sku_code), (c) => skuByCode.has(c));
    const sk = sc ? skuByCode.get(sc) : undefined;
    if (sk && (!lp || s(sk.parent_sku_id) === lp)) { guess.set(String(i.id), { skuId: String(sk.id), parentId: s(sk.parent_sku_id), by: "code", code: String(sk.code) }); continue; }
    if (lp) { guess.set(String(i.id), { skuId: null, parentId: lp, by: "listing", code: null }); continue; }
    const pc = bestGuess(s(i.sku_code), (c) => parByCode.has(c));
    const pr = pc ? parByCode.get(pc) : undefined;
    if (pr) guess.set(String(i.id), { skuId: null, parentId: String(pr.id), by: "code", code: String(pr.code) });
  }
  return guess;
}

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
  type It = { id: string; order_id: string; sku_code: string | null; name: string | null; qty: number | string | null; price: number | string | null; matched_sku_id: string | null; matched_parent_sku_id: string | null; raw?: unknown; guessed?: boolean };
  const rawItems = await inChunks<It>(orderIds, (p) => admin.from("platform_order_items").select("id, order_id, sku_code, name, qty, price, matched_sku_id, matched_parent_sku_id, raw:raw->item_id").in("order_id", p));
  // บรรทัดที่ยังจับคู่ไม่ได้ (รหัสร้านมีไซซ์/รหัสสลักต่อท้าย) → เดาด้วยตัวเดียวกับสถานีแพ็ก เพื่อโชว์รูป/สี (ไม่บันทึกการจับคู่)
  const platOf = new Map<string, string | null>();
  if (rawItems.some((i) => !i.matched_sku_id && !i.matched_parent_sku_id)) {
    const loIds = [...new Set(rawItems.filter((i) => !i.matched_sku_id && !i.matched_parent_sku_id).map((i) => i.order_id))];
    for (const o of await inChunks<{ id: string; platform_id: string | null }>(loIds, (p) => admin.from("platform_orders").select("id, platform_id").in("id", p))) platOf.set(o.id, o.platform_id);
  }
  const guesses = await guessLooseItems(admin, rawItems.map((i) => ({ ...i, raw: { item_id: i.raw }, platform_id: platOf.get(i.order_id) ?? null })));
  const items: It[] = rawItems.map((i) => { const g = guesses.get(i.id); return g ? { ...i, matched_sku_id: g.skuId, matched_parent_sku_id: g.skuId ? null : g.parentId, guessed: true } : i; });
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
      matched_sku_id: i.guessed ? null : i.matched_sku_id, matched_parent_sku_id: i.guessed ? null : i.matched_parent_sku_id,
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
