/**
 * ดึงข้อมูลจาก "ใบกำกับภาษี" ในระบบ มาตั้งต้นใบลดหนี้
 *   GET /api/credit-notes/from-invoice            → รายชื่อใบกำกับให้เลือก (ค้นหาด้วย ?search=)
 *   GET /api/credit-notes/from-invoice?so_id=...  → ข้อมูลลูกค้า + รายการสินค้าของใบนั้น
 *
 * ใบกำกับภาษีในระบบ = ใบขาย (SO) ที่มีเลข tax_invoice_no
 * (ใบเก่าที่ออกนอกระบบ ผู้ใช้พิมพ์เลข/วันที่/ยอดเองในหน้าใบลดหนี้ได้)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { customerHeader } from "@/lib/doc-parties";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export type InvoiceOption = {
  so_id: string;
  invoice_no: string;
  invoice_date: string | null;
  customer_name: string | null;
  company_code: string | null;
  taxable: number;      // ยอดก่อน VAT ของทั้งใบ = "มูลค่าตามเอกสารเดิม"
  grand_total: number;
};

export type InvoiceSource = InvoiceOption & {
  company_id: string | null;
  customer_id: string | null;
  customer_code: string | null;
  customer_address: string | null;
  customer_tax_id: string | null;
  customer_phone: string | null;
  vat_rate: number;
  lines: {
    product_id: string | null; sku: string | null; product_name: string; note: string | null;
    unit: string | null; unit_price: number; qty_original: number; qty_correct: number;
  }[];
};

export async function GET(request: NextRequest) {
  const denied = await guardApi(request, "cn.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const soId = (sp.get("so_id") ?? "").trim();
  const admin = supabaseAdmin();

  // ---- รายชื่อใบกำกับให้เลือก ----
  if (!soId) {
    const search = (sp.get("search") ?? "").trim();
    let q = admin.from("erp_playground_sales_orders")
      .select("id, tax_invoice_no, so_number, order_date, customer_name, taxable, grand_total, company_id, status")
      .not("tax_invoice_no", "is", null)
      .neq("status", "cancelled")
      .order("order_date", { ascending: false })
      .limit(100);
    if (search) q = q.or(`tax_invoice_no.ilike.%${search}%,customer_name.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

    const companyCodes = await companyCodeMap(admin);
    const list: InvoiceOption[] = ((data ?? []) as Record<string, unknown>[]).map(r => ({
      so_id: String(r.id),
      invoice_no: String(r.tax_invoice_no ?? r.so_number ?? ""),
      invoice_date: (r.order_date as string) ?? null,
      customer_name: (r.customer_name as string) ?? null,
      company_code: companyCodes.get(String(r.company_id ?? "")) ?? null,
      taxable: num(r.taxable),
      grand_total: num(r.grand_total),
    }));
    return NextResponse.json({ data: list, error: null });
  }

  // ---- ข้อมูลของใบที่เลือก ----
  const { data: so, error } = await admin.from("erp_playground_sales_orders")
    .select("*").eq("id", soId).maybeSingle();
  if (error) return NextResponse.json({ data: null, error: error.message }, { status: 500 });
  if (!so) return NextResponse.json({ data: null, error: "ไม่พบใบกำกับภาษีใบนี้" }, { status: 404 });
  const row = so as Record<string, unknown>;

  const { data: lines } = await admin.from("erp_playground_so_lines")
    .select("*").eq("so_id", soId).order("sort_order", { ascending: true });

  const companyCodes = await companyCodeMap(admin);
  const customer = await customerHeader(admin, row.customer_id as string | null, {
    customer_name: (row.customer_name as string) ?? "",
    customer_code: (row.customer_code as string) ?? "",
  });

  const source: InvoiceSource = {
    so_id: soId,
    invoice_no: String(row.tax_invoice_no ?? row.so_number ?? ""),
    invoice_date: (row.order_date as string) ?? null,
    company_id: (row.company_id as string) ?? null,
    company_code: companyCodes.get(String(row.company_id ?? "")) ?? null,
    customer_id: (row.customer_id as string) ?? null,
    ...customer,
    vat_rate: num(row.vat_rate) || 7,
    taxable: num(row.taxable),
    grand_total: num(row.grand_total),
    // ตั้งต้น "จำนวนที่ถูกต้อง" = จำนวนเดิม → ผู้ใช้แก้เฉพาะบรรทัดที่ต้องลด
    lines: ((lines ?? []) as Record<string, unknown>[]).map(l => ({
      product_id: (l.product_id as string) ?? null,
      sku: (l.sku as string) ?? null,
      product_name: String(l.product_name ?? ""),
      note: (l.note as string) ?? null,
      unit: (l.unit as string) ?? null,
      unit_price: num(l.unit_price),
      qty_original: num(l.qty),
      qty_correct: num(l.qty),
    })),
  };
  return NextResponse.json({ data: source, error: null });
}

async function companyCodeMap(admin: ReturnType<typeof supabaseAdmin>) {
  const { data } = await admin.from("companies").select("id, company_code");
  const map = new Map<string, string>();
  for (const c of (data ?? []) as Record<string, unknown>[]) map.set(String(c.id), String(c.company_code ?? ""));
  return map;
}
