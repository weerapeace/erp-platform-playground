/**
 * 💼 ราคากลางค่าใช้จ่ายเพิ่ม 1 รายการ — PATCH แก้ · DELETE ซ่อน (is_active = false · เก็บประวัติไว้)
 *   สิทธิ์: เห็นต้นทุน (products.cost.view) + แก้สินค้า (products.edit) · audit cost_preset_update / cost_preset_delete (มี changes)
 *   แก้ราคากลางแล้ว ใบงานที่ใส่ราคาไปแล้วไม่เปลี่ยน (ค่าที่ใส่เก็บใน design_sheets.cost_extra)
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { writeAudit, auditChangeMeta } from "@/lib/audit";
import { cleanPreset, presetProblem, PRESET_KIND_META } from "@/lib/design-cost-presets";

export const dynamic = "force-dynamic";

const COLS = "id, kind, label, amount, w_cm, l_cm, h_cm, max_kg, mode, sort_order";
type Ctx = { params: Promise<{ presetId: string }> };

async function guardEdit(request: Request) {
  return (await guardApi(request, COST_PERM)) ?? (await guardApi(request, "products.edit"));
}

export async function PATCH(request: Request, ctx: Ctx) {
  const denied = await guardEdit(request); if (denied) return denied;
  const { presetId } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("design_cost_presets").select(COLS).eq("id", presetId).eq("is_active", true).maybeSingle();
  if (!before) return NextResponse.json({ error: "ไม่พบรายการนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const p = cleanPreset({ ...before, ...body, kind: before.kind });   // เปลี่ยนหมวดไม่ได้
  const problem = presetProblem(p);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { id: _id, kind: _k, ...patch } = p; void _id; void _k;
  const { data, error } = await admin.from("design_cost_presets").update({ ...patch, updated_by: user?.id ?? null, updated_at: new Date().toISOString() })
    .eq("id", presetId).select(COLS).single();
  if (error) return NextResponse.json({ error: "บันทึกราคากลางไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, {
    action: "cost_preset_update", entityType: "design_cost_preset", entityId: presetId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { kind: before.kind, kind_label: PRESET_KIND_META[p.kind].label, label: p.label, ...auditChangeMeta(before as Record<string, unknown>, patch as Record<string, unknown>) },
  });
  return NextResponse.json({ data: { ...cleanPreset(data), id: String(data.id) }, error: null });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const denied = await guardEdit(request); if (denied) return denied;
  const { presetId } = await ctx.params;
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("design_cost_presets").select(COLS).eq("id", presetId).eq("is_active", true).maybeSingle();
  if (!before) return NextResponse.json({ ok: true, error: null });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const { error } = await admin.from("design_cost_presets").update({ is_active: false, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", presetId);
  if (error) return NextResponse.json({ error: "ลบไม่สำเร็จ" }, { status: 400 });
  await writeAudit(admin, {
    action: "cost_preset_delete", entityType: "design_cost_preset", entityId: presetId, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { kind: before.kind, label: before.label, amount: before.amount, w_cm: before.w_cm, l_cm: before.l_cm, h_cm: before.h_cm, max_kg: before.max_kg },
  });
  return NextResponse.json({ ok: true, error: null });
}
