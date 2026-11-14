/**
 * 📂 ข้อมูลสินค้า + รูปเดิม ตามรหัสในชื่อโฟลเดอร์/ไฟล์ (ของกลางฝั่งเซิร์ฟเวอร์)
 * ใช้ร่วม: POST /api/product-images/catalog (ปุ่ม 📂 จัดรูปหลายโฟลเดอร์ในเว็บ) · POST /api/file-sort/plan สูตรงานสินค้า (ตัวแยกไฟล์ ERP)
 *
 * codes = รหัสที่เจอในชื่อโฟลเดอร์/ไฟล์ (BCG11-01 · BCG12-01-L · BCG11) → หารุ่นจาก "รหัสรุ่น" (ตัดตามขีด) + รหัส SKU ลูกตรงตัว
 *         (SKU ลูก ~2,300 ตัวรหัสไม่ได้ขึ้นต้นด้วยรหัสรุ่น · ~100 ตัวเป็นตัวพิมพ์เล็ก → ส่งทั้งตัวเดิม + ตัวใหญ่)
 * → { parents: RouteParent + รูปเดิม (galleryItems / skus[].items / descItems) , shops, truncated }
 *    สี = SKU ตัวหลักของสี · รหัสไซส์ = aliases (ของกลาง colorGroups) · ร้านที่ขาย + รูปบนเว็บรายสี/Hero ต่อร้าน
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { colorGroups, baseColor } from "@/lib/website-size-options";
import { normalizeHero } from "@/lib/website-hero";
import { toKeyList } from "@/lib/website-listing-patch";
import { codePrefixes, type RouteParent, type RouteSku } from "@/lib/product-image-routing";
import { fetchAllPages } from "@/lib/fetch-all";

type Admin = ReturnType<typeof supabaseAdmin>;

const UUID = /^[0-9a-f-]{36}$/i;
const CODE = /^[A-Za-z0-9][A-Za-z0-9#._-]{0,48}$/;
export const CATALOG_MAX_PARENTS = 60;
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

type Kid = { id: string; code: string | null; color: string | null; color_th: string | null; attribute_values: Record<string, unknown> | null; parent_sku_id: string };
type Att = { id: string; entity_id: string; file_path: string | null; is_primary: boolean | null; sort_order: number | null };
export type CatalogItem = { id: string; key: string; primary: boolean };
/** รูป Description เดิม (ลำดับ) — ใช้ตอน "แทนที่" + ย้อนคืน */
export type CatalogDescItem = { assetId: string; sort: number | null };
export type CatalogParent = Omit<RouteParent, "skus"> & { galleryItems: CatalogItem[]; descItems: CatalogDescItem[]; pngKey: string | null; skus: (RouteSku & { items: CatalogItem[] })[] };
export type CatalogShop = { id: string; name: string; isDefault: boolean };
export type ImageCatalog = { parents: CatalogParent[]; shops: CatalogShop[]; truncated: boolean };

/** ทำความสะอาดคำขอ (รหัส/ id ที่รูปแบบผิดทิ้งไป) */
export function cleanCatalogRequest(raw: { codes?: unknown; parentIds?: unknown }): { codes: string[]; parentIds: string[] } {
  const codes = (Array.isArray(raw.codes) ? raw.codes : []).filter((c): c is string => typeof c === "string" && CODE.test(c.trim())).map((c) => c.trim()).slice(0, 300);
  const parentIds = (Array.isArray(raw.parentIds) ? raw.parentIds : []).filter((s): s is string => typeof s === "string" && UUID.test(s)).slice(0, CATALOG_MAX_PARENTS);
  return { codes, parentIds };
}

