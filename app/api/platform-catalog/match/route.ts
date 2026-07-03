/**
 * จับคู่สินค้าบนแพลตฟอร์มกับสินค้าใน ERP ด้วยมือ — /api/platform-catalog/match
 *  POST { listing_id, parent_sku_id }  (products.platforms.edit)
 *   parent_sku_id ว่าง/null = ยกเลิกจับคู่ · คืน matched_code/matched_name เพื่ออัปเดตหน้าจอ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { listing_id?: string; parent_sku_id?: string | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const listing_id = (body.listing_id ?? "").trim();
  if (!listing_id) return NextResponse.json({ error: "ต้องระบุ listing_id" }, { status: 400 });
  const parent_sku_id = (body.parent_sku_id ?? "").toString().trim() || null;

  const admin = supabaseAdmin();
  // ตรวจว่า parent มีจริง + เอา code/name มาโชว์
  let matched_code: string | null = null, matched_name: string | null = null;
  if (parent_sku_id) {
    const { data: p } = await admin.from("parent_skus_v2").select("id, code, name_th").eq("id", parent_sku_id).maybeSingle();
    if (!p) return NextResponse.json({ error: "ไม่พบ Parent SKU ที่เลือก" }, { status: 400 });
    matched_code = (p as { code?: string }).code ?? null;
    matched_name = (p as { name_th?: string }).name_th ?? null;
  }
  const { error } = await admin.from("platform_catalog_listings")
    .update({ matched_parent_sku_id: parent_sku_id, updated_at: new Date().toISOString() })
    .eq("id", listing_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "update", entityType: "platform_catalog", entityId: listing_id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { manual_match: parent_sku_id } });
  return NextResponse.json({ ok: true, matched_parent_sku_id: parent_sku_id, matched_code, matched_name, error: null });
}
