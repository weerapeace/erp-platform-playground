/**
 * จัดการสินค้าบนเว็บไซต์ (ทุกร้าน) — /api/website/listings
 * ใช้ในหน้า "เว็บไซต์" (/website) แท็บ "สินค้าบนเว็บ"
 *
 * GET  ?shop=<slug>              → ร้านทั้งหมด + สินค้าที่อยู่บนเว็บของร้านนั้น
 * GET  ?shop=<slug>&search=<q>   → ค้นหาสินค้า ERP (parent_skus_v2) ที่ยังไม่อยู่ในร้านนั้น (ไว้กดเพิ่ม)
 * POST { shopId, parentId, action:"add"|"remove" }  → เพิ่ม/เอาออกจากร้าน
 * POST { shopId, parentIds:[], action:"addMany", publish? } → เพิ่มหลายรุ่นพร้อมกัน (ป๊อปเพิ่มสินค้าเข้าเว็บ · ค่าเริ่มต้น = ซ่อนไว้ก่อน)
 * POST { shopId, parentId, patch:{...} }            → แก้ข้อมูลเวอร์ชันเว็บ (store_listings)
 *
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin (store_* อยู่ DB เดียวกัน) + writeAudit
 * หมายเหตุ: ฟิลด์ web_unit/web_category/web_options/web_badge/web_stock_status/web_swatch
 * เพิ่มมาเพื่อร้านวัสดุ (IG International) — ร้านอื่นปล่อยว่างได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import {
  normalizeFieldMap,
  cleanCategoryKey,
  resolveCategories,
  resolveProduct,
  attachNameRefs,
  nameRuleNeedsRefs,
  PARENT_SELECT,
  CHILD_SELECT,
  type ParentRow as MapParentRow,
  type ChildSku,
  type ListingRow,
} from "@/lib/website-field-map";
import { SwatchIndex, swatchCss, rowToSwatchEntry, SWATCH_SELECT } from "@/lib/color-swatch";
import { loadShopSiteUrls } from "@/lib/website-site-url";
import { listingPatchToRow, cleanCategoryList, type ListingPatch } from "@/lib/website-listing-patch";
import { computeListingDisplay } from "@/lib/website-listing-display";
import { readFitCheckShops } from "@/lib/website-site-info";

export const dynamic = "force-dynamic";
export const revalidate = 0;


type ParentRow = {
  id: string;
  code: string | null;
  name_th: string | null;
  name_platform: string | null;
  description: string | null;
  platform_description: string | null;
  sale_price: number | string | null;
  final_price: number | string | null;
  cover_image_r2_key: string | null;
};

const displayName = (p: Pick<ParentRow, "name_platform" | "name_th" | "code">) =>
  (p.name_platform && p.name_platform.trim()) || (p.name_th && p.name_th.trim()) || p.code || "";

const erpPrice = (p: Pick<ParentRow, "final_price" | "sale_price">) =>
  Number(p.final_price) || Number(p.sale_price) || 0;

const PARENT_COLS =
  "id, code, name_th, name_platform, description, platform_description, sale_price, final_price, cover_image_r2_key";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const url = new URL(request.url);
  const shopSlug = (url.searchParams.get("shop") ?? "").trim();
  const search = (url.searchParams.get("search") ?? "").trim();

  const sb = supabaseAdmin();

  const { data: shopsData } = await sb
    .from("shops")
    .select("id, name, slug, is_default, status, field_map")
    .order("is_default", { ascending: false })
    .order("name");
  const shops = (shopsData ?? []) as {
    id: string;
    name: string;
    slug: string;
    is_default: boolean;
    status: string;
    field_map: unknown;
  }[];
  if (!shops.length)
    return NextResponse.json({ shops: [], shop: null, listings: [], results: [], notFound: true }, { status: 404 });

  // ระบุ slug มาแล้ว "ต้องเจอร้านนั้นจริง" — ห้าม fallback เป็นร้านแรกเงียบ ๆ
  // (ของเดิมพิมพ์ slug ผิด → เด้งไปร้านแรกโดยไม่บอก เสี่ยงนั่งแก้สินค้าผิดร้าน)
  // เทียบซ้ำแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ ให้ URL ต่างเคสยังเข้าได้
  const shop = shopSlug
    ? shops.find((s) => s.slug === shopSlug) ??
      shops.find((s) => s.slug.toLowerCase() === shopSlug.toLowerCase())
    : shops[0];
  if (!shop)
    return NextResponse.json(
      {
        shops: shops.map((s) => ({ id: s.id, name: s.name, slug: s.slug, isDefault: s.is_default })),
        shop: null,
        listings: [],
        results: [],
        notFound: true,
      },
      { status: 404 }
    );

  // สินค้าที่อยู่บนเว็บของร้านนี้
  const { data: listData } = await sb
    .from("store_listings")
    .select("*")
    .eq("shop_id", shop.id)
    .order("sort_order")
    .order("created_at");
  const rows = (listData ?? []) as Record<string, unknown>[];

  const parentIds = rows.map((r) => r.parent_sku_id as string).filter(Boolean);
  const parentById = new Map<string, ParentRow>();
  // ข้อมูลสำหรับคำนวณ "ค่าที่จะได้อัตโนมัติ" ตามการจับคู่ฟิลด์
  const fieldMap = normalizeFieldMap(shop.field_map);
  const mapParentById = new Map<string, MapParentRow>();
  const kidsByParent = new Map<string, ChildSku[]>();
  const catName = new Map<string, string>();
  // 🎨 ทะเบียนสีกลาง (จุดสีของแต่ละตัวเลือก — ตัวเดียวกับเว็บจริง) + 🌐 โดเมนร้าน (ลิงก์ดูหน้าเว็บ)
  const [{ data: swatchRows }, siteUrls] = await Promise.all([
    sb.from("erp_color_dictionary").select(SWATCH_SELECT).eq("is_active", true),
    loadShopSiteUrls(sb, [shop.id]),
  ]);
  const swatches = new SwatchIndex(((swatchRows ?? []) as Parameters<typeof rowToSwatchEntry>[0][]).map(rowToSwatchEntry));
  const siteUrl = siteUrls.get(shop.id) ?? null;
  const fitCheck = (await readFitCheckShops(sb)).has(shop.id);
  const thumb = (k: string) => `/api/r2-image?key=${encodeURIComponent(k)}&w=96`;

  if (parentIds.length) {
    const [{ data: parents }, { data: mapParents }, { data: children }] = await Promise.all([
      sb.from("parent_skus_v2").select(PARENT_COLS).in("id", parentIds),
      sb.from("parent_skus_v2").select(PARENT_SELECT).in("id", parentIds),
      sb.from("skus_v2").select(CHILD_SELECT).in("parent_sku_id", parentIds).eq("is_active", true),
    ]);
    for (const p of (parents ?? []) as ParentRow[]) parentById.set(p.id, p);
    if (nameRuleNeedsRefs(fieldMap)) await attachNameRefs(sb, (mapParents ?? []) as MapParentRow[]);
    for (const p of (mapParents ?? []) as MapParentRow[]) mapParentById.set(p.id, p);
    for (const k of (children ?? []) as (ChildSku & { parent_sku_id: string })[]) {
      const arr = kidsByParent.get(k.parent_sku_id) ?? [];
      arr.push(k);
      kidsByParent.set(k.parent_sku_id, arr);
    }
    const catIds = [
      ...new Set([...mapParentById.values()].map((p) => p.category_id).filter(Boolean)),
    ] as string[];
    if (catIds.length) {
      const { data: cats } = await sb.from("product_categories").select("id, name").in("id", catIds);
      for (const c of (cats ?? []) as { id: string; name: string }[]) catName.set(c.id, c.name);
    }
  }

  const listings = rows.map((l) => {
    const p = parentById.get(l.parent_sku_id as string);
    const mp = mapParentById.get(l.parent_sku_id as string);
    // ค่าที่เว็บจะใช้จริงถ้าไม่กรอกทับ (เอาไปโชว์เป็น placeholder ในหน้าจัดการ)
    const kids = mp ? kidsByParent.get(mp.id) ?? [] : [];
    const catLabel = mp?.category_id ? catName.get(mp.category_id) ?? null : null;
    // 👁 ค่าอัตโนมัติ + ค่าที่ "ลูกค้าเห็นจริง" (ของกลาง — ตัวเดียวกับตัวตั้งค่าเว็บของสินค้า)
    const view = mp ? computeListingDisplay({ fieldMap, parent: mp, kids, listing: l, categoryName: catLabel, swatches, siteUrl, code: p?.code ?? "", thumb, fitCheck }) : null;
    const mapped = view?.mapped ?? null;
    const display = view?.display ?? null;
    return {
      display,
      mapped,
      id: l.id as string,
      parentId: l.parent_sku_id as string,
      code: p?.code ?? "",
      erpName: p ? displayName(p) : "(ไม่พบสินค้าใน ERP)",
      erpPrice: p ? erpPrice(p) : 0,
      erpDescription: (p?.platform_description ?? p?.description ?? "") || "",
      erpImageKey: p?.cover_image_r2_key ?? null,
      published: Boolean(l.is_published),
      featured: Boolean(l.featured),
      sortOrder: Number(l.sort_order) || 0,
      webName: (l.web_name as string | null) ?? "",
      webPrice: l.web_price != null ? Number(l.web_price) : null,
      webDescription: (l.web_description as string | null) ?? "",
      webImages: Array.isArray(l.web_images) ? (l.web_images as string[]) : [],
      webUnit: (l.web_unit as string | null) ?? "",
      webCategory: (l.web_category as string | null) ?? "",
      /** 📂 หมวดหลายหมวด — null = ยังไม่เคยจัด (ใช้ mapped.categories แบบเดิม) */
      webCategories: Array.isArray(l.web_categories) ? (l.web_categories as string[]) : null,
      /** หมวดที่เว็บใช้จริงตอนนี้ (จัดเอง หรือแบบเดิม) */
      categories: view?.categories ?? resolveCategories(fieldMap, l.web_categories, String(l.web_category ?? "").trim()),
      webBadge: (l.web_badge as string | null) ?? "",
      webStockStatus: (l.web_stock_status as string | null) ?? "",
      webSwatch: (l.web_swatch as string | null) ?? "",
      webOptions: l.web_options ?? null,
    };
  });

  // โหมดค้นหาสินค้า ERP เพื่อเพิ่มเข้าร้าน
  let results: { id: string; code: string; name: string; price: number; imageKey: string | null }[] = [];
  if (search) {
    const term = search.replace(/[%,]/g, " ").trim();
    const { data: found } = await sb
      .from("parent_skus_v2")
      .select(PARENT_COLS)
      .eq("is_active", true)
      .or(`code.ilike.%${term}%,name_th.ilike.%${term}%,name_platform.ilike.%${term}%`)
      .limit(30);
    const already = new Set(parentIds);
    results = ((found ?? []) as ParentRow[])
      .filter((p) => !already.has(p.id))
      .map((p) => ({
        id: p.id,
        code: p.code ?? "",
        name: displayName(p),
        price: erpPrice(p),
        imageKey: p.cover_image_r2_key ?? null,
      }));
  }

  return NextResponse.json({
    shops: shops.map((s) => ({ id: s.id, name: s.name, slug: s.slug, isDefault: s.is_default })),
    shop: { id: shop.id, name: shop.name, slug: shop.slug, isDefault: shop.is_default, siteUrl },
    listings,
    results,
    /** หมวดของร้านนี้ (ตั้งเองได้ในแท็บจับคู่ฟิลด์) — ช่อง "หมวดบนเว็บ" ใช้รายการนี้ */
    categories: fieldMap.categories,
  });
}

