/**
 * รวมเงินเดือน "เฉพาะคนที่เลือก" (สำหรับทดลองคำนวณค่าแรงจ่ายโต๊ะ — multi-pick)
 * GET /api/mo/worker-wage?ids=id1,id2,... → { total, count }
 * privacy: คิดผลรวมฝั่ง server ไม่ส่งเงินเดือนรายคนออก (เหมือน /api/mo/assignees) · guard products.edit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ total: 0, count: 0, error: null });
  const { data, error } = await supabaseAdmin().from("employees").select("payroll_register_base_salary").in("id", ids);
  if (error) return NextResponse.json({ total: 0, count: 0, error: error.message }, { status: 500 });
  const total = (data ?? []).reduce((a, e) => a + (Number((e as { payroll_register_base_salary?: number }).payroll_register_base_salary) || 0), 0);
  return NextResponse.json({ total: Math.round(total * 100) / 100, count: (data ?? []).length, error: null });
}
