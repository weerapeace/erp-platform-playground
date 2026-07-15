/**
 * Creative Tasks — bulk edit
 * POST /api/creative-tasks/bulk  body = { items: [{ id, changes }] }
 *   → แก้หลายงานในคำขอเดียว (ลดยิงทีละงาน) · เฉพาะฟิลด์ปลอดภัย (ไม่รวมสถานะ — ต้องผ่าน workflow)
 *   → per-item try + รายงานผลสำเร็จ/ล้มเหลว + audit รวม 1 รายการ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { friendlyDbError } from "../../master-v2/[entity]/route";
import { validateTaskFields } from "../shared";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// ฟิลด์ที่ bulk แก้ได้ (ตรงกับ bulkEditFields ฝั่ง UI) — ไม่มี status (ต้องผ่าน workflow รายตัว)
const BULK_EDITABLE = new Set(["priority", "task_type", "brand_id", "campaign_id", "due_date", "start_date", "asset_status"]);

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "tasks.edit"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: { items?: { id?: string; changes?: Record<string, unknown> }[] };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const items = (body.items ?? []).filter((x) => x?.id && x.changes && Object.keys(x.changes).length);
  if (items.length === 0) return NextResponse.json({ error: "ไม่มีรายการที่จะแก้" }, { status: 400 });
  if (items.length > 200) return NextResponse.json({ error: "แก้ได้ครั้งละไม่เกิน 200 รายการ" }, { status: 400 });

  const admin = supabaseAdmin();
  let success = 0;
  const failures: { id: string; error: string }[] = [];
  for (const it of items) {
    const id = String(it.id);
    try {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      for (const [k, v] of Object.entries(it.changes ?? {})) if (BULK_EDITABLE.has(k)) patch[k] = v === "" ? null : v;
      if (Object.keys(patch).length <= 1) { failures.push({ id, error: "ไม่มีฟิลด์ที่อนุญาตให้แก้" }); continue; }
      const vErr = validateTaskFields(it.changes ?? {});
      if (vErr) { failures.push({ id, error: vErr }); continue; }
      const { error } = await admin.from("erp_creative_tasks").update(patch).eq("id", id);
      if (error) { failures.push({ id, error: friendlyDbError(error.message) }); continue; }
      success++;
    } catch (e) { failures.push({ id, error: (e as Error).message }); }
  }

  await writeAudit(admin, {
    action: "bulk_edit", entityType: "creative_task", entityId: String(items[0].id), actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { count: items.length, success, failed: failures.length, ids: items.map((x) => x.id), fields: [...new Set(items.flatMap((x) => Object.keys(x.changes ?? {})))] },
  });
  return NextResponse.json({ success, failed: failures.length, failures, error: null });
}
