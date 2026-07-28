/**
 * จัดการสินค้าบนเว็บไซต์ (ทุกร้าน) — /api/website/listings
 * ใช้ในหน้า "เว็บไซต์" (/website) แท็บ "สินค้าบนเว็บ"
 *
 * GET  ?shop=<slug>              → ร้านทั้งหมด + สินค้าที่อยู่บนเว็บของร้านนั้น
 * GET  ?shop=<slug>&search=<q>   → ค้นหาสินค้า ERP (parent_skus_v2) ที่ยังไม่อยู่ในร้านนั้น (ไว้กดเพิ่ม)
 * POST { shopId, parentId, action:"add"|"remove" }  → เพิ่ม/เอาออกจากร้าน
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
  resolveProduct,
  PARENT_SELECT,
  CHILD_SELECT,
  type ParentRow as MapParentRow,
  type ChildSku,
} from "@/lib/website-field-map";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY_RE = /^[\w\-./%()]+$/; // r2 object key ที่ยอมรับ
const STOCK_STATUS = new Set(["in", "low", "preorder"]);

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
  if (!shops.length) return NextResponse.json({ shops: [], shop: null, listings: [], results: [] });

  const shop = shops.find((s) => s.slug === shopSlug) ?? shops[0];

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

  if (parentIds.length) {
    const [{ data: parents }, { data: mapParents }, { data: children }] = await Promise.all([
      sb.from("parent_skus_v2").select(PARENT_COLS).in("id", parentIds),
      sb.from("parent_skus_v2").select(PARENT_SELECT).in("id", parentIds),
      sb.from("skus_v2").select(CHILD_SELECT).in("parent_sku_id", parentIds).eq("is_active", true),
    ]);
    for (const p of (parents ?? []) as ParentRow[]) parentById.set(p.id, p);
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
    const mapped = mp
      ? resolveProduct(fieldMap, mp, kidsByParent.get(mp.id) ?? [], null, mp.category_id ? catName.get(mp.category_id) ?? null : null)
      : null;
    return {
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
    shop: { id: shop.id, name: shop.name, slug: shop.slug, isDefault: shop.is_default },
    listings,
    results,
  });
}

type Patch = {
  isPublished?: boolean;
  featured?: boolean;
  sortOrder?: number;
  webName?: string;
  webPrice?: number | null;
  webDescription?: string;
  webImages?: string[];
  webUnit?: string;
  webCategory?: string;
  webBadge?: string;
  webStockStatus?: string;
  webSwatch?: string;
  webOptions?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let b: { shopId?: string; parentId?: string; action?: string; patch?: Patch };
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!b.shopId || !b.parentId) return NextResponse.json({ error: "ต้องระบุ shopId + parentId" }, { status: 400 });

  const sb = supabaseAdmin();
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };

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
  const row: Record<string, unknown> = {
    shop_id: b.shopId,
    parent_sku_id: b.parentId,
    updated_at: new Date().toISOString(),
  };
  const text = (v: unknown, max: number) => String(v ?? "").slice(0, max).trim() || null;

  if (p.isPublished !== undefined) row.is_published = !!p.isPublished;
  if (p.featured !== undefined) row.featured = !!p.featured;
  if (p.sortOrder !== undefined) row.sort_order = Number(p.sortOrder) || 0;
  if (p.webName !== undefined) row.web_name = text(p.webName, 200);
  if (p.webPrice !== undefined) row.web_price = p.webPrice == null ? null : Number(p.webPrice) || null;
  if (p.webDescription !== undefined) row.web_description = text(p.webDescription, 3000);
  if (p.webUnit !== undefined) row.web_unit = text(p.webUnit, 40);
  if (p.webCategory !== undefined) row.web_category = text(p.webCategory, 60);
  if (p.webBadge !== undefined) row.web_badge = text(p.webBadge, 40);
  if (p.webSwatch !== undefined) row.web_swatch = text(p.webSwatch, 300);
  if (p.webStockStatus !== undefined) {
    const s = String(p.webStockStatus ?? "").trim();
    row.web_stock_status = STOCK_STATUS.has(s) ? s : null;
  }
  if (p.webImages !== undefined) {
    const keys = (Array.isArray(p.webImages) ? p.webImages : [])
      .filter((k) => typeof k === "string" && KEY_RE.test(k))
      .slice(0, 12);
    row.web_images = keys.length ? keys : null;
  }
  if (p.webOptions !== undefined) {
    // รูปแบบ: { label: string, items: [{ id, label, swatch? }] }
    const o = p.webOptions as { label?: unknown; items?: unknown } | null;
    if (!o || !Array.isArray(o.items) || !o.items.length) {
      row.web_options = null;
    } else {
      const items = (o.items as Record<string, unknown>[])
        .slice(0, 24)
        .map((it) => ({
          id: text(it.id, 40) ?? "",
          label: text(it.label, 80) ?? "",
          swatch: text(it.swatch, 80),
        }))
        .filter((it) => it.id && it.label);
      row.web_options = items.length ? { label: text(o.label, 60) ?? "ตัวเลือก", items } : null;
    }
  }

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
