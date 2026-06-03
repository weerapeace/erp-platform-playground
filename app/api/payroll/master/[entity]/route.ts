/**
 * Payroll module — Master generic API (list + create) / Phase 2
 * GET  /api/payroll/master/<entity>?include_inactive=true
 * POST /api/payroll/master/<entity>
 * entity: departments | companies | periods
 */
import { NextRequest, NextResponse } from "next/server";
import { getEntityCfg, listMaster, createMaster } from "@/lib/payroll-master-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ entity: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const { entity } = await ctx.params;
  const cfg = getEntityCfg(entity);
  if (!cfg) return NextResponse.json({ data: [], error: "entity ไม่รองรับ" }, { status: 400 });
  try {
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") !== "false";
    const rows = await listMaster(cfg, includeInactive);
    return NextResponse.json({ data: rows, total: rows.length, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req, "employees.create"); if (denied) return denied;
  const { entity } = await ctx.params;
  const cfg = getEntityCfg(entity);
  if (!cfg) return NextResponse.json({ error: "entity ไม่รองรับ" }, { status: 400 });
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  try {
    const row = await createMaster(cfg, body);
    await writeAudit(supabaseAdmin(), {
      action: "create", entityType: cfg.table, entityId: row.id as string,
      actorName: (body.actor as string) ?? null,
    });
    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างไม่สำเร็จ" }, { status: 500 });
  }
}
