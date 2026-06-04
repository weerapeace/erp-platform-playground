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

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ entity: string }> };

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

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const { entity } = await ctx.params;
  const cfg = CORE[entity];
  if (!cfg) return NextResponse.json({ data: [], error: "entity ไม่รองรับ" }, { status: 400 });
  try {
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") !== "false";
    // รองรับกรองตามพนักงาน (จากลิงก์ ?flt={employee_id:...} ในหน้าพนักงาน)
    let employeeId: string | null = null;
    const raw = req.nextUrl.searchParams.get("filters");
    if (raw) {
      try {
        const f = JSON.parse(raw) as Record<string, { value?: string }>;
        const v = f.employee_id?.value;
        if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v)) employeeId = v;
      } catch { /* ignore */ }
    }
    const rows = await cfg.list(includeInactive, employeeId);
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
