/**
 * GET /api/loan-dashboard — สรุปภาพรวมเงินกู้ (อ่านจากรายการต้นทางผ่าน RPC loan_dashboard)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "loan_contracts.view");
  if (denied) return denied;

  const { data, error } = await supabaseAdmin().rpc("loan_dashboard");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data, error: null });
}
