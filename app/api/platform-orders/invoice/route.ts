/**
 * 🧾 ใบกำกับภาษีของออเดอร์แพลตฟอร์ม — /api/platform-orders/invoice   (ศูนย์ออเดอร์ เฟส A4 · 2026-11-10)
 *
 * ออก "ผ่านใบขาย" (erp_playground_sales_orders) — เจ้าของอนุมัติแผน: เลขชุดเดียวกับใบกำกับที่ออกอยู่ (ISG2569-…)
 *   → เข้ารายงานภาษีขาย /sales/tax-report เอง · พิมพ์ด้วยหน้าใบขายเดิม /print/sales-order/<id>
 *   - ใบขายไม่ใส่คลัง = ไม่จอง/ไม่ตัดสต๊อก (สต๊อกของออเดอร์แพลตฟอร์มตัดที่ศูนย์ออเดอร์อยู่แล้ว กันตัดซ้ำ)
 *     ⚠️ ใบขายที่ไม่มีคลัง "ยืนยัน" ไม่ได้ (กติกาใบขายจะจองของ) → ค้างเป็นร่างที่มีเลขแล้ว · รายงานภาษีนับรวม (ติดป้าย "ร่าง")
 *   - บริษัทที่ออก = ตั้งต่อร้านที่ 🏪 บัญชีแพลตฟอร์ม (platform_accounts.tax_invoice_company_id) — ไม่ได้ตั้ง = ไม่ออก (ไม่เดาบริษัท)
 *   - ลูกค้า: หาในรายชื่อลูกค้าด้วยเลขผู้เสียภาษี (+สาขา) ไม่เจอ = สร้างใหม่ (รายงานภาษีดึงเลขผู้เสียภาษีจากรายชื่อลูกค้า)
 *   - ใบขายที่ผูกไว้ถูกยกเลิก = ออกใหม่ได้
 *
 * GET  ?order_id=   (platform_orders.view)   → ข้อมูลก่อนออก: ผู้ขอ, รายการ, ยอด, บริษัท, ใบที่ออกแล้ว, คำเตือน
 * POST { order_id, request, shipping_fee? }  (platform_orders.manage + สิทธิ์สร้างใบขาย so.create ในฐานข้อมูล)
 * ออเดอร์ตัวอย่าง (demo-) = ตอบผลจำลอง ไม่บันทึก
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { cleanTaxInvoice, type TaxInvoiceRequest } from "@/lib/website-tax-invoice";
import { demoOrder, isDemoId } from "@/lib/platform-order-demo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type Company = { id: string; company_code: string | null; name_th: string | null; name: string | null; vat_registered: boolean | null };
type Line = { sku: string | null; product_id: string | null; name: string; qty: number; unit_price: number; line_total: number };
const r2 = (n: number) => Math.round(n * 100) / 100;

async function companyOf(admin: Admin, brandId: string | null, platformId: string | null): Promise<Company | null> {
  if (!brandId || !platformId) return null;
  const { data: acc } = await admin.from("platform_accounts").select("tax_invoice_company_id").eq("brand_id", brandId).eq("platform_id", platformId).maybeSingle();
  const cid = (acc as { tax_invoice_company_id?: string | null } | null)?.tax_invoice_company_id;
  if (!cid) return null;
  const { data } = await admin.from("companies").select("id, company_code, name_th, name, vat_registered").eq("id", cid).maybeSingle();
  return (data as Company | null) ?? null;
}

/** ใบขายที่ผูกไว้ (ไม่นับใบที่ยกเลิกแล้ว) */
async function activeInvoice(admin: Admin, soId: string | null): Promise<{ so_id: string; tax_invoice_no: string | null; status: string } | null> {
  if (!soId) return null;
  const { data } = await admin.from("erp_playground_sales_orders").select("id, tax_invoice_no, so_number, status").eq("id", soId).maybeSingle();
  const so = data as { id: string; tax_invoice_no: string | null; so_number: string | null; status: string } | null;
  if (!so || so.status === "cancelled") return null;
  return { so_id: so.id, tax_invoice_no: so.tax_invoice_no ?? so.so_number, status: so.status };
}

function linesOf(items: Record<string, unknown>[]): Line[] {
  return items.map((it) => {
    const qty = Number(it.qty) || 0;
    const unit = Number(it.price) || 0;
    const variant = typeof it.variant === "string" && it.variant ? ` (${it.variant})` : "";
    return { sku: (it.sku_code as string) ?? null, product_id: (it.matched_sku_id as string) ?? null, name: `${String(it.name ?? it.sku_code ?? "สินค้า")}${variant}`, qty, unit_price: unit, line_total: r2(qty * unit) };
  });
}

