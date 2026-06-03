/**
 * Payroll module — Master generic API (get + patch + delete) / Phase 2
 * soft delete เท่านั้น (เปลี่ยน status)
 */
import { NextRequest, NextResponse } from "next/server";
import { getEntityCfg, getMaster, updateMaster, softDeleteMaster } from "@/lib/payroll-master-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ entity: string; id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const { entity, id } = await ctx.params;
  const cfg = getEntityCfg(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });
  try {
    const row = await getMaster(cfg, id);
    if (!row) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    return NextResponse.json({ data: row, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.edit"); if (denied) return denied;
  const { entity, id } = await ctx.params;
  const cfg = getEntityCfg(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  try {
    const row = await updateMaster(cfg, id, body);
    if (!row) return NextResponse.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    await writeAudit(supabaseAdmin(), {
      action: "update", entityType: cfg.table, entityId: id,
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
  const cfg = getEntityCfg(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });
  if (req.nextUrl.searchParams.get("hard") === "1") {
    return NextResponse.json({ error: "ลบถาวรไม่ได้ — ระบบจะเปลี่ยนสถานะแทน" }, { status: 400 });
  }
  try {
    await softDeleteMaster(cfg, id);
    await writeAudit(supabaseAdmin(), {
      action: "archive", entityType: cfg.table, entityId: id,
      actorName: req.nextUrl.searchParams.get("actor"),
    });
    return NextResponse.json({ data: { id }, error: null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "ลบไม่สำเร็จ" }, { status: 500 });
  }
}
