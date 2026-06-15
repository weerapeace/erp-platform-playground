/**
 * Creative Option — รายตัว (PATCH แก้ชื่อ/ลำดับ, DELETE soft)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Phase A: option = แถวในตารางจริง (id อยู่ใน task_types หรือ platforms) — แก้ field ที่ map ชื่อแล้ว
const TABLES: { table: string; kind: string }[] = [
  { table: "erp_task_types", kind: "task_type" },
  { table: "erp_platforms", kind: "platform" },
];
const mapRow = (r: Record<string, unknown>, kind: string) => ({ id: r.id, kind, key: r.code, label: r.name_th, sort_order: r.sort_order, is_active: r.is_active });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ("label" in body) patch.name_th = body.label;       // label → name_th
  if ("sort_order" in body) patch.sort_order = body.sort_order;
  if ("is_active" in body) patch.is_active = body.is_active;
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: "ไม่มีข้อมูลให้แก้ไข" }, { status: 400 });
  const admin = supabaseAdmin();
  for (const { table, kind } of TABLES) {
    const { data, error } = await admin.from(table).update(patch).eq("id", id).select("id, code, name_th, sort_order, is_active").maybeSingle();
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
    if (data) {
      await writeAudit(admin, { action: "update", entityType: "creative_option", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { changes: Object.keys(patch).filter((k) => k !== "updated_at") } });
      return NextResponse.json({ data: mapRow(data as Record<string, unknown>, kind), error: null });
    }
  }
  return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  for (const { table } of TABLES) {
    const { data, error } = await admin.from(table).update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });
    if (data) {
      await writeAudit(admin, { action: "delete", entityType: "creative_option", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: {} });
      return NextResponse.json({ success: true, error: null });
    }
  }
  return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
}
