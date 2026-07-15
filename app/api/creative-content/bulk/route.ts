/**
 * Creative Content — bulk operations
 * POST /api/creative-content/bulk  body = { action: "delete", ids: string[] }
 *   → soft delete ทีเดียวหลายรายการ (query เดียว ไม่วนยิงทีละตัว) + audit + รายงานผล
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.delete"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { action?: string; ids?: string[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (body.action !== "delete") return NextResponse.json({ error: "action ไม่ถูกต้อง (รองรับ: delete)" }, { status: 400 });
  const ids = [...new Set((body.ids ?? []).filter(Boolean))];
  if (ids.length === 0) return NextResponse.json({ error: "ไม่มีรายการที่เลือก" }, { status: 400 });
  if (ids.length > 200) return NextResponse.json({ error: "เลือกได้ครั้งละไม่เกิน 200 รายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  // เก็บเลขที่เอกสารก่อนลบ ไว้ตามรอยใน audit
  const { data: rows } = await admin.from("erp_creative_content").select("id, content_no").in("id", ids);
  const { error } = await admin.from("erp_creative_content")
    .update({ is_active: false, updated_at: new Date().toISOString() }).in("id", ids);
  if (error) return NextResponse.json({ error: friendlyDbError(error.message), success: 0, failed: ids.length }, { status: 400 });

  await writeAudit(admin, {
    action: "bulk_delete", entityType: "creative_content", entityId: ids[0], actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { count: ids.length, ids, content_nos: ((rows ?? []) as { content_no?: string | null }[]).map((r) => r.content_no).filter(Boolean) },
  });
  return NextResponse.json({ success: ids.length, failed: 0, error: null });
}