export async function loadImageCatalog(sb: Admin, req: { codes: string[]; parentIds: string[] }): Promise<ImageCatalog> {
  // 1) หารุ่น: รหัสรุ่น (ตัดตามขีด) + รหัส SKU ลูกตรงตัว
  const variants = (c: string) => [...new Set([c, c.toUpperCase()])];
  const parentCodes = [...new Set(req.codes.flatMap((c) => codePrefixes(c).flatMap(variants)))];
  const skuCodes = [...new Set(req.codes.flatMap(variants))];
  const ids = new Set(req.parentIds);
  for (const part of chunk(parentCodes, 200)) {
    const { data } = await sb.from("parent_skus_v2").select("id").in("code", part);
    for (const r of (data ?? []) as { id: string }[]) ids.add(r.id);
  }
  for (const part of chunk(skuCodes, 200)) {
    const { data } = await sb.from("skus_v2").select("parent_sku_id").in("code", part).not("parent_sku_id", "is", null);
    for (const r of (data ?? []) as { parent_sku_id: string }[]) ids.add(r.parent_sku_id);
  }
  // รหัสรุ่นที่ไม่มี Parent ชื่อตรง (เช่น MGN150 อยู่ใน Parent รวม "MGN150, MGN156, MGN159") → หาจาก SKU ที่ขึ้นต้น "MGN150-" (2026-11-14)
  const modelLike = [...new Set(req.codes.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]+\d+[A-Z0-9]*$/.test(c)))].slice(0, 60);
  for (const part of chunk(modelLike, 20)) {
    const { data } = await sb.from("skus_v2").select("parent_sku_id").or(part.map((c) => `code.ilike.${c}-*`).join(",")).not("parent_sku_id", "is", null).limit(400);
    for (const r of (data ?? []) as { parent_sku_id: string }[]) ids.add(r.parent_sku_id);
  }
  const parentIds = [...ids].slice(0, CATALOG_MAX_PARENTS);
  const { data: shopRows } = await sb.from("shops").select("id, name, is_default").order("is_default", { ascending: false }).order("name");
  const shops = ((shopRows ?? []) as { id: string; name: string; is_default: boolean | null }[]).map((s) => ({ id: s.id, name: s.name, isDefault: !!s.is_default }));
  if (!parentIds.length) return { parents: [], shops, truncated: false };

  // 2) รุ่น + สี + รูปเดิม + ร้าน
  // SKU ลูกของ 60 รุ่นเกิน 1,000 ได้ (เพดานต่อครั้งของฐานข้อมูล) → ไล่ดึงทีละหน้า ไม่งั้นรุ่นท้าย ๆ ขึ้น 0 สี
  const [{ data: ps }, kids, { data: listingRows }, { data: descRows }] = await Promise.all([
    sb.from("parent_skus_v2").select("id, code, name_th, name_platform, png_image_r2_key").in("id", parentIds),
    fetchAllPages<Kid>((from, to) =>
      sb.from("skus_v2").select("id, code, color, color_th, attribute_values, parent_sku_id").in("parent_sku_id", parentIds).eq("is_active", true).order("code").order("id").range(from, to)),
    sb.from("store_listings").select("shop_id, parent_sku_id, web_sku_images, web_hero").in("parent_sku_id", parentIds),
    sb.from("asset_usages").select("record_id, asset_id, sort_order").eq("module", "parent_sku_description").is("field", null).in("record_id", parentIds),
  ]);
  const kidsBy = new Map<string, Kid[]>();
  for (const k of kids) kidsBy.set(k.parent_sku_id, [...(kidsBy.get(k.parent_sku_id) ?? []), k]);

  const attBy = new Map<string, CatalogItem[]>();
  const entityIds = [...parentIds, ...kids.map((k) => k.id)];
  for (const part of chunk(entityIds, 150)) {
    const data = await fetchAllPages<Att>((from, to) => sb
      .from("erp_playground_attachments")
      .select("id, entity_id, file_path, is_primary, sort_order")
      .in("entity_type", ["skus_v2", "parent_skus_v2"])
      .in("entity_id", part)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to));
    for (const a of data) {
      if (!a.file_path) continue;
      attBy.set(a.entity_id, [...(attBy.get(a.entity_id) ?? []), { id: a.id, key: a.file_path, primary: !!a.is_primary }]);
    }
  }
  const descBy = new Map<string, CatalogDescItem[]>();
  for (const r of (descRows ?? []) as { record_id: string; asset_id: string; sort_order: number | null }[]) {
    descBy.set(String(r.record_id), [...(descBy.get(String(r.record_id)) ?? []), { assetId: String(r.asset_id), sort: r.sort_order ?? null }]);
  }
  type L = { shop_id: string; parent_sku_id: string; web_sku_images: unknown; web_hero: unknown };
  const listBy = new Map<string, L[]>();
  for (const l of (listingRows ?? []) as L[]) listBy.set(l.parent_sku_id, [...(listBy.get(l.parent_sku_id) ?? []), l]);

  const parents: CatalogParent[] = [];
  for (const p of (ps ?? []) as { id: string; code: string | null; name_th: string | null; name_platform: string | null; png_image_r2_key: string | null }[]) {
    if (!p.code) continue;
    const listings = listBy.get(p.id) ?? [];
    const webColor: Record<string, Record<string, number>> = {};
    const hero: Record<string, { desktop: boolean; mobile: boolean }> = {};
    for (const l of listings) {
      const imgs = (l.web_sku_images && typeof l.web_sku_images === "object" ? l.web_sku_images : {}) as Record<string, unknown>;
      webColor[l.shop_id] = Object.fromEntries(Object.entries(imgs).map(([k, v]) => [k, toKeyList(v).length]));
      const h = normalizeHero(l.web_hero);
      hero[l.shop_id] = { desktop: !!h?.desktop?.key, mobile: !!h?.mobile?.key };
    }
    const gallery = attBy.get(p.id) ?? [];
    const descItems = (descBy.get(p.id) ?? []).sort((a, b) => (a.sort ?? 1e9) - (b.sort ?? 1e9));
    parents.push({
      parentId: p.id,
      code: p.code,
      name: (p.name_platform ?? "").trim() || (p.name_th ?? "").trim() || p.code,
      gallery: gallery.length,
      galleryItems: gallery,
      desc: descItems.length,
      descItems,
      png: !!p.png_image_r2_key,
      pngKey: p.png_image_r2_key ?? null,
      shopIds: listings.map((l) => l.shop_id),
      webColor,
      hero,
      skus: colorGroups(kidsBy.get(p.id) ?? [])
        .filter((c) => c.base.code)
        .map(({ base, aliases }, i) => {
          const items = attBy.get(base.id) ?? [];
          return { id: base.id, code: base.code as string, label: baseColor(base) || `แบบ ${i + 1}`, aliases, gallery: items.length, items };
        }),
    });
  }
  parents.sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  return { parents, shops, truncated: ids.size > CATALOG_MAX_PARENTS };
}
