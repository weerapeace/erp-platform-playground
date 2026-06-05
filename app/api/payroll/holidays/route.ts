/**
 * Payroll module — วันหยุดของงวด (payroll_period_holidays)
 * GET  /api/payroll/holidays?period_id=...   → วันหยุดของงวด
 * POST /api/payroll/holidays  { period_id, holiday_date, holiday_name? }
 *
 * เครื่องคำนวณใช้วันหยุดในการคิด "วันทำงานที่จ่าย" — พนักงานประจำ(รายเดือน)ยังได้เงินวันหยุด
 * แต่รายวันไม่ได้ (เพราะจ่ายตามวันที่มาทำ) — เป็นพฤติกรรม engine เดิม
 * ความปลอดภัย: employees.edit, เฉพาะงวด draft/review, audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardPayroll } from "@/lib/payroll-auth";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const EDITABLE = new Set(["draft", "review"]);

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const periodId = req.nextUrl.searchParams.get("period_id");
  if (!periodId) return NextResponse.json({ error: "ต้องระบุ period_id" }, { status: 400 });
  try {
    const { data, error } = await supabaseAdmin().from("payroll_period_holidays")
      .select("id, holiday_date, holiday_name, is_paid").eq("payroll_period_id", periodId).order("holiday_date", { ascending: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ data: data ?? [], error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: { period_id?: string; holiday_date?: string; holiday_name?: string; actor?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const periodId = String(body.period_id ?? ""); const date = String(body.holiday_date ?? "").slice(0, 10);
  if (!periodId || !date) return NextResponse.json({ error: "ต้องระบุงวด + วันที่" }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "รูปแบบวันที่ไม่ถูกต้อง" }, { status: 400 });

  let userId: string | null = null;
  try { const { data } = await supabaseFromRequest(req).auth.getUser(); userId = data.user?.id ?? null; } catch { /* */ }

  try {
    const a = supabaseAdmin();
    const { data: pd } = await a.from("payroll_periods").select("status, period_name, start_date, end_date").eq("id", periodId).limit(1);
    const period = pd?.[0] as { status: string; period_name: string; start_date: string; end_date: string } | undefined;
    if (!period) return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 });
    if (!EDITABLE.has(String(period.status))) return NextResponse.json({ error: `งวดสถานะ "${period.status}" แก้ไม่ได้` }, { status: 409 });
    if (date < String(period.start_date).slice(0, 10) || date > String(period.end_date).slice(0, 10)) {
      return NextResponse.json({ error: "วันหยุดต้องอยู่ในช่วงของงวด" }, { status: 400 });
    }
    // กันซ้ำวันเดียวกัน
    const { data: dup } = await a.from("payroll_period_holidays").select("id").eq("payroll_period_id", periodId).eq("holiday_date", date).limit(1);
    if (dup?.[0]) return NextResponse.json({ error: "มีวันหยุดนี้อยู่แล้ว" }, { status: 409 });

    const { data: ins, error } = await a.from("payroll_period_holidays").insert({
      payroll_period_id: periodId, holiday_date: date, holiday_name: body.holiday_name?.trim() || null, is_paid: true,
    }).select("id, holiday_date, holiday_name, is_paid").limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAudit(a, { action: "create", entityType: "payroll_period_holidays", entityId: (ins?.[0] as { id: string })?.id, actorId: userId,
      actorName: body.actor ?? null, metadata: { period_name: period.period_name, date, name: body.holiday_name } });
    return NextResponse.json({ data: ins?.[0], error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
