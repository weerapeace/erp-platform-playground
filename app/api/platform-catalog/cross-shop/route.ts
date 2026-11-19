/**
 * เช็กข้ามร้าน — /api/platform-catalog/cross-shop (หน้าสินค้าบนแพลตฟอร์ม ?view=cross)
 *
 *  GET ?brand_id=  (products.platforms.view · อ่านอย่างเดียว ไม่ส่งอะไรขึ้นร้าน)
 *    → CrossShopResponse (lib/platform-cross-shop): ร้าน + แถวละ 1 Parent SKU × ช่องละ 1 ร้าน (สถานะ/ราคา/ชื่อ/รายละเอียด/สต๊อก/ตัวเลือก)
 *  ประกอบข้อมูลที่ lib/platform-cross-shop-server · ความพร้อมลงไม่อยู่ที่นี่ (หน้าเรียก /api/product-platforms/create-readiness ทีละแถวที่อยู่บนจอ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadCrossShop } from "@/lib/platform-cross-shop-server";
import type { CrossShopResponse } from "@/lib/platform-cross-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const brandId = (request.nextUrl.searchParams.get("brand_id") ?? "").trim();
  const empty: CrossShopResponse = { brand: null, shops: [], rows: [], unmatched: {}, error: null };
  if (!brandId) return NextResponse.json({ ...empty, error: "ต้องเลือกแบรนด์ก่อน" }, { status: 400, headers: NO_STORE });
  const t0 = Date.now();
  try {
    const data = await loadCrossShop(supabaseAdmin(), brandId);
    const body: CrossShopResponse = { ...data, error: null };
    return NextResponse.json(body, { headers: { ...NO_STORE, "Server-Timing": `load;dur=${Date.now() - t0}` } });
  } catch (e) {
    console.error("[cross-shop]", e);
    return NextResponse.json({ ...empty, error: "โหลดข้อมูลไม่สำเร็จ ลองกดรีเฟรชอีกครั้ง" }, { status: 500, headers: NO_STORE });
  }
}
