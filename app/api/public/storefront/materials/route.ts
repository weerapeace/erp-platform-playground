/**
 * API สาธารณะสำหรับเว็บร้าน — 🧵 หน้าวัสดุ /api/public/storefront/materials[?slug=<slug>]
 *
 * ใครเรียกได้: ทุกคน (ไม่ต้องล็อกอิน) — เว็บร้านดึงไปทำหน้า /materials/<slug>
 * ปลอดภัยเพราะ: ส่งเฉพาะวัสดุที่เปิดใช้ + มีคำอธิบายแล้ว (มีหน้า) และเฉพาะช่องเนื้อหาหน้าเว็บ (lib/product-materials publicMaterial)
 *   ?slug=x  → { material } (ไม่พบ/ยังไม่มีหน้า = 404)
 *   ไม่ส่ง   → { materials: [{ slug, name, name_en?, image? }] } สำหรับ sitemap / หน้ารวม
 * ข้อมูลวัสดุแก้ที่ ERP /m/product_materials · ชื่อวัสดุในคำอธิบายสินค้าลิงก์มาเอง (products API materialLinks)
 *
 * ⚠️ เหมือน products API: "ไม่มี guardApi" โดยเจตนา และมี CORS
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { hasMaterialPage, MATERIAL_SELECT, publicMaterial, type MaterialRow } from "@/lib/product-materials";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("slug") ?? "").trim().toLowerCase();
  const imageUrl = (key: string) => `${url.origin}/api/r2-image?key=${encodeURIComponent(key)}`;
  const sb = supabaseAdmin();

  if (slug) {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return json({ error: "ไม่พบวัสดุ" }, 404);
    const { data, error } = await sb.from("product_materials").select(MATERIAL_SELECT).eq("slug", slug).maybeSingle();
    if (error) return json({ error: "โหลดข้อมูลวัสดุไม่สำเร็จ" }, 500);
    const m = data as MaterialRow | null;
    if (!m || !hasMaterialPage(m)) return json({ error: "ไม่พบวัสดุ" }, 404);
    return json({ material: publicMaterial(m, imageUrl) });
  }

  const { data, error } = await sb.from("product_materials").select(MATERIAL_SELECT).eq("is_active", true).order("sort_order").order("name");
  if (error) return json({ error: "โหลดข้อมูลวัสดุไม่สำเร็จ" }, 500);
  const materials = ((data ?? []) as MaterialRow[]).filter(hasMaterialPage).map((m) => {
    const p = publicMaterial(m, imageUrl);
    const nameEn = String(m.name_en ?? "").trim();
    return { slug: p.slug, name: p.name, ...(nameEn ? { name_en: nameEn } : {}), ...(p.image ? { image: p.image } : {}) };
  });
  return json({ materials });
}
