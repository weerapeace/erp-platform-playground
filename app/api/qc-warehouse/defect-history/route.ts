/**
 * โกดัง QC — ประวัติของเสีย (จาก defect_logs จริง)
 * GET /api/qc-warehouse/defect-history?sku=&search=  → รายการล่าสุด (กรองตาม SKU ได้)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export type DefectLog = {
  id: string; defect_no: string | null; sku: string | null; worker: string | null;
  qty: number | null; defect_type: string | null; kind: string | null; mo_no: string | null; created_at: string;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "qc.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const sku = (searchParams.get("sku") ?? "").trim();
  const search = (searchParams.get("search") ?? "").trim();

  let q = supabaseAdmin().from("defect_logs").select("id, defect_no, sku, worker, qty, defect_type, kind, mo_no, created_at").order("created_at", { ascending: false }).limit(500);
  if (sku) q = q.eq("sku", sku);
  if (search) q = q.or(`sku.ilike.%${search}%,worker.ilike.%${search}%,defect_type.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [], error: null });
}
