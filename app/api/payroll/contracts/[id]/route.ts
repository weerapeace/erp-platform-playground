/**
 * Payroll module — Contract detail API (get + patch + delete) — Phase 2
 * soft delete = status → cancelled (ลบถาวรไม่ได้)
 */
import { NextRequest, NextResponse } from "next/server";
import { getContract, updateContract, softDeleteContract } from "@/lib/payroll-contracts-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const row = await getContract(id);
    if (!row) return NextResponse.json({ error: "ไม่พบสัญญา" }, { status: 404 });
    return NextResponse.json({ data: row, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  try {
    const row = await updateContract(id, body);
    if (!row) return NextResponse.json({ error: "ไม่พบสัญญา" }, { status: 404 });
    await writeAudit(supabaseAdmin(), {
      action: "update", entityType: "employee_contracts", entityId: id,
      actorName: (body.actor as string) ?? null, metadata: { fields: Object.keys(body).filter((k) => k !== "actor") },
    });
    return NextResponse.json({ data: row, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { id } = await ctx.params;
  if (req.nextUrl.searchParams.get("hard") === "1") {
    return NextResponse.json({ error: "ลบสัญญาถาวรไม่ได้ — ระบบจะเปลี่ยนสถานะเป็น 'ยกเลิก' แทน" }, { status: 400 });
  }
  try {
    await softDeleteContract(id);
    await writeAudit(supabaseAdmin(), {
      action: "cancel", entityType: "employee_contracts", entityId: id,
      actorName: req.nextUrl.searchParams.get("actor"),
    });
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
