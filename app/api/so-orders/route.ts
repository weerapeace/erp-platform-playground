/**
 * ใบสั่งขาย — /api/so-orders
 *   GET  ?search=&status=&limit=   → รายการใบสั่งขาย (+จำนวนบรรทัด)
 *   POST { header, lines, open_mo } → สร้างใบใหม่ (เลขที่ออกให้ตามบริษัท) · open_mo=true → เปิดใบสั่งผลิตให้เลย
 * สิทธิ์: ดู so.view · สร้าง so.create · ทุก action เขียน audit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { computeTotals, nextOrderNo, type SoOrderHeaderInput, type SoOrderLineInput, type SoOrderRow } from "./shared";
import { openMoForOrder } from "./open-mo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const search = (searchParams.get("search") ?? "").trim();
  const status = (searchParams.get("status") ?? "").trim();
  const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit") ?? 300)));

  const admin = supabaseAdmin();
  let q = admin.from("so_orders")
    .select("id, order_no, status, company_code, customer_name, customer_code, customer_po_no, sale_person_name, order_date, due_date, grand_total, mo_opened_at, invoice_so_id, shipped_at")
    .order("order_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (status) q = q.eq("status", status);
  if (search) q = q.or(`order_no.ilike.%${search}%,customer_name.ilike.%${search}%,customer_po_no.ilike.%${search}%`);
  const { data, error } = await q;
  if (error) return NextResponse.json({ data: [], error: error.message }, { status: 500 });

  const ids = (data ?? []).map((r) => (r as { id: string }).id);
  const counts = new Map<string, number>();
  if (ids.length) {
    const { data: lines } = await admin.from("so_order_lines").select("order_id").in("order_id", ids);
    for (const l of (lines ?? []) as { order_id: string }[]) counts.set(l.order_id, (counts.get(l.order_id) ?? 0) + 1);
  }
  const rows: SoOrderRow[] = (data ?? []).map((r) => ({ ...(r as Omit<SoOrderRow, "line_count">), line_count: counts.get((r as { id: string }).id) ?? 0 }));
  return NextResponse.json({ data: rows, error: null });
}

type CreateBody = { header?: SoOrderHeaderInput; lines?: SoOrderLineInput[]; open_mo?: boolean };

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "so.create"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let b: CreateBody;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const header = b.header ?? {};
  const lines = (b.lines ?? []).filter((l) => (l.product_name ?? "").trim() || l.sku);
  if (!header.customer_name && !header.customer_id) return NextResponse.json({ error: "ต้องเลือกลูกค้าก่อน" }, { status: 400 });
  if (lines.length === 0) return NextResponse.json({ error: "ต้องมีรายการสินค้าอย่างน้อย 1 บรรทัด" }, { status: 400 });

  const admin = supabaseAdmin();
  const orderNo = await nextOrderNo(admin, header.company_code ?? null);
  const totals = computeTotals(header, lines);

  const { data: order, error } = await admin.from("so_orders").insert({
    order_no: orderNo,
    company_id: header.company_id ?? null, company_code: header.company_code ?? null,
    status: "confirmed",
    customer_id: header.customer_id ?? null, customer_name: header.customer_name ?? null,
    customer_code: header.customer_code ?? null, customer_po_no: header.customer_po_no ?? null,
    sale_person_name: header.sale_person_name ?? null,
    order_date: header.order_date || new Date().toISOString().slice(0, 10),
    due_date: header.due_date || null,
    currency: header.currency ?? "THB",
    header_discount_type: header.header_discount_type ?? "amount",
    header_discount_value: Number(header.header_discount_value) || 0,
    shipping_fee: Number(header.shipping_fee) || 0,
    vat_rate: Number(header.vat_rate ?? 7), vat_included: !!header.vat_included,
    wht_rate: Number(header.wht_rate) || 0,
    ...totals,
    note: header.note ?? null, created_by: user?.id ?? null,
  }).select("id, order_no").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const orderId = (order as { id: string }).id;
  const rows = lines.map((l, i) => ({
    order_id: orderId, line_no: i + 1,
    sku: l.sku ?? null, product_name: l.product_name ?? l.sku ?? "",
    qty: Number(l.qty) || 0, unit: l.unit || "ชิ้น", unit_price: Number(l.unit_price) || 0,
    discount_type: l.discount_type ?? "amount", discount_value: Number(l.discount_value) || 0,
    due_date: l.due_date || null, mo_id: l.mo_id ?? null, mo_no: l.mo_no ?? null,
    source: l.source ?? "manual", note: l.note ?? null,
  }));
  const { error: lineErr } = await admin.from("so_order_lines").insert(rows);
  if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 400 });

  // ผูกใบสั่งผลิตที่ "ดึงมา" เข้ากับใบนี้ทันที (เจ้าของสั่ง: ยืนยันแล้ว = เปลี่ยนสถานะใบสั่งงานด้วย)
  let opened: { created: number; linked: number } | null = null;
  if (b.open_mo !== false) opened = await openMoForOrder(admin, orderId, user?.id ?? null);

  await writeAudit(admin, { action: "create", entityType: "so_order", entityId: orderId,
    actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { order_no: orderNo, lines: rows.length, grand_total: totals.grand_total, opened } });

  return NextResponse.json({ id: orderId, order_no: orderNo, opened, error: null });
}
