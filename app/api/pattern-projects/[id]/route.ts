/**
 * /api/pattern-projects/[id] — แพทเทิร์น 1 ใบ
 *
 * GET    → { data: แพทเทิร์นเต็ม (ชิ้น + ตะเข็บ), me: { can_edit, can_delete, can_cost }, error }   (pattern_studio.view)
 * PATCH  { name?, status?, note?, sku_code?, basis?, template?, pieces?, seams?, autosave? }  → บันทึก (pattern_studio.edit) · autosave = จากตัวจับเวลา (จดประวัติแก้รูปชิ้นไม่เกิน 1 ครั้ง/10 นาที)
 *        ส่งชิ้นมา = คิดช่องสรุป (จำนวนชิ้น · พื้นที่ · ภาพย่อ) ใหม่ · ประวัติจดช่องที่เปลี่ยน (ชิ้น/ตะเข็บจดเป็นจำนวน ไม่จดทั้งก้อน)
 * DELETE → ซ่อนจากรายการ (is_active = false · กู้คืนได้ในฐานข้อมูล)   (pattern_studio.delete)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { apiCan, guardApi } from "@/lib/api-auth";
import { COST_PERM } from "@/lib/cost-access";
import { auditDiff, writeAudit } from "@/lib/audit";
import { cleanProjectPatch, cleanProjectPieces } from "@/lib/pattern-project";
import { cleanSeams } from "@/lib/pattern-seams";
import { PROJECT_PERM, PROJECT_TABLE, derivedColumns, loadProjectActor } from "@/lib/pattern-project-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, PROJECT_PERM.view); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "ไม่พบแพทเทิร์นนี้" }, { status: 404 });
  const admin = supabaseAdmin();
  const [{ data, error }, actor, canCost] = await Promise.all([
    admin.from(PROJECT_TABLE).select("*").eq("id", id).eq("is_active", true).maybeSingle(),
    loadProjectActor(request, admin),
    apiCan(request, COST_PERM),
  ]);
  if (error) return NextResponse.json({ error: "โหลดแพทเทิร์นไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "ไม่พบแพทเทิร์นนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const pieces = cleanProjectPieces(data.pieces);
  return NextResponse.json({
    data: { ...data, pieces, seams: cleanSeams(data.seams, new Set(pieces.map((p) => p.pid))) },
    me: { can_edit: actor.canEdit, can_delete: actor.canDelete, can_cost: actor.canEdit && canCost }, error: null,   // can_cost = ส่งชิ้นไปตีราคาได้
  });
}

export async function PATCH(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, PROJECT_PERM.edit); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "ไม่พบแพทเทิร์นนี้" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const admin = supabaseAdmin();
  const [{ data: cur }, actor] = await Promise.all([
    admin.from(PROJECT_TABLE).select("*").eq("id", id).eq("is_active", true).maybeSingle(),
    loadProjectActor(request, admin),
  ]);
  if (!cur) return NextResponse.json({ error: "ไม่พบแพทเทิร์นนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });

  const curPieces = cleanProjectPieces(cur.pieces);
  const { patch, error } = cleanProjectPatch(body, curPieces);
  if (error) return NextResponse.json({ error }, { status: 400 });
  if (!Object.keys(patch).length) return NextResponse.json({ data: { id, updated_at: cur.updated_at }, error: null });

  const pieces = patch.pieces ?? curPieces;
  const seams = patch.seams ?? cleanSeams(cur.seams, new Set(pieces.map((p) => p.pid)));
  const basis = patch.basis ?? (cur.basis === "area" ? "area" : "box");
  const derived: Partial<ReturnType<typeof derivedColumns>> = patch.pieces || patch.seams || patch.basis ? derivedColumns(pieces, seams, basis) : {};
  const now = new Date().toISOString();
  const row = { ...patch, ...(patch.pieces && !patch.seams ? { seams } : {}), ...derived, updated_by_name: actor.name, updated_at: now };
  const { error: e } = await admin.from(PROJECT_TABLE).update(row).eq("id", id);
  if (e) return NextResponse.json({ error: "บันทึกแพทเทิร์นไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });

  // ประวัติ: ช่องธรรมดาจดจาก → เป็น · ชิ้น/ตะเข็บจดเป็นจำนวน (ก้อนใหญ่ ไม่จดทั้งก้อน)
  const { pieces: _p, seams: _s, template: _t, ...plain } = patch;
  void _p; void _s; void _t;
  const after: Record<string, unknown> = { ...plain, ...("piece_count" in derived ? { piece_count: derived.piece_count, seam_count: derived.seam_count, area_cm2: derived.area_cm2 } : {}) };
  const changes = auditDiff(cur as Record<string, unknown>, after);
  const shapeEdited = !!patch.pieces && JSON.stringify(cur.pieces) !== JSON.stringify(patch.pieces);
  // บันทึกอัตโนมัติ (Bag CAD รอบ A · ทุก ~4 วิหลังหยุดแก้): แก้รูปชิ้นอย่างเดียว จดประวัติไม่เกิน 1 ครั้งต่อ 10 นาที (กันประวัติท่วม) · เปลี่ยนชื่อ/สถานะ/จำนวนชิ้น = จดทุกครั้งเหมือนเดิม
  const isAuto = body.autosave === true;
  let skipAudit = false;
  if (isAuto && !changes.length && shapeEdited) {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { data: recent } = await admin.from("audit_logs").select("id").eq("entity_type", PROJECT_TABLE).eq("entity_id", id).gte("created_at", since).limit(1);
    skipAudit = !!recent?.length;
  }
  if ((changes.length || shapeEdited) && !skipAudit) {
    await writeAudit(admin, {
      action: "update", entityType: PROJECT_TABLE, entityId: id, actorId: actor.userId, actorName: actor.name,
      metadata: { pattern_no: cur.pattern_no, name: patch.name ?? cur.name, changes, ...(shapeEdited ? { pieces_edited: true } : {}), ...(isAuto ? { autosave: true } : {}) },
    });
  }
  return NextResponse.json({ data: { id, updated_at: now, ...derived }, error: null });
}

export async function DELETE(request: NextRequest, { params }: Params): Promise<NextResponse> {
  const denied = await guardApi(request, PROJECT_PERM.del); if (denied) return denied;
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "ไม่พบแพทเทิร์นนี้" }, { status: 404 });
  const admin = supabaseAdmin();
  const [{ data: cur }, actor] = await Promise.all([
    admin.from(PROJECT_TABLE).select("id, pattern_no, name, piece_count").eq("id", id).eq("is_active", true).maybeSingle(),
    loadProjectActor(request, admin),
  ]);
  if (!cur) return NextResponse.json({ error: "ไม่พบแพทเทิร์นนี้ (อาจถูกลบไปแล้ว)" }, { status: 404 });
  const { error } = await admin.from(PROJECT_TABLE).update({ is_active: false, updated_by_name: actor.name, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return NextResponse.json({ error: "ลบแพทเทิร์นไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  await writeAudit(admin, {
    action: "delete", entityType: PROJECT_TABLE, entityId: id, actorId: actor.userId, actorName: actor.name,
    metadata: { pattern_no: cur.pattern_no, name: cur.name, piece_count: cur.piece_count, soft: true },
  });
  return NextResponse.json({ data: { id }, error: null });
}
