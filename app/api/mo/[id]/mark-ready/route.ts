/**
 * mark ใบสั่งผลิตเป็น "เตรียม/ตัดครบ" ทั้งใบ (ใช้ตอนจ่ายงานจากหน้าช้อป — ติ๊กงานที่ตัด/เตรียมครบพร้อมจ่าย)
 * PATCH /api/mo/[id]/mark-ready  body: { ready?: boolean }  (default true)
 *   → manufacturing_orders.prep_done/cut_done = ready (ครอบคลุมใบไม่มี BOM)
 *   → mo_material_summary.is_ready = ready ทุกแถวของใบ (เตรียมครบ)
 *   → mo_materials.cut_done = ready ทุกแถวของใบ (ตัดครบ) — ครอบคลุมใบมี BOM
 * ของกลาง: guardApi (products.edit) + audit ลง audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { ready?: boolean };

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Body;
  try { body = await request.json(); } catch { body = {}; }
  const ready = body.ready !== false;   // default = true
  const now = new Date().toISOString();

  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("manufacturing_orders").select("mo_no").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "ไม่พบใบสั่งผลิตนี้" }, { status: 404 });
  const moNo = (existing as { mo_no: string }).mo_no;

  const { error } = await admin.from("manufacturing_orders")
    .update({ prep_done: ready, prep_done_at: ready ? now : null, cut_done: ready, cut_done_at: ready ? now : null }).eq("id", id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // ใบมี BOM: ความพร้อมคิดจากวัตถุดิบ → เซ็ตทั้งใบให้ครบ
  await admin.from("mo_material_summary").update({ is_ready: ready }).eq("mo_no", moNo).eq("is_active", true);
  await admin.from("mo_materials").update({ cut_done: ready, cut_done_at: ready ? now : null }).eq("mo_no", moNo).eq("is_active", true);

  await admin.from("audit_logs").insert({
    actor_user_id: user?.id ?? null, action: "update", entity_type: "mo", entity_id: id,
    metadata: { mo_no: moNo, mark_ready: ready },
  }).then(() => {}, () => {});

  return NextResponse.json({ id, mo_no: moNo, ready, error: null });
}
