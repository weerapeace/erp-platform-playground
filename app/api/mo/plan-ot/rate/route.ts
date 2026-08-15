/**
 * ค่าแรงต่อชั่วโมงของพนักงาน (ไว้เติมช่อง "฿/ชม." ของ OT อัตโนมัติ) — /api/mo/plan-ot/rate
 *   GET ?ids=<uuid,uuid>&workdays=26&hours=8
 *     → { data: { <employee_id>: { rate, basis } } }
 *
 * สูตร (ตามที่เจ้าของสั่ง: "เอาค่าแรงของพนักงาน / วัน / ชั่วโมง · ถ้าเป็นรายวันก็หารชั่วโมงเอา"):
 *   • มีค่าแรงรายชั่วโมง (hourly_wage)  → ใช้เลย                         basis = hourly
 *   • ลูกจ้างรายวัน (daily_wage)        → daily_wage ÷ ชั่วโมงงาน/วัน      basis = daily
 *   • ลูกจ้างรายเดือน (base_salary)     → base_salary ÷ วันทำงาน/เดือน ÷ ชั่วโมงงาน/วัน   basis = monthly
 *   (ไม่มีข้อมูลค่าแรง → rate = 0, basis = none — ให้กรอกเอง)
 *
 * 🔒 ความเป็นส่วนตัว: คืนเฉพาะ "ค่าแรงต่อชั่วโมงที่คำนวณแล้ว" ไม่ส่งเงินเดือน/ค่าแรงดิบออกไป
 *    (แนวเดียวกับ /api/mo/assignees ที่ส่งเฉพาะผลรวมต่อแผนก) · guard products.edit เหมือน /api/mo/worker-wage
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type OtRateInfo = { rate: number; basis: "hourly" | "daily" | "monthly" | "none" };

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return isFinite(n) && n > 0 ? n : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const ids = (sp.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 300);
  if (ids.length === 0) return NextResponse.json({ data: {}, error: null });

  const workdays = num(sp.get("workdays")) || 26;   // วันทำงานต่อเดือน (ค่าเริ่มต้น)
  const hours = num(sp.get("hours")) || 8;          // ชั่วโมงงานปกติต่อวัน

  const admin = supabaseAdmin();
  const [{ data: contracts }, { data: emps }] = await Promise.all([
    admin.from("employee_contracts")
      .select("employee_id, wage_type, base_salary, daily_wage, hourly_wage, payroll_register_base_salary, start_date")
      .in("employee_id", ids),
    admin.from("employees").select("id, payroll_register_base_salary").in("id", ids),
  ]);

  // สัญญาล่าสุดต่อคน (เรียงตามวันเริ่ม) — ตาราง employee_contracts มีได้หลายฉบับต่อคน
  const latest = new Map<string, Record<string, unknown>>();
  for (const c of ((contracts ?? []) as Record<string, unknown>[])) {
    const k = String(c.employee_id);
    const cur = latest.get(k);
    if (!cur || String(c.start_date ?? "") > String(cur.start_date ?? "")) latest.set(k, c);
  }
  const regSalary = new Map<string, number>();
  for (const e of ((emps ?? []) as Record<string, unknown>[])) regSalary.set(String(e.id), Number(e.payroll_register_base_salary) || 0);

  const data: Record<string, OtRateInfo> = {};
  for (const id of ids) {
    const c = latest.get(id);
    const hourly = num(c?.hourly_wage);
    const daily = num(c?.daily_wage);
    // เงินเดือน: สัญญาก่อน → ไม่มีค่อยใช้ตัวที่ใช้คิดค่าแรงรวมต่อโต๊ะ (employees.payroll_register_base_salary)
    const monthly = num(c?.base_salary) || num(c?.payroll_register_base_salary) || regSalary.get(id) || 0;

    if (hourly > 0)      data[id] = { rate: r2(hourly), basis: "hourly" };
    else if (daily > 0)  data[id] = { rate: r2(daily / hours), basis: "daily" };
    else if (monthly > 0) data[id] = { rate: r2(monthly / workdays / hours), basis: "monthly" };
    else                 data[id] = { rate: 0, basis: "none" };
  }
  return NextResponse.json({ data, error: null });
}
