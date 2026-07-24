/**
 * POST /api/purchasing/sku-cn-fields — บันทึกฟิลด์ใบ PO ร้านจีนกลับเข้า SKU (batch)
 * body: { items: [{ sku_id, supplier_sku_code?, name_cn?, name_en?, purchase_uom_en? }] }
 * ครั้งหน้าเปิดใบ PO ร้านจีนจะเติมให้อัตโนมัติ ไม่ต้องกรอกซ้ำ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Item = { sku_id: string; supplier_sku_code?: string | null; name_cn?: string | null; name_en?: string | null; purchase_uom_en?: string | null };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let body: { items?: Item[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const items = Array.isArray(body.items) ? body.items : [];
  const admin = supabaseAdmin();
  let saved = 0;
  for (const it of items) {
    if (!it.sku_id) continue;
    const patch: Record<string, unknown> = {};
    if (it.supplier_sku_code !== undefined) patch.supplier_sku_code = it.supplier_sku_code || null;
    if (it.name_cn !== undefined) patch.name_cn = it.name_cn || null;
    if (it.name_en !== undefined) patch.name_en = it.name_en || null;
    if (it.purchase_uom_en !== undefined) patch.purchase_uom_en = it.purchase_uom_en || null;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await admin.from("skus_v2").update(patch).eq("id", it.sku_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    saved++;
  }
  return NextResponse.json({ saved, error: null });
}
