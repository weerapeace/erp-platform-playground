/**
 * Payroll master — แก้หลายรายการ (bulk edit)
 * POST /api/payroll/master/<entity>/bulk-update
 *   { edits: [{ id, changes }], actor }   ← โหมดเลือกแถว (ที่ UI ใช้)
 * (โหมด "ทั้งหมดที่ตรงตัวกรอง" ไม่รองรับสำหรับตาราง master เล็ก — ให้เลือกแถวแล้วแก้)
 *
 * เดิมไม่มี route นี้ → POST ตกไปเข้า [entity]/[id] (id="bulk-update") → 405 body ว่าง
 * → ฝั่ง client parse JSON ไม่ได้ ("Unexpected end of JSON input")
 */
import { NextRequest, NextResponse } from "next/server";
import { getEntityCfg, updateMaster } from "@/lib/payroll-master-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ entity: string }> };

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { entity } = await ctx.params;
  const cfg = getEntityCfg(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });

  let body: { edits?: { id: string; changes: Record<string, unknown> }[]; changes?: Record<string, unknown>; actor?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const edits = Array.isArray(body.edits) ? body.edits : [];
  if (edits.length === 0) {
    if (body.changes) return NextResponse.json({ error: "โหมด “แก้ทั้งหมดที่ตรงตัวกรอง” ยังไม่รองรับตารางนี้ — เลือกแถวที่ต้องการแล้วแก้" }, { status: 400 });
    return NextResponse.json({ affected: 0, error: null });
  }

  let affected = 0;
  const errors: string[] = [];
  for (const e of edits) {
    if (!e?.id || !e.changes || typeof e.changes !== "object") continue;
    try { const row = await updateMaster(cfg, String(e.id), e.changes); if (row) affected++; }
    catch (err) { errors.push(err instanceof Error ? err.message : "แก้บางแถวไม่สำเร็จ"); }
  }
  await writeAudit(supabaseAdmin(), { action: "bulk_update", entityType: cfg.table, actorName: body.actor ?? null, metadata: { count: affected } });
  if (affected === 0 && errors.length > 0) return NextResponse.json({ error: errors[0] }, { status: 400 });
  return NextResponse.json({ affected, error: null });
}
