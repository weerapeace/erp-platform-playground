/**
 * GET /api/sales/tax-report?month=YYYY-MM&company=<uuid> — รายงานภาษีขายรายเดือนของบริษัทที่เลือก
 *
 * ใช้โดยหน้า /sales/tax-report (ดูบนจอ / พิมพ์ A4 / Excel)
 * แหล่งข้อมูล:
 *   - erp_playground_sales_orders  ที่มี tax_invoice_no (ใบกำกับภาษี — รวมใบยกเลิก ยอดเป็น 0)
 *   - erp_playground_credit_notes  issued/cancelled ของเดือน (ใบลดหนี้ — บรรทัดติดลบ)
 *   - partners_v2                  เลขผู้เสียภาษี + สาขาของลูกค้า (ใบขายไม่ได้เก็บไว้บนเอกสาร)
 *   - companies                    หัวบิลผู้ประกอบการ + รายชื่อบริษัทให้เลือก
 * กติกา:
 *   - เดือนของใบกำกับ = order_date (ระบบยังไม่มีช่องวันที่ใบกำกับแยก) · เดือนของใบลดหนี้ = cn_date
 *   - ตรรกะคิดเลข/เรียง/ตรวจเลขขาด-ซ้ำ อยู่ lib/sales-tax-report.ts (มีเทสต์) — ที่นี่แค่ดึงข้อมูลแล้วประกอบ
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { firstText } from "@/lib/doc-parties";
import { formatThaiAddress } from "@/lib/thai-address";
import { isMonthKey, monthRange, thisMonth } from "@/lib/month";
import {
  analyzeInvoiceSequence, creditNoteRow, invoiceRow, sortSalesTaxRows, summarizeSalesTax,
  type CustomerTax, type SalesTaxCompany, type SalesTaxReport, type SalesTaxRow,
} from "@/lib/sales-tax-report";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: unknown) => { const n = Number(v); return isFinite(n) ? n : 0; };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;

  const sp = new URL(request.url).searchParams;
  const month = isMonthKey(sp.get("month")) ? sp.get("month")! : thisMonth();
  const { from, to } = monthRange(month);
  const admin = supabaseAdmin();

  // ---- บริษัทผู้ออกใบกำกับ (หัวรายงาน) + รายชื่อให้เลือก ----
  const { data: coData, error: coErr } = await admin.from("companies").select("*")
    .order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (coErr) return NextResponse.json({ data: null, error: coErr.message }, { status: 500 });
  const coRows = ((coData ?? []) as Record<string, unknown>[]).filter(c => String(c.status ?? "active") !== "inactive");
  const wanted = String(sp.get("company") ?? "").trim();
  const coRow = coRows.find(c => String(c.id) === wanted) ?? coRows.find(c => c.is_default === true) ?? coRows[0] ?? null;
  const companies = coRows.map(c => ({
    id: String(c.id), code: firstText(c.company_code), name_th: firstText(c.name_th, c.name),
  }));
  if (!coRow) {
    const empty: SalesTaxReport = { month, company: null, companies, rows: [], summary: summarizeSalesTax([]), issues: { gaps: [], duplicates: [] } };
    return NextResponse.json({ data: empty, error: null });
  }
  const company: SalesTaxCompany = {
    id: String(coRow.id), code: firstText(coRow.company_code), name_th: firstText(coRow.name_th, coRow.name),
    tax_id: firstText(coRow.tax_id), tax_branch: firstText(coRow.tax_branch), address: formatThaiAddress(coRow),
  };

  // ---- ใบขายของเดือน (บริษัทนี้) ----
  const { data: soData, error: soErr } = await admin.from("erp_playground_sales_orders")
    .select("id, so_number, tax_invoice_no, order_date, customer_id, customer_name, status, taxable, total_vat, grand_total")
    .eq("company_id", company.id).gte("order_date", from).lt("order_date", to)
    .order("order_date", { ascending: true }).limit(3000);
  if (soErr) return NextResponse.json({ data: null, error: soErr.message }, { status: 500 });
  const soRows = (soData ?? []) as Record<string, unknown>[];
  const invoices = soRows.filter(s => String(s.tax_invoice_no ?? "").trim());
  // บิลไม่มี VAT (ไม่มีเลขใบกำกับ) — ไม่อยู่ในรายงาน แต่บอกจำนวนไว้ให้รู้
  const noVatRows = soRows.filter(s => !String(s.tax_invoice_no ?? "").trim() && s.status !== "cancelled");

  // ---- ใบลดหนี้ของเดือน (บริษัทนี้) ----
  const { data: cnData, error: cnErr } = await admin.from("erp_playground_credit_notes")
    .select("id, cn_number, status, ref_invoice_no, cn_date, customer_id, customer_name, customer_tax_id, diff_amount, vat_amount")
    .eq("company_id", company.id).gte("cn_date", from).lt("cn_date", to)
    .in("status", ["issued", "cancelled"]).limit(1000);
  if (cnErr) return NextResponse.json({ data: null, error: cnErr.message }, { status: 500 });
  const cnRows = ((cnData ?? []) as Record<string, unknown>[]).filter(c => String(c.cn_number ?? "").trim());

  // ---- เลขผู้เสียภาษี + สาขา จากทะเบียนคู่ค้า (ครั้งเดียวทั้งชุด) ----
  const custIds = [...new Set([...invoices, ...cnRows].map(r => String(r.customer_id ?? "").trim()).filter(Boolean))];
  const taxById = new Map<string, CustomerTax>();
  for (let i = 0; i < custIds.length; i += 200) {
    const { data: ps } = await admin.from("partners_v2").select("id, tax_id, tax_branch").in("id", custIds.slice(i, i + 200));
    for (const p of (ps ?? []) as Record<string, unknown>[]) {
      taxById.set(String(p.id), { tax_id: firstText(p.tax_id).replace(/[^\d]/g, ""), branch: firstText(p.tax_branch) });
    }
  }
  const custOf = (r: Record<string, unknown>) => taxById.get(String(r.customer_id ?? "")) ?? null;

  // ---- ประกอบบรรทัดรายงาน ----
  const rows: SalesTaxRow[] = sortSalesTaxRows([
    ...invoices.map(s => invoiceRow({
      id: String(s.id), tax_invoice_no: String(s.tax_invoice_no).trim(), so_number: (s.so_number as string) ?? null,
      order_date: (s.order_date as string) ?? null, customer_name: (s.customer_name as string) ?? null,
      status: (s.status as string) ?? null, taxable: s.taxable, total_vat: s.total_vat,
    }, custOf(s))),
    ...cnRows.map(c => creditNoteRow({
      id: String(c.id), cn_number: String(c.cn_number).trim(), status: (c.status as string) ?? null,
      ref_invoice_no: (c.ref_invoice_no as string) ?? null, cn_date: (c.cn_date as string) ?? null,
      customer_name: (c.customer_name as string) ?? null, customer_tax_id: (c.customer_tax_id as string) ?? null,
      diff_amount: c.diff_amount, vat_amount: c.vat_amount,
    }, custOf(c))),
  ]);

  const report: SalesTaxReport = {
    month, company, companies, rows,
    summary: summarizeSalesTax(rows, { n: noVatRows.length, total: noVatRows.reduce((a, s) => a + num(s.grand_total), 0) }),
    issues: analyzeInvoiceSequence(rows.filter(r => r.kind === "invoice").map(r => r.doc_no)),
  };
  return NextResponse.json({ data: report, error: null });
}
