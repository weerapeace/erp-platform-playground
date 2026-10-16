import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { cleanIds, isUuid } from "@/lib/marketing/sku-list";
import { loadMarketingSkuList } from "@/lib/marketing/sku-list-db";

export const dynamic = "force-dynamic";

// SKU การตลาด = ทุก Parent SKU ที่เปิดใช้งาน (view marketing_sku_overview) + ป้าย/หมายเหตุการตลาด (ตาราง marketing_skus)


// GET → ทุกรุ่น + ป้าย + แบรนด์ (แท็บ)
export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.view");
  if (denied) return denied;

  // ตัวโหลดกลาง (lib/marketing/sku-list-db) — ป๊อปเพิ่มสินค้าเข้าเว็บใช้ตัวเดียวกัน
  const r = await loadMarketingSkuList(supabaseAdmin());
  if ("error" in r) return NextResponse.json({ data: null, error: r.error }, { status: 500 });
  return NextResponse.json({ data: r.data, error: null });
}

// PATCH { parent_sku_ids: string[], label_id?: string|null, note?: string|null } → ติด/เปลี่ยน/ล้างป้าย หรือหมายเหตุ (หลายรุ่นพร้อมกันได้)
export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.manage");
  if (denied) return denied;

  let body: { parent_sku_ids?: unknown; label_id?: unknown; note?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  const ids = cleanIds(body.parent_sku_ids);
  if (ids.length === 0) return NextResponse.json({ data: null, error: "ยังไม่ได้เลือกรุ่น" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if ("label_id" in body) {
    if (body.label_id !== null && !isUuid(body.label_id)) return NextResponse.json({ data: null, error: "ป้ายไม่ถูกต้อง" }, { status: 400 });
    patch.label_id = body.label_id;
  }
  if ("note" in body) {
    const n = body.note == null ? "" : String(body.note).trim();
    if (n.length > 500) return NextResponse.json({ data: null, error: "หมายเหตุยาวเกิน 500 ตัวอักษร" }, { status: 400 });
    patch.note = n || null;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ data: null, error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const admin = supabaseAdmin();
  if (patch.label_id) {
    const { data: lb } = await admin.from("marketing_sku_labels").select("id").eq("id", patch.label_id as string).eq("kind", "status").maybeSingle();
    if (!lb) return NextResponse.json({ data: null, error: "ไม่พบป้ายที่เลือก (อาจถูกลบไปแล้ว)" }, { status: 400 });
  }
  // กันรหัสมั่ว: ต้องเป็น Parent SKU ที่มีอยู่จริง
  const { data: parents, error: pErr } = await admin.from("parent_skus_v2").select("id").in("id", ids);
  if (pErr) return NextResponse.json({ data: null, error: "ตรวจรุ่นไม่สำเร็จ: " + pErr.message }, { status: 500 });
  const valid = (parents ?? []).map((p) => p.id as string);
  if (valid.length === 0) return NextResponse.json({ data: null, error: "ไม่พบรุ่นที่เลือก" }, { status: 400 });

  const { data: before } = await admin.from("marketing_skus").select("parent_sku_id, label_id, note").in("parent_sku_id", valid);
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const now = new Date().toISOString();
  // upsert: รุ่นที่ยังไม่มีแถว → สร้าง · มีแล้ว → อัปเดตเฉพาะช่องที่ส่งมา
  const { error } = await admin.from("marketing_skus")
    .upsert(valid.map((parent_sku_id) => ({ parent_sku_id, ...patch, updated_at: now })), { onConflict: "parent_sku_id" });
  if (error) return NextResponse.json({ data: null, error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 500 });

  await writeAudit(admin, {
    action: "marketing.sku.update", entityType: "marketing_skus", entityId: valid.length === 1 ? valid[0] : null,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { parent_sku_ids: valid, changes: patch, before: before ?? [] },
  });
  return NextResponse.json({ data: { updated: valid.length, skipped: ids.length - valid.length }, error: null });
}
