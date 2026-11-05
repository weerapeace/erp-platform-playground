/**
 * ใบสั่งขาย รายใบ — /api/so-orders/[id]
 *   GET    → หัวใบ + บรรทัด (+ progress ต่อรายการ: สั่ง/เปิดผลิต/ส่ง · orphan_mos = ใบผลิตที่ผูกใบนี้แต่ไม่ตรงรายการไหน)
 *            + stage ต่อรายการ 0-4 (lib/so-order-stage — ตัวเดียวกับมุมมองตามชุด) + image_url (รูปปก SKU / รุ่น)
 *   PATCH  { action }
 *      save     → แก้ไขใบ (หัว + บรรทัด · คิดเงินใหม่ด้วยเครื่องคิดเงินกลาง)
 *      open_mo  { group_id? } → เปิด/ผูกใบสั่งผลิตให้ทุกบรรทัด (หรือเฉพาะชุด) · กดซ้ำได้ ไม่สร้างซ้ำ · ใบที่เปิดเข้าชุดของรายการให้เอง
 *      ship     { create_invoice } → "ส่งแล้ว" · create_invoice=true = ออกใบขาย/บิลให้เลย
 *      cancel   { reason }         → ยกเลิกใบ
 *      reopen   → กลับเป็น "ยืนยันแล้ว"
 *   DELETE → ลบใบ (เฉพาะใบที่ยังไม่เปิดใบสั่งผลิต/ยังไม่ออกใบขาย)
 *   ใบเสนอราคาที่บรรทัดอ้าง (quote_id): บันทึก = ตรวจว่าดึงได้ + "แปลงแล้ว" · ยกเลิก/ลบ/ลบบรรทัดออกหมด = กลับ "ตอบรับแล้ว" (lib/quote-convert)
 * สิทธิ์: ดู so.view · แก้ so.create · ยืนยันส่ง so.ship · ยกเลิก so.cancel
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { checkQuotePull, orderQuoteIds, quotePullProblems, syncQuoteConversions } from "@/lib/quote-convert";
import { computeTotals, lineQuoteIds, lineRow, resolveLineGroups, type SoOrderHeaderInput, type SoOrderLineInput } from "../shared";
import { openMoForOrder } from "../open-mo";
import { soLineProgress } from "@/lib/mo-so-rule";
import { loadMoDispatch } from "@/lib/mo-dispatch";
import { soLineStageMulti } from "@/lib/so-order-stage";
import { SKU_COVER_SELECT, coverUrl, resolveSkuCover } from "@/lib/sku-cover";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const [{ data: order }, { data: lines }, { data: mos }] = await Promise.all([
    admin.from("so_orders").select("*").eq("id", id).maybeSingle(),
    admin.from("so_order_lines").select("*").eq("order_id", id).order("line_no"),
    admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, status, skipped_stages").eq("so_order_id", id).eq("is_active", true).order("mo_no"),
  ]);
  if (!order) return NextResponse.json({ data: null, error: "ไม่พบใบสั่งขาย" }, { status: 404 });

  // ยอดต่อรายการ: สั่ง / เปิดผลิตแล้ว (รวมใบที่แตก/เปิดเพิ่ม) / ส่งแล้ว (ใบขายที่ผูกใบผลิต) — กติกา lib/mo-so-rule.ts
  const moRows = (mos ?? []) as { id: string; mo_no: string; product_sku: string | null; qty: number; status: string | null }[];
  const shipped = new Map<string, number>();
  if (moRows.length) {
    const { data: links } = await admin.from("mo_sales_links").select("mo_id, qty").in("mo_id", moRows.map((m) => m.id)).not("is_active", "is", false);
    for (const l of (links ?? []) as { mo_id: string; qty: number }[]) shipped.set(l.mo_id, (shipped.get(l.mo_id) ?? 0) + (Number(l.qty) || 0));
  }
  const ls = (lines ?? []) as Record<string, unknown>[];
  const prog = soLineProgress(
    ls.map((l) => ({ id: String(l.id), sku: (l.sku as string) ?? null, qty: Number(l.qty) || 0, mo_id: (l.mo_id as string) ?? null })),
    moRows.map((m) => ({ ...m, shipped: shipped.get(m.id) ?? 0 })),
  );
  // ขั้นงานต่อรายการ (จ่ายงาน/ส่งงานจากบอร์ด — lib/mo-dispatch) + รูปปกสินค้า (ของตัวเอง ไม่มีใช้ของรุ่น)
  const disp = await loadMoDispatch(admin, moRows as unknown as Record<string, unknown>[]);
  const codes = [...new Set(ls.map((l) => String(l.sku ?? "").trim()).filter(Boolean))];
  const imgOf = new Map<string, string>();
  for (let i = 0; i < codes.length; i += 200) {
    const { data: skus } = await admin.from("skus_v2").select(`code, is_active, ${SKU_COVER_SELECT}`).in("code", codes.slice(i, i + 200));
    for (const s of ((skus ?? []) as Record<string, unknown>[]).sort((a, b) => Number(!!a.is_active) - Number(!!b.is_active))) {
      const url = coverUrl(resolveSkuCover(s).key);
      if (url) imgOf.set(String(s.code), `${url}&w=160`);   // ตัวที่ใช้งานอยู่ทับตัวที่ปิด (เรียงไว้ท้าย)
    }
  }
  const orderShipped = (order as { status?: string }).status === "shipped";
  const outLines = ls.map((l) => {
    const p = prog.byLine[String(l.id)] ?? null;
    const stage = soLineStageMulti({
      orderShipped, ordered: Number(l.qty) || 0, shipped: p?.shipped ?? 0,
      mos: (p?.mos ?? []).map((m) => ({ status: m.status, dispatched: !!disp.get(m.mo_no)?.dispatched, submitted: !!disp.get(m.mo_no)?.submitted })),
    });
    return { ...l, progress: p, stage, image_url: imgOf.get(String(l.sku ?? "").trim()) ?? null };
  });
  return NextResponse.json({ data: { ...order, lines: outLines, orphan_mos: prog.orphans }, error: null });
}

type PatchBody = {
  action?: string;
  header?: SoOrderHeaderInput;
  lines?: SoOrderLineInput[];
  create_invoice?: boolean;
  reason?: string;
  new_groups?: Record<string, string>;
  /** open_mo: เปิดเฉพาะรายการของชุดนี้ (ปุ่ม "เปิดใบสั่งผลิตทั้งชุด") */
  group_id?: string;
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
    const quoteIds = lineQuoteIds(lines);
    const quoteErr = await checkQuotePull(admin, quoteIds, { orderId: id, customerId: header.customer_id ?? null });
    if (quoteErr) return NextResponse.json({ error: quoteErr }, { status: 400 });
    const oldQuoteIds = await orderQuoteIds(admin, id);   // ใบที่ถูกเอาออกจากใบนี้ → กลับ "ตอบรับแล้ว"
    const totals = computeTotals(header, lines);
    let groups: Awaited<ReturnType<typeof resolveLineGroups>>;
    try { groups = await resolveLineGroups(admin, lines, b.new_groups, { id: user?.id ?? null, email: user?.email ?? null }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "สร้างชุดไม่สำเร็จ" }, { status: 400 }); }

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
    const { error: lineErr } = await admin.from("so_order_lines").insert(lines.map((l, i) => lineRow(id, l, i, groups.groupOf(l))));
    if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 400 });
    const quotes = await syncQuoteConversions(admin, [...oldQuoteIds, ...quoteIds], actor);
    await writeAudit(admin, { action: "update", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: order.order_no, grand_total: totals.grand_total, ...(quotes.converted.length || quotes.released.length ? { quotes } : {}) } });
    return NextResponse.json({ ok: true, error: null });
  }

  // ── เปิด/ผูกใบสั่งผลิต ───────────────────────────────────
  if (action === "open_mo") {
    const opened = await openMoForOrder(admin, id, user?.id ?? null, b.group_id ? { onlyGroupId: b.group_id } : undefined);
    return NextResponse.json({ ok: true, opened, error: null });
  }

  // ── ส่งแล้ว (ออกใบขายให้เลยได้) ─────────────────────────
  if (action === "ship") {
    if (order.status === "cancelled") return NextResponse.json({ error: "ใบที่ยกเลิกแล้ว ส่งไม่ได้" }, { status: 400 });
    let invoiceId = (order.invoice_so_id as string | null) ?? null;

    if (b.create_invoice && !invoiceId) {
      const { data: lines } = await admin.from("so_order_lines").select("*").eq("order_id", id).order("line_no");
      const lineRows = (lines ?? []) as Record<string, unknown>[];
      // ใบขายต้องรู้ "บริษัท" (เลือกชุดเลขใบกำกับ ISG/LOUIS) · "คลังที่ขายออก" (ยืนยัน = จอง, ส่งแล้ว = ตัดของ)
      // และ "รหัสสินค้า" ของแต่ละบรรทัด — เดิมไม่ส่ง → ใบขายตกไปบริษัทหลัก + ไม่จอง/ไม่ตัดสต็อก
      // คลัง = โซนสินค้าสำเร็จ WH-FG (ค่าเริ่มต้นเดียวกับฟอร์มสร้างใบขาย /sales-orders)
      const skuCodes = [...new Set(lineRows.map((l) => (typeof l.sku === "string" ? l.sku.trim() : "")).filter(Boolean))];
      const [{ data: fgWh }, { data: skuRows }] = await Promise.all([
        admin.from("erp_playground_warehouses").select("id").eq("code", "WH-FG").maybeSingle(),
        skuCodes.length ? admin.from("skus_v2").select("id, code").in("code", skuCodes).eq("is_active", true) : Promise.resolve({ data: [] as { id: string; code: string }[] }),
      ]);
      const skuIdByCode = new Map(((skuRows ?? []) as { id: string; code: string }[]).map((s) => [s.code, s.id]));
      const { data: newId, error: rpcErr } = await supabaseFromRequest(request).rpc("erp_playground_so_create", {
        p_header: {
          company_id: order.company_id ?? null, customer_po_no: order.customer_po_no ?? null,
          from_warehouse_id: (fgWh as { id: string } | null)?.id ?? null,
          customer_id: order.customer_id, customer_name: order.customer_name, customer_code: order.customer_code,
          sale_person_name: order.sale_person_name, currency: order.currency, exchange_rate: order.exchange_rate ?? null,
          order_date: order.order_date, expected_ship_date: order.due_date,
          header_discount_type: order.header_discount_type, header_discount_value: order.header_discount_value,
          shipping_fee: order.shipping_fee, vat_rate: order.vat_rate, vat_included: order.vat_included,
          wht_rate: order.wht_rate, note: `จากใบสั่งขาย ${order.order_no ?? ""}`.trim(),
        },
        p_lines: lineRows.map((l) => ({
          product_id: (typeof l.sku === "string" && skuIdByCode.get(l.sku.trim())) || null,
          sku: l.sku, product_name: l.product_name, qty: l.qty, unit: l.unit,
          unit_price: l.unit_price, discount_type: l.discount_type, discount_value: l.discount_value, note: l.note,
        })),
        p_actor: user?.email ?? null,
      });
      if (rpcErr) return NextResponse.json({ error: `ออกใบขายไม่สำเร็จ: ${rpcErr.message}` }, { status: 400 });
      invoiceId = (newId as string) ?? null;
    }

    // ส่งของแล้ว → ใบขายต้องเป็น "จัดส่งแล้ว" ด้วย = ตัดของออกจากคลัง (กติกา 2026-11-02: ใบขายจัดส่ง = จุดเดียวที่ตัดสต็อกตอนขาย)
    // ใบที่เพิ่งออก (ร่าง) → ยืนยัน (ออกเลข/จองของ) → จัดส่ง (ปลดจอง + ตัดของ) ผ่านกติกาสถานะกลางของใบขาย
    // ไม่สำเร็จ (เช่น ไม่มีสิทธิ์ยืนยัน) = ใบสั่งขายยังบันทึกส่งแล้ว + ใบขายค้างสถานะเดิม แจ้งเตือนให้ไปกดต่อที่หน้าใบขาย
    let warning: string | null = null;
    if (b.create_invoice && invoiceId) {
      const sb = supabaseFromRequest(request);
      const { data: inv } = await admin.from("erp_playground_sales_orders").select("status").eq("id", invoiceId).maybeSingle();
      const steps = inv?.status === "draft" ? ["confirm", "ship"] : inv?.status === "confirmed" || inv?.status === "ready" ? ["ship"] : [];
      for (const step of steps) {
        const { error: tErr } = await sb.rpc("erp_playground_so_transition", { p_id: invoiceId, p_action: step, p_actor: user?.email ?? null, p_reason: null });
        if (tErr) { warning = `ออกใบขายแล้ว แต่${step === "confirm" ? "ยืนยัน" : "จัดส่ง"}ใบขายไม่สำเร็จ (${tErr.message}) — ไปกดต่อที่หน้าใบขาย`; break; }
      }
    }

    const { error } = await admin.from("so_orders")
      .update({ status: "shipped", shipped_at: now, invoice_so_id: invoiceId, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await writeAudit(admin, { action: "so_order.ship", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: order.order_no, invoice_so_id: invoiceId, created_invoice: !!b.create_invoice, ...(warning ? { warning } : {}) } });
    return NextResponse.json({ ok: true, invoice_so_id: invoiceId, warning, error: null });
  }

  // ── ยกเลิก / เปิดใหม่ ───────────────────────────────────
  if (action === "cancel") {
    const { error } = await admin.from("so_orders")
      .update({ status: "cancelled", cancelled_at: now, cancel_reason: b.reason ?? null, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const quotes = await syncQuoteConversions(admin, await orderQuoteIds(admin, id), actor);   // ใบเสนอราคากลับ "ตอบรับแล้ว"
    await writeAudit(admin, { action: "so_order.cancel", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: order.order_no, reason: b.reason ?? null, ...(quotes.released.length ? { quotes_released: quotes.released } : {}) } });
    return NextResponse.json({ ok: true, error: null });
  }
  if (action === "reopen") {
    // ใบเสนอราคาที่ระหว่างนี้ถูกใช้ที่อื่น/ถูกปฏิเสธ → ปลดออกจากบรรทัด (รายการยังอยู่ ไม่ผูกใบเสนอราคาแล้ว)
    const quoteIds = await orderQuoteIds(admin, id);
    const problems = await quotePullProblems(admin, quoteIds, { orderId: id });
    if (problems.size) {
      await admin.from("so_order_lines").update({ quote_id: null, quote_no: null, source: "manual" }).eq("order_id", id).in("quote_id", [...problems.keys()]);
    }
    const { error } = await admin.from("so_orders")
      .update({ status: "confirmed", cancelled_at: null, cancel_reason: null, shipped_at: null, updated_at: now }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const quotes = await syncQuoteConversions(admin, quoteIds.filter((q) => !problems.has(q)), actor);
    const warning = problems.size ? `ไม่ได้ผูกใบเสนอราคาเดิมกลับ: ${[...problems.values()].join(" · ")}` : null;
    await writeAudit(admin, { action: "so_order.reopen", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: order.order_no, ...(quotes.converted.length ? { quotes: quotes.converted } : {}), ...(warning ? { warning } : {}) } });
    return NextResponse.json({ ok: true, warning, error: null });
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
  const quoteIds = await orderQuoteIds(admin, id);
  const { error } = await admin.from("so_orders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const actor = { actorId: user?.id ?? null, actorName: user?.email ?? null };
  const quotes = await syncQuoteConversions(admin, quoteIds, actor);   // บรรทัดถูกลบตาม → ใบเสนอราคากลับ "ตอบรับแล้ว"
  await writeAudit(admin, { action: "delete", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: o.order_no, ...(quotes.released.length ? { quotes_released: quotes.released } : {}) } });
  return NextResponse.json({ ok: true, error: null });
}
