import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PeriodRow = { id: string; period_name: string | null; status: string | null };
type DeleteFailed = { id: string; name?: string | null; reason: string };

const TEST_PERIOD_NAME = /(test|demo|draft|manual input|ทดสอบ|ทดลอง)/i;
const BLOCKING_TABLES = [
  { table: "payroll_runs", label: "รันคำนวณ" },
  { table: "payroll_lines", label: "รายการเงินเดือน" },
  { table: "payroll_payslips", label: "สลิปเงินเดือน" },
  { table: "attendance_entries", label: "ข้อมูลเข้างาน" },
  { table: "leave_entries", label: "ข้อมูลลา" },
  { table: "overtime_entries", label: "ข้อมูล OT" },
  { table: "advance_payments", label: "เงินเบิก/เงินล่วงหน้า" },
  { table: "payroll_adjustments", label: "รายการเพิ่ม/หัก" },
  { table: "payment_batches", label: "ชุดจ่ายเงิน" },
];

async function countLinkedRows(admin: ReturnType<typeof supabaseAdmin>, table: string, periodId: string): Promise<number> {
  const { count, error } = await admin
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("payroll_period_id", periodId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;

  let body: { ids?: unknown; actor?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map((id) => String(id)).filter(Boolean))] : [];
  if (ids.length === 0) return NextResponse.json({ error: "ต้องเลือกรายการที่จะลบ" }, { status: 400 });
  if (ids.length > 50) return NextResponse.json({ error: "ลบงวดทดสอบได้ครั้งละไม่เกิน 50 รายการ" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* best effort */ }

  const admin = supabaseAdmin();
  const deleted: string[] = [];
  const failed: DeleteFailed[] = [];

  for (const id of ids) {
    try {
      const { data, error } = await admin
        .from("payroll_periods")
        .select("id, period_name, status")
        .eq("id", id)
        .limit(1);
      if (error) throw new Error(error.message);

      const period = data?.[0] as PeriodRow | undefined;
      if (!period) {
        failed.push({ id, reason: "ไม่พบงวดเงินเดือน" });
        continue;
      }

      const periodName = String(period.period_name ?? "");
      if (!TEST_PERIOD_NAME.test(periodName)) {
        failed.push({ id, name: period.period_name, reason: "ชื่อไม่ใช่งวดทดสอบ/test/demo" });
        continue;
      }

      const blockers: string[] = [];
      for (const cfg of BLOCKING_TABLES) {
        const n = await countLinkedRows(admin, cfg.table, id);
        if (n > 0) blockers.push(`${cfg.label} ${n} รายการ`);
      }
      if (blockers.length > 0) {
        failed.push({ id, name: period.period_name, reason: `มีข้อมูลผูกอยู่: ${blockers.join(", ")}` });
        continue;
      }

      const { error: holidayError } = await admin.from("payroll_period_holidays").delete().eq("payroll_period_id", id);
      if (holidayError) throw new Error(holidayError.message);

      const { error: deleteError } = await admin.from("payroll_periods").delete().eq("id", id);
      if (deleteError) throw new Error(deleteError.message);

      deleted.push(id);
      await writeAudit(admin, {
        action: "delete_test_period",
        entityType: "payroll_periods",
        entityId: id,
        actorId: userId,
        actorName: body.actor ?? null,
        metadata: { period_name: period.period_name, status: period.status },
      });
    } catch (e) {
      failed.push({ id, reason: e instanceof Error ? e.message : "ลบไม่สำเร็จ" });
    }
  }

  return NextResponse.json({ data: { deleted, failed }, error: failed.length ? "บางรายการลบไม่ได้" : null });
}
