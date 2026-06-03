/**
 * Payroll module — Read-only view API (GET only) / Phase 3
 * GET /api/payroll/view/<entity>?limit=&offset=&sort_by=&sort_dir=
 *
 * ⚠️ ไม่มี POST/PATCH/DELETE — ข้อมูลที่คำนวณแล้วห้ามแก้ผ่านที่นี่
 * entity: payroll-lines | payslips | payment-batches | attendance | recurring | requests
 */
import { NextRequest, NextResponse } from "next/server";
import { getViewCfg, listView } from "@/lib/payroll-view-db";
import { guardPayroll } from "@/lib/payroll-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ entity: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const denied = await guardPayroll(req); if (denied) return denied;
  const { entity } = await ctx.params;
  const cfg = getViewCfg(entity);
  if (!cfg) return NextResponse.json({ data: [], error: "entity ไม่รองรับ" }, { status: 400 });
  try {
    const sp = req.nextUrl.searchParams;
    const limit  = Math.min(Math.max(parseInt(sp.get("limit") ?? "200", 10) || 200, 1), 1000);
    const offset = Math.max(parseInt(sp.get("offset") ?? "0", 10) || 0, 0);
    const sortBy = sp.get("sort_by") ?? undefined;
    const sortDir = (sp.get("sort_dir") === "asc" ? "asc" : sp.get("sort_dir") === "desc" ? "desc" : undefined) as "asc" | "desc" | undefined;
    const { data, total } = await listView(cfg, { limit, offset, sortBy, sortDir });
    return NextResponse.json({ data, total, error: null });
  } catch (e) {
    return NextResponse.json({ data: [], error: e instanceof Error ? e.message : "โหลดไม่ได้" }, { status: 500 });
  }
}
