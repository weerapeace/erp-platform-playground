/**
 * 🧾 ใบกำกับภาษีเต็มรูปของออเดอร์เว็บ — /api/website/orders/tax-invoice
 * POST { orderId } (products.edit) → ออกเลขที่ใบกำกับ ครั้งเดียวต่อออเดอร์ (ออกแล้ว = คืนเลขเดิม) + audit
 *   เลขชุดของเว็บต่อบริษัทต่อเดือน: <รหัสบริษัท>-TI<ปปดด>-00001 (แยกจากใบสั่งขาย กันเลขชน · unique index ใน DB)
 * GET ?id=<orderId> (products.view) → { doc } ข้อมูลพร้อมพิมพ์ (lib/website-tax-invoice-print) — ยังไม่ออกเลข = 409
 * บริษัทบนหัวกระดาษ: ข้อมูลร้าน › 🧾 รหัสบริษัท (tax_invoice_company) — ต้องตั้งก่อนออกใบ (ไม่เดาบริษัทหลักให้ · ใบกำกับผิดบริษัท = ปัญหาภาษี)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAuditFor } from "@/lib/audit";
import { readSiteInfo } from "@/lib/website-site-info";
import { formatThaiAddress, formatTaxId } from "@/lib/thai-address";
import type { TaxInvoiceRequest } from "@/lib/website-tax-invoice";
import type { TaxInvoiceDoc } from "@/lib/website-tax-invoice-print";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type CompanyRow = Record<string, unknown> & { id: string; company_code: string | null; name_th: string | null; name_en: string | null; phone: string | null; tax_id: string | null; tax_branch: string | null; vat_registered: boolean | null };
const UUID = /^[0-9a-f-]{36}$/i;

/** บริษัทของใบกำกับ: เคยออกแล้วใช้บริษัทเดิม · ไม่งั้นรหัสที่ตั้งในข้อมูลร้าน · ไม่ได้ตั้ง/รหัสผิด = null (ไม่เดาให้) */
async function companyFor(sb: Admin, shopId: string, fixedId: string | null): Promise<CompanyRow | null> {
  if (fixedId) {
    const { data } = await sb.from("companies").select("*").eq("id", fixedId).maybeSingle();
    if (data) return data as CompanyRow;
  }
  const code = String((await readSiteInfo(sb, shopId)).tax_invoice_company ?? "").trim();
  if (!code) return null;
  const { data } = await sb.from("companies").select("*").ilike("company_code", code).maybeSingle();
  return (data as CompanyRow | null) ?? null;
}

