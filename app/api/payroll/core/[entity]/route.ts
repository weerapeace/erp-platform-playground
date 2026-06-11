/**
 * Payroll module — Core CRUD (employees + contracts) แบบรวม route / ลด bundle (1102)
 * GET  /api/payroll/core/<entity>?include_inactive=true
 * POST /api/payroll/core/<entity>
 * entity: employees | contracts  (logic เดิมจาก lib เดิม — แค่รวม route เพื่อลดจำนวน route ใน worker)
 */
import { NextRequest, NextResponse } from "next/server";
import { listEmployees, createEmployee } from "@/lib/payroll-employees-db";
import { listContracts, createContract } from "@/lib/payroll-contracts-db";
import { listSettings, createSettings } from "@/lib/payroll-settings-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";
import { filterEmployeesMissingCurrentContract, getPayrollIssueFilter, payrollWageProblem } from "@/lib/payroll-issue-filters";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ entity: string }> };
type FilterMap = Record<string, { value?: string }>;

const CORE: Record<string, {
  auditType: string;
  list: (inc: boolean, employeeId?: string | null) => Promise<Array<Record<string, unknown>>>;
  create: (b: Record<string, unknown>) => Promise<Record<string, unknown> & { id: string }>;
  validateCreate: (b: Record<string, unknown>) => string | null;
  label: (row: Record<string, unknown>) => unknown;
}> = {
  employees: {
    auditType: "employees", list: listEmployees, create: createEmployee,
    validateCreate: (b) => (!b.first_name || String(b.first_name).trim() === "") ? "ชื่อ ห้ามว่าง" : null,
    label: (r) => r.employee_code,
  },
  contracts: {
    auditType: "employee_contracts", list: listContracts, create: createContract,
    validateCreate: () => null,
    label: (r) => r.contract_no,
  },
  settings: {
    auditType: "employee_payroll_settings", list: listSettings, create: createSettings,
    validateCreate: () => null,
    label: (r) => r.employee_name,
  },
};

function parseFilters(raw: string | null): FilterMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed as FilterMap : {};
  } catch {
    return {};
  }
}

async function getPeriodCompanyId(periodId: string | null): Promise<string | null> {
  if (!periodId) return null;
  const { data } = await supabaseAdmin().from("payroll_periods").select("company_id").eq("id", periodId).limit(1);
  return (data?.[0] as { company_id?: string | null } | undefined)?.company_id ?? null;
}

async function currentContracts(): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabaseAdmin().from("employee_contracts")
    .select("employee_id, company_id")
    .eq("is_current", true)
    .eq("status", "active");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

async function applyPayrollIssueFilter(entity: string, rows: Array<Record<string, unknown>>, filters: FilterMap) {
  const { issueCode, periodId } = getPayrollIssueFilter(filters);
  if (!issueCode) return rows;
  const companyId = await getPeriodCompanyId(periodId);

  if (entity === "employees" && issueCode === "employees_without_contract") {
    const allCurrentContracts = await currentContracts();
    const periodContracts = companyId
      ? allCurrentContracts.filter((contract) => String(contract.company_id ?? "") === companyId)
      : allCurrentContracts;
    const activeEmployees = rows.filter((r) => String(r.employment_status ?? "") === "active");
    return filterEmployeesMissingCurrentContract(activeEmployees, periodContracts, allCurrentContracts, companyId);
  }

  if (entity === "contracts") {
    const activeCurrent = (r: Record<string, unknown>) =>
      String(r.status ?? "") === "active" &&
      r.is_current === true &&
      (!companyId || String(r.company_id ?? "") === companyId);

    if (issueCode === "invalid_contract_wage") return rows.filter((r) => activeCurrent(r) && payrollWageProblem(r));
    if (issueCode === "no_active_contracts") return rows.filter(activeCurrent);
  }

  return rows;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const { entity } = await ctx.params;
  const cfg = CORE[entity];
  if (!cfg) return NextResponse.json({ data: [], error: "entity ไม่รองรับ" }, { status: 400 });
  try {
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") !== "false";
    // รองรับกรองตามพนักงาน (จากลิงก์ ?flt={employee_id:...} ในหน้าพนักงาน)
    let employeeId: string | null = null;
    const filters = parseFilters(req.nextUrl.searchParams.get("filters"));
    const v = filters.employee_id?.value;
    if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) employeeId = v;
    const rows = await applyPayrollIssueFilter(entity, await cfg.list(includeInactive, employeeId), filters);
    return NextResponse.json({ data: rows, total: rows.length, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.create"); if (denied) return denied;
  const { entity } = await ctx.params;
  const cfg = CORE[entity];
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const verr = cfg.validateCreate(body);
  if (verr) return NextResponse.json({ error: verr }, { status: 400 });
  try {
    const row = await cfg.create(body);
    await writeAudit(supabaseAdmin(), {
      action: "create", entityType: cfg.auditType, entityId: row.id,
      actorName: (body.actor as string) ?? null, metadata: { label: cfg.label(row) },
    });
    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างไม่สำเร็จ" }, { status: 500 });
  }
}
