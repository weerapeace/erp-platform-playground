/**
 * Payroll module — Employee detail API (get + patch + delete) — ของจริง / Phase 1
 *
 * GET    /api/payroll/employees/:id
 * PATCH  /api/payroll/employees/:id   body = { ...fields, actor }
 * DELETE /api/payroll/employees/:id?actor=...   → soft delete (inactive) เท่านั้น
 *
 * ต่อตาราง employees จริงผ่าน lib/payroll-employees-db.ts + audit กลาง
 */
import { NextRequest, NextResponse } from "next/server";
import { getEmployee, updateEmployee, softDeleteEmployee } from "@/lib/payroll-employees-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    const row = await getEmployee(id);
    if (!row) return NextResponse.json({ error: "ไม่พบพนักงาน" }, { status: 404 });
    return NextResponse.json({ data: row, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  try {
    const row = await updateEmployee(id, body);
    if (!row) return NextResponse.json({ error: "ไม่พบพนักงาน" }, { status: 404 });
    await writeAudit(supabaseAdmin(), {
      action: "update", entityType: "employees", entityId: id,
      actorName: (body.actor as string) ?? null,
      metadata: { fields: Object.keys(body).filter((k) => k !== "actor") },
    });
    return NextResponse.json({ data: row, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  // ลบถาวรไม่ได้ — กันข้อมูลพนักงานจริงหาย (มีสัญญา/เงินเดือน/สลิปผูกอยู่)
  if (req.nextUrl.searchParams.get("hard") === "1") {
    return NextResponse.json(
      { error: "ลบพนักงานถาวรไม่ได้ — ระบบจะเปลี่ยนสถานะเป็น 'ไม่ใช้งาน' แทน" },
      { status: 400 },
    );
  }
  try {
    const ok = await softDeleteEmployee(id);
    if (!ok) return NextResponse.json({ error: "ไม่พบพนักงาน" }, { status: 404 });
    await writeAudit(supabaseAdmin(), {
      action: "archive", entityType: "employees", entityId: id,
      actorName: req.nextUrl.searchParams.get("actor"),
    });
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
