/**
 * POST /api/od-recon/build — คำนวณ/อัปเดตดอกเบี้ยประมาณการรายเดือนจาก daily balances
 * (คง actual/reason เดิม) · body: { facility_id? }  (ไม่ส่ง = ทุกวงเงิน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "od_interest.reconcile");
  if (denied) return denied;

  let body: { facility_id?: string | null } = {};
  try { body = await request.json(); } catch { /* empty body ok */ }
  const facility_id = body?.facility_id ? String(body.facility_id) : null;

  const { error } = await supabaseAdmin().rpc("od_recon_build", { p_facility_id: facility_id });
  if (error) return NextResponse.json({ error: "คำนวณไม่สำเร็จ: " + error.message }, { status: 500 });
  return NextResponse.json({ ok: true, error: null });
}
