/**
 * ลิงก์สินค้าบนร้าน (Shopee / Lazada / TikTok / LINE / เว็บ) ของ Parent SKU — ชิปลิงก์ในการ์ดสินค้าของ drawer โพสต์ Contents
 * GET /api/creative-content/shop-links?parent_id=<uuid>&brand_id=<uuid?>  → { data: ShopLink[] }  (ร้านที่ไม่มี = url null → ชิปเทา)
 * อ่านอย่างเดียว · ใช้ของกลาง lib/product-shop-links (ตัวเดียวกับการ์ดสินค้าในห้องแชท) · สิทธิ์ tasks.view
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { loadProductShopLinks } from "@/lib/product-shop-links";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const parentId = sp.get("parent_id") ?? "";
  const brandId = sp.get("brand_id");
  if (!UUID.test(parentId)) return NextResponse.json({ error: "ต้องระบุสินค้า" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: parent } = await admin.from("parent_skus_v2").select("id, code, brand_id").eq("id", parentId).maybeSingle();
  if (!parent) return NextResponse.json({ data: [], error: null });
  const p = parent as { id: string; code: string | null; brand_id: string | null };
  try {
    const data = await loadProductShopLinks(admin, { id: p.id, code: p.code ?? "", brand_id: p.brand_id }, { preferBrandId: brandId && UUID.test(brandId) ? brandId : null });
    return NextResponse.json({ data, error: null }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    return NextResponse.json({ error: `โหลดลิงก์ร้านไม่สำเร็จ: ${(e as Error).message}` }, { status: 500 });
  }
}
