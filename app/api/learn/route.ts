/**
 * 🎓 ศูนย์เรียนรู้ — รายการบทเรียน / สร้างบทเรียน
 * GET  /api/learn           → บทเรียน + ขั้นตอน (learn.view เห็นเฉพาะที่เผยแพร่ · learn.manage เห็นร่างด้วย)
 * GET  /api/learn?trash=1   → บทเรียนในถังขยะ (learn.manage)
 * POST /api/learn           → สร้างบทเรียน (learn.manage) · ค่าเริ่ม = ร่าง รอตรวจ · ส่ง steps มาด้วยได้
 * ตารางเดียวกับคู่มือวิธีใช้งาน (erp_help_guides kind = "lesson") · audit ทุกการเขียน
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { apiCan, guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { requestActor } from "@/lib/request-actor";
import { LEARN_MANAGE, LEARN_VIEW, LESSON_COLS, cleanLessonBody, cleanSteps, type Lesson } from "@/lib/learn";
import { attachSteps, stepRows } from "@/lib/learn-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_VIEW); if (denied) return denied;
  const trash = new URL(request.url).searchParams.get("trash") === "1";
  const canManage = await apiCan(request, LEARN_MANAGE);
  if (trash && !canManage) return bad("ไม่มีสิทธิ์ดูถังขยะบทเรียน", 403);

  let q = supabaseAdmin().from("erp_help_guides").select(LESSON_COLS).eq("kind", "lesson").eq("is_active", !trash);
  if (!canManage) q = q.eq("status", "published");
  const { data, error } = await q.order("sort_order", { ascending: true }).order("title", { ascending: true });
  if (error) return bad("โหลดบทเรียนไม่สำเร็จ กรุณาลองใหม่", 500);
  const lessons = await attachSteps((data ?? []) as unknown as Omit<Lesson, "steps">[]);
  return NextResponse.json({ data: lessons, canManage, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const v = cleanLessonBody(body, false);
  if (!v.ok) return bad(v.error);
  const steps = cleanSteps(body.steps);

  const admin = supabaseAdmin();
  const actor = await requestActor(supabaseFromRequest(request));
  const { data: mx } = await admin.from("erp_help_guides").select("sort_order").eq("kind", "lesson").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("erp_help_guides").insert({
    ...v.patch, kind: "lesson", is_active: true,
    sort_order: v.patch.sort_order ?? (((mx?.sort_order as number | undefined) ?? 0) + 1),
    created_by: actor.name, updated_by: actor.name,
  }).select(LESSON_COLS).single();
  if (error || !data) return bad("สร้างบทเรียนไม่สำเร็จ กรุณาลองใหม่", 500);
  const id = (data as unknown as { id: string }).id;
  if (steps.length) {
    const { error: se } = await admin.from("erp_help_guide_steps").insert(stepRows(id, steps));
    if (se) return bad("บันทึกขั้นตอนไม่สำเร็จ กรุณาลองใหม่", 500);
  }
  await writeAuditFor(request, admin, {
    action: "create", entityType: "learn_lesson", entityId: id,
    metadata: { name: v.patch.title, status: v.patch.status, steps: steps.length, source_url: v.patch.source_url ?? null },
  });
  const [lesson] = await attachSteps([data as unknown as Omit<Lesson, "steps">]);
  return NextResponse.json({ data: lesson, error: null });
}
