/**
 * 📚 Design Library — ราคาทุนของ SKU ในสูตร (ใช้คิดทุนประมาณสดในหน้าสูตร)
 * GET ?sku_ids=a,b → { prices: { [sku_id]: standard_price } } (ไม่มีราคา/≤0 = ไม่ส่ง)
 * สิทธิ์: products.cost.view เท่านั้น (ไม่มีสิทธิ์ = 403 ข้อความภาษาคน) · คิดเงินที่ lib/design-library-cost (bomMaterialCost กลาง)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { COST_PERM } from "@/lib/cost-access";
import { loadCostPrices } from "@/lib/design-library-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID = /^[0-9a-f-]{36}$/i;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, COST_PERM); if (denied) return denied;
  const ids = (new URL(request.url).searchParams.get("sku_ids") ?? "").split(",").filter((x) => UUID.test(x)).slice(0, 200);
  if (!ids.length) return NextResponse.json({ data: { prices: {} }, error: null });
  const prices = await loadCostPrices(supabaseAdmin(), ids);
  if (!prices) return NextResponse.json({ data: null, error: "โหลดราคาทุนไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  return NextResponse.json({ data: { prices }, error: null }, { headers: { "Cache-Control": "no-store" } });
}
