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
  productSpecAttrs,
  PARENT_SELECT,
  CHILD_SELECT,
  type ParentRow,
  type ChildSku,
} from "@/lib/website-field-map";
import { cleanDetailOverrides } from "@/lib/website-detail-overrides";

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
    // ⚠️ ห้ามแคชที่ขอบเครือข่าย (Vercel CDN) — ไม่งั้นเว็บร้านล้างแคชแล้วยังได้รายการสินค้าเก่าอีก ≤6 นาที
    // (เว็บร้านแคชเองด้วย tag 'site-config' และ ERP สั่งล้างหลังบันทึก/เผยแพร่อยู่แล้ว) — site/page ใช้ no-store เหมือนกัน
    headers: { ...CORS, "Cache-Control": "no-store" },
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
      "parent_sku_id, is_published, featured, sort_order, web_name, web_price, web_description, web_images, web_sku_images, web_details, web_unit, web_category, web_options, web_badge, web_stock_status, web_swatch"
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

  // แกลเลอรีของ Parent SKU (รูปปก + รูปเพิ่มเติม) — ⚙️ แบนเนอร์เลือก "รูปจากแกลเลอรี Parent SKU" ได้
  const parentGallery = new Map<string, string[]>();
  const { data: pAtt } = await sb
    .from("erp_playground_attachments")
    .select("entity_id, file_path, content_type, is_primary, sort_order")
    .eq("entity_type", "parent_skus_v2")
    .in("entity_id", parentIds)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  for (const a of (pAtt ?? []) as { entity_id: string; file_path: string | null; content_type: string | null }[]) {
    if (!a.file_path || (a.content_type && !a.content_type.startsWith("image/"))) continue;
    const arr = parentGallery.get(a.entity_id) ?? [];
    if (!arr.includes(a.file_path) && arr.length < 12) arr.push(a.file_path);
    parentGallery.set(a.entity_id, arr);
  }

  // อันดับขายดี (จากออเดอร์บนเว็บของร้านนี้ ไม่รวมยกเลิก) — ส่งเป็น "อันดับ" ไม่ส่งจำนวนจริง
  const salesRank = new Map<string, number>();
  {
    const { data: orders } = await sb.from("store_orders").select("id").eq("shop_id", s.id).neq("status", "cancelled").order("created_at", { ascending: false }).limit(2000);
    const orderIds = ((orders ?? []) as { id: string }[]).map((o) => o.id);
    if (orderIds.length) {
      const { data: items } = await sb.from("store_order_items").select("parent_code, qty").in("order_id", orderIds);
      const qtyByCode = new Map<string, number>();
      for (const it of (items ?? []) as { parent_code: string | null; qty: number | string | null }[]) {
        const c = (it.parent_code ?? "").toUpperCase();
        if (c) qtyByCode.set(c, (qtyByCode.get(c) ?? 0) + (Number(it.qty) || 0));
      }
      [...qtyByCode.entries()].sort((a, b) => b[1] - a[1]).forEach(([c], i) => salesRank.set(c, i + 1));
    }
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
      const detailOverrides = cleanDetailOverrides(l.web_details);
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
        // รูปต่อสี (r2 key → URL) ให้เว็บสลับรูปใหญ่ตอนเลือกสี
        // image = รูปแรก · images = ทั้งชุดของสีนั้น (เลือกไว้ในแท็บ 🛍 เว็บไซต์) → เว็บโชว์เฉพาะชุดนี้เมื่อเลือกสี
        options: r.options
          ? {
              ...r.options,
              items: r.options.items.map((it) => ({
                ...it,
                image: it.image ? imageUrl(it.image) : undefined,
                images: it.images?.length ? it.images.map(imageUrl) : undefined,
              })),
            }
          : null,
        /** ตัวเลือกกลุ่มที่ 2 (null = สินค้าชิ้นนี้มีตัวเลือกชั้นเดียว) — เว็บเก่าที่ยังไม่รู้จักจะข้ามไปเอง */
        options2: r.options2,
        featured: Boolean(l.featured),
        /** ฟิลด์สเปกจาก Parent SKU (วัสดุ/ขนาด/น้ำหนัก…) สำหรับหัวข้อ "ฟิลด์จาก Parent SKU" ในชุดรายละเอียดสินค้า */
        attrs: productSpecAttrs(p),
        images: r.images.map(imageUrl),
        /** รูปปก + แกลเลอรีของ Parent SKU (แยกจาก images ที่อาจมาจาก SKU ลูก) */
        parentImages: [...new Set([...(p.cover_image_r2_key ? [p.cover_image_r2_key] : []), ...(parentGallery.get(p.id) ?? [])])].map(imageUrl),
        /** คอลเลกชันใน ERP (id) — ใช้จับกลุ่มสินค้าที่เกี่ยวข้อง */
        collection: p.collection_id ?? null,
        /** อันดับขายดีบนเว็บ (1 = ขายดีสุด) — ไม่มี = ยังไม่เคยขาย */
        salesRank: salesRank.get(code.toUpperCase()) ?? null,
        /** จับคู่รายละเอียดหน้าเว็บเฉพาะรุ่น { itemId: { show, text } } — ไม่มี = ตามชุดรายละเอียดกลางของธีม */
        detailOverrides: Object.keys(detailOverrides).length ? detailOverrides : undefined,
      };
    })
    .filter(Boolean);

  return json({ shop: shopSlug, shopName: s.name, count: products.length, products });
}
