import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type PeriodRow = { id: string; period_name: string | null; status: string | null };
type DeleteFailed = { id: string; name?: string | null; reason: string };
type DeletedPeriod = { id: string; name: string | null; counts: Record<string, number> };

const CONFIRM_TEXT = "ลบงวดพร้อมข้อมูล";
const BLOCKED_STATUSES = new Set(["paid"]);

const PERIOD_TABLES = [
  { table: "payroll_audit_logs", label: "audit เดิมของ payroll" },
  { table: "payroll_payslips", label: "สลิปเงินเดือน" },
  { table: "payroll_lines", label: "รายการเงินเดือน" },
  { table: "payroll_runs", label: "รอบคำนวณ" },
  { table: "attendance_entries", label: "สาย/ขาด/เข้างาน" },
  { table: "leave_entries", label: "ลา" },
  { table: "overtime_entries", label: "OT" },
  { table: "advance_payments", label: "เงินเบิก/เงินล่วงหน้า" },
  { table: "payroll_adjustments", label: "รายการเพิ่ม/หัก" },
  { table: "payroll_period_holidays", label: "วันหยุดงวด" },
];

async function countByPeriod(admin: Admin, table: string, periodId: string): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("payroll_period_id", periodId);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function deleteByPeriod(admin: Admin, table: string, periodId: string): Promise<void> {
  const { error } = await admin.from(table).delete().eq("payroll_period_id", periodId);
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function getPaymentBatchIds(admin: Admin, periodId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("payment_batches")
    .select("id")
    .eq("payroll_period_id", periodId);
  if (error) throw new Error(`payment_batches: ${error.message}`);
  return (data ?? []).map((r) => String((r as { id: string }).id)).filter(Boolean);
}

async function countPaymentBatchLines(admin: Admin, batchIds: string[]): Promise<number> {
  if (batchIds.length === 0) return 0;
  const { count, error } = await admin
    .from("payment_batch_lines")
    .select("id", { count: "exact", head: true })
    .in("payment_batch_id", batchIds);
  if (error) throw new Error(`payment_batch_lines: ${error.message}`);
  return count ?? 0;
}

async function deletePaymentBatchLines(admin: Admin, batchIds: string[]): Promise<void> {
  if (batchIds.length === 0) return;
  const { error } = await admin.from("payment_batch_lines").delete().in("payment_batch_id", batchIds);
  if (error) throw new Error(`payment_batch_lines: ${error.message}`);
}

async function purgeOne(admin: Admin, period: PeriodRow): Promise<DeletedPeriod> {
  const counts: Record<string, number> = {};
  const batchIds = await getPaymentBatchIds(admin, period.id);
  counts["รายการในชุดจ่ายเงิน"] = await countPaymentBatchLines(admin, batchIds);
  counts["ชุดจ่ายเงิน"] = batchIds.length;
  for (const cfg of PERIOD_TABLES) counts[cfg.label] = await countByPeriod(admin, cfg.table, period.id);

  await deletePaymentBatchLines(admin, batchIds);
  await deleteByPeriod(admin, "payment_batches", period.id);

  for (const cfg of PERIOD_TABLES) await deleteByPeriod(admin, cfg.table, period.id);

  const { error } = await admin.from("payroll_periods").delete().eq("id", period.id);
  if (error) throw new Error(`payroll_periods: ${error.message}`);

  return { id: period.id, name: period.period_name, counts };
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;

  let body: { ids?: unknown; confirm_text?: string; actor?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((id) => String(id)).filter(Boolean))] : [];
  if (ids.length === 0) return NextResponse.json({ error: "ต้องเลือกรายการที่จะลบ" }, { status: 400 });
  if (ids.length > 20) return NextResponse.json({ error: "ลบงวดพร้อมข้อมูลได้ครั้งละไม่เกิน 20 รายการ" }, { status: 400 });
  if (String(body.confirm_text ?? "").trim() !== CONFIRM_TEXT) {
    return NextResponse.json({ error: `ต้องพิมพ์ "${CONFIRM_TEXT}" เพื่อยืนยัน` }, { status: 400 });
  }

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* best effort */ }

  const admin = supabaseAdmin();
  const deleted: DeletedPeriod[] = [];
  const failed: DeleteFailed[] = [];

  for (const id of ids) {
    let period: PeriodRow | undefined;
    try {
      const { data, error } = await admin
        .from("payroll_periods")
        .select("id, period_name, status")
        .eq("id", id)
        .limit(1);
      if (error) throw new Error(error.message);
      period = data?.[0] as PeriodRow | undefined;
      if (!period) {
        failed.push({ id, reason: "ไม่พบงวดเงินเดือน" });
        continue;
      }
      if (BLOCKED_STATUSES.has(String(period.status ?? ""))) {
        failed.push({ id, name: period.period_name, reason: "งวดสถานะจ่ายแล้วไม่อนุญาตให้ลบจากปุ่มนี้" });
        continue;
      }

      const result = await purgeOne(admin, period);
      deleted.push(result);
      await writeAudit(admin, {
        action: "purge_payroll_period",
        entityType: "payroll_periods",
        entityId: id,
        actorId: userId,
        actorName: body.actor ?? null,
        metadata: { period_name: period.period_name, status: period.status, counts: result.counts },
      });
    } catch (e) {
      const reason = e instanceof Error ? e.message : "ลบไม่สำเร็จ";
      failed.push({ id, name: period?.period_name, reason });
      await writeAudit(admin, {
        action: "purge_payroll_period_failed",
        entityType: "payroll_periods",
        entityId: id,
        actorId: userId,
        actorName: body.actor ?? null,
        metadata: { period_name: period?.period_name ?? null, status: period?.status ?? null, reason },
      });
    }
  }

  return NextResponse.json({ data: { deleted, failed }, error: failed.length ? "บางรายการลบไม่ได้" : null });
}
