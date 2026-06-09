import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";
import { money } from "@/lib/payroll-calc";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

const WRITABLE = new Set([
  "employee_id", "contract_id", "item_name", "item_type", "amount_per_period",
  "duration_type", "calculation_method", "quantity_default", "rate_default",
  "start_date", "end_date", "status",
]);

function toColumns(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (WRITABLE.has(k)) out[k] = v === "" ? null : v;
  }
  if ("active" in body && !("status" in out)) out.status = body.active === true || body.active === "true" ? "active" : "inactive";
  if (out.status === "inactive") out.status = "cancelled";
  for (const k of ["amount_per_period", "quantity_default", "rate_default"]) {
    if (k in out) out[k] = money(out[k]);
  }
  if (out.duration_type === "permanent") out.duration_type = "unlimited";
  return out;
}

function validate(cols: Record<string, unknown>, partial = false): string | null {
  if (!partial && !cols.employee_id) return "ต้องเลือกพนักงาน";
  if ("item_name" in cols && (!cols.item_name || String(cols.item_name).trim() === "")) return "ต้องระบุชื่อรายการ";
  if ("item_type" in cols && !["earning", "deduction"].includes(String(cols.item_type))) return "ต้องเลือกประเภท เพิ่ม/หัก";
  if ("duration_type" in cols && !["unlimited", "until_amount"].includes(String(cols.duration_type))) return "ต้องเลือกระยะเวลาเป็น ไม่จำกัด หรือ จนกว่าจะครบยอด";
  if ("status" in cols && !["active", "paused", "completed", "cancelled"].includes(String(cols.status))) return "ต้องเลือกสถานะรายการประจำให้ถูกต้อง";
  if ("amount_per_period" in cols && String(cols.calculation_method ?? "fixed") === "fixed" && money(cols.amount_per_period) <= 0) return "ยอด/งวดต้องมากกว่า 0";
  if (cols.end_date && cols.start_date && String(cols.end_date) < String(cols.start_date)) return "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม";
  return null;
}

function friendlyError(e: unknown, fallback: string): string {
  const message = e instanceof Error ? e.message : String(e ?? "");
  if (
    message.includes("employee_recurring_pay_items_check") ||
    message.includes("duration_type") ||
    message.includes("target_total_amount")
  ) {
    return "บันทึกรายการประจำไม่ได้ เพราะรูปแบบระยะเวลาไม่ตรงกับกฎเงินประจำ กรุณาลองใหม่อีกครั้ง";
  }
  return message || fallback;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const { data, error } = await supabaseAdmin().from("employee_recurring_pay_items").select("*").eq("id", id).limit(1);
    if (error) throw new Error(error.message);
    const row = data?.[0] as Record<string, unknown> | undefined;
    if (!row) return NextResponse.json({ error: "ไม่พบรายการประจำ" }, { status: 404 });
    return NextResponse.json({ data: { ...row, active: String(row.status ?? "active") === "active" }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดรายการไม่สำเร็จ" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  try {
    const cols = toColumns(body);
    const v = validate(cols, true);
    if (v) return NextResponse.json({ error: v }, { status: 400 });
    if (Object.keys(cols).length === 0) return NextResponse.json({ data: { id }, error: null });
    const { data, error } = await supabaseAdmin().from("employee_recurring_pay_items").update(cols).eq("id", id).select("*").limit(1);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin(), { action: "update", entityType: "employee_recurring_pay_items", entityId: id, actorName: (body.actor as string) ?? null, metadata: { fields: Object.keys(cols) } });
    return NextResponse.json({ data: data?.[0] ?? { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: friendlyError(e, "บันทึกรายการไม่สำเร็จ") }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  if (req.nextUrl.searchParams.get("hard") === "1") {
    return NextResponse.json({ error: "รายการประจำไม่อนุญาตให้ลบถาวร ให้ปิดใช้งานแทนเพื่อเก็บประวัติ" }, { status: 400 });
  }
  try {
    const { error } = await supabaseAdmin().from("employee_recurring_pay_items").update({ status: "cancelled" }).eq("id", id);
    if (error) throw new Error(error.message);
    await writeAudit(supabaseAdmin(), { action: "archive", entityType: "employee_recurring_pay_items", entityId: id, actorName: req.nextUrl.searchParams.get("actor") });
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ปิดใช้งานไม่สำเร็จ" }, { status: 500 });
  }
}
