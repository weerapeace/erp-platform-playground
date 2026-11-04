/**
 * /api/ai-office/scene — ค่าตกแต่งฉากออฟฟิศพิกเซล (ตัวละคร · โต๊ะ · ธีม) ของหน้า /master/ai-office
 * GET  = อ่าน (สิทธิ์ ai_office.view) · ยังไม่เคยบันทึก = ค่าเริ่มต้น
 * PUT  = บันทึกทั้งก้อน (สิทธิ์ ai_office.edit = แอดมิน) → cleanScene กรองก่อนเก็บ + audit `ai_office.scene_update`
 * เก็บใน ui_config key `ai_office_scene` แถวเดียว · กติกาค่าอยู่ที่ lib/ai-office-scene.ts
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { AI_OFFICE_PERM, AI_OFFICE_EDIT_PERM } from "@/lib/ai-office";
import { SCENE_CONFIG_KEY, cleanScene, sceneChanges } from "@/lib/ai-office-scene";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readScene(admin: ReturnType<typeof supabaseAdmin>) {
  const { data, error } = await admin.from("ui_config").select("value").eq("key", SCENE_CONFIG_KEY).maybeSingle();
  if (error) throw new Error(error.message);
  return cleanScene((data as { value?: unknown } | null)?.value);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, AI_OFFICE_PERM); if (denied) return denied;
  try {
    return NextResponse.json({ data: await readScene(supabaseAdmin()), error: null });
  } catch (e) {
    console.error("[ai-office/scene] GET", e instanceof Error ? e.message : e);
    return NextResponse.json({ data: cleanScene(null), error: "โหลดการตกแต่งไม่สำเร็จ ใช้แบบเริ่มต้นไปก่อน" });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, AI_OFFICE_EDIT_PERM); if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  const next = cleanScene(body);
  const admin = supabaseAdmin();
  let before = cleanScene(null);
  try { before = await readScene(admin); } catch { /* อ่านของเดิมไม่ได้ = เทียบกับค่าเริ่มต้น */ }
  const changes = sceneChanges(before, next);
  if (!changes.length) return NextResponse.json({ data: next, error: null });

  const { error } = await admin.from("ui_config").upsert({ key: SCENE_CONFIG_KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) {
    console.error("[ai-office/scene] PUT", error.message);
    return NextResponse.json({ error: "บันทึกการตกแต่งไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  }
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "ai_office.scene_update", entityType: "ui_config", entityId: null,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { key: SCENE_CONFIG_KEY, changes: changes.slice(0, 60) },
  });
  return NextResponse.json({ data: next, error: null });
}
