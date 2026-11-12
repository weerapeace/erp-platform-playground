/**
 * หน้าแบรนด์ — /api/brand-hub  (products.platforms.view · อ่านอย่างเดียว)
 *   GET                → { brands: HubBrandCard[] }  การ์ดทุกแบรนด์ (หน้าเลือกแบรนด์แบบ carousel)
 *   GET ?brand_id=<id> → { brand: HubDetail }         หน้าจัดการแบรนด์: ช่องทาง + ตัวเลขงานที่ต้องทำ
 * ตัวนับ = lib/brand-hub-server · กติกา = lib/brand-hub · ไม่ส่งกุญแจร้านออกไป
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { loadHubBrandCards, loadHubDetail } from "@/lib/brand-hub-server";
import type { HubBrandsResponse, HubDetailResponse } from "@/lib/brand-hub";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.view"); if (denied) return denied;
  const brandId = (new URL(request.url).searchParams.get("brand_id") ?? "").trim();
  const admin = supabaseAdmin();
  try {
    if (brandId) {
      if (!UUID.test(brandId)) return NextResponse.json({ brand: null, error: "รหัสแบรนด์ไม่ถูกต้อง" } satisfies HubDetailResponse, { status: 400 });
      const brand = await loadHubDetail(admin, brandId);
      if (!brand) return NextResponse.json({ brand: null, error: "ไม่พบแบรนด์นี้" } satisfies HubDetailResponse, { status: 404 });
      return NextResponse.json({ brand, error: null } satisfies HubDetailResponse);
    }
    return NextResponse.json({ brands: await loadHubBrandCards(admin), error: null } satisfies HubBrandsResponse);
  } catch (e) {
    console.error("[brand-hub]", (e as Error).message);
    // ข้อมูลไม่ครบ = ไม่ส่งตัวเลขผิด ๆ · 503 = ลองใหม่ได้
    return NextResponse.json({ error: "โหลดข้อมูลแบรนด์ไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 503 });
  }
}
