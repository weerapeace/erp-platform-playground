/**
 * Payroll module — Employees API (list + create) — ของจริง / Phase 1
 *
 * GET  /api/payroll/employees?include_inactive=true&limit=200
 * POST /api/payroll/employees   body = { ...fields, actor }
 *
 * ต่อตาราง employees จริงใน Supabase ผ่าน lib/payroll-employees-db.ts
 * ตอบรูปแบบเดียวกับของกลาง master-crud: { data, error, total }
 */
import { NextRequest, NextResponse } from "next/server";
import { listEmployees, createEmployee } from "@/lib/payroll-employees-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  try {
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") !== "false";
    const rows = await listEmployees(includeInactive);
    return NextResponse.json({ data: rows, total: rows.length, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await guardPayroll(req, "employees.create"); if (denied) return denied;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  if (!body.first_name || String(body.first_name).trim() === "") {
    return NextResponse.json({ error: "ชื่อ ห้ามว่าง" }, { status: 400 });
  }
  try {
    const row = await createEmployee(body);
    await writeAudit(supabaseAdmin(), {
      action: "create", entityType: "employees", entityId: row.id as string,
      actorName: (body.actor as string) ?? null,
      metadata: { employee_code: row.employee_code },
    });
    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างไม่สำเร็จ" }, { status: 500 });
  }
}
