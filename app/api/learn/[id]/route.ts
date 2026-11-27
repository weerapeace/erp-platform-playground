/**
 * 🎓 ศูนย์เรียนรู้ — แก้ / ลบ บทเรียนเดียว (learn.manage)
 * PATCH  /api/learn/<id>          → ส่งเฉพาะช่องที่แก้ · steps = แทนที่ขั้นตอนทั้งชุด · is_active:true = กู้คืนจากถังขยะ
 *                                   status "published" = เผยแพร่ · "draft" = ซ่อนกลับเป็นร่าง
 * DELETE /api/learn/<id>          → ลบแบบเก็บไว้ก่อน (ย้ายเข้าถังขยะ)
 * DELETE /api/learn/<id>?hard=1   → ลบถาวร — เฉพาะบทที่อยู่ในถังขยะ (ขั้นตอนหายด้วย)
 * audit ทุกการเขียน (changes: จาก → เป็น · ขั้นตอนเทียบแบบย่อ)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, auditDiff, writeAuditFor } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { LEARN_MANAGE, cleanLessonBody, cleanSteps } from "@/lib/learn";
import { loadLesson, stepRows, stepsDigest } from "@/lib/learn-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

export async function PATCH(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  const { id } = await ctx.params;
  const before = await loadLesson(id);
  if (!before) return bad("ไม่พบบทเรียนนี้", 404);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const v = cleanLessonBody(body, true);
  if (!v.ok) return bad(v.error);
  const steps = Array.isArray(body.steps) ? cleanSteps(body.steps) : null;

  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const now = new Date().toISOString();
  const out: Record<string, unknown> = { ...v.patch, updated_at: now, updated_by: actor.name };
  if (v.patch.is_active === true) out.deleted_at = null;
  if (v.patch.is_active === false) out.deleted_at = now;
  const { error } = await admin.from("erp_help_guides").update(out).eq("id", id).eq("kind", "lesson");
  if (error) return bad("บันทึกบทเรียนไม่สำเร็จ กรุณาลองใหม่", 500);

  if (steps) {
    const { error: de } = await admin.from("erp_help_guide_steps").delete().eq("guide_id", id);
    if (de) return bad("บันทึกขั้นตอนไม่สำเร็จ กรุณาลองใหม่", 500);
    if (steps.length) {
      const { error: ie } = await admin.from("erp_help_guide_steps").insert(stepRows(id, steps));
      if (ie) return bad("บันทึกขั้นตอนไม่สำเร็จ กรุณาลองใหม่", 500);
    }
  }

  const action = v.patch.is_active === true && !before.is_active ? "restore"
    : v.patch.is_active === false && before.is_active ? "archive"
    : v.patch.status === "published" && before.status !== "published" ? "publish"
    : "update";
  const stepChanges = steps ? auditDiff({ steps: stepsDigest(before.steps) }, { steps: stepsDigest(steps) }) : [];
  const meta = auditChangeMeta(before as unknown as Record<string, unknown>, v.patch);
  await writeAuditFor(request, admin, {
    action, entityType: "learn_lesson", entityId: id,
    metadata: { name: v.patch.title ?? before.title, ...meta, changes: [...(meta.changes ?? []), ...stepChanges] },
  });
  return NextResponse.json({ data: await loadLesson(id), error: null });
}

export async function DELETE(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  const { id } = await ctx.params;
  const before = await loadLesson(id);
  if (!before) return bad("ไม่พบบทเรียนนี้", 404);
  const hard = new URL(request.url).searchParams.get("hard") === "1";
  const admin = supabaseAdmin();
  if (hard) {
    if (before.is_active) return bad("ลบถาวรได้เฉพาะบทที่อยู่ในถังขยะ — ย้ายเข้าถังขยะก่อน", 409);
    await admin.from("erp_help_guide_steps").delete().eq("guide_id", id);
    const { error } = await admin.from("erp_help_guides").delete().eq("id", id).eq("kind", "lesson");
    if (error) return bad("ลบถาวรไม่สำเร็จ กรุณาลองใหม่", 500);
    await writeAuditFor(request, admin, { action: "delete", entityType: "learn_lesson", entityId: id, metadata: { hard: true, name: before.title, snapshot: before } });
    return NextResponse.json({ data: { id }, error: null });
  }
  const now = new Date().toISOString();
  const { error } = await admin.from("erp_help_guides").update({ is_active: false, deleted_at: now, updated_at: now }).eq("id", id).eq("kind", "lesson");
  if (error) return bad("ลบไม่สำเร็จ กรุณาลองใหม่", 500);
  await writeAuditFor(request, admin, { action: "archive", entityType: "learn_lesson", entityId: id, metadata: { hard: false, name: before.title } });
  return NextResponse.json({ data: { id }, error: null });
}
