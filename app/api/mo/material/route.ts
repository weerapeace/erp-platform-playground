/**
 * บอร์ดจ่ายงาน Phase 2 — ติ๊กเตรียม/ตัด รายวัตถุดิบ (เช็กลิสต์จาก BOM)
 * PATCH /api/mo/material  body: { id: string; is_ready?: boolean; cut_done?: boolean }
 *   → อัปเดต 1 แถวใน mo_material_summary (เตรียม=is_ready, ตัด=cut_done)
 * ของกลาง: guardApi (products.edit) + audit ลง audit_logs
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Body = { id?: string; is_ready?: boolean; cut_done?: boolean };

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  let body: Body;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.id) return NextResponse.json({ error: "ต้องระบุ id วัตถุดิบ" }, { status: 400 });

  const patch: Record<string, unknown> = {};
  if (typeof body.is_ready === "boolean") patch.is_ready = body.is_ready;
  if (typeof body.cut_done === "boolean") { patch.cut_done = body.cut_done; patch.cut_done_at = body.cut_done ? new Date().toISOString() : null; }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "ไม่มีสถานะให้อัปเดต" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row } = await admin.from("mo_material_summary").select("mo_no, component_name").eq("id", body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: "ไม่พบวัตถุดิบนี้" }, { status: 404 });

  const { error } = await admin.from("mo_material_summary").update(patch).eq("id", body.id);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  await admin.from("audit_logs").insert({
    actor_user_id: user?.id ?? null, action: "update", entity_type: "mo_material", entity_id: body.id,
    metadata: { mo_no: (row as { mo_no?: string }).mo_no, component: (row as { component_name?: string }).component_name, ...patch },
  }).then(() => {}, () => {});

  return NextResponse.json({ id: body.id, ...patch, error: null });
}
