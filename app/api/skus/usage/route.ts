/**
 * GET /api/skus/usage?id=<skus_v2.id> → { data: SkuUsage }
 * "SKU นี้ถูกใช้ที่ไหนบ้าง" — ไว้เช็กก่อนลบถาวร (ของกลาง lib/sku-usage)
 * สิทธิ์: products.view
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { skuUsage, type SkuUsage } from "@/lib/sku-usage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) return NextResponse.json({ data: null, error: "ต้องส่ง id" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: sku, error } = await admin.from("skus_v2").select("id, code").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  if (!sku) return NextResponse.json({ data: null, error: "ไม่พบ SKU" }, { status: 404 });
  const usage: SkuUsage = await skuUsage(admin, { id: String(sku.id), code: (sku.code as string) ?? null });
  return NextResponse.json({ data: usage, error: null });
}