function warningsOf(o: { status: string; total: number | null }, lines: Line[], company: Company | null): string[] {
  const w: string[] = [];
  if (o.status === "cancelled") w.push("ออเดอร์ยกเลิกแล้ว — ออกใบกำกับไม่ได้");
  if (!company) w.push("ยังไม่ได้เลือกบริษัทที่ออกใบกำกับของร้านนี้ — ตั้งที่ 🏪 บัญชีแพลตฟอร์ม › ร้านนี้ › ใบกำกับภาษี");
  else if (company.vat_registered === false) w.push("บริษัทที่ตั้งไว้ไม่ได้จดภาษีมูลค่าเพิ่ม — ออกใบกำกับภาษีไม่ได้");
  if (!lines.length) w.push("ออเดอร์นี้ไม่มีรายการสินค้า");
  if (lines.some((l) => l.unit_price <= 0)) w.push("มีรายการที่ไม่มีราคา — แก้ราคาในใบขายก่อนพิมพ์");
  const sum = r2(lines.reduce((a, l) => a + l.line_total, 0));
  if (o.total != null && Math.abs(sum - Number(o.total)) > 1) w.push(`ยอดรายการ ${sum.toLocaleString("th-TH")} ไม่เท่ายอดออเดอร์ ${Number(o.total).toLocaleString("th-TH")} (ค่าส่ง/ส่วนลดของร้าน) — ใส่ค่าส่งด้านล่าง หรือแก้ในใบขายก่อนพิมพ์`);
  return w;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.view"); if (denied) return denied;
  const id = (new URL(request.url).searchParams.get("order_id") ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุออเดอร์" }, { status: 400 });

  if (isDemoId(id)) {
    const o = demoOrder(id);
    if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์ตัวอย่าง" }, { status: 404 });
    const lines = linesOf(o.items as unknown as Record<string, unknown>[]);
    const company: Company = { id: "demo", company_code: "DEMO", name_th: "บริษัทของร้าน (ตัวอย่าง)", name: null, vat_registered: true };
    return NextResponse.json({ demo: true, order: { id, order_no: o.order_no, total: o.total, status: o.status }, request: o.tax_invoice_request, lines, lines_total: r2(lines.reduce((a, l) => a + l.line_total, 0)), company, invoice: null, warnings: warningsOf(o, lines, company), error: null });
  }

  const admin = supabaseAdmin();
  const { data: row } = await admin.from("platform_orders").select("id, order_no, external_order_id, total, status, brand_id, platform_id, invoice_so_id, tax_invoice_request").eq("id", id).maybeSingle();
  const o = row as Record<string, unknown> | null;
  if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  const [{ data: items }, company, invoice] = await Promise.all([
    admin.from("platform_order_items").select("*").eq("order_id", id),
    companyOf(admin, (o.brand_id as string) ?? null, (o.platform_id as string) ?? null),
    activeInvoice(admin, (o.invoice_so_id as string) ?? null),
  ]);
  const lines = linesOf((items ?? []) as Record<string, unknown>[]);
  const order = { id, order_no: (o.order_no as string) ?? (o.external_order_id as string) ?? null, total: o.total == null ? null : Number(o.total), status: String(o.status ?? "new") };
  return NextResponse.json({
    order, request: (o.tax_invoice_request as TaxInvoiceRequest | null) ?? null, lines, lines_total: r2(lines.reduce((a, l) => a + l.line_total, 0)),
    company, invoice, warnings: invoice ? [] : warningsOf(order, lines, company), error: null,
  }, { headers: { "Cache-Control": "no-store" } });
}

/** ลูกค้าในรายชื่อ (partners_v2) จากเลขผู้เสียภาษี — ไม่เจอ = สร้างใหม่ */
async function customerFor(admin: Admin, req: TaxInvoiceRequest): Promise<{ id: string; created: boolean }> {
  const { data: found } = await admin.from("partners_v2").select("id, tax_branch, is_customer").eq("tax_id", req.taxId).limit(20);
  const rows = (found ?? []) as { id: string; tax_branch: string | null; is_customer: boolean | null }[];
  const sameBranch = (b: string | null) => req.kind !== "company" || (b ?? "") === req.branch || (req.branch === "00000" && (!b || b === "สำนักงานใหญ่"));
  const hit = rows.find((r) => sameBranch(r.tax_branch));
  if (hit) {
    if (!hit.is_customer) await admin.from("partners_v2").update({ is_customer: true }).eq("id", hit.id);
    return { id: hit.id, created: false };
  }
  const { data: ins, error } = await admin.from("partners_v2").insert({
    name_th: req.name, display_name: req.name, is_customer: true, is_company: req.kind === "company", is_active: true,
    tax_id: req.taxId, tax_branch: req.kind === "company" ? req.branch : null, address_line: req.address, email: req.email ?? null,
    country: "TH", notes: "สร้างอัตโนมัติจากคำขอใบกำกับภาษีของออเดอร์แพลตฟอร์ม",
  }).select("id").single();
  if (error || !ins) throw new Error("สร้างรายชื่อลูกค้าไม่สำเร็จ");
  return { id: String((ins as { id: string }).id), created: true };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  let body: { order_id?: string; request?: unknown; shipping_fee?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const id = String(body.order_id ?? "").trim();
  if (!id) return NextResponse.json({ error: "ต้องระบุออเดอร์" }, { status: 400 });
  const req = cleanTaxInvoice({ ...(body.request as Record<string, unknown> | null ?? {}), requested: true });
  if (!req.ok) return NextResponse.json({ error: req.error }, { status: 400 });
  if (!req.value) return NextResponse.json({ error: "กรอกข้อมูลผู้ขอใบกำกับภาษี" }, { status: 400 });
  const shipping = Math.max(0, r2(Number(body.shipping_fee) || 0));

  if (isDemoId(id)) return NextResponse.json({ ok: true, demo: true, so_id: null, tax_invoice_no: "ISG2569-11-XXX", note: "โหมดทดลอง — ไม่ได้ออกใบจริง", error: null });

  const admin = supabaseAdmin();
  const { data: row } = await admin.from("platform_orders").select("*").eq("id", id).maybeSingle();
  const o = row as Record<string, unknown> | null;
  if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
  if (o.status === "cancelled") return NextResponse.json({ error: "ออเดอร์ยกเลิกแล้ว — ออกใบกำกับไม่ได้" }, { status: 409 });
  const existing = await activeInvoice(admin, (o.invoice_so_id as string) ?? null);
  if (existing) return NextResponse.json({ ok: true, already: true, ...existing, error: null });

  const company = await companyOf(admin, (o.brand_id as string) ?? null, (o.platform_id as string) ?? null);
  if (!company) return NextResponse.json({ error: "ยังไม่ได้เลือกบริษัทที่ออกใบกำกับของร้านนี้ — ตั้งที่ 🏪 บัญชีแพลตฟอร์ม › ร้านนี้ › ใบกำกับภาษี" }, { status: 409 });
  if (company.vat_registered === false) return NextResponse.json({ error: "บริษัทที่ตั้งไว้ไม่ได้จดภาษีมูลค่าเพิ่ม — ออกใบกำกับภาษีไม่ได้" }, { status: 409 });
  const { data: items } = await admin.from("platform_order_items").select("*").eq("order_id", id);
  const lines = linesOf((items ?? []) as Record<string, unknown>[]);
  if (!lines.length) return NextResponse.json({ error: "ออเดอร์นี้ไม่มีรายการสินค้า" }, { status: 400 });

  let cust: { id: string; created: boolean };
  try { cust = await customerFor(admin, req.value); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }

  const sb = supabaseFromRequest(request);
  const { data: { user } } = await sb.auth.getUser();
  const orderNo = (o.order_no as string) || (o.external_order_id as string) || "";
  const orderedAt = (o.ordered_at as string) ?? (o.created_at as string) ?? null;
  const orderDate = orderedAt ? new Date(Date.parse(orderedAt) + 7 * 3600_000).toISOString().slice(0, 10) : null;   // วันที่ตามเวลาไทย
  const { data: soId, error: rpcErr } = await sb.rpc("erp_playground_so_create", {
    p_header: {
      company_id: company.id, from_warehouse_id: null, customer_id: cust.id, customer_name: req.value.name,
      order_date: orderDate, vat_rate: 7, vat_included: true, shipping_fee: shipping, customer_po_no: orderNo,
      note: `ใบกำกับจากออเดอร์แพลตฟอร์ม ${orderNo} (ไม่ตัดสต๊อก — ตัดที่ศูนย์ออเดอร์)`,
    },
    p_lines: lines.map((l) => ({ product_id: l.product_id, sku: l.sku, product_name: l.name, qty: l.qty, unit: "ชิ้น", unit_price: l.unit_price })),
    p_actor: user?.email ?? null,
  });
  if (rpcErr) {
    const m = rpcErr.message.includes("so.create") ? "บัญชีนี้ไม่มีสิทธิ์สร้างใบขาย (so.create) — ขอสิทธิ์จากผู้ดูแลระบบ" : `ออกใบขายไม่สำเร็จ: ${rpcErr.message}`;
    return NextResponse.json({ error: m }, { status: 400 });
  }
  const newId = String(soId ?? "");
  const inv = await activeInvoice(admin, newId);
  await admin.from("platform_orders").update({ invoice_so_id: newId, tax_invoice_request: req.value, updated_at: new Date().toISOString() }).eq("id", id);
  await writeAudit(admin, {
    action: "tax_invoice", entityType: "platform_order", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { order_no: orderNo, so_id: newId, tax_invoice_no: inv?.tax_invoice_no ?? null, company: company.company_code, customer: req.value.name, customer_created: cust.created, shipping_fee: shipping },
  });
  return NextResponse.json({ ok: true, so_id: newId, tax_invoice_no: inv?.tax_invoice_no ?? null, customer_created: cust.created, error: null });
}
