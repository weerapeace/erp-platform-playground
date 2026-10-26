/**
 * 📂 จัดรูปหลายโฟลเดอร์ — ข้อมูลสินค้า + รูปเดิม ตามรหัสในชื่อโฟลเดอร์/ไฟล์ — POST /api/product-images/catalog
 * ใช้ที่ components/product-image-router (ลากหลายโฟลเดอร์ / หลายรุ่นทีเดียว)
 *
 * POST { codes: string[], parentIds?: string[] }
 *   codes = รหัสที่เจอในชื่อโฟลเดอร์/ไฟล์ (BCG11-01 · BCG12-01-L · BCG11) → หารุ่นจาก "รหัสรุ่น" (ตัดตามขีด) + "รหัส SKU ลูกตรงตัว"
 *           (SKU ลูก ~2,300 ตัวรหัสไม่ได้ขึ้นต้นด้วยรหัสรุ่น · ~100 ตัวเป็นตัวพิมพ์เล็ก → ส่งรหัสตามตัวพิมพ์เดิม + ตัวใหญ่)
 *   → { parents: RouteParent + รูปเดิม (galleryItems / skus[].items) , shops }
 * (ประวัติชุดอัป + "เคยอัปแล้ว" อยู่ที่ /api/product-images/batches)
 *      สี = SKU ตัวหลักของสี · รหัสไซส์ = aliases (ของกลาง colorGroups) · ร้านที่ขาย + รูปบนเว็บรายสี/Hero เดิมต่อร้าน
 * ของกลาง: guardApi(products.view) · colorGroups · codePrefixes (lib/product-image-routing)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { colorGroups, baseColor } from "@/lib/website-size-options";
import { normalizeHero } from "@/lib/website-hero";
import { toKeyList } from "@/lib/website-listing-patch";
import { codePrefixes, type RouteParent, type RouteSku } from "@/lib/product-image-routing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;
const CODE = /^[A-Za-z0-9][A-Za-z0-9#._-]{0,48}$/;
const MAX_PARENTS = 60;
const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

type Kid = { id: string; code: string | null; color: string | null; color_th: string | null; attribute_values: Record<string, unknown> | null; parent_sku_id: string };
type Att = { id: string; entity_id: string; file_path: string | null; is_primary: boolean | null; sort_order: number | null };
export type CatalogItem = { id: string; key: string; primary: boolean };
export type CatalogParent = Omit<RouteParent, "skus"> & { galleryItems: CatalogItem[]; pngKey: string | null; skus: (RouteSku & { items: CatalogItem[] })[] };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  let b: { codes?: unknown; parentIds?: unknown };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const codes = (Array.isArray(b.codes) ? b.codes : []).filter((c): c is string => typeof c === "string" && CODE.test(c.trim())).map((c) => c.trim()).slice(0, 300);
  const askIds = (Array.isArray(b.parentIds) ? b.parentIds : []).filter((s): s is string => typeof s === "string" && UUID.test(s)).slice(0, MAX_PARENTS);
  const sb = supabaseAdmin();

  // 1) หารุ่น: รหัสรุ่น (ตัดตามขีด) + รหัส SKU ลูกตรงตัว
  const variants = (c: string) => [...new Set([c, c.toUpperCase()])];
  const parentCodes = [...new Set(codes.flatMap((c) => codePrefixes(c).flatMap(variants)))];
  const skuCodes = [...new Set(codes.flatMap(variants))];
  const ids = new Set(askIds);
  for (const part of chunk(parentCodes, 200)) {
    const { data } = await sb.from("parent_skus_v2").select("id").in("code", part);
    for (const r of (data ?? []) as { id: string }[]) ids.add(r.id);
  }
  for (const part of chunk(skuCodes, 200)) {
    const { data } = await sb.from("skus_v2").select("parent_sku_id").in("code", part).not("parent_sku_id", "is", null);
    for (const r of (data ?? []) as { parent_sku_id: string }[]) ids.add(r.parent_sku_id);
  }
  const parentIds = [...ids].slice(0, MAX_PARENTS);
  const { data: shopRows } = await sb.from("shops").select("id, name, is_default").order("is_default", { ascending: false }).order("name");
  const shops = ((shopRows ?? []) as { id: string; name: string; is_default: boolean | null }[]).map((s) => ({ id: s.id, name: s.name, isDefault: !!s.is_default }));
  if (!parentIds.length) return NextResponse.json({ parents: [], shops, truncated: false });

  // 2) รุ่น + สี + รูปเดิม + ร้าน
  const [{ data: ps }, { data: kidRows }, { data: listingRows }, { data: descRows }] = await Promise.all([
    sb.from("parent_skus_v2").select("id, code, name_th, name_platform, png_image_r2_key").in("id", parentIds),
    sb.from("skus_v2").select("id, code, color, color_th, attribute_values, parent_sku_id").in("parent_sku_id", parentIds).eq("is_active", true).order("code"),
    sb.from("store_listings").select("shop_id, parent_sku_id, web_sku_images, web_hero").in("parent_sku_id", parentIds),
    sb.from("asset_usages").select("record_id").eq("module", "parent_sku_description").in("record_id", parentIds),
  ]);
  const kids = (kidRows ?? []) as Kid[];
  const kidsBy = new Map<string, Kid[]>();
  for (const k of kids) kidsBy.set(k.parent_sku_id, [...(kidsBy.get(k.parent_sku_id) ?? []), k]);

  const attBy = new Map<string, CatalogItem[]>();
  const entityIds = [...parentIds, ...kids.map((k) => k.id)];
  for (const part of chunk(entityIds, 150)) {
    const { data } = await sb
      .from("erp_playground_attachments")
      .select("id, entity_id, file_path, is_primary, sort_order")
      .in("entity_type", ["skus_v2", "parent_skus_v2"])
      .in("entity_id", part)
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true });
    for (const a of (data ?? []) as Att[]) {
      if (!a.file_path) continue;
      attBy.set(a.entity_id, [...(attBy.get(a.entity_id) ?? []), { id: a.id, key: a.file_path, primary: !!a.is_primary }]);
    }
  }
  const descCount = new Map<string, number>();
  for (const r of (descRows ?? []) as { record_id: string }[]) descCount.set(String(r.record_id), (descCount.get(String(r.record_id)) ?? 0) + 1);
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
    parents.push({
      parentId: p.id,
      code: p.code,
      name: (p.name_platform ?? "").trim() || (p.name_th ?? "").trim() || p.code,
      gallery: gallery.length,
      galleryItems: gallery,
      desc: descCount.get(p.id) ?? 0,
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
  return NextResponse.json({ parents, shops, truncated: ids.size > MAX_PARENTS });
}

