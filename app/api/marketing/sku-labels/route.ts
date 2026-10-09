import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { cleanColor, cleanIds, isUuid } from "@/lib/marketing/sku-list";

export const dynamic = "force-dynamic";

// ป้ายกลุ่มสินค้าการตลาด (Hero / Clearance / …) — อ่านได้ทุกคนที่ดู SKU การตลาด · แก้ได้เฉพาะ marketing.label.manage

async function actor(request: NextRequest) {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  return { actorId: user?.id ?? null, actorName: user?.email ?? null };
}

const dupMsg = (e: { code?: string; message: string }) =>
  e.code === "23505" ? "มีป้ายชื่อนี้อยู่แล้ว" : "บันทึกไม่สำเร็จ: " + e.message;

type LabelInput = { name?: unknown; icon?: unknown; color?: unknown; description?: unknown; is_active?: unknown };

function pickFields(b: LabelInput, requireName: boolean): { fields: Record<string, unknown>; error?: string } {
  const f: Record<string, unknown> = {};
  if ("name" in b || requireName) {
    const name = String(b.name ?? "").trim();
    if (!name) return { fields: f, error: "ต้องใส่ชื่อป้าย" };
    if (name.length > 60) return { fields: f, error: "ชื่อป้ายยาวเกิน 60 ตัวอักษร" };
    f.name = name;
  }
  if ("icon" in b) f.icon = String(b.icon ?? "").trim().slice(0, 8) || null;
  if ("color" in b) f.color = cleanColor(b.color);
  if ("description" in b) f.description = String(b.description ?? "").trim().slice(0, 200) || null;
  if ("is_active" in b) f.is_active = b.is_active !== false;
  return { fields: f };
}

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "marketing.sku.view");
  if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("marketing_sku_labels")
    .select("id, name, icon, color, description, sort_order, is_active").order("sort_order").order("name");
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}

// POST { name, icon?, color?, description? } → เพิ่มป้าย (ต่อท้ายลำดับ)
export async function POST(request: NextRequest) {
  const denied = await guardApi(request, "marketing.label.manage");
  if (denied) return denied;
  let body: LabelInput;
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }
  const { fields, error: vErr } = pickFields(body, true);
  if (vErr) return NextResponse.json({ data: null, error: vErr }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: last } = await admin.from("marketing_sku_labels").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("marketing_sku_labels")
    .insert({ color: "#64748b", ...fields, sort_order: (Number(last?.sort_order) || 0) + 10 })
    .select("id, name, icon, color, description, sort_order, is_active").single();
  if (error) return NextResponse.json({ data: null, error: dupMsg(error) }, { status: 400 });

  const { actorId, actorName } = await actor(request);
  await writeAudit(admin, { action: "marketing.label.create", entityType: "marketing_sku_labels", entityId: data.id, actorId, actorName, metadata: { label: data } });
  return NextResponse.json({ data, error: null });
}

// PATCH { id, name?, icon?, color?, description? } → แก้ป้าย
// PATCH { order: string[] }                      → เรียงลำดับใหม่ (ตามลำดับ id ที่ส่งมา)
export async function PATCH(request: NextRequest) {
  const denied = await guardApi(request, "marketing.label.manage");
  if (denied) return denied;
  let body: LabelInput & { id?: unknown; order?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ data: null, error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const { actorId, actorName } = await actor(request);

  if (Array.isArray(body.order)) {
    const order = cleanIds(body.order, 200);
    const results = await Promise.all(order.map((id, i) =>
      admin.from("marketing_sku_labels").update({ sort_order: (i + 1) * 10, updated_at: new Date().toISOString() }).eq("id", id)));
    const failed = results.find((r) => r.error);
    if (failed?.error) return NextResponse.json({ data: null, error: "เรียงลำดับไม่สำเร็จ: " + failed.error.message }, { status: 500 });
    await writeAudit(admin, { action: "marketing.label.reorder", entityType: "marketing_sku_labels", actorId, actorName, metadata: { order } });
    return NextResponse.json({ data: { ok: true }, error: null });
  }

  if (!isUuid(body.id)) return NextResponse.json({ data: null, error: "ไม่พบป้าย" }, { status: 400 });
  const { fields, error: vErr } = pickFields(body, false);
  if (vErr) return NextResponse.json({ data: null, error: vErr }, { status: 400 });
  if (Object.keys(fields).length === 0) return NextResponse.json({ data: null, error: "ไม่มีอะไรให้แก้" }, { status: 400 });

  const { data: before } = await admin.from("marketing_sku_labels").select("name, icon, color, description, is_active").eq("id", body.id).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบป้าย (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { data, error } = await admin.from("marketing_sku_labels")
    .update({ ...fields, updated_at: new Date().toISOString() }).eq("id", body.id)
    .select("id, name, icon, color, description, sort_order, is_active").single();
  if (error) return NextResponse.json({ data: null, error: dupMsg(error) }, { status: 400 });

  await writeAudit(admin, { action: "marketing.label.update", entityType: "marketing_sku_labels", entityId: body.id, actorId, actorName, metadata: { before, after: fields } });
  return NextResponse.json({ data, error: null });
}

// DELETE ?id= → ลบป้าย · สินค้าที่ติดป้ายนี้จะกลายเป็น "ไม่มีป้าย" (ไม่ถูกเอาออกจากรายการ)
export async function DELETE(request: NextRequest) {
  const denied = await guardApi(request, "marketing.label.manage");
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ data: null, error: "ไม่พบป้าย" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: before } = await admin.from("marketing_sku_labels").select("id, name, icon, color").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ data: null, error: "ไม่พบป้าย (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { count } = await admin.from("marketing_skus").select("id", { count: "exact", head: true }).eq("label_id", id);
  const { error } = await admin.from("marketing_sku_labels").delete().eq("id", id);
  if (error) return NextResponse.json({ data: null, error: "ลบไม่สำเร็จ: " + error.message }, { status: 500 });

  const { actorId, actorName } = await actor(request);
  await writeAudit(admin, { action: "marketing.label.delete", entityType: "marketing_sku_labels", entityId: id, actorId, actorName, metadata: { label: before, unlabeled_count: count ?? 0 } });
  return NextResponse.json({ data: { unlabeled: count ?? 0 }, error: null });
}
