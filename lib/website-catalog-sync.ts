/**
 * "สินค้าบนเว็บของเราเอง" → รายการสินค้าของร้าน Website ในหน้าสินค้าบนแพลตฟอร์ม — ของกลาง (server)
 * ใช้: /api/platform-catalog/website-sync (ปุ่ม "ดึงสินค้าจาก Website" + ดึงเองตอนเปิดแท็บ Website)
 *
 * ทำไมไม่ต้องนำเข้าไฟล์: เว็บเป็นของเรา ข้อมูลอยู่ใน store_listings (ฐานข้อมูลเดียวกัน) อยู่แล้ว
 *   - 1 แถว store_listings (ร้านเว็บ × Parent SKU) = 1 สินค้าบนร้าน Website · external_product_id = id ของแถวนั้น
 *   - แบรนด์ = แบรนด์ของ Parent SKU (ร้านเว็บไม่ได้ผูกแบรนด์ · กฎเดียวกับคอลัมน์ Website ในเช็กข้ามร้าน)
 *   - ชื่อ/ราคา/รูป = "ที่ลูกค้าเห็นจริง" คิดด้วย resolveProduct ตัวเดียวกับหน้าเว็บ (ราคาเว็บกรอกทับ หรือราคาตาม SKU)
 *   - ราคาขีดฆ่า = resolveComparePrice ตัวเดียวกับเว็บ
 *   - เปิดขาย = is_published (ซ่อนไว้ = ปิดขาย) · อ่านอย่างเดียว ไม่แตะการตั้งค่า/สถานะเว็บจริง
 *   - ร้านเว็บที่ปิด (shops.status ≠ active) ไม่นับ
 * บันทึก + จับคู่ใช้ของกลาง lib/platform-catalog-sync (รหัส Parent ตรง = จับคู่ให้เอง · ไม่ทับคู่ที่คนจับไว้)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeFieldMap, resolveProduct, resolveComparePrice, PARENT_SELECT, CHILD_SELECT, type ParentRow, type ChildSku, type ListingRow, type FieldMap } from "@/lib/website-field-map";
import { fetchAllPages } from "@/lib/fetch-all";
import type { CatalogSyncItem } from "@/lib/platform-catalog-sync";

type Admin = ReturnType<typeof supabaseAdmin>;

/** ข้อมูลย่อที่เก็บใน raw.website (การ์ด/ตารางในหน้าจับคู่อ่านผ่าน summarizeListing) */
export type WebsiteRaw = {
  shop_id: string; shop_name: string; shop_slug: string | null;
  published: boolean;
  /** ราคาที่ลูกค้าจ่าย (ต่ำสุดของตัวเลือก) */
  price: number | null;
  /** ราคาขีดฆ่า (null = ไม่มี) */
  compare: number | null;
  /** รูปแรกบนเว็บ (ที่อยู่รูปย่อ) */
  image: string | null;
  variants: number;
  category: string | null;
};

const GROUP = 130;   // id ต่อคำขอ (ที่อยู่คำขอไม่ยาวเกิน · แบบเดียวกับ /api/website/listings)

