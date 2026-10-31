/**
 * ตัวโหลดข้อมูลหน้า "ตรวจทั้งงวด" (server-only)
 * - loadPeriodRecheck: อ่านอย่างเดียว — ดึงผลคำนวณที่บันทึก + รายการต้นทางทั้งหมดของงวด + คำนวณสดเทียบ แล้วส่งให้ buildPeriodRecheck
 * - applyPeriodReprice: ปุ่ม "คิดราคาใหม่" — เขียนราคาสาย/ขาด/ลา/OT ตามสูตรตอนนี้ (เฉพาะรายการที่ผู้ใช้เห็นในตัวอย่าง + audit)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { computePeriodPreview } from "@/lib/payroll-calc-engine";
import { validatePayrollPeriod } from "@/lib/payroll-validation";
import { buildPeriodRecheck, type PeriodRecheck, type RepriceItem } from "@/lib/payroll-period-recheck";
import { money, roundMoney } from "@/lib/payroll-calc";
import { writeAuditMany } from "@/lib/audit";

type Row = Record<string, unknown>;

export async function loadPeriodRecheck(periodId: string): Promise<PeriodRecheck> {
  const a = supabaseAdmin();
  const [preview, validation, runRes] = await Promise.all([
    computePeriodPreview(periodId).catch(() => null),
    validatePayrollPeriod(periodId).catch(() => null),
    a.from("payroll_runs").select("id, run_no, calculated_at, created_at").eq("payroll_period_id", periodId).order("run_no", { ascending: false }).limit(1),
  ]);
  if (runRes.error) throw new Error(runRes.error.message);
  const run = (runRes.data?.[0] ?? null) as Row | null;

  let period = preview?.period ?? null;
  if (!period) {
    const { data, error } = await a.from("payroll_periods").select("*, payroll_period_holidays(*)").eq("id", periodId).limit(1);
    if (error) throw new Error(error.message);
    period = (data?.[0] as Row) ?? null;
  }
  if (!period) throw new Error("ไม่พบงวดเงินเดือน");

  let savedLines: Row[] = [];
  if (run) {
    const { data, error } = await a.from("payroll_lines").select("*").eq("payroll_run_id", String(run.id));
    if (error) throw new Error(error.message);
    savedLines = (data ?? []) as Row[];
  }
  const liveLines = preview?.lines ?? null;
  const empIds = [...new Set([...savedLines, ...(liveLines ?? [])].map((l) => String(l.employee_id)))];
  const none = Promise.resolve({ data: [] as Row[], error: null });

  const [empRes, setRes, attRes, leaveRes, otRes, advRes, adjRes, recRes, batchRes] = await Promise.all([
    empIds.length ? a.from("employees").select("id, employee_code, first_name, last_name, nickname").in("id", empIds) : none,
    empIds.length ? a.from("employee_payroll_settings").select("*").in("employee_id", empIds) : none,
    a.from("attendance_entries").select("*").eq("payroll_period_id", periodId),
    a.from("leave_entries").select("*").eq("payroll_period_id", periodId),
    a.from("overtime_entries").select("*").eq("payroll_period_id", periodId),
    a.from("advance_payments").select("*").eq("payroll_period_id", periodId),
    a.from("payroll_adjustments").select("*").eq("payroll_period_id", periodId),
    empIds.length ? a.from("employee_recurring_pay_items").select("*").eq("status", "active").lte("start_date", String(period.end_date)).in("employee_id", empIds) : none,
    a.from("payment_batches").select("*, payment_batch_lines(*)").eq("payroll_period_id", periodId),
  ]);
  for (const r of [empRes, setRes, attRes, leaveRes, otRes, advRes, adjRes, recRes, batchRes]) if (r.error) throw new Error(r.error.message);

  return buildPeriodRecheck({
    period, run, savedLines, liveLines,
    employees: new Map(((empRes.data ?? []) as Row[]).map((e) => [String(e.id), e])),
    contracts: preview?.contracts ?? new Map(),
    settings: new Map(((setRes.data ?? []) as Row[]).map((s) => [String(s.employee_id), s])),
    attendance: (attRes.data ?? []) as Row[],
    leave: (leaveRes.data ?? []) as Row[],
    overtime: (otRes.data ?? []) as Row[],
    advances: (advRes.data ?? []) as Row[],
    adjustments: (adjRes.data ?? []) as Row[],
    recurring: (recRes.data ?? []) as Row[],
    batches: (batchRes.data ?? []) as Row[],
    validationIssues: validation?.issues,
  });
}

const EDITABLE = new Set(["draft", "review"]);

export type RepriceResult = {
  updated: number;
  net_effect: number;                                        // ผลต่อสุทธิรวมของรายการที่เปลี่ยนแล้ว
  skipped: { key: string; label: string; reason: string }[];
};

/** คิดราคาใหม่ตามสูตรตอนนี้ — ตรวจทั้งงวดใหม่ฝั่ง server (ไม่เชื่อราคาจากหน้าจอ) แล้วเขียนเฉพาะรายการที่
 *  ผู้ใช้ยืนยันและราคาใหม่ยังเท่ากับที่เห็นในตัวอย่าง · กันทับคนอื่น: อัปเดตเฉพาะแถวที่ราคายังเป็นค่าเดิม
 *  จำนวนชั่วโมง/นาทีไม่เปลี่ยน · ผลคำนวณที่บันทึกไว้ไม่เปลี่ยน (ต้องคำนวณงวดใหม่เอง) */
