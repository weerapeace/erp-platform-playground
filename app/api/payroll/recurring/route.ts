import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";
import { money } from "@/lib/payroll-calc";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RecurringRow = Record<string, unknown> & { id: string };

const WRITABLE = new Set([
  "employee_id", "contract_id", "item_name", "item_type", "amount_per_period",
  "duration_type", "calculation_method", "quantity_default", "rate_default",
  "start_date", "end_date", "status",
]);

function rowLabel(e: Record<string, unknown>): string {
  const first = String(e.first_name ?? "").trim();
  const last = String(e.last_name ?? "").trim();
  const nick = String(e.nickname ?? "").trim();
  const name = [first, last].filter(Boolean).join(" ") || nick;
  return `${String(e.employee_code ?? "")}${name ? " · " + name : ""}`.trim();
}

async function decorate(rows: RecurringRow[]): Promise<RecurringRow[]> {
  const admin = supabaseAdmin();
  const employeeIds = [...new Set(rows.map((r) => String(r.employee_id ?? "")).filter(Boolean))];
  const contractIds = [...new Set(rows.map((r) => String(r.contract_id ?? "")).filter(Boolean))];
  const employeeById: Record<string, string> = {};
  const contractById: Record<string, string> = {};

  if (employeeIds.length) {
    const { data } = await admin.from("employees").select("id, employee_code, first_name, last_name, nickname").in("id", employeeIds);
    (data ?? []).forEach((e) => { employeeById[String(e.id)] = rowLabel(e as Record<string, unknown>); });
  }
  if (contractIds.length) {
    const { data } = await admin.from("employee_contracts").select("id, contract_no").in("id", contractIds);
    (data ?? []).forEach((c) => { contractById[String(c.id)] = String(c.contract_no ?? ""); });
  }

  return rows.map((r) => ({
    ...r,
    active: String(r.status ?? "active") === "active",
    employee_label: employeeById[String(r.employee_id ?? "")] ?? "",
    contract_label: contractById[String(r.contract_id ?? "")] ?? "",
    contract_no: contractById[String(r.contract_id ?? "")] ?? "",
  }));
}

function toColumns(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (WRITABLE.has(k)) out[k] = v === "" ? null : v;
  }
  if ("active" in body && !("status" in out)) out.status = body.active === true || body.active === "true" ? "active" : "inactive";
  for (const k of ["amount_per_period", "quantity_default", "rate_default"]) {
    if (k in out) out[k] = money(out[k]);
  }
  if (!out.calculation_method) out.calculation_method = "fixed";
  if (!out.duration_type) out.duration_type = "permanent";
  if (!out.status) out.status = "active";
  return out;
}

function validate(cols: Record<string, unknown>): string | null {
  if (!cols.employee_id) return "ต้องเลือกพนักงาน";
  if (!cols.item_name || String(cols.item_name).trim() === "") return "ต้องระบุชื่อรายการ";
  if (!["earning", "deduction"].includes(String(cols.item_type))) return "ต้องเลือกประเภท เพิ่ม/หัก";
  if (String(cols.calculation_method ?? "fixed") === "fixed" && money(cols.amount_per_period) <= 0) return "ยอด/งวดต้องมากกว่า 0";
  if (String(cols.calculation_method ?? "fixed") !== "fixed" && (money(cols.quantity_default) <= 0 || money(cols.rate_default) <= 0)) return "จำนวนและอัตราต้องมากกว่า 0";
  if (!cols.start_date) return "ต้องระบุวันที่เริ่ม";
  if (cols.end_date && String(cols.end_date) < String(cols.start_date)) return "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่ม";
  return null;
}

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  try {
    const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "1000", 10) || 1000, 1), 2000);
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") === "true";
    let q = supabaseAdmin().from("employee_recurring_pay_items")
      .select("id, employee_id, contract_id, item_name, item_type, amount_per_period, duration_type, calculation_method, quantity_default, rate_default, status, start_date, end_date, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!includeInactive) q = q.eq("status", "active");
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return NextResponse.json({ data: await decorate((data ?? []) as RecurringRow[]), error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดรายการประจำไม่สำเร็จ" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  try {
    const cols = toColumns(body);
    const v = validate(cols);
    if (v) return NextResponse.json({ error: v }, { status: 400 });
    const { data, error } = await supabaseAdmin().from("employee_recurring_pay_items")
      .insert(cols).select("id, employee_id, contract_id, item_name, item_type, amount_per_period, duration_type, calculation_method, quantity_default, rate_default, status, start_date, end_date, created_at").limit(1);
    if (error) throw new Error(error.message);
    const row = (data?.[0] ?? null) as RecurringRow | null;
    if (row) await writeAudit(supabaseAdmin(), { action: "create", entityType: "employee_recurring_pay_items", entityId: row.id, actorName: (body.actor as string) ?? null, metadata: { item_name: row.item_name, item_type: row.item_type } });
    return NextResponse.json({ data: row ? (await decorate([row]))[0] : null, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างรายการประจำไม่สำเร็จ" }, { status: 500 });
  }
}
