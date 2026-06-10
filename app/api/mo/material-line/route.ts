/**
 * เตรียม/ตัด รายบล็อก — ติ๊ก "ตัดครบ" ที่บรรทัด mo_materials (แท็บรายละเอียดบล็อก)
 * PATCH /api/mo/material-line  body: { id: string; cut_done: boolean }
 *   → อัปเดต mo_materials.cut_done (+เวลา)
 *   → คำนวณ: ถ้าบล็อก "ที่ต้องตัด" ของวัตถุดิบนั้นตัดครบทุกอัน → set เตรียมครบ (is_ready) ในสรุป
 *     ถ้าไม่ครบ → ปลดเตรียมครบ (ลิงก์สองทาง)
 * ของกลาง: guardApi (products.edit) + audit ลง audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { id?: string; cut_done?: boolean };
const needsCut = (m: Record<string, unknown>) => m.cut_block_code != null || m.cut_length != null || m.pieces != null;

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id || typeof body.cut_done !== "boolean") return NextResponse.json({ error: "ต้องระบุ id และ cut_done" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: line } = await admin.from("mo_materials").select("mo_no, component_sku, component_name").eq("id", body.id).maybeSingle();
  if (!line) return NextResponse.json({ error: "ไม่พบบรรทัดวัตถุดิบนี้" }, { status: 404 });
  const moNo = (line as { mo_no: string }).mo_no;
  const sku = (line as { component_sku: string | null }).component_sku;

  const { error } = await admin.from("mo_materials").update({ cut_done: body.cut_done, cut_done_at: body.cut_done ? new Date().toISOString() : null }).eq("id", body.id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // คำนวณ "เตรียมครบ" ของวัตถุดิบนี้จากบล็อกที่ต้องตัด (ลิงก์สองทาง)
  let q = admin.from("mo_materials").select("cut_done, cut_block_code, cut_length, pieces").eq("mo_no", moNo).eq("is_active", true);
  q = sku == null ? q.is("component_sku", null) : q.eq("component_sku", sku);
  const { data: siblings } = await q;
  const cutLines = (siblings ?? []).filter(needsCut);
  const allCut = cutLines.length > 0 && cutLines.every((m) => m.cut_done);

  let su = admin.from("mo_material_summary").update({ is_ready: allCut }).eq("mo_no", moNo);
  su = sku == null ? su.is("component_sku", null) : su.eq("component_sku", sku);
  await su;

  await admin.from("audit_logs").insert({
    actor_user_id: user?.id ?? null, action: "update", entity_type: "mo_material_line", entity_id: body.id,
    metadata: { mo_no: moNo, component: (line as { component_name?: string }).component_name, cut_done: body.cut_done, is_ready: allCut },
  }).then(() => {}, () => {});

  return NextResponse.json({ id: body.id, cut_done: body.cut_done, is_ready: allCut, error: null });
}
