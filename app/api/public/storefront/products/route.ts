/**
 * API สาธารณะสำหรับเว็บร้านค้าภายนอก — /api/public/storefront/products?shop=<slug>
 *
 * ใครเรียกได้: ทุกคน (ไม่ต้องล็อกอิน) — เว็บร้าน เช่น IG International ดึงไปแสดงหน้าเว็บ
 * ปลอดภัยเพราะ: ส่งเฉพาะสินค้าที่ "เผยแพร่แล้ว" (is_published) ของร้านนั้น
 * และเลือกเฉพาะฟิลด์ที่ตั้งใจให้ลูกค้าเห็น — ไม่มีต้นทุน/ข้อมูลภายใน/สต๊อกจริง
 * (pattern เดียวกับ /api/offer-sheets/public/[token] ที่เปิดสาธารณะโดยตั้งใจ)
 *
 * ⚠️ ต่างจาก API อื่นในระบบ: route นี้ "ไม่มี guardApi" โดยเจตนา และมี CORS
 * ให้เว็บภายนอกเรียกข้ามโดเมนได้ (ระบบเดิมไม่มี CORS ที่ไหนเลย จึงใส่เฉพาะจุดนี้)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

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

const displayName = (p: ParentRow) =>
  (p.name_platform && p.name_platform.trim()) || (p.name_th && p.name_th.trim()) || p.code || "";

/** สร้าง slug จากรหัสสินค้า (ใช้เป็น URL บนเว็บร้าน) */
const slugify = (code: string) =>
  code.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || code;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  if (!shopSlug) return json({ error: "ต้องระบุ shop" }, 400);

  const sb = supabaseAdmin();

  const { data: shop } = await sb
    .from("shops")
    .select("id, name, slug, status")
    .eq("slug", shopSlug)
    .maybeSingle();
  if (!shop) return json({ error: "ไม่พบร้าน" }, 404);
  if ((shop as { status: string }).status !== "active") return json({ shop: shopSlug, products: [] });

  const { data: listData } = await sb
    .from("store_listings")
    .select(
      "parent_sku_id, is_published, featured, sort_order, web_name, web_price, web_description, web_images, web_unit, web_category, web_options, web_badge, web_stock_status, web_swatch"
    )
    .eq("shop_id", (shop as { id: string }).id)
    .eq("is_published", true)
    .order("sort_order")
    .order("created_at");

  const rows = (listData ?? []) as Record<string, unknown>[];
  if (!rows.length) return json({ shop: shopSlug, products: [] });

  const { data: parents } = await sb
    .from("parent_skus_v2")
    .select("id, code, name_th, name_platform, description, platform_description, sale_price, final_price, cover_image_r2_key")
    .in(
      "id",
      rows.map((r) => r.parent_sku_id as string)
    );
  const parentById = new Map(((parents ?? []) as ParentRow[]).map((p) => [p.id, p]));

  // รูปเสิร์ฟผ่าน proxy สาธารณะของระบบ (/api/r2-image) — เว็บภายนอกใช้ URL นี้ได้เลย
  const origin = new URL(request.url).origin;
  const imageUrl = (key: string) => `${origin}/api/r2-image?key=${encodeURIComponent(key)}`;

  const products = rows
    .map((l) => {
      const p = parentById.get(l.parent_sku_id as string);
      if (!p) return null;
      const code = p.code ?? "";
      const keys = [
        ...(Array.isArray(l.web_images) ? (l.web_images as string[]) : []),
        ...(p.cover_image_r2_key ? [p.cover_image_r2_key] : []),
      ].filter((k) => typeof k === "string" && k);

      return {
        id: l.parent_sku_id as string,
        code,
        slug: slugify(code),
        name: (l.web_name as string | null)?.trim() || displayName(p),
        description:
          ((l.web_description as string | null) ?? "").trim() ||
          (p.platform_description ?? p.description ?? "").trim(),
        /** ราคาเป็น "บาท" (ไม่ใช่สตางค์) */
        price: l.web_price != null ? Number(l.web_price) : Number(p.final_price) || Number(p.sale_price) || 0,
        unit: ((l.web_unit as string | null) ?? "").trim(),
        category: ((l.web_category as string | null) ?? "").trim(),
        badge: ((l.web_badge as string | null) ?? "").trim(),
        stock: ((l.web_stock_status as string | null) ?? "in").trim(),
        swatch: ((l.web_swatch as string | null) ?? "").trim(),
        options: (l.web_options as unknown) ?? null,
        featured: Boolean(l.featured),
        images: [...new Set(keys)].map(imageUrl),
      };
    })
    .filter(Boolean);

  return json({ shop: shopSlug, shopName: (shop as { name: string }).name, count: products.length, products });
}
