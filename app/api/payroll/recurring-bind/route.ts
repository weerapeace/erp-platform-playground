/**
 * Payroll module — ผูกสัญญาให้เงินประจำ / Phase 3
 * GET   /api/payroll/recurring-bind?employee_id=<id>   → รายชื่อสัญญาของพนักงาน
 * PATCH /api/payroll/recurring-bind  body={recurring_id, contract_id|null}  → ผูก/ยกเลิกผูก
 */
import { NextRequest, NextResponse } from "next/server";
import { listEmployeeContracts, bindContract } from "@/lib/payroll-recurring-bind-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const employeeId = req.nextUrl.searchParams.get("employee_id") ?? "";
  try {
    const data = await listEmployeeContracts(employeeId);
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: { recurring_id?: string; contract_id?: string | null; actor?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  if (!body.recurring_id) return NextResponse.json({ error: "ต้องระบุ recurring_id" }, { status: 400 });
  try {
    const data = await bindContract(body.recurring_id, body.contract_id ?? null);
    await writeAudit(supabaseAdmin(), {
      action: body.contract_id ? "bind_contract" : "unbind_contract",
      entityType: "employee_recurring_pay_items", entityId: body.recurring_id,
      actorName: body.actor ?? null, metadata: { contract_id: body.contract_id ?? null },
    });
    return NextResponse.json({ data, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ผูกสัญญาไม่สำเร็จ" }, { status: 500 });
  }
}
