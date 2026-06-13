/**
 * ประวัติการจ่ายงานของใบสั่งผลิต — /api/mo/dispatch-history?mo_no=MO-xxxx
 * รวมใบจ่ายงาน (mo_work_orders) ทุกใบของงานนี้ (รวมที่ยกเลิกแล้ว) — ใครรับ/เมื่อไหร่/จำนวน/สถานะ
 * ของกลาง: guardApi(products.view) + supabaseAdmin
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DispatchHistRow = {
  id: string; wo_no: string; stage: string | null; assignee_name: string | null; department_name: string | null;
  qty: number; received_qty: number; dispatch_date: string | null; status: string; is_active: boolean;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const moNo = (new URL(request.url).searchParams.get("mo_no") ?? "").trim();
  if (!moNo) return NextResponse.json({ data: [], error: null });
  const { data, error } = await supabaseAdmin().from("mo_work_orders")
    .select("id, wo_no, stage, assignee_name, department_name, qty, received_qty, dispatch_date, status, is_active")
    .eq("mo_no", moNo).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  const out: DispatchHistRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id), wo_no: String(r.wo_no ?? ""), stage: (r.stage as string) ?? null,
    assignee_name: (r.assignee_name as string) ?? null, department_name: (r.department_name as string) ?? null,
    qty: Number(r.qty) || 0, received_qty: Number(r.received_qty) || 0, dispatch_date: (r.dispatch_date as string) ?? null,
    status: String(r.status ?? ""), is_active: r.is_active !== false,
  }));
  return NextResponse.json({ data: out, error: null });
}
