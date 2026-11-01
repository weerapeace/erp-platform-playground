/**
 * บันทึกว่า "รูปในคลังไฟล์ ถูกใช้บนหน้าขายบนเว็บของรุ่นไหน ร้านไหน" (asset_usages module "store_listing")
 * → คลังไฟล์โชว์ "ใช้อยู่ที่ไหน" (เช่น เว็บ Louis Montini · TTM114-01) + กันลบรูปที่ยังขึ้นเว็บ (DELETE /api/assets/[id] ตอบ 409)
 *
 * 1 แถว = 1 รูป 1 ช่อง: record_id = parent_sku_id · field = "<shopId>:<folder>[:<skuId>]" · sort_order = ลำดับในช่อง
 * ช่องรูปมาจากของกลาง listingImageSlots (lib/website-listing-images) — รวมวิดีโอ Hero ด้วย (กันลบ)
 * เรียกหลังบันทึกรูปหน้าขายบนเว็บทุกทาง: parent-web-listings · /api/website/listings (บันทึก/เอาออกจากร้าน) · ลงรูปทีละมาก · ย้อนกลับ
 * แถวที่ถูกลบออกจากร้านแล้ว = ล้าง usage ของร้านนั้นทิ้ง · รูปที่ไม่ได้อยู่ในคลังข้ามเงียบ ๆ · พังไม่ทำให้การบันทึกพัง (log ไว้)
 * เติมย้อนหลัง: scripts/backfill-store-listing-usages.cjs (ดูตัวเลขก่อน · --apply = เขียนจริง)
 */
import { LISTING_IMAGE_SELECT, listingImageSlots, type ListingImageRow, type ListingImageSlot } from "@/lib/website-listing-images";

type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;
type Pair = { shopId: string; parentId: string };
export type StoreListingUsageRow = { asset_id: string; module: string; record_id: string; record_label: string; field: string; sort_order: number };

export const STORE_LISTING_USAGE_MODULE = "store_listing";

const FOLDER_LABEL: Record<Exclude<ListingImageSlot["folder"], "sku">, string> = { gallery: "รูปบนเว็บ", hero: "รูปเปิด (Hero)", banner: "แบนเนอร์" };

const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export const storeListingUsageField = (shopId: string, s: Pick<ListingImageSlot, "folder" | "skuId">) =>
  `${shopId}:${s.folder}${s.folder === "sku" && s.skuId ? `:${s.skuId}` : ""}`;