/** เลขถัดไปของเดือนนี้ (เวลาไทย) */
function prefixOf(code: string | null, now = new Date()): string {
  const bkk = new Date(now.getTime() + 7 * 3600e3);
  const yymm = `${String(bkk.getUTCFullYear()).slice(2)}${String(bkk.getUTCMonth() + 1).padStart(2, "0")}`;
  const c = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) || "WEB";
  return `${c}-TI${yymm}-`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
  const id = String(body?.orderId ?? "");
  if (!UUID.test(id)) return NextResponse.json({ error: "ต้องระบุออเดอร์" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: o } = await sb.from("store_orders").select("id, shop_id, order_no, status, tax_invoice, tax_invoice_no, tax_invoice_company_id").eq("id", id).maybeSingle();
  const order = o as { id: string; shop_id: string; order_no: string; status: string; tax_invoice: TaxInvoiceRequest | null; tax_invoice_no: string | null; tax_invoice_company_id: string | null } | null;
  if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  if (order.tax_invoice_no) return NextResponse.json({ ok: true, no: order.tax_invoice_no, already: true });
  if (!order.tax_invoice) return NextResponse.json({ error: "ออเดอร์นี้ลูกค้าไม่ได้ขอใบกำกับภาษี" }, { status: 400 });
  if (order.status === "cancelled") return NextResponse.json({ error: "ออเดอร์ยกเลิกแล้ว — ออกใบกำกับไม่ได้" }, { status: 409 });
  const company = await companyFor(sb, order.shop_id, null);
  if (!company) return NextResponse.json({ error: "ยังไม่ได้เลือกบริษัทที่ออกใบกำกับ — ตั้ง “รหัสบริษัท” ที่แท็บ 🏪 ข้อมูลร้าน › ออเดอร์ ก่อน (รหัสดูได้ที่ ERP › ตั้งค่า › บริษัท)" }, { status: 409 });

  const prefix = prefixOf(company.company_code);
  for (let attempt = 0; attempt < 8; attempt++) {
    const { count } = await sb.from("store_orders").select("id", { count: "exact", head: true }).like("tax_invoice_no", `${prefix}%`);
    const no = `${prefix}${String((count ?? 0) + 1 + attempt).padStart(5, "0")}`;
    const { data: upd, error } = await sb
      .from("store_orders")
      .update({ tax_invoice_no: no, tax_invoice_at: new Date().toISOString(), tax_invoice_company_id: company.id })
      .eq("id", id)
      .is("tax_invoice_no", null)
      .select("tax_invoice_no");
    if (error) {
      if ((error as { code?: string }).code === "23505") continue; // เลขชน → ขยับ
      return NextResponse.json({ error: "ออกเลขไม่สำเร็จ" }, { status: 500 });
    }
    if (!(upd ?? []).length) {
      // อีกคนกดออกพร้อมกันไปก่อน → ใช้เลขนั้น
      const { data: again } = await sb.from("store_orders").select("tax_invoice_no").eq("id", id).maybeSingle();
      return NextResponse.json({ ok: true, no: (again as { tax_invoice_no: string | null } | null)?.tax_invoice_no ?? null, already: true });
    }
    await writeAuditFor(request, sb, { action: "create", entityType: "store_orders", entityId: id, metadata: { kind: "tax_invoice", orderNo: order.order_no, taxInvoiceNo: no, company: company.company_code, customer: order.tax_invoice.name } });
    return NextResponse.json({ ok: true, no });
  }
  return NextResponse.json({ error: "ระบบไม่ว่าง กรุณาลองใหม่" }, { status: 503 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "ต้องระบุออเดอร์" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: o } = await sb.from("store_orders").select("*").eq("id", id).maybeSingle();
  const r = o as Record<string, unknown> | null;
  if (!r) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  if (!r.tax_invoice_no || !r.tax_invoice) return NextResponse.json({ error: "ยังไม่ได้ออกเลขใบกำกับภาษี" }, { status: 409 });
  const company = await companyFor(sb, String(r.shop_id), (r.tax_invoice_company_id as string | null) ?? null);
  if (!company) return NextResponse.json({ error: "ไม่พบข้อมูลบริษัท" }, { status: 409 });
  const { data: items } = await sb.from("store_order_items").select("name, variant_label, qty, unit_price, line_total").eq("order_id", id);
  const n = (v: unknown) => Number(v) || 0;
  const doc: TaxInvoiceDoc = {
    no: String(r.tax_invoice_no),
    issuedAt: String(r.tax_invoice_at ?? r.created_at),
    orderNo: String(r.order_no),
    company: {
      name: String(company.name_th ?? company.name ?? ""),
      nameEn: String(company.name_en ?? ""),
      address: formatThaiAddress(company),
      phone: String(company.phone ?? ""),
      taxId: formatTaxId(company.tax_id, company.tax_branch),
      vatRegistered: company.vat_registered !== false,
    },
    customer: r.tax_invoice as TaxInvoiceRequest,
    lines: ((items ?? []) as { name: string; variant_label: string | null; qty: number; unit_price: number; line_total: number }[]).map((l) => ({ name: l.name, variant: l.variant_label, qty: n(l.qty), unitPrice: n(l.unit_price), lineTotal: n(l.line_total) })),
    extras: [
      { label: "ค่าจัดส่ง", amount: n(r.shipping_fee) },
      { label: "ค่าธรรมเนียมเก็บเงินปลายทาง", amount: n(r.cod_fee) },
      { label: "บริการห่อของขวัญ", amount: n(r.gift_fee) },
      { label: "การ์ดอวยพร", amount: n(r.gift_card_fee) },
    ],
    discount: Math.round((n(r.discount) + n(r.points_discount)) * 100) / 100,
    total: n(r.grand_total),
  };
  return NextResponse.json({ doc }, { headers: { "Cache-Control": "no-store" } });
}
