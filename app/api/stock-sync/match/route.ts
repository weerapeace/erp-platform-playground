/**
 * POST /api/stock-sync/match { mapping_id, sku_id | null } — จับคู่ / ยกเลิกจับคู่ รหัสปลายทาง ↔ SKU ใน ERP ทีละแถว
 * จับคู่เอง = match_method 'manual' → นำเข้าไฟล์รอบหน้าจะไม่ทับการจับคู่นี้ (อัปเดตแค่ยอด)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "products.platforms.edit"); if (denied) return denied;
  let body: { mapping_id?: unknown; sku_id?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "อ่านข้อมูลไม่ได้" }, { status: 400 }); }
  const mappingId = typeof body.mapping_id === "string" ? body.mapping_id : "";
  const skuId = typeof body.sku_id === "string" && body.sku_id ? body.sku_id : null;
  if (!mappingId) return NextResponse.json({ error: "ไม่พบรายการที่จะจับคู่" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: m } = await admin.from("marketplace_sku_mappings")
    .select("id, channel_id, marketplace_sku, sku_id, internal_sku, is_combo").eq("id", mappingId).maybeSingle();
  const row = m as { id: string; channel_id: string | null; marketplace_sku: string; sku_id: string | null; internal_sku: string | null; is_combo: boolean } | null;
  if (!row || !row.channel_id) return NextResponse.json({ error: "ไม่พบรายการ (หรือไม่ใช่รายการของหน้าซิงค์สต๊อก)" }, { status: 404 });
  if (row.is_combo) return NextResponse.json({ error: "สินค้าชุดยังไม่รองรับในเฟสนี้ — BigSeller คิดยอดชุดจากชิ้นย่อยเอง" }, { status: 400 });

  let skuCode: string | null = null;
  if (skuId) {
    const { data: s } = await admin.from("skus_v2").select("id, code, is_active").eq("id", skuId).maybeSingle();
    const sku = s as { id: string; code: string; is_active: boolean } | null;
    if (!sku) return NextResponse.json({ error: "ไม่พบ SKU ที่เลือก" }, { status: 404 });
    if (!sku.is_active) return NextResponse.json({ error: `SKU ${sku.code} ถูกปิดใช้งานแล้ว เลือกตัวอื่น` }, { status: 400 });
    skuCode = sku.code;
  }

  const { error } = await admin.from("marketplace_sku_mappings").update({
    sku_id: skuId, internal_sku: skuCode, match_method: skuId ? "manual" : null, updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (error) return NextResponse.json({ error: "บันทึกการจับคู่ไม่สำเร็จ" }, { status: 500 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: skuId ? "match" : "unmatch", entityType: "marketplace_sku_mappings", entityId: row.id,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { channel_id: row.channel_id, external_sku: row.marketplace_sku, from: row.internal_sku, to: skuCode },
  });
  return NextResponse.json({ sku_code: skuCode, error: null });
}