export async function applyPeriodReprice(
  periodId: string,
  confirmed: { key: string; new_amount: number }[],
  actor: { id: string | null; name: string | null },
): Promise<RepriceResult> {
  const recheck = await loadPeriodRecheck(periodId);
  if (!EDITABLE.has(recheck.period.status)) throw new Error(`งวดสถานะ "${recheck.period.status}" แก้ไม่ได้แล้ว`);
  const plan = new Map(recheck.reprice.map((it) => [it.key, it]));
  const skipped: RepriceResult["skipped"] = [];
  const todo: RepriceItem[] = [];
  for (const c of confirmed) {
    const it = plan.get(c.key);
    if (!it) { skipped.push({ key: c.key, label: "รายการนี้", reason: "ราคาตรงสูตรแล้ว หรือรายการถูกแก้/ลบไปแล้ว" }); continue; }
    if (Math.abs(it.new_amount - money(c.new_amount)) > 0.005) {
      skipped.push({ key: c.key, label: `${it.code} ${it.label}`, reason: `ราคาใหม่เปลี่ยนเป็น ฿${it.new_amount} ระหว่างที่เปิดดู — เปิดดูใหม่แล้วกดอีกครั้ง` });
      continue;
    }
    todo.push(it);
  }

  const a = supabaseAdmin();
  const now = new Date().toISOString();
  const done: RepriceItem[] = [];
  for (let i = 0; i < todo.length; i += 10) {
    await Promise.all(todo.slice(i, i + 10).map(async (it) => {
      const { data, error } = await a.from(it.ref.table)
        .update({ [it.ref.field]: it.new_amount, updated_at: now })
        .eq("id", it.ref.id).eq("payroll_period_id", periodId)
        .gte(it.ref.field, it.old_amount - 0.005).lte(it.ref.field, it.old_amount + 0.005)
        .select("id");
      if (error) {
        console.error(`[payroll-reprice] ${it.key}:`, error.message);
        skipped.push({ key: it.key, label: `${it.code} ${it.label}`, reason: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" });
      } else if (!data?.length) {
        skipped.push({ key: it.key, label: `${it.code} ${it.label}`, reason: "รายการถูกแก้ระหว่างนี้ — เปิดดูใหม่" });
      } else done.push(it);
    }));
  }

  const { period } = recheck;
  await writeAuditMany(a, done.map((it) => ({
    action: "reprice", entityType: it.ref.table, entityId: it.ref.id, actorId: actor.id, actorName: actor.name,
    metadata: {
      period_id: periodId, period_name: period.name, employee_id: it.employee_id, employee_code: it.code, item: `${it.item_label} · ${it.label}`,
      field_name: it.ref.field, old_value: it.old_amount, new_value: it.new_amount,
      reason: `คิดราคาใหม่ตามตั้งค่างวดตอนนี้ (${period.work_days} วัน × ${period.hours_per_day} ชม.)`,
    },
  })));
  return { updated: done.length, net_effect: roundMoney(done.reduce((t, it) => t + it.net_effect, 0)), skipped };
}
