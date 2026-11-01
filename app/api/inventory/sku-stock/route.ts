/**
 * GET /api/inventory/sku-stock
 * ยอดคงเหลือต่อ SKU จริง (คลังรวม นับจำนวน) — ของกลาง lib/sku-stock (ledger กลางก่อน · ตารางเก่าเป็นสำรอง)
 * + join ชื่อ/รหัสจาก skus_v2 · ใครล็อกอินแล้วอ่านได้ (เท่าเดิม — หน้าขอซื้อใช้โชว์ยอดในป๊อปเพิ่มรายการ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { listSkuStock } from "@/lib/sku-stock";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type SkuStockRow = {
  sku_id:           string;
  code:             string | null;
  name_th:          string | null;
  qty_on_hand:      number;
  last_movement_at: string | null;
};

export async function GET(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ data: [], total: 0, error: "ต้องเข้าสู่ระบบก่อน" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(2000, Math.max(1, parseInt(searchParams.get("limit") ?? "500", 10)));
  const admin = supabaseAdmin();

  try {
    const list = await listSkuStock(admin, limit);
    const names = new Map<string, { code: string | null; name_th: string | null }>();
    const ids = list.map((r) => r.skuId);
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await admin.from("skus_v2").select("id, code, name_th").in("id", ids.slice(i, i + 300));
      for (const s of (data ?? []) as { id: string; code: string | null; name_th: string | null }[]) names.set(s.id, s);
    }
    const rows: SkuStockRow[] = list.map(({ skuId, stock }) => ({
      sku_id:           skuId,
      code:             names.get(skuId)?.code ?? null,
      name_th:          names.get(skuId)?.name_th ?? null,
      qty_on_hand:      stock.onHand,
      last_movement_at: stock.lastMovementAt,
    }));
    return NextResponse.json({ data: rows, total: rows.length, error: null });
  } catch (e) {
    console.error("[api/inventory/sku-stock] GET", e);
    return NextResponse.json({ data: [], total: 0, error: "โหลดยอดคงเหลือไม่สำเร็จ" }, { status: 500 });
  }
}
