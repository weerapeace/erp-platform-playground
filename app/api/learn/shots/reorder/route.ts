/**
 * 🎬 Video Shot — จัดลำดับช็อต (learn.manage)
 * POST /api/learn/shots/reorder  { ids: string[] }  → ช็อตตาม ids ได้ sort_order = ลำดับในรายการ (0,1,2…)
 * ย้อนกลับ = ส่งลำดับเดิมมาอีกครั้ง · audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { LEARN_MANAGE } from "@/lib/learn";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, LEARN_MANAGE); if (denied) return denied;
  let body: { ids?: unknown };
  try { body = await request.json(); } catch { return bad("ข้อมูลที่ส่งมาไม่ถูกต้อง"); }
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x)) : [];
  if (!ids.length || ids.length > 500) return bad("ไม่มีช็อตให้จัดลำดับ");
  const admin = supabaseAdmin();
  const results = await Promise.all(ids.map((id, i) => admin.from("erp_video_shots").update({ sort_order: i }).eq("id", id)));
  if (results.some((r) => r.error)) return bad("จัดลำดับไม่สำเร็จ กรุณาลองใหม่", 500);
  await writeAuditFor(request, admin, { action: "update", entityType: "learn_shot", entityId: ids[0], metadata: { reorder: true, order: ids } });
  return NextResponse.json({ data: { ids }, error: null });
}
