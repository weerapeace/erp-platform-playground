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
import { writeAuditFor, writeAuditMany, auditChangeMeta, auditRecordLabel, type AuditEntry } from "@/lib/audit";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
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
  // ค่าเดิมของทุกแถว (อ่านครั้งเดียว) → จดประวัติรายแถวว่าเปลี่ยนจากอะไรเป็นอะไร (ไม่เกิน 200 แถว)
  const admin = supabaseAdmin();
  const ids = edits.filter((e) => e?.id).map((e) => String(e.id)).slice(0, 200);
  const { data: beforeRows } = ids.length ? await admin.from(cfg.table).select("*").in("id", ids) : { data: [] };
  const beforeById = new Map(((beforeRows ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), r]));
  const perRow: Omit<AuditEntry, "actorId" | "actorName">[] = [];
  for (const e of edits) {
    if (!e?.id || !e.changes || typeof e.changes !== "object") continue;
    try {
      const row = await updateMaster(cfg, String(e.id), e.changes);
      if (row) {
        affected++;
        const before = beforeById.get(String(e.id)) ?? null;
        if (before) perRow.push({ action: "update", entityType: cfg.table, entityId: String(e.id), metadata: { via: "bulk", ...auditRecordLabel(before), ...auditChangeMeta(before, e.changes, { onlyKnown: true }) } });
      }
    }
    catch (err) { errors.push(err instanceof Error ? err.message : "แก้บางแถวไม่สำเร็จ"); }
  }
  if (perRow.length) {
    let actorId: string | null = null, actorName: string | null = null;
    try { const { data: { user } } = await supabaseFromRequest(req).auth.getUser(); actorId = user?.id ?? null; actorName = user?.email ?? null; } catch { /* ไม่มีตัวตน */ }
    await writeAuditMany(admin, perRow.map((x) => ({ ...x, actorId, actorName })));
  }
  await writeAuditFor(req, admin, { action: "bulk_update", entityType: cfg.table, metadata: { count: affected } });
  if (affected === 0 && errors.length > 0) return NextResponse.json({ error: errors[0] }, { status: 400 });
  return NextResponse.json({ affected, error: null });
}
