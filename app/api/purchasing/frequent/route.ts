/**
 * GET /api/purchasing/frequent  → { ids: string[] }
 * สินค้าที่ "ซื้อบ่อย" — นับอัตโนมัติจากประวัติใบขอซื้อ (purchase_requests_v2.item_sku_id)
 * เรียงจากซื้อบ่อยสุดก่อน (top 100)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ ids: [], error: "ต้อง login" }, { status: 401 });

  const { data, error } = await supabaseAdmin()
    .from("purchase_requests_v2")
    .select("item_sku_id")
    .not("item_sku_id", "is", null)
    .limit(5000);
  if (error) return NextResponse.json({ ids: [], error: error.message }, { status: 500 });

  const counts = new Map<string, number>();
  for (const r of (data ?? []) as { item_sku_id: string | null }[]) {
    if (!r.item_sku_id) continue;
    counts.set(r.item_sku_id, (counts.get(r.item_sku_id) ?? 0) + 1);
  }
  const ids = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 100).map(([id]) => id);
  return NextResponse.json({ ids, error: null });
}
