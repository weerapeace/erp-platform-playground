/**
 * 🐾 ทะเบียนแมว — ค่าตั้ง (ตารางมื้ออาหารเปียก · แจ้งเตือน LINE)
 * GET /api/cats/settings  → { data: { meal_plan, notify, line: { botReady, groupSet, eventOn } } }  (สิทธิ์ cats.view)
 * PUT /api/cats/settings  body { key: "meal_plan" | "notify", value }                              (สิทธิ์ cats.edit · audit)
 * กลุ่ม LINE ปลายทางตั้งที่ศูนย์ LINE (/admin/line) ช่อง "กลุ่มแมว" (lib/line-registry slot "cats")
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAuditFor } from "@/lib/audit";
import { friendlyDbError } from "@/app/api/master-v2/[entity]/route";
import { CATS_EDIT, CATS_VIEW } from "@/lib/cats";
import { asMealPlan, asNotify, cleanMealPlan, cleanNotify } from "@/lib/cats-supplies";
import { lineEventEnabled } from "@/lib/line-registry";
import { lineTokenFor, loadLineConfig } from "@/lib/line-send";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

async function lineStatus(admin: ReturnType<typeof supabaseAdmin>) {
  try {
    const cfg = await loadLineConfig(admin);
    return { botReady: !!lineTokenFor(cfg, "cats"), groupSet: !!cfg.groups?.cats, eventOn: lineEventEnabled(cfg.disabled_events, "cat_reminder") };
  } catch {
    return { botReady: false, groupSet: false, eventOn: true };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, CATS_VIEW); if (denied) return denied;
  const admin = supabaseAdmin();
  const { data, error } = await admin.from("cat_settings").select("key, value");
  if (error) return bad(friendlyDbError(error.message), 500);
  const m = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  return NextResponse.json({ data: { meal_plan: asMealPlan(m.meal_plan), notify: asNotify(m.notify), line: await lineStatus(admin) }, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, CATS_EDIT); if (denied) return denied;
  let body: { key?: string; value?: unknown };
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const r = body.key === "meal_plan" ? cleanMealPlan(body.value) : body.key === "notify" ? cleanNotify(body.value) : null;
  if (!r) return bad("ไม่รู้จักค่าตั้งนี้");
  if (!r.ok) return bad(r.error);
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("cat_settings").select("value").eq("key", body.key!).maybeSingle();
  const { error } = await admin.from("cat_settings").upsert({ key: body.key!, value: r.value, updated_at: new Date().toISOString() });
  if (error) return bad(friendlyDbError(error.message));
  const old = body.key === "meal_plan" ? asMealPlan(before?.value) : asNotify(before?.value);
  await writeAuditFor(request, admin, {
    action: "setting_change", entityType: "cat_settings", entityId: null,
    metadata: { key: body.key, ...auditChangeMeta(old as unknown as Record<string, unknown>, r.value as unknown as Record<string, unknown>) },
  });
  return NextResponse.json({ data: r.value, error: null });
}
