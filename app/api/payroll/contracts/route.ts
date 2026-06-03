/**
 * Payroll module — Contracts API (list + create) — ของจริง / Phase 2
 * GET  /api/payroll/contracts?include_inactive=true
 * POST /api/payroll/contracts
 */
import { NextRequest, NextResponse } from "next/server";
import { listContracts, createContract } from "@/lib/payroll-contracts-db";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const includeInactive = req.nextUrl.searchParams.get("include_inactive") !== "false";
    const rows = await listContracts(includeInactive);
    return NextResponse.json({ data: rows, total: rows.length, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  try {
    const row = await createContract(body);
    await writeAudit(supabaseAdmin(), {
      action: "create", entityType: "employee_contracts", entityId: row.id as string,
      actorName: (body.actor as string) ?? null, metadata: { contract_no: row.contract_no },
    });
    return NextResponse.json({ data: row, error: null }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างไม่สำเร็จ" }, { status: 500 });
  }
}
