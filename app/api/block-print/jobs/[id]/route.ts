/**
 * 🧱 บล็อกพิมพ์ — อ่าน / แก้ / ลบ งานเดียว
 * GET    /api/block-print/jobs/<id>          → { data: row (มีเส้นของชิ้น) }
 * PATCH  /api/block-print/jobs/<id>          → ส่งเฉพาะช่องที่แก้ · is_active:true = กู้คืนจากถังขยะ
 * DELETE /api/block-print/jobs/<id>          → ลบแบบเก็บไว้ก่อน (ย้ายเข้าถังขยะ)
 * DELETE /api/block-print/jobs/<id>?hard=1   → ลบถาวร — ทำได้เฉพาะงานที่อยู่ในถังขยะแล้ว
 * สิทธิ์ block_print.view / block_print.edit · audit ทุกการเขียน (ชิ้นจดรายชิ้น: ขนาด/ติ๊ก/ชื่อ จาก → เป็น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { pieceAuditChanges, type BlockPiece } from "@/lib/block-print";
import { layoutAuditChanges, type BlockLayout } from "@/lib/block-print-layout";
import { bad, cleanJobBody, EDIT_PERM, ENTITY, TABLE, VIEW_PERM } from "../../_shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/i;

async function load(id: string) {
  return supabaseAdmin().from(TABLE).select("*").eq("id", id).maybeSingle();
}

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, VIEW_PERM); if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("ไม่พบงานนี้", 404);
  const { data, error } = await load(id);
  if (error) return bad(friendlyDbError(error.message), 500);
  if (!data) return bad("ไม่พบงานนี้", 404);
  return NextResponse.json({ data, error: null });
}

export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("ไม่พบงานนี้", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const v = cleanJobBody(body, true);
  if (!v.ok) return bad(v.error);
  const { data: before } = await load(id);
  if (!before) return bad("ไม่พบงานนี้", 404);

  const out: Record<string, unknown> = { ...v.patch, updated_at: new Date().toISOString() };
  if (v.patch.is_active === true) out.deleted_at = null;
  if (v.patch.is_active === false) out.deleted_at = new Date().toISOString();
  const admin = supabaseAdmin();
  const { data, error } = await admin.from(TABLE).update(out).eq("id", id).select("*").single();
  if (error) return bad(friendlyDbError(error.message));

  const { pieces: _p, layouts: _l, ...plain } = v.patch;
  const meta = auditChangeMeta(before, plain);
  const pieceChanges = v.patch.pieces ? pieceAuditChanges((before.pieces ?? []) as BlockPiece[], v.patch.pieces) : [];
  const layoutChanges = v.patch.layouts ? layoutAuditChanges((before.layouts ?? []) as BlockLayout[], v.patch.layouts) : [];
  const action = v.patch.is_active === true && before.is_active === false ? "restore" : v.patch.is_active === false && before.is_active ? "archive" : "update";
  await writeAuditFor(request, admin, {
    action, entityType: ENTITY, entityId: id,
    metadata: { code: data.code, name: data.name, ...meta, changes: [...(meta.changes ?? []), ...pieceChanges, ...layoutChanges] },
  });
  return NextResponse.json({ data, error: null });
}

export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, EDIT_PERM); if (denied) return denied;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return bad("ไม่พบงานนี้", 404);
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const { data: before } = await load(id);
  if (!before) return bad("ไม่พบงานนี้", 404);
  const admin = supabaseAdmin();
  if (hard) {
    if (before.is_active) return bad("ลบถาวรได้เฉพาะงานที่อยู่ในถังขยะ — ย้ายเข้าถังขยะก่อน", 409);
    const { error } = await admin.from(TABLE).delete().eq("id", id);
    if (error) return bad(friendlyDbError(error.message));
    await writeAuditFor(request, admin, { action: "delete", entityType: ENTITY, entityId: id, metadata: { hard: true, code: before.code, name: before.name } });
    return NextResponse.json({ id, error: null });
  }
  const now = new Date().toISOString();
  const { error } = await admin.from(TABLE).update({ is_active: false, deleted_at: now, updated_at: now }).eq("id", id);
  if (error) return bad(friendlyDbError(error.message));
  await writeAuditFor(request, admin, { action: "archive", entityType: ENTITY, entityId: id, metadata: { hard: false, code: before.code, name: before.name } });
  return NextResponse.json({ id, error: null });
}