type Patch = ListingPatch;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let b: { shopId?: string; parentId?: string; action?: string; patch?: Patch; items?: { parentId?: string; categories?: unknown }[]; category?: string; parentIds?: unknown; order?: unknown; publish?: unknown };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };
  const idList = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && !!x))].slice(0, 500) : []);

  // ☑️ ทำหลายรายการพร้อมกัน (หน้า "สินค้าบนเว็บ" → แถบล่าง) — parentIds + patch { isPublished?, featured? } เท่านั้น
  if (b.action === "bulk") {
    const ids = idList(b.parentIds);
    const p = b.patch ?? {};
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof p.isPublished === "boolean") upd.is_published = p.isPublished;
    if (typeof p.featured === "boolean") upd.featured = p.featured;
    if (!b.shopId || !ids.length || Object.keys(upd).length < 2) return NextResponse.json({ error: "ต้องระบุ shopId + parentIds + สิ่งที่จะเปลี่ยน" }, { status: 400 });
    const { error } = await sb.from("store_listings").update(upd).eq("shop_id", b.shopId).in("parent_sku_id", ids);
    if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
    await writeAudit(sb, { action: "bulk_update", entityType: "store_listing", entityId: b.shopId, ...actor, metadata: { count: ids.length, parentIds: ids, patch: { isPublished: p.isPublished, featured: p.featured } } });
    return NextResponse.json({ ok: true, count: ids.length });
  }

  // ➕ เพิ่มหลายรุ่นพร้อมกัน (ป๊อปเพิ่มสินค้าเข้าเว็บ) — ตัวที่อยู่ในร้านแล้วข้าม · publish=false (ค่าเริ่มต้น) = ซ่อนไว้ก่อนให้ไปตั้งรูป/ราคา/หมวด
  if (b.action === "addMany") {
    const ids = idList(b.parentIds);
    if (!b.shopId || !ids.length) return NextResponse.json({ error: "ต้องระบุ shopId + parentIds" }, { status: 400 });
    const publish = b.publish === true;
    const [{ data: have }, { data: real }] = await Promise.all([
      sb.from("store_listings").select("parent_sku_id").eq("shop_id", b.shopId).in("parent_sku_id", ids),
      sb.from("parent_skus_v2").select("id").in("id", ids),
    ]);
    const exists = new Set(((have ?? []) as { parent_sku_id: string }[]).map((r) => r.parent_sku_id));
    const valid = new Set(((real ?? []) as { id: string }[]).map((r) => r.id));
    const add = ids.filter((id) => valid.has(id) && !exists.has(id));
    if (add.length) {
      const { error } = await sb.from("store_listings").insert(add.map((id) => ({ shop_id: b.shopId, parent_sku_id: id, is_published: publish })));
      if (error) return NextResponse.json({ error: "เพิ่มเข้าร้านไม่สำเร็จ" }, { status: 500 });
      await writeAudit(sb, { action: "create", entityType: "store_listing", entityId: b.shopId, ...actor, metadata: { kind: "add_many", count: add.length, parentIds: add, published: publish } });
    }
    return NextResponse.json({ ok: true, added: add.length, skipped: ids.length - add.length });
  }

  // ⠿ เรียงลำดับบนเว็บ — order = parentId ทั้งร้านตามลำดับใหม่ → sort_order = ตำแหน่ง (เขียนเฉพาะตัวที่เปลี่ยน)
  if (b.action === "reorder") {
    const order = idList(b.order);
    if (!b.shopId || !order.length) return NextResponse.json({ error: "ต้องระบุ shopId + order" }, { status: 400 });
    const { data: cur } = await sb.from("store_listings").select("parent_sku_id, sort_order").eq("shop_id", b.shopId).in("parent_sku_id", order);
    const now = new Map(((cur ?? []) as { parent_sku_id: string; sort_order: number | null }[]).map((r) => [r.parent_sku_id, Number(r.sort_order) || 0]));
    const jobs = order.map((id, i) => ({ id, i })).filter(({ id, i }) => now.has(id) && now.get(id) !== i);
    const results = await Promise.all(
      jobs.map(({ id, i }) => sb.from("store_listings").update({ sort_order: i, updated_at: new Date().toISOString() }).eq("shop_id", b.shopId!).eq("parent_sku_id", id))
    );
    if (results.some((r) => r.error)) return NextResponse.json({ error: "เรียงลำดับไม่สำเร็จบางรายการ" }, { status: 500 });
    await writeAudit(sb, { action: "update", entityType: "store_listing", entityId: b.shopId, ...actor, metadata: { kind: "reorder", changed: jobs.length } });
    return NextResponse.json({ ok: true, changed: jobs.length });
  }

  // 📂 จัดสินค้าลงหมวดทีละหลายรุ่น (แท็บหมวดหมู่) — items: [{ parentId, categories }] ชุดหมวดใหม่ทั้งชุดของแต่ละรุ่น
  if (b.action === "setCategories") {
    if (!b.shopId || !Array.isArray(b.items) || !b.items.length) return NextResponse.json({ error: "ต้องระบุ shopId + items" }, { status: 400 });
    const items = b.items.slice(0, 500).filter((it) => typeof it?.parentId === "string" && it.parentId);
    let ok = 0;
    for (const it of items) {
      const { error } = await sb
        .from("store_listings")
        .update({ web_categories: cleanCategoryList(it.categories), updated_at: new Date().toISOString() })
        .eq("shop_id", b.shopId)
        .eq("parent_sku_id", it.parentId!);
      if (!error) ok++;
    }
    await writeAudit(sb, {
      action: "update",
      entityType: "store_listing",
      entityId: b.shopId,
      ...actor,
      metadata: { kind: "web_categories", category: b.category ?? null, count: ok, items: items.map((it) => ({ parentId: it.parentId, categories: cleanCategoryList(it.categories) })) },
    });
    if (ok < items.length) return NextResponse.json({ ok: false, error: `บันทึกได้ ${ok}/${items.length} รายการ` }, { status: 500 });
    return NextResponse.json({ ok: true, count: ok });
  }

  if (!b.shopId || !b.parentId) return NextResponse.json({ error: "ต้องระบุ shopId + parentId" }, { status: 400 });

  if (b.action === "add") {
    const { data: exists } = await sb
      .from("store_listings")
      .select("id")
      .eq("shop_id", b.shopId)
      .eq("parent_sku_id", b.parentId)
      .maybeSingle();
    if (!exists) {
      const { error } = await sb
        .from("store_listings")
        .insert({ shop_id: b.shopId, parent_sku_id: b.parentId, is_published: false });
      if (error) return NextResponse.json({ error: "เพิ่มเข้าร้านไม่สำเร็จ" }, { status: 500 });
      await writeAudit(sb, {
        action: "create",
        entityType: "store_listing",
        entityId: b.parentId,
        ...actor,
        metadata: { shopId: b.shopId },
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (b.action === "remove") {
    const { error } = await sb.from("store_listings").delete().eq("shop_id", b.shopId).eq("parent_sku_id", b.parentId);
    if (error) return NextResponse.json({ error: "เอาออกจากร้านไม่สำเร็จ" }, { status: 500 });
    await writeAudit(sb, {
      action: "delete",
      entityType: "store_listing",
      entityId: b.parentId,
      ...actor,
      metadata: { shopId: b.shopId },
    });
    return NextResponse.json({ ok: true });
  }

  const p = b.patch ?? {};
  // ของกลาง: ฟิลด์ชุดเดียวกับตัวตั้งค่าเว็บของสินค้า (/api/parent-web-listings)
  const row: Record<string, unknown> = { shop_id: b.shopId, parent_sku_id: b.parentId, updated_at: new Date().toISOString(), ...listingPatchToRow(p) };

  const { error } = await sb.from("store_listings").upsert(row, { onConflict: "shop_id,parent_sku_id" });
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  await writeAudit(sb, {
    action: "update",
    entityType: "store_listing",
    entityId: b.parentId,
    ...actor,
    metadata: { shopId: b.shopId, patch: p },
  });
  return NextResponse.json({ ok: true });
}
