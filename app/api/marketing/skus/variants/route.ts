import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { isUuid, variantSummary, type MarketingSkuVariant } from "@/lib/marketing/sku-list";

export const dynamic = "force-dynamic";

// สี/แบบ (SKU ย่อย) ของรุ่น สำหรับช่อง "SKU ที่เหลือ"
// ปิด/เปิด ที่นี่ = เฉพาะการตลาด (ตาราง marketing_sku_variant_off) — ไม่แตะ skus_v2.is_active

async function loadVariants(parentId: string): Promise<{ data?: MarketingSkuVariant[]; error?: string }> {
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("skus_v2")
    .select("id, code, color_th, color, is_active, cover_image_r2_key").eq("parent_sku_id", parentId).order("code").limit(500);
  if (error) return { error: "โหลดสี/แบบไม่สำเร็จ: " + error.message };
  const ids = (data ?? []).map((v) => v.id as string);
  const { data: offs, error: oErr } = ids.length
    ? await admin.from("marketing_sku_variant_off").select("sku_id").in("sku_id", ids)
    : { data: [], error: null };
  if (oErr) return { error: "โหลดสถานะการตลาดไม่สำเร็จ: " + oErr.message };
  const off = new Set((offs ?? []).map((o) => o.sku_id as string));
  return {
    data: (data ?? []).map((v) => ({
      id: v.id as string, code: v.code ?? "", color: v.color_th || v.color || null,
      is_active: v.is_active !== false, image_key: v.cover_image_r2_key ?? null, mk_off: off.has(v.id as string),
    })),
  };
}

// GET ?parent_id= → สี/แบบของรุ่น (โหลดตอนกดดู)
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.view");
  if (denied) return denied;
  const parentId = new URL(request.url).searchParams.get("parent_id");
  if (!isUuid(parentId)) return NextResponse.json({ data: null, error: "ไม่พบรุ่น" }, { status: 400 });
  const r = await loadVariants(parentId);
  if (r.error) return NextResponse.json({ data: null, error: r.error }, { status: 500 });
  return NextResponse.json({ data: r.data, error: null });
}

// PATCH { sku_id, open: boolean } → เปิด/ปิด สีนี้ "เฉพาะการตลาด" · คืนรายการสีล่าสุด + จำนวนที่เหลือ
export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;
  let body: { sku_id?: unknown; open?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  if (!isUuid(body.sku_id) || typeof body.open !== "boolean")
    return NextResponse.json({ data: null, error: "ข้อมูลไม่ครบ (sku_id, open)" }, { status: 400 });
  const skuId = body.sku_id;

  const admin = supabaseAdmin();
  const { data: sku } = await admin.from("skus_v2").select("id, code, parent_sku_id, is_active").eq("id", skuId).maybeSingle();
  if (!sku?.parent_sku_id) return NextResponse.json({ data: null, error: "ไม่พบสี/แบบนี้" }, { status: 404 });
  if (sku.is_active === false && body.open)
    return NextResponse.json({ data: null, error: "สีนี้ถูกปิดในระบบ (หน้า SKU) — เปิดจากหน้านี้ไม่ได้" }, { status: 400 });

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { error } = body.open
    ? await admin.from("marketing_sku_variant_off").delete().eq("sku_id", skuId)
    : await admin.from("marketing_sku_variant_off").upsert({ sku_id: skuId, created_by: user?.id ?? null }, { onConflict: "sku_id", ignoreDuplicates: true });
  if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 500 });

  await writeAudit(admin, {
    action: body.open ? "marketing.variant.open" : "marketing.variant.close", entityType: "marketing_sku_variant_off", entityId: skuId,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { sku_code: sku.code, parent_sku_id: sku.parent_sku_id },
  });

  const r = await loadVariants(sku.parent_sku_id as string);
  if (r.error) return NextResponse.json({ data: null, error: r.error }, { status: 500 });
  return NextResponse.json({ data: { variants: r.data, summary: variantSummary(r.data ?? []) }, error: null });
}
