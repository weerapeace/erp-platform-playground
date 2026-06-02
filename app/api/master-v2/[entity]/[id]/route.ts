/**
 * Master Data v2 — single record operations
 *
 * GET    /api/master-v2/<entity>/<id>      → one record
 * PATCH  /api/master-v2/<entity>/<id>      → update fields
 * DELETE /api/master-v2/<entity>/<id>      → soft delete (is_active=false)
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveEntity, resolveRelationLabels, friendlyDbError } from "../route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---- GET — single ----

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
): Promise<NextResponse> {
  const { entity, id } = await params;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ data: null, error: "entity ไม่รองรับ" }, { status: 400 });

  const supabase = supabaseFromRequest(request);
  const { data, error } = await supabase
    .from(cfg.table)
    .select(cfg.selectColumns)
    .eq("id", id)
    .single();

  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  const processed = cfg.postProcess ? cfg.postProcess(data as unknown as Record<string, unknown>) : (data as unknown as Record<string, unknown>);
  const [row] = await resolveRelationLabels(supabase, cfg, [processed]);
  return NextResponse.json({ data: row, error: null });
}

// ---- PATCH — update ----

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
): Promise<NextResponse> {
  const { entity, id } = await params;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  // ตรวจ user login
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // strip 'actor' (audit metadata, not a column)
  const { actor: _actor, id: _id, ...fields } = body;
  void _actor; void _id;

  // drop undefined values
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) patch[k] = v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "ไม่มี field ที่ต้อง update" }, { status: 400 });
  }

  // ใช้ supabaseAdmin (service-role bypass RLS)
  const { data, error } = await supabaseAdmin()
    .from(cfg.table)
    .update(patch)
    .eq("id", id)
    .select(cfg.selectColumns)
    .single();

  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
  const processed = cfg.postProcess ? cfg.postProcess(data as unknown as Record<string, unknown>) : (data as unknown as Record<string, unknown>);
  // คืนชื่อ relation (label) ด้วย → หน้า detail โชว์ชื่อทันทีหลังบันทึก (ไม่ใช่รหัส)
  const [row] = await resolveRelationLabels(supabaseFromRequest(request), cfg, [processed]);
  return NextResponse.json({ data: row, error: null });
}

// ---- DELETE — soft delete (set is_active=false) ----

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
): Promise<NextResponse> {
  const { entity, id } = await params;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  // ตรวจ user login
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const admin = supabaseAdmin();

  if (hard) {
    // ลบถาวร — ลบจริงออกจาก Supabase
    const { error } = await admin.from(cfg.table).delete().eq("id", id);
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 409 });
    await admin.from("erp_audit_logs").insert({
      actor_name: user.email ?? "system", action: "delete_permanent", module: entity, record_label: id,
    }).then(() => {}, () => {});
    return NextResponse.json({ data: { deleted: true }, error: null });
  }

  // ลบชั่วคราว — soft delete (ซ่อน กู้คืนได้)
  const col = cfg.softDeleteColumn ?? "is_active";
  const { error } = await admin.from(cfg.table).update({ [col]: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("erp_audit_logs").insert({
    actor_name: user.email ?? "system", action: "archive", module: entity, record_label: id,
  }).then(() => {}, () => {});
  return NextResponse.json({ data: { archived: true }, error: null });
}

