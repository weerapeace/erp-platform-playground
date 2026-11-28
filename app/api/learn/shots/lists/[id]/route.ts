/**
 * 🎬 Video Shot — แก้ / ลบ ชุดช็อต (learn.manage)
 * PATCH  /api/learn/shots/lists/<id>          → ชื่อ · คำอธิบาย · is_active:true = กู้คืน
 * DELETE /api/learn/shots/lists/<id>          → ลบแบบเก็บไว้ก่อน (ช็อตในชุดยังอยู่ครบ กู้ชุดคืนแล้วกลับมาเหมือนเดิม)
 * DELETE /api/learn/shots/lists/<id>?hard=1   → ลบถาวร — เฉพาะชุดในถังขยะ · ช็อตในชุดไม่ถูกลบ (กลายเป็น "ไม่อยู่ในชุด")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAuditFor } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { LEARN_MANAGE } from "@/lib/learn";
import { cleanShotListBody } from "@/lib/video-shot";
import { loadShotList } from "@/lib/video-shot-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  const { id } = await ctx.params;
  const before = await loadShotList(id);
  if (!before) return bad("ไม่พบชุดช็อตนี้", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const v = cleanShotListBody(body, true);
  if (!v.ok) return bad(v.error);
  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const now = new Date().toISOString();
  const out: Record<string, unknown> = { ...v.patch, updated_at: now, updated_by: actor.name };
  if (v.patch.is_active === true) out.deleted_at = null;
  if (v.patch.is_active === false) out.deleted_at = now;
  const { error } = await admin.from("erp_video_shot_lists").update(out).eq("id", id);
  if (error) return bad("บันทึกชุดช็อตไม่สำเร็จ กรุณาลองใหม่", 500);
  const action = v.patch.is_active === true && !before.is_active ? "restore" : v.patch.is_active === false && before.is_active ? "archive" : "update";
  const meta = auditChangeMeta(before as unknown as Record<string, unknown>, v.patch as Record<string, unknown>);
  await writeAuditFor(request, admin, { action, entityType: "learn_shot_list", entityId: id, metadata: { name: v.patch.name ?? before.name, ...meta } });
  return NextResponse.json({ data: await loadShotList(id), error: null });
}

export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  const { id } = await ctx.params;
  const before = await loadShotList(id);
  if (!before) return bad("ไม่พบชุดช็อตนี้", 404);
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const admin = supabaseAdmin();
  if (hard) {
    if (before.is_active) return bad("ลบถาวรได้เฉพาะชุดที่อยู่ในถังขยะ — ย้ายเข้าถังขยะก่อน", 409);
    const { error } = await admin.from("erp_video_shot_lists").delete().eq("id", id);
    if (error) return bad("ลบถาวรไม่สำเร็จ กรุณาลองใหม่", 500);
    await writeAuditFor(request, admin, { action: "delete", entityType: "learn_shot_list", entityId: id, metadata: { hard: true, name: before.name, snapshot: before } });
    return NextResponse.json({ data: { id }, error: null });
  }
  const now = new Date().toISOString();
  const { error } = await admin.from("erp_video_shot_lists").update({ is_active: false, deleted_at: now, updated_at: now }).eq("id", id);
  if (error) return bad("ลบไม่สำเร็จ กรุณาลองใหม่", 500);
  await writeAuditFor(request, admin, { action: "archive", entityType: "learn_shot_list", entityId: id, metadata: { hard: false, name: before.name } });
  return NextResponse.json({ data: { id }, error: null });
}
