/**
 * Payroll module — Core CRUD detail (employees + contracts) แบบรวม route / ลด bundle (1102)
 * GET/PATCH/DELETE /api/payroll/core/<entity>/<id>   (soft delete เท่านั้น)
 */
import { NextRequest, NextResponse } from "next/server";
import { getEmployee, updateEmployee, softDeleteEmployee } from "@/lib/payroll-employees-db";
import { getContract, updateContract, softDeleteContract } from "@/lib/payroll-contracts-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ entity: string; id: string }> };

const CORE: Record<string, {
  auditType: string;
  get: (id: string) => Promise<(Record<string, unknown> & { id: string }) | null>;
  update: (id: string, b: Record<string, unknown>) => Promise<(Record<string, unknown> & { id: string }) | null>;
  del: (id: string) => Promise<boolean>;
  deleteMsg: string;
}> = {
  employees: {
    auditType: "employees", get: getEmployee, update: updateEmployee, del: softDeleteEmployee,
    deleteMsg: "ลบพนักงานถาวรไม่ได้ — ระบบจะเปลี่ยนสถานะเป็น 'ไม่ใช้งาน' แทน",
  },
  contracts: {
    auditType: "employee_contracts", get: getContract, update: updateContract, del: softDeleteContract,
    deleteMsg: "ลบสัญญาถาวรไม่ได้ — ระบบจะเปลี่ยนสถานะเป็น 'ยกเลิก' แทน",
  },
};

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const { entity, id } = await ctx.params;
  const cfg = CORE[entity];
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });
  try {
    const row = await cfg.get(id);
    if (!row) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    return NextResponse.json({ data: row, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { entity, id } = await ctx.params;
  const cfg = CORE[entity];
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  try {
    const row = await cfg.update(id, body);
    if (!row) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    await writeAudit(supabaseAdmin(), {
      action: "update", entityType: cfg.auditType, entityId: id,
      actorName: (body.actor as string) ?? null, metadata: { fields: Object.keys(body).filter((k) => k !== "actor") },
    });
    return NextResponse.json({ data: row, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { entity, id } = await ctx.params;
  const cfg = CORE[entity];
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });
  if (req.nextUrl.searchParams.get("hard") === "1") {
    return NextResponse.json({ error: cfg.deleteMsg }, { status: 400 });
  }
  try {
    const ok = await cfg.del(id);
    if (!ok) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    await writeAudit(supabaseAdmin(), {
      action: "archive", entityType: cfg.auditType, entityId: id,
      actorName: req.nextUrl.searchParams.get("actor"),
    });
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
