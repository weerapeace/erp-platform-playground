import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * รายละเอียด "ที่มา" ของ movement — จ่ายงานให้โต๊ะ/ช่างไหน / รับของจากใบไหน
 * GET ?ref_type=&ref_id=
 */
export type RefWorker = { assignee_name: string | null; stage: string | null; qty: number; received_qty?: number; labor_cost?: number | null };

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "stock.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const refType = (sp.get("ref_type") ?? "").trim();
  const refId = (sp.get("ref_id") ?? "").trim();
  if (!refId) return NextResponse.json({ kind: "none", error: null });
  const admin = supabaseAdmin();

  // จ่ายงาน (RAW→WIP): ref_id = mo_id → ใบจ่ายงานของ MO (โต๊ะ/ช่างที่รับ)
  if (refType === "mo_issue_wip") {
    const { data: mo } = await admin.from("manufacturing_orders").select("mo_no").eq("id", refId).maybeSingle();
    const moNo = (mo as { mo_no?: string } | null)?.mo_no ?? null;
    if (!moNo) return NextResponse.json({ kind: "dispatch", mo_no: null, workers: [], error: null });
    const { data: wos } = await admin.from("mo_work_orders")
      .select("assignee_name, stage, qty, received_qty, labor_cost").eq("mo_no", moNo).eq("is_active", true);
    return NextResponse.json({ kind: "dispatch", mo_no: moNo, workers: (wos ?? []) as RefWorker[], error: null });
  }
  // QC (รับเข้า/ของเสีย/ย้อนกลับ): ref_id = wo_id (ใบจ่ายงานเดียว)
  if (["qc_receive", "qc_backflush", "qc_scrap", "qc_reverse"].includes(refType)) {
    const { data: wo } = await admin.from("mo_work_orders")
      .select("assignee_name, stage, qty, mo_no, product_sku, product_name").eq("id", refId).maybeSingle();
    return NextResponse.json({ kind: "qc", wo: wo ?? null, error: null });
  }
  // รับของ PO: ref_id = goods receipt id
  if (refType === "goods_receipt") {
    const { data: gr } = await admin.from("goods_receipts_v2")
      .select("gr_no, po_no, seller_name, receive_date, receiver").eq("id", refId).maybeSingle();
    return NextResponse.json({ kind: "receipt", gr: gr ?? null, error: null });
  }
  return NextResponse.json({ kind: "other", error: null });
}
