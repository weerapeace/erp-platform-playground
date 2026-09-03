/**
 * ใบสั่งขาย รายใบ — /api/so-orders/[id]
 *   GET    → หัวใบ + บรรทัด
 *   PATCH  { action }
 *      save     → แก้ไขใบ (หัว + บรรทัด · คิดเงินใหม่ด้วยเครื่องคิดเงินกลาง)
 *      open_mo  → เปิด/ผูกใบสั่งผลิตให้ทุกบรรทัด (กดซ้ำได้ ไม่สร้างซ้ำ)
 *      ship     { create_invoice } → "ส่งแล้ว" · create_invoice=true = ออกใบขาย/บิลให้เลย
 *      cancel   { reason }         → ยกเลิกใบ
 *      reopen   → กลับเป็น "ยืนยันแล้ว"
 *   DELETE → ลบใบ (เฉพาะใบที่ยังไม่เปิดใบสั่งผลิต/ยังไม่ออกใบขาย)
 * สิทธิ์: ดู so.view · แก้ so.create · ยืนยันส่ง so.ship · ยกเลิก so.cancel
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { computeTotals, type SoOrderHeaderInput, type SoOrderLineInput } from "../shared";
import { openMoForOrder } from "../open-mo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const [{ data: order }, { data: lines }] = await Promise.all([
    admin.from("so_orders").select("*").eq("id", id).maybeSingle(),
    admin.from("so_order_lines").select("*").eq("order_id", id).order("line_no"),
  ]);
  if (!order) return NextResponse.json({ data: null, error: "ไม่พบใบสั่งขาย" }, { status: 404 });
  return NextResponse.json({ data: { ...order, lines: lines ?? [] }, error: null });
}

type PatchBody = {
  action?: string;
  header?: SoOrderHeaderInput;
  lines?: SoOrderLineInput[];
  create_invoice?: boolean;
  reason?: string;
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id } = await params;
  let b: PatchBody;
  try { b = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const action = b.action ?? "save";

  const perm = action === "cancel" ? "so.cancel" : action === "ship" ? "so.ship" : "so.create";
  const denied = await guardApi(request, perm); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();

  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("so_orders").select("*").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบสั่งขาย" }, { status: 404 });
  const order = cur as Record<string, unknown>;
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };
  const now = new Date().toISOString();

  // ── แก้ไขใบ ─────────────────────────────────────────────
  if (action === "save") {
    if (order.status === "cancelled") return NextResponse.json({ error: "ใบที่ยกเลิกแล้ว แก้ไม่ได้" }, { status: 400 });
    const header = b.header ?? {};
    const lines = (b.lines ?? []).filter((l) => (l.product_name ?? "").trim() || l.sku);
    if (lines.length === 0) return NextResponse.json({ error: "ต้องมีรายการสินค้าอย่างน้อย 1 บรรทัด" }, { status: 400 });
    const totals = computeTotals(header, lines);

    const { error } = await admin.from("so_orders").update({
      company_id: header.company_id ?? null, company_code: header.company_code ?? null,
      customer_id: header.customer_id ?? null, customer_name: header.customer_name ?? null,
      customer_code: header.customer_code ?? null, customer_po_no: header.customer_po_no ?? null,
      sale_person_name: header.sale_person_name ?? null,
      order_date: header.order_date || String(order.order_date), due_date: header.due_date || null,
      header_discount_type: header.header_discount_type ?? "amount",
      header_discount_value: Number(header.header_discount_value) || 0,
      shipping_fee: Number(header.shipping_fee) || 0,
      vat_rate: Number(header.vat_rate ?? 7), vat_included: !!header.vat_included,
      wht_rate: Number(header.wht_rate) || 0,
      ...totals, note: header.note ?? null, updated_at: now,
    }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // บรรทัด: เขียนทับทั้งชุด แต่ "คงการผูกใบสั่งผลิตเดิม" ไว้ (ห้ามทำให้ MO หลุดจากใบ)
    await admin.from("so_order_lines").delete().eq("order_id", id);
    await admin.from("so_order_lines").insert(lines.map((l, i) => ({
      order_id: id, line_no: i + 1,
      sku: l.sku ?? null, product_name: l.product_name ?? l.sku ?? "",
      qty: Number(l.qty) || 0, unit: l.unit || "ชิ้น", unit_price: Number(l.unit_price) || 0,
      discount_type: l.discount_type ?? "amount", discount_value: Number(l.discount_value) || 0,
      due_date: l.due_date || null, mo_id: l.mo_id ?? null, mo_no: l.mo_no ?? null,
      source: l.source ?? "manual", note: l.note ?? null,
    })));
    await writeAudit(admin, { action: "update", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: order.order_no, grand_total: totals.grand_total } });
    return NextResponse.json({ ok: true, error: null });
  }

  // ── เปิด/ผูกใบสั่งผลิต ───────────────────────────────────
  if (action === "open_mo") {
    const opened = await openMoForOrder(admin, id, user?.id ?? null);
    return NextResponse.json({ ok: true, opened, error: null });
  }

  // ── ส่งแล้ว (ออกใบขายให้เลยได้) ─────────────────────────
  if (action === "ship") {
    if (order.status === "cancelled") return NextResponse.json({ error: "ใบที่ยกเลิกแล้ว ส่งไม่ได้" }, { status: 400 });
    let invoiceId = (order.invoice_so_id as string | null) ?? null;

    if (b.create_invoice && !invoiceId) {
      const { data: lines } = await admin.from("so_order_lines").select("*").eq("order_id", id).order("line_no");
      const { data: newId, error: rpcErr } = await supabaseFromRequest(request).rpc("erp_playground_so_create", {
        p_header: {
          customer_id: order.customer_id, customer_name: order.customer_name, customer_code: order.customer_code,
          sale_person_name: order.sale_person_name, currency: order.currency,
          order_date: order.order_date, expected_ship_date: order.due_date,
          header_discount_type: order.header_discount_type, header_discount_value: order.header_discount_value,
          shipping_fee: order.shipping_fee, vat_rate: order.vat_rate, vat_included: order.vat_included,
          wht_rate: order.wht_rate, note: `จากใบสั่งขาย ${order.order_no ?? ""}`.trim(),
        },
        p_lines: ((lines ?? []) as Record<string, unknown>[]).map((l) => ({
          sku: l.sku, product_name: l.product_name, qty: l.qty, unit: l.unit,
          unit_price: l.unit_price, discount_type: l.discount_type, discount_value: l.discount_value, note: l.note,
        })),
        p_actor: user?.email ?? null,
      });
      if (rpcErr) return NextResponse.json({ error: `ออกใบขายไม่สำเร็จ: ${rpcErr.message}` }, { status: 400 });
      invoiceId = (newId as string) ?? null;
    }

    const { error } = await admin.from("so_orders")
      .update({ status: "shipped", shipped_at: now, invoice_so_id: invoiceId, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: "so_order.ship", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: order.order_no, invoice_so_id: invoiceId, created_invoice: !!b.create_invoice } });
    return NextResponse.json({ ok: true, invoice_so_id: invoiceId, error: null });
  }

  // ── ยกเลิก / เปิดใหม่ ───────────────────────────────────
  if (action === "cancel") {
    const { error } = await admin.from("so_orders")
      .update({ status: "cancelled", cancelled_at: now, cancel_reason: b.reason ?? null, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: "so_order.cancel", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: order.order_no, reason: b.reason ?? null } });
    return NextResponse.json({ ok: true, error: null });
  }
  if (action === "reopen") {
    const { error } = await admin.from("so_orders")
      .update({ status: "confirmed", cancelled_at: null, cancel_reason: null, shipped_at: null, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: "so_order.reopen", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: order.order_no } });
    return NextResponse.json({ ok: true, error: null });
  }

  return NextResponse.json({ error: "ไม่รู้จัก action" }, { status: 400 });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "so.cancel"); if (denied) return denied;
  const { id } = await params;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("so_orders").select("order_no, mo_opened_at, invoice_so_id").eq("id", id).maybeSingle();
  if (!cur) return NextResponse.json({ error: "ไม่พบใบสั่งขาย" }, { status: 404 });
  const o = cur as { order_no: string | null; mo_opened_at: string | null; invoice_so_id: string | null };
  if (o.mo_opened_at || o.invoice_so_id) {
    return NextResponse.json({ error: "ใบนี้เปิดใบสั่งผลิต/ออกใบขายไปแล้ว — ใช้ 'ยกเลิก' แทนการลบ" }, { status: 400 });
  }
  const { error } = await admin.from("so_orders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await writeAudit(admin, { action: "delete", entityType: "so_order", entityId: id, actorId: user?.id ?? null, actorName: user?.email ?? null, metadata: { order_no: o.order_no } });
  return NextResponse.json({ ok: true, error: null });
}