/** แถว usage ที่ "ควรมี" ของคู่ร้าน+รุ่นที่ขอ (ยังไม่เขียน) · missingKeys = รูปบนเว็บที่ไม่อยู่ในคลัง (บันทึกไม่ได้) */
export async function planStoreListingUsages(sb: Admin, pairs: Pair[]): Promise<{ pairs: Pair[]; rows: StoreListingUsageRow[]; missingKeys: string[] }> {
  const want = new Map(pairs.filter((p) => p.shopId && p.parentId).map((p) => [`${p.shopId}|${p.parentId}`, p]));
  if (!want.size) return { pairs: [], rows: [], missingKeys: [] };
  const parentIds = [...new Set([...want.values()].map((p) => p.parentId))];

  const listings = new Map<string, ListingImageRow>();
  const codes = new Map<string, string>();
  for (const ids of chunk(parentIds, 150)) {
    const [{ data: ls }, { data: ps }, { data: ks }] = await Promise.all([
      sb.from("store_listings").select(`shop_id, parent_sku_id, ${LISTING_IMAGE_SELECT}`).in("parent_sku_id", ids),
      sb.from("parent_skus_v2").select("id, code").in("id", ids),
      sb.from("skus_v2").select("id, code").in("parent_sku_id", ids),
    ]);
    for (const l of (ls ?? []) as (ListingImageRow & { shop_id: string; parent_sku_id: string })[]) {
      const k = `${l.shop_id}|${l.parent_sku_id}`;
      if (want.has(k)) listings.set(k, l);
    }
    for (const r of [...((ps ?? []) as { id: string; code: string }[]), ...((ks ?? []) as { id: string; code: string }[])]) codes.set(r.id, r.code);
  }
  const { data: shops } = await sb.from("shops").select("id, name").in("id", [...new Set([...want.values()].map((p) => p.shopId))]);
  const shopName = new Map(((shops ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));

  // ช่องรูปที่ต้องมี (แถวที่ไม่มีแล้ว = ไม่มีรูป → ล้าง)
  const slots: { pair: Pair; slot: ListingImageSlot; order: number }[] = [];
  for (const [k, pair] of want) {
    const perField = new Map<string, number>();
    for (const slot of listingImageSlots(listings.get(k))) {
      const f = storeListingUsageField(pair.shopId, slot);
      const order = perField.get(f) ?? 0;
      perField.set(f, order + 1);
      slots.push({ pair, slot, order });
    }
  }
  const allKeys = [...new Set(slots.map((s) => s.slot.key))];
  // ⚠️ ทีละ 50 key — key ยาว ~60 ตัวอักษร ทีละ 200 ทำให้ URL ยาวเกินจนคำขอพังเงียบ (เคยนับรูปในคลังขาดไปเกือบหมด)
  const assetId = new Map<string, string>();
  for (const keys of chunk(allKeys, 50)) {
    const { data, error } = await sb.from("assets").select("id, r2_key").in("r2_key", keys);
    if (error) throw error;
    for (const a of (data ?? []) as { id: string; r2_key: string }[]) if (!assetId.has(a.r2_key)) assetId.set(a.r2_key, a.id);
  }
  const rows = slots.flatMap(({ pair, slot, order }) => {
    const id = assetId.get(slot.key);
    if (!id) return [];
    const shop = shopName.get(pair.shopId) ?? "ร้าน";
    const what = slot.folder === "sku" ? (codes.get(slot.skuId ?? "") ?? "สี") : `${codes.get(pair.parentId) ?? "สินค้า"} ${FOLDER_LABEL[slot.folder]}`;
    return [{ asset_id: id, module: STORE_LISTING_USAGE_MODULE, record_id: pair.parentId, record_label: `เว็บ ${shop} · ${what}`, field: storeListingUsageField(pair.shopId, slot), sort_order: order }];
  });
  return { pairs: [...want.values()], rows, missingKeys: allKeys.filter((k) => !assetId.has(k)) };
}

/** เขียนตามแผน: ล้างของเดิมของคู่ที่ขอ แล้วใส่ใหม่ทั้งชุด */
export async function applyStoreListingUsages(sb: Admin, plan: { pairs: Pair[]; rows: StoreListingUsageRow[] }): Promise<void> {
  for (const batch of chunk(plan.pairs, 10)) {
    const res = await Promise.all(batch.map((p) => sb.from("asset_usages").delete().eq("module", STORE_LISTING_USAGE_MODULE).eq("record_id", p.parentId).like("field", `${p.shopId}:%`)));
    const bad = res.find((r) => r.error);
    if (bad?.error) throw bad.error;
  }
  for (const part of chunk(plan.rows, 500)) {
    const { error } = await sb.from("asset_usages").upsert(part, { onConflict: "asset_id,module,record_id,field", ignoreDuplicates: true });
    if (error) throw error;
  }
}

export async function syncStoreListingUsages(sb: Admin, pairs: Pair[]): Promise<void> {
  try {
    await applyStoreListingUsages(sb, await planStoreListingUsages(sb, pairs));
  } catch (e) {
    // บันทึกหน้าเว็บสำคัญกว่า — ถ้าบันทึก "ใช้อยู่ที่ไหน" พัง แค่ log ไว้
    console.error("[store-listing-usage] sync failed", e);
  }
}
