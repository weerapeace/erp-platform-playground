/**
 * รายการโปรด (favorite) สินค้า SKU — แบบรวมทั้งบริษัท (shared)
 * GET  /api/purchasing/favorites          → { ids: string[] }  (sku_id ที่ถูกกดดาว)
 * POST /api/purchasing/favorites { sku_id, on }  → กดติด (on=true) / กดออก (on=false)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ ids: [], error: "ต้อง login" }, { status: 401 });
  const { data, error } = await supabaseAdmin().from("sku_favorites").select("sku_id");
  if (error) return NextResponse.json({ ids: [], error: error.message }, { status: 500 });
  return NextResponse.json({ ids: (data ?? []).map((r) => r.sku_id as string), error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: { sku_id?: string; on?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const skuId = typeof body.sku_id === "string" ? body.sku_id : "";
  if (!skuId) return NextResponse.json({ error: "ไม่ระบุ sku_id" }, { status: 400 });

  const admin = supabaseAdmin();
  if (body.on === false) {
    const { error } = await admin.from("sku_favorites").delete().eq("sku_id", skuId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ on: false, error: null });
  }
  const { error } = await admin.from("sku_favorites")
    .upsert({ sku_id: skuId, created_by: user.email ?? null }, { onConflict: "sku_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ on: true, error: null });
}
