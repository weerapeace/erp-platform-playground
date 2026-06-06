/**
 * Payroll module — คำนวณงวด (พรีวิว/เทียบ) — Phase 3, อ่านอย่างเดียว ไม่เขียน DB
 * GET /api/payroll/calc-run?period_id=...
 *   → รันเครื่องคำนวณเต็มจาก raw input + เทียบกับ payroll_lines เดิม (latest/พนักงาน)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardPayroll } from "@/lib/payroll-auth";
import { runCalcPreview } from "@/lib/payroll-calc-run";
import { timeRoute } from "@/lib/api-timing";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function _GET(req: NextRequest) {
  const denied = await guardPayroll(req); if (denied) return denied;
  try {
    const result = await runCalcPreview(req.nextUrl.searchParams.get("period_id"));
    return NextResponse.json({ ...result, error: null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "คำนวณไม่ได้";
    return NextResponse.json({ data: [], summary: null, error: msg }, { status: msg === "ไม่มีงวด" ? 400 : 500 });
  }
}

// Phase 0 — ครอบ timing log (endpoint นี้หนักสุด: คำนวณ payroll สด)
/* eslint-disable @typescript-eslint/no-explicit-any */
export const GET = timeRoute("payroll:calc-run", _GET as any) as any;
