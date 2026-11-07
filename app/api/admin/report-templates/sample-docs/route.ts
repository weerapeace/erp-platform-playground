/**
 * GET /api/admin/report-templates/sample-docs?entity_type=billing_note[&q=BN-2569]
 * รายการเอกสารจริงล่าสุด (20 ใบ) ไว้เลือกพรีวิวแม่แบบในหน้า /admin/report-templates — อ่านอย่างเดียว
 * guard reports.view · คืนแค่ เลขที่ + ชื่อลูกค้า/ร้าน (ข้อมูลเต็มหน้าพิมพ์ดึงเองตามสิทธิ์ของผู้ใช้)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type Source = { table: string; num: string; sub?: string; activeCol?: string };

const DESIGN_SHEET: Source = { table: "design_sheets", num: "code", sub: "name", activeCol: "is_active" };

const SOURCES: Record<string, Source> = {
  qt: { table: "erp_playground_quotations", num: "quote_number", sub: "customer_name" },
  pr: { table: "erp_playground_purchase_requests", num: "pr_number" },
  po: { table: "purchase_orders_v2", num: "po_no", sub: "seller_name" },
  gr: { table: "goods_receipts_v2", num: "gr_no", sub: "seller_name", activeCol: "is_active" },
  pv: { table: "purchase_vouchers_v2", num: "pv_no", sub: "seller_name", activeCol: "is_active" },
  wo: { table: "manufacturing_orders", num: "mo_no", sub: "product_name", activeCol: "is_active" },
  so: { table: "erp_playground_sales_orders", num: "so_number", sub: "customer_name" },
  billing_note: { table: "erp_playground_billing_notes", num: "bill_number", sub: "customer_name" },
  cn: { table: "erp_playground_credit_notes", num: "cn_number", sub: "customer_name" },
  design_sheet: DESIGN_SHEET,
  design_sheet_cost: DESIGN_SHEET,
  design_sheet_quote: DESIGN_SHEET,
  design_sheet_supplier: DESIGN_SHEET,
  ds_present: DESIGN_SHEET,
};

export type SampleDoc = { id: string; label: string; sub: string | null };

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "reports.view");
  if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const src = SOURCES[sp.get("entity_type") ?? ""];
  if (!src) return NextResponse.json({ data: [], error: null });

  // ตัดอักขระที่ทำให้ตัวกรอง or() ของ PostgREST เพี้ยน
  const q = (sp.get("q") ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 60);
  const cols = ["id", src.num, src.sub].filter(Boolean).join(",");
  let query = supabaseAdmin().from(src.table).select(cols).order("created_at", { ascending: false }).limit(20);
  if (src.activeCol) query = query.not(src.activeCol, "is", false);
  if (q) query = query.or([src.num, src.sub].filter(Boolean).map(c => `${c}.ilike.%${q}%`).join(","));

  const { data, error } = await query;
  if (error) return NextResponse.json({ data: [], error: "โหลดรายการเอกสารไม่ได้" }, { status: 500 });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const docs: SampleDoc[] = rows.map(r => ({
    id: String(r.id),
    label: String(r[src.num] ?? "(ไม่มีเลขที่)"),
    sub: src.sub && r[src.sub] ? String(r[src.sub]) : null,
  }));
  return NextResponse.json({ data: docs, error: null });
}
