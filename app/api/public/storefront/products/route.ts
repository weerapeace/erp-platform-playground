/**
 * API สาธารณะสำหรับเว็บร้านค้าภายนอก — /api/public/storefront/products?shop=<slug>
 *
 * ใครเรียกได้: ทุกคน (ไม่ต้องล็อกอิน) — เว็บร้าน เช่น IG International ดึงไปแสดงหน้าเว็บ
 * ปลอดภัยเพราะ: ส่งเฉพาะสินค้าที่ "เผยแพร่แล้ว" (is_published) ของร้านนั้น
 * และเลือกเฉพาะฟิลด์ที่ตั้งใจให้ลูกค้าเห็น — ไม่มีต้นทุน/ข้อมูลภายใน/สต๊อกจริง
 * (pattern เดียวกับ /api/offer-sheets/public/[token] ที่เปิดสาธารณะโดยตั้งใจ)
 *
 * ค่าที่ส่ง = store_listings ที่กรอกทับ ถ้าเว้นว่างจะดึงจาก Parent SKU ตาม shops.field_map
 * (ดู lib/website-field-map.ts)
 *
 * ⚠️ ต่างจาก API อื่นในระบบ: route นี้ "ไม่มี guardApi" โดยเจตนา และมี CORS
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeFieldMap,
  resolveProduct,
  PARENT_SELECT,
  CHILD_SELECT,
  type ParentRow,
  type ChildSku,
} from "@/lib/website-field-map";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// อ่านอย่างเดียว + เป็นข้อมูลที่ตั้งใจเผยแพร่อยู่แล้ว → อนุญาตทุกโดเมน แต่ห้ามส่ง cookie/credential
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { ...CORS, "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
  });

/** สร้าง slug จากรหัสสินค้า (ใช้เป็น URL บนเว็บร้าน) */
const slugify = (code: string) =>
  code.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || code;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  if (!shopSlug) return json({ error: "ต้องระบุ shop" }, 400);

  const sb = supabaseAdmin();

  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, status, field_map")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  const s = shop as { id: string; name: string; status: string; field_map: unknown };
  if (s.status !== "active") return json({ shop: shopSlug, products: [] });

  const fieldMap = normalizeFieldMap(s.field_map);

  const { data: listData } = await sb
    .from("store_listings")
    .select(
      "parent_sku_id, is_published, featured, sort_order, web_name, web_price, web_description, web_images, web_unit, web_category, web_options, web_badge, web_stock_status, web_swatch"
    )
    .eq("shop_id", s.id)
    .eq("is_published", true)
    .order("sort_order")
    .order("created_at");

  const rows = (listData ?? []) as Record<string, unknown>[];
  if (!rows.length) return json({ shop: shopSlug, shopName: s.name, count: 0, products: [] });

  const parentIds = rows.map((r) => r.parent_sku_id as string).filter(Boolean);

  const [{ data: parents }, { data: children }] = await Promise.all([
    sb.from("parent_skus_v2").select(PARENT_SELECT).in("id", parentIds),
    sb.from("skus_v2").select(CHILD_SELECT).in("parent_sku_id", parentIds).eq("is_active", true),
  ]);

  const parentById = new Map(((parents ?? []) as ParentRow[]).map((p) => [p.id, p]));

  const kidsByParent = new Map<string, ChildSku[]>();
  for (const k of (children ?? []) as (ChildSku & { parent_sku_id: string })[]) {
    const arr = kidsByParent.get(k.parent_sku_id) ?? [];
    arr.push(k);
    kidsByParent.set(k.parent_sku_id, arr);
  }

  // ชื่อหมวดใน ERP (ใช้จับคู่เป็นหมวดเว็บ)
  const catIds = [...new Set(((parents ?? []) as ParentRow[]).map((p) => p.category_id).filter(Boolean))] as string[];
  const catName = new Map<string, string>();
  if (catIds.length) {
    const { data: cats } = await sb.from("product_categories").select("id, name").in("id", catIds);
    for (const c of (cats ?? []) as { id: string; name: string }[]) catName.set(c.id, c.name);
  }

  // รูปเสิร์ฟผ่าน proxy สาธารณะของระบบ (/api/r2-image) — เว็บภายนอกใช้ URL นี้ได้เลย
  const origin = new URL(request.url).origin;
  const imageUrl = (key: string) => `${origin}/api/r2-image?key=${encodeURIComponent(key)}`;

  const products = rows
    .map((l) => {
      const p = parentById.get(l.parent_sku_id as string);
      if (!p) return null;

      const kids = kidsByParent.get(p.id) ?? [];
      const cat = p.category_id ? catName.get(p.category_id) ?? null : null;
      const r = resolveProduct(fieldMap, p, kids, l, cat);

      const code = p.code ?? "";
      return {
        id: p.id,
        code,
        slug: slugify(code),
        name: r.name,
        description: r.description,
        /** ราคาเป็น "บาท" (ไม่ใช่สตางค์) */
        price: r.price,
        unit: r.unit,
        category: r.category,
        badge: String(l.web_badge ?? "").trim(),
        stock: String(l.web_stock_status ?? "in").trim() || "in",
        swatch: String(l.web_swatch ?? "").trim(),
        options: r.options,
        featured: Boolean(l.featured),
        images: r.images.map(imageUrl),
      };
    })
    .filter(Boolean);

  return json({ shop: shopSlug, shopName: s.name, count: products.length, products });
}
