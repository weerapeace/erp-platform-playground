/**
 * ตั้งค่าหน้าวางแผนคอนเทนต์ — /api/marketing/content-plan-settings
 * GET → { platforms: string[] | null, placements: PlacementType[] | null }
 *        platforms = ช่องทางที่แสดงในหน้าวางแผน (เรียงตามลำดับ) · null = ยังไม่ตั้ง → แสดงทุกช่องทางที่เปิดใช้
 *        placements = ประเภทการลง (แต่งร้าน / ในสินค้า / Story …) แต่ละประเภทมีช่องทางของตัวเอง · null = ใช้ค่าเริ่มต้นในโค้ด
 * PUT   body = { platforms?, placements? } → บันทึกเฉพาะก้อนที่ส่งมา (null = กลับไปค่าเริ่มต้น)
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

type PlacementType = { key: string; label: string; icon: string | null; platforms: string[] };
function validatePlacements(v: unknown): string | null {
  if (!Array.isArray(v) || v.length > 20) return "ประเภทการลงไม่ถูกต้อง (สูงสุด 20 ประเภท)";
  const keys = new Set<string>();
  for (const t of v as Record<string, unknown>[]) {
    if (!t || typeof t.key !== "string" || !/^[a-z0-9_-]{1,40}$/i.test(t.key)) return "รหัสประเภทการลงไม่ถูกต้อง";
    if (keys.has(t.key)) return "รหัสประเภทการลงซ้ำ";
    keys.add(t.key);
    if (typeof t.label !== "string" || !t.label.trim() || t.label.length > 40) return "ใส่ชื่อประเภทการลง (ไม่เกิน 40 ตัวอักษร)";
    if (t.icon != null && (typeof t.icon !== "string" || t.icon.length > 8)) return "ไอคอนยาวเกินไป";
    if (!Array.isArray(t.platforms) || t.platforms.length === 0 || t.platforms.some((p) => typeof p !== "string" || !/^[a-z0-9_-]{1,60}$/i.test(p)))
      return `ประเภท "${t.label}" ต้องเลือกอย่างน้อย 1 ช่องทาง`;
  }
  return null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.view"); if (denied) return denied;
  const { data, error } = await supabaseAdmin().from("ui_config").select("value").eq("key", KEY).maybeSingle();
  if (error) return NextResponse.json({ platforms: null, error: error.message }, { status: 500 });
  const v = (data as { value?: { platforms?: unknown; placements?: unknown } } | null)?.value;
  const platforms = Array.isArray(v?.platforms) ? (v!.platforms as unknown[]).filter((x): x is string => typeof x === "string") : null;
  const placements = Array.isArray(v?.placements) ? (v!.placements as PlacementType[]) : null;
  return NextResponse.json({ platforms, placements, error: null });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "marketing.label.manage"); if (denied) return denied;
  let body: { platforms?: unknown; placements?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const admin = supabaseAdmin();
  const { data: before } = await admin.from("ui_config").select("value").eq("key", KEY).maybeSingle();
  const cur = ((before as { value?: Record<string, unknown> } | null)?.value ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { platforms: cur.platforms ?? null, placements: cur.placements ?? null };

  if ("platforms" in body) {
    if (body.platforms === null) next.platforms = null;
    else {
      if (!Array.isArray(body.platforms) || body.platforms.some((x) => typeof x !== "string" || !x || x.length > 60))
        return NextResponse.json({ error: "รายการช่องทางไม่ถูกต้อง" }, { status: 400 });
      const platforms = [...new Set(body.platforms as string[])].slice(0, 50);
      if (platforms.length === 0) return NextResponse.json({ error: "ต้องเลือกอย่างน้อย 1 ช่องทาง" }, { status: 400 });
      next.platforms = platforms;
    }
  }
  if ("placements" in body) {
    if (body.placements === null) next.placements = null;
    else {
      const err = validatePlacements(body.placements);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
      next.placements = (body.placements as PlacementType[]).map((t) => ({ key: t.key, label: t.label.trim(), icon: t.icon?.trim() || null, platforms: [...new Set(t.platforms)] }));
    }
  }
  const { error } = await admin.from("ui_config").upsert({ key: KEY, value: next, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ: " + error.message }, { status: 400 });
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(admin, {
    action: "update", entityType: "marketing_content_plan_settings", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { before: (before as { value?: unknown } | null)?.value ?? null, after: next },
  });
  return NextResponse.json({ platforms: next.platforms, placements: next.placements, error: null });
}
