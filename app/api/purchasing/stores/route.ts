/**
 * GET /api/purchasing/stores — รายชื่อร้าน (ของกลาง) สำหรับ pickup เลือกร้าน
 * รวมชื่อร้านที่เคยใช้จากใบขอซื้อ + ใบสั่งซื้อ + แหล่งซื้อที่ 2 ของ SKU (ไม่ซ้ำ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const admin = supabaseAdmin();
  const [pr, po, sku] = await Promise.all([
    admin.from("purchase_requests_v2").select("seller_name").eq("is_active", true).limit(8000),
    admin.from("purchase_orders_v2").select("seller_name").limit(8000),
    admin.from("skus_v2").select("alt_seller").not("alt_seller", "is", null).limit(8000),
  ]);
  const set = new Set<string>();
  const add = (v: unknown) => { const s = String(v ?? "").trim(); if (s && s !== "—") set.add(s); };
  for (const r of (pr.data ?? []) as Record<string, unknown>[]) add(r.seller_name);
  for (const r of (po.data ?? []) as Record<string, unknown>[]) add(r.seller_name);
  for (const r of (sku.data ?? []) as Record<string, unknown>[]) add(r.alt_seller);
  const stores = [...set].sort((a, b) => a.localeCompare(b, "th"));
  return NextResponse.json({ stores, error: null });
}
