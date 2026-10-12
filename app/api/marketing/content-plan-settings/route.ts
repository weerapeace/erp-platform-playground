/**
 * ตั้งค่าหน้าวางแผนคอนเทนต์ — /api/marketing/content-plan-settings
 * GET → { platforms: string[] | null }   ช่องทางที่แสดงในหน้าวางแผน (เรียงตามลำดับ) · null = ยังไม่ตั้ง → แสดงทุกช่องทางที่เปิดใช้
 * PUT   body = { platforms: string[] | null } → บันทึก (null = กลับไปแสดงทุกช่องทาง)
 *
 * เก็บใน ui_config(key='marketing_content_plan') · ช่องทางมาจากรายการกลาง creative-options kind=platform
 * สิทธิ์: อ่าน = tasks.view · แก้ = marketing.label.manage (ตั้งค่าร่วมทั้งทีม)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const KEY = "marketing_content_plan";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("ui_config").select("value").eq("key", KEY).maybeSingle();
  if (error) return NextResponse.json({ platforms: null, error: error.message }, { status: 500 });
  const v = (data as { value?: { platforms?: unknown } } | null)?.value;
  const platforms = Array.isArray(v?.platforms) ? (v!.platforms as unknown[]).filter((x): x is string => typeof x === "string") : null;
  return NextResponse.json({ platforms, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.label.manage"); if (denied) return denied;
  let body: { platforms?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  let platforms: string[] | null = null;
  if (body.platforms !== null) {
    if (!Array.isArray(body.platforms) || body.platforms.some((x) => typeof x !== "string" || !x || x.length > 60))
      return NextResponse.json({ error: "รายการช่องทางไม่ถูกต้อง" }, { status: 400 });
    platforms = [...new Set(body.platforms as string[])].slice(0, 50);
    if (platforms.length === 0) return NextResponse.json({ error: "ต้องเลือกอย่างน้อย 1 ช่องทาง" }, { status: 400 });
  }
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("ui_config").select("value").eq("key", KEY).maybeSingle();
  const { error } = await admin.from("ui_config").upsert({ key: KEY, value: { platforms }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "update", entityType: "marketing_content_plan_settings", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { before: (before as { value?: unknown } | null)?.value ?? null, platforms },
  });
  return NextResponse.json({ platforms, error: null });
}
