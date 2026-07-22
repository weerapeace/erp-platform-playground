/**
 * /api/dashboard/dept-overview — ตัวเลขงานค้าง/สรุปต่อแผนก สำหรับการ์ดแผนกในมุมมองผู้บริหาร
 *
 * GET → RPC erp_admin_dept_overview() (SECURITY DEFINER) ยิงครั้งเดียวได้ครบทุกแผนก:
 *       ผลิต / ซื้อ / ขาย / QC / Design / จัดการงาน
 *
 * เสริมจาก /api/dashboard/executive (ตัวเลขเงินภาพรวม) — ใช้คู่กันในการ์ดแผนก
 * gate เฉพาะ admin ที่ server (admin.users) เหมือนหน้าผู้บริหาร
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DeptOverview = {
  production: { unassigned: number; in_production: number; labor_month: number };
  purchasing: { awaiting_goods: number; spend_month: number };
  sales: { orders_month: number };
  qc: { pending_check: number };
  design: { due_soon: number; designing: number; quoted: number; revising: number };
  tasks: { total_active: number; review_pending: number; overdue: number; done_month: number };
};

export type DeptOverviewResponse = { data: DeptOverview | null; error: string | null };

export async function GET(request: NextRequest) {
  const supabase = supabaseFromRequest(request);

  // gate: เฉพาะ admin (มุมมองผู้บริหาร)
  const { data: allowed, error: canErr } = await supabase.rpc("erp_can", { p_permission: "admin.users" });
  if (canErr) return NextResponse.json({ data: null, error: canErr.message }, { status: 500 });
  if (allowed !== true) {
    return NextResponse.json({ data: null, error: "ไม่มีสิทธิ์ดูสรุปแผนก" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("erp_admin_dept_overview");
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  return NextResponse.json(
    { data: (data ?? null) as DeptOverview | null, error: null },
    { headers: { "Cache-Control": "private, max-age=60" } },
  );
}
