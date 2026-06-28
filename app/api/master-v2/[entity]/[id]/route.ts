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
import { writeAudit } from "@/lib/audit";
import { guardApi } from "@/lib/api-auth";
import { timeRoute } from "@/lib/api-timing";
import { getFieldAccess, stripHidden, stripReadonly } from "@/lib/field-permissions";
import { r2MoveToTrash } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ---- GET — single ----

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
): Promise<NextResponse> {
  const { entity, id } = await params;
  // ⚡ ยิงขนาน: ตรวจสิทธิ์ + อ่าน config โมดูล (อิสระต่อกัน) — แทนการรอทีละจังหวะ → เปิด drawer เร็วขึ้นทุกหน้า
  const [denied, cfg] = await Promise.all([
    guardApi(request, "products.view"),   // กันข้อมูล master หลุดให้คนที่ไม่ได้ล็อกอิน
    resolveEntity(entity),
  ]);
  if (denied) return denied;   // ตรวจสิทธิ์ก่อนคืนข้อมูลเสมอ (data fetch อยู่จังหวะถัดไป)
  if (!cfg) return NextResponse.json({ data: null, error: "entity ไม่รองรับ" }, { status: 400 });

  const supabase = supabaseFromRequest(request);
  // ⚡ ยิงขนาน: ดึงแถว + สิทธิ์ระดับฟิลด์ (ทั้งคู่ใช้ cfg แต่ไม่ขึ้นต่อกัน)
  const [rowRes, access] = await Promise.all([
    supabase.from(cfg.table).select(cfg.selectColumns).eq("id", id).single(),
    getFieldAccess(request, supabaseAdmin(), cfg.table),
  ]);
  const { data, error } = rowRes;
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  const processed = cfg.postProcess ? cfg.postProcess(data as unknown as Record<string, unknown>) : (data as unknown as Record<string, unknown>);
  // relation labels ต้องรอ row ก่อน (ใช้ค่าจากแถว)
  const [row] = await resolveRelationLabels(supabase, cfg, [processed]);
  const [safe] = stripHidden([row as Record<string, unknown>], access.hiddenCols);
  return NextResponse.json({ data: safe, error: null });
}

// ---- PATCH — update ----

async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
): Promise<NextResponse> {
  const { entity, id } = await params;
  // ตรวจสิทธิ์แก้ไขข้อมูล master ก่อน (ไม่ล็อกอิน/ไม่มีสิทธิ์ → 401)
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  // ดึง user object ไว้ใช้ทำ audit (สิทธิ์ตรวจแล้วด้านบน)
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  // strip 'actor' (audit metadata, not a column)
  const { actor: _actor, id: _id, ...fields } = body;
  void _id;
  const actorName = typeof _actor === "string" ? _actor : (user.email ?? null);

  // drop undefined values
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) patch[k] = v;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "ไม่มี field ที่ต้อง update" }, { status: 400 });
  }

  // ใช้ supabaseAdmin (service-role bypass RLS)
  const admin = supabaseAdmin();

  // สิทธิ์ระดับฟิลด์ (ของกลาง) — ตัดคอลัมน์ที่ role นี้แก้ไม่ได้ออกก่อนเขียน
  const access = await getFieldAccess(request, admin, cfg.table);
  const { clean: cleanPatch, skipped } = stripReadonly(patch, access.readonlyCols);
  if (Object.keys(cleanPatch).length === 0) {
    return NextResponse.json({ error: "คุณไม่มีสิทธิ์แก้ไขฟิลด์ที่ส่งมา" }, { status: 403 });
  }

  // ของกลาง: ถ้ารูปปกถูกเปลี่ยน/ลบ → อ่าน key เดิมไว้ก่อน เพื่อย้ายเข้าถังขยะ R2 หลังบันทึกสำเร็จ
  let oldCoverKey: string | null = null;
  if ("cover_image_r2_key" in cleanPatch) {
    const { data: prev } = await admin.from(cfg.table).select("cover_image_r2_key").eq("id", id).maybeSingle();
    oldCoverKey = (prev?.cover_image_r2_key as string) || null;
  }

  const { data, error } = await admin
    .from(cfg.table)
    .update(cleanPatch)
    .eq("id", id)
    .select(cfg.selectColumns)
    .single();

  if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 400 });

  // รูปปกเปลี่ยน/ลบ → ย้ายไฟล์เก่าเข้าถังขยะ R2 (ลบจริงด้วย lifecycle rule) ไม่ปล่อยขยะค้าง · ไม่ขวางการบันทึก
  if (oldCoverKey && oldCoverKey !== cleanPatch.cover_image_r2_key) {
    try { await r2MoveToTrash(oldCoverKey); } catch { /* best-effort */ }
  }

  // audit (ของกลาง — ลง audit_logs, ไม่ throw)
  await writeAudit(admin, {
    action: "update", entityType: cfg.table, entityId: id,
    actorId: user.id, actorName,
    metadata: { entity, changed_fields: Object.keys(cleanPatch), ...(skipped.length ? { skipped_no_permission: skipped } : {}) },
  });

  const processed = cfg.postProcess ? cfg.postProcess(data as unknown as Record<string, unknown>) : (data as unknown as Record<string, unknown>);
  // คืนชื่อ relation (label) ด้วย → หน้า detail โชว์ชื่อทันทีหลังบันทึก (ไม่ใช่รหัส)
  const [row] = await resolveRelationLabels(supabaseFromRequest(request), cfg, [processed]);
  const [safe] = stripHidden([row as Record<string, unknown>], access.hiddenCols);
  return NextResponse.json({ data: safe, error: null });
}

// ---- DELETE — soft delete (set is_active=false) ----

async function _DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string; id: string }> }
): Promise<NextResponse> {
  const { entity, id } = await params;
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  // ลบถาวร (hard) = อันตราย → ต้องมีสิทธิ์ products.delete (admin);
  // ลบชั่วคราว (soft/archive) → products.edit ก็พอ (กู้คืนได้)
  const denied = await guardApi(request, hard ? "products.delete" : "products.edit"); if (denied) return denied;
  const cfg = await resolveEntity(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  // ดึง user object ไว้ใช้ทำ audit (สิทธิ์ตรวจแล้วด้านบน)
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return NextResponse.json({ error: "ต้อง login" }, { status: 401 });

  const admin = supabaseAdmin();

  if (hard) {
    // ลบถาวร — ลบจริงออกจาก Supabase
    const { error } = await admin.from(cfg.table).delete().eq("id", id);
    if (error) return NextResponse.json({ error: friendlyDbError(error.message) }, { status: 409 });
    await writeAudit(admin, {
      action: "delete_permanent", entityType: cfg.table, entityId: id,
      actorId: user.id, actorName: user.email ?? null, metadata: { entity },
    });
    return NextResponse.json({ data: { deleted: true }, error: null });
  }

  // ลบชั่วคราว — soft delete (ซ่อน กู้คืนได้)
  const col = cfg.softDeleteColumn ?? "is_active";
  const { error } = await admin.from(cfg.table).update({ [col]: false }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await writeAudit(admin, {
    action: "archive", entityType: cfg.table, entityId: id,
    actorId: user.id, actorName: user.email ?? null, metadata: { entity, soft_delete_column: col },
  });
  return NextResponse.json({ data: { archived: true }, error: null });
}

// Phase 0 — ครอบ timing log
/* eslint-disable @typescript-eslint/no-explicit-any */
export const GET = timeRoute("master-v2:detail", _GET as any) as any;
export const PATCH = timeRoute("master-v2:update", _PATCH as any) as any;
export const DELETE = timeRoute("master-v2:delete", _DELETE as any) as any;

