/**
 * Payroll module — ดึงวันหยุดพิเศษ (คลัง) มาใส่งวด
 * POST /api/payroll/holidays/apply-standard  { period_id }
 * หา payroll_holidays (active) ที่ตรงช่วงวันของงวด → ใส่ลง payroll_period_holidays (ข้ามวันที่มีอยู่แล้ว)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardPayroll } from "@/lib/payroll-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const EDITABLE = new Set(["draft", "review"]);

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: { period_id?: string; actor?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const periodId = String(body.period_id ?? "");
  if (!periodId) return NextResponse.json({ error: "ต้องระบุงวด" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* */ }

  try {
    const a = supabaseAdmin();
    const { data: pd } = await a.from("payroll_periods").select("status, period_name, start_date, end_date").eq("id", periodId).limit(1);
    const period = pd?.[0] as { status: string; period_name: string; start_date: string; end_date: string } | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });
    if (!EDITABLE.has(String(period.status))) return NextResponse.json({ error: `งวดสถานะ "${period.status}" แก้ไม่ได้` }, { status: 409 });

    const start = String(period.start_date).slice(0, 10), end = String(period.end_date).slice(0, 10);
    // คลังวันหยุดในช่วงงวด
    const { data: std } = await a.from("payroll_holidays").select("holiday_date, holiday_name").eq("status", "active").gte("holiday_date", start).lte("holiday_date", end);
    const standard = (std ?? []) as { holiday_date: string; holiday_name: string }[];
    if (standard.length === 0) return NextResponse.json({ data: { added: 0 }, message: "ไม่มีวันหยุดในคลังที่อยู่ในช่วงงวดนี้", error: null });

    // วันที่มีอยู่แล้วในงวด
    const { data: existing } = await a.from("payroll_period_holidays").select("holiday_date").eq("payroll_period_id", periodId);
    const have = new Set(((existing ?? []) as { holiday_date: string }[]).map((h) => String(h.holiday_date).slice(0, 10)));

    const toAdd = standard.filter((s) => !have.has(String(s.holiday_date).slice(0, 10)));
    if (toAdd.length === 0) return NextResponse.json({ data: { added: 0 }, message: "วันหยุดในคลังถูกใส่ครบแล้ว", error: null });

    const rows = toAdd.map((s) => ({ payroll_period_id: periodId, holiday_date: s.holiday_date, holiday_name: s.holiday_name, is_paid: true }));
    const { error } = await a.from("payroll_period_holidays").insert(rows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(a, { action: "apply_holidays", entityType: "payroll_periods", entityId: periodId, actorId: userId, actorName: body.actor ?? null,
      metadata: { period_name: period.period_name, added: toAdd.length } });
    return NextResponse.json({ data: { added: toAdd.length }, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ดึงไม่สำเร็จ" }, { status: 500 });
  }
}