const groupsOf = <T,>(xs: T[], n = GROUP): T[][] => { const out: T[][] = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out; };
const thumbUrl = (key: string) => (/^https?:\/\//.test(key) ? key : `/api/r2-image?key=${encodeURIComponent(key)}&w=200`);

/**
 * สินค้าบนเว็บทุกร้าน (ที่เปิดอยู่) ของแบรนด์นี้ → รายการพร้อมบันทึก
 * ร้านเว็บที่มีสินค้าแบรนด์นี้น้อยกว่า (เช่น Louis Montini 4 ตัวอยู่ในร้าน Pixiedustie) ต่อท้ายชื่อด้วยชื่อร้าน — ไม่ให้นับว่า "ซ้ำบนร้าน"
 * โยน error เมื่ออ่านข้อมูลไม่ครบ (ห้ามบันทึกครึ่ง ๆ แล้วติดป้าย "ไม่อยู่บนร้านแล้ว" ผิด)
 */
export async function loadWebsiteCatalogItems(admin: Admin, brandId: string): Promise<{ items: CatalogSyncItem[]; shops: { id: string; name: string; count: number }[] }> {
  const { data: shopRows, error: shopErr } = await admin.from("shops").select("id, name, slug, status, field_map");
  if (shopErr) throw new Error(`อ่านร้านเว็บไม่สำเร็จ: ${shopErr.message}`);
  const shops = ((shopRows ?? []) as { id: string; name: string | null; slug: string | null; status: string | null; field_map: unknown }[]).filter((s) => s.status === "active");
  if (!shops.length) return { items: [], shops: [] };
  const shopById = new Map(shops.map((s) => [s.id, s]));

  const listings = await fetchAllPages<Record<string, unknown> & { id: string; shop_id: string; parent_sku_id: string; is_published: boolean | null }>((from, to) =>
    admin.from("store_listings").select("*").in("shop_id", [...shopById.keys()]).order("id").range(from, to), { strict: true });
  const allParentIds = [...new Set(listings.map((l) => l.parent_sku_id).filter(Boolean))];
  if (!allParentIds.length) return { items: [], shops: [] };

  // Parent SKU ของแบรนด์นี้เท่านั้น
  const parentRes = await Promise.all(groupsOf(allParentIds).map((ids) => admin.from("parent_skus_v2").select(PARENT_SELECT).in("id", ids).eq("brand_id", brandId)));
  const bad = parentRes.find((r) => r.error);
  if (bad?.error) throw new Error(`อ่านสินค้าไม่สำเร็จ: ${bad.error.message}`);
  const parentById = new Map<string, ParentRow>();
  for (const r of parentRes) for (const p of (r.data ?? []) as unknown as ParentRow[]) parentById.set(p.id, p);
  const mine = listings.filter((l) => parentById.has(l.parent_sku_id));
  if (!mine.length) return { items: [], shops: [] };

  // SKU ลูก (ราคา/รูป/ตัวเลือก) — ไม่ครบ = ราคาผิด → strict
  const parentIds = [...new Set(mine.map((l) => l.parent_sku_id))];
  const kidParts = await Promise.all(groupsOf(parentIds).map((ids) =>
    fetchAllPages<ChildSku & { parent_sku_id: string }>((from, to) =>
      admin.from("skus_v2").select(CHILD_SELECT).in("parent_sku_id", ids).eq("is_active", true).order("code").order("id").range(from, to), { strict: true })));
  const kidsBy = new Map<string, ChildSku[]>();
  for (const k of kidParts.flat()) (kidsBy.get(k.parent_sku_id) ?? kidsBy.set(k.parent_sku_id, []).get(k.parent_sku_id)!).push(k);

  const catIds = [...new Set([...parentById.values()].map((p) => p.category_id).filter(Boolean))] as string[];
  const catName = new Map<string, string>();
  if (catIds.length) {
    const { data: cats } = await admin.from("product_categories").select("id, name").in("id", catIds);
    for (const c of (cats ?? []) as { id: string; name: string }[]) catName.set(c.id, c.name);
  }

  // ร้านหลักของแบรนด์ = ร้านที่มีสินค้าแบรนด์นี้มากที่สุด
  const countBy = new Map<string, number>();
  for (const l of mine) countBy.set(l.shop_id, (countBy.get(l.shop_id) ?? 0) + 1);
  const mainShop = [...countBy.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const maps = new Map<string, FieldMap>();
  const mapOf = (shopId: string) => maps.get(shopId) ?? maps.set(shopId, normalizeFieldMap(shopById.get(shopId)?.field_map)).get(shopId)!;

  const items: CatalogSyncItem[] = mine.map((l) => {
    const shop = shopById.get(l.shop_id)!;
    const parent = parentById.get(l.parent_sku_id)!;
    const kids = kidsBy.get(parent.id) ?? [];
    const r = resolveProduct(mapOf(shop.id), parent, kids, l as ListingRow, parent.category_id ? catName.get(parent.category_id) ?? null : null);
    const price = r.price > 0 ? r.price : null;
    const compare = price != null ? resolveComparePrice(parent.fake_price, kids, price) : null;
    const shopName = shop.name ?? "เว็บไซต์";
    const name = r.name || parent.code || "";
    const raw: WebsiteRaw = {
      shop_id: shop.id, shop_name: shopName, shop_slug: shop.slug ?? null,
      published: l.is_published === true, price, compare,
      image: r.images[0] ? thumbUrl(r.images[0]) : null,
      variants: kids.length, category: r.category || null,
    };
    return {
      external_product_id: l.id,
      title: l.shop_id === mainShop ? name : `${name} (เว็บ ${shopName})`,
      skus: parent.code ? [parent.code] : [],
      price,
      status: l.is_published === true ? "active" : "inactive",
      raw: { website: raw },
    };
  });
  return { items, shops: [...countBy.entries()].map(([id, count]) => ({ id, name: shopById.get(id)?.name ?? "เว็บไซต์", count })) };
}
