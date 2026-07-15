/**
 * Resolve brand — หาแบรนด์จากสินค้าที่เลือก (ให้ฟอร์มคอนเทนต์เติมแบรนด์อัตโนมัติ)
 *
 * GET /api/creative-content/resolve-brand?parent_sku_id=X   → { brand_id }
 * GET /api/creative-content/resolve-brand?sku_id=Y          → { brand_id }
 *
 * เส้นทาง: skus_v2.parent_sku_id → parent_skus_v2.brand_id (แบบเดียวกับ qc-warehouse)
 * คืนแค่ brand_id — ฝั่งหน้าเว็บมีรายชื่อแบรนด์ (ชื่อ/สี) อยู่แล้ว จับคู่เองได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const parentSkuId = (searchParams.get("parent_sku_id") ?? "").trim();
  const skuId = (searchParams.get("sku_id") ?? "").trim();
  const admin = supabaseAdmin();

  // มี Parent SKU → ใช้เลย · ไม่มี → หา Parent จาก SKU เดี่ยวก่อน
  let pid: string | null = parentSkuId || null;
  if (!pid && skuId) {
    const { data: sk } = await admin.from("skus_v2").select("parent_sku_id").eq("id", skuId).maybeSingle();
    pid = (sk as { parent_sku_id?: string | null } | null)?.parent_sku_id ?? null;
  }
  if (!pid) return NextResponse.json({ data: { brand_id: null }, error: null });

  const { data: par } = await admin.from("parent_skus_v2").select("brand_id").eq("id", pid).maybeSingle();
  const brandId = (par as { brand_id?: string | null } | null)?.brand_id ?? null;
  return NextResponse.json({ data: { brand_id: brandId }, error: null });
}
