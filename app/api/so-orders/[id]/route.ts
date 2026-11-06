/**
 * ใบสั่งขาย รายใบ — /api/so-orders/[id]
 *   GET    → หัวใบ + บรรทัด (+ progress ต่อรายการ: สั่ง/เปิดผลิต/ส่ง · orphan_mos = ใบผลิตที่ผูกใบนี้แต่ไม่ตรงรายการไหน)
 *            + stage ต่อรายการ 0-4 (lib/so-order-stage — ตัวเดียวกับมุมมองตามชุด) + image_url (รูปปก SKU / รุ่น)
 *            ?print=1 → + print { mos: ช่าง/กำหนดเสร็จ/พิมพ์ใบงาน/ใบขายที่ส่ง ต่อใบผลิต, group_names } (ใบเช็กสถานะ)
 *   PATCH  { action }
 *      save     → แก้ไขใบ (หัว + บรรทัด · คิดเงินใหม่ด้วยเครื่องคิดเงินกลาง)
 *      open_mo  { group_id?, line_id? } → เปิด/ผูกใบสั่งผลิตให้ทุกบรรทัด (หรือเฉพาะชุด / เฉพาะรายการ) · กดซ้ำได้ ไม่สร้างซ้ำ · ใบที่เปิดเข้าชุดของรายการให้เอง
 *      link_mo  { line_id, mo_id } → ผูกใบสั่งผลิตที่มีอยู่เข้ารายการนี้ (รหัสสินค้าต้องตรง · ใบที่ผูกใบสั่งขายอื่นแล้วผูกไม่ได้)
 *      save     → หลังบันทึก ผูกใบสั่งผลิตที่รายการอ้างไว้ให้ด้วย (ไม่เปิดใบใหม่ — open-mo linkOnly)
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
import { printSummaryOf } from "@/lib/print-log-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const [{ data: order }, { data: lines }, { data: mos }] = await Promise.all([
    admin.from("so_orders").select("*").eq("id", id).maybeSingle(),
    admin.from("so_order_lines").select("*").eq("order_id", id).order("line_no"),
    admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, status, skipped_stages, due_date, internal_due_date").eq("so_order_id", id).eq("is_active", true).order("mo_no"),
  ]);
  if (!order) return NextResponse.json({ data: null, error: "ไม่พบใบสั่งขาย" }, { status: 404 });
  const wantPrint = new URL(request.url).searchParams.get("print") === "1";

  // ยอดต่อรายการ: สั่ง / เปิดผลิตแล้ว (รวมใบที่แตก/เปิดเพิ่ม) / ส่งแล้ว (ใบขายที่ผูกใบผลิต) — กติกา lib/mo-so-rule.ts
  const moRows = (mos ?? []) as { id: string; mo_no: string; product_sku: string | null; qty: number; status: string | null; due_date: string | null; internal_due_date: string | null }[];
  const shipped = new Map<string, number>();
  const linkRows: { mo_id: string; qty: number; sale_line_id: string | null }[] = [];
  if (moRows.length) {
    const { data: links } = await admin.from("mo_sales_links").select("mo_id, qty, sale_line_id").in("mo_id", moRows.map((m) => m.id)).not("is_active", "is", false);
    for (const l of (links ?? []) as { mo_id: string; qty: number; sale_line_id: string | null }[]) {
      shipped.set(l.mo_id, (shipped.get(l.mo_id) ?? 0) + (Number(l.qty) || 0));
      linkRows.push(l);
    }
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
  const print = wantPrint ? await printDetail(admin, moRows, linkRows, disp, ls) : undefined;
  return NextResponse.json({ data: { ...order, lines: outLines, orphan_mos: prog.orphans, ...(print ? { print } : {}) }, error: null });
}

/**
 * ?print=1 (ใบเช็กสถานะ /print/so-order-status) — ต่อใบผลิต: ช่าง · จ่ายงานแล้ว · กำหนดเสร็จ · พิมพ์ใบงานแล้วกี่ครั้ง · ใบขายที่ส่ง
 *   + ชื่อชุดต่อรายการ · อ่านอย่างเดียว · ไม่ส่ง print=1 = ผลเหมือนเดิมทุกอย่าง
 */
async function printDetail(
  admin: ReturnType<typeof supabaseAdmin>,
  moRows: { id: string; mo_no: string; due_date: string | null; internal_due_date: string | null }[],
  links: { mo_id: string; qty: number; sale_line_id: string | null }[],
  disp: Awaited<ReturnType<typeof loadMoDispatch>>,
  lines: Record<string, unknown>[],
) {
  const saleIds = [...new Set(links.map((l) => l.sale_line_id).filter(Boolean) as string[])];
  const billOf = new Map<string, { no: string; date: string }>();
  for (let i = 0; i < saleIds.length; i += 200) {
    const { data } = await admin.from("erp_playground_so_lines").select("id, erp_playground_sales_orders!inner(so_number, order_date)").in("id", saleIds.slice(i, i + 200));
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const h = (Array.isArray(r.erp_playground_sales_orders) ? r.erp_playground_sales_orders[0] : r.erp_playground_sales_orders) as { so_number?: string; order_date?: string } | null;
      if (h) billOf.set(String(r.id), { no: String(h.so_number ?? "—"), date: String(h.order_date ?? "").slice(0, 10) });
    }
  }
  const printed = await printSummaryOf(admin, "mo", moRows.map((m) => m.id));
  const groupIds = [...new Set(lines.map((l) => l.mo_group_id as string | null).filter(Boolean) as string[])];
  const groupName: Record<string, string> = {};
  if (groupIds.length) {
    const { data } = await admin.from("mo_groups").select("id, name").in("id", groupIds);
    for (const g of (data ?? []) as { id: string; name: string }[]) groupName[g.id] = g.name;
  }
  const mos: Record<string, { due: string | null; assignees: string[]; dispatched: boolean; printed: number; bills: { no: string; date: string; qty: number }[] }> = {};
  for (const m of moRows) {
    const d = disp.get(m.mo_no);
    const bills = new Map<string, { no: string; date: string; qty: number }>();
    for (const l of links.filter((x) => x.mo_id === m.id)) {
      const b = l.sale_line_id ? billOf.get(l.sale_line_id) : undefined;
      const key = b?.no ?? "—";
      const cur = bills.get(key) ?? { no: key, date: b?.date ?? "", qty: 0 };
      cur.qty += Number(l.qty) || 0;
      bills.set(key, cur);
    }
    mos[m.mo_no] = {
      due: m.internal_due_date || m.due_date || null,
      assignees: d?.assignees ?? [], dispatched: !!d?.dispatched,
      printed: printed.get(m.id)?.n ?? 0,
      bills: [...bills.values()].sort((a, b) => a.date.localeCompare(b.date) || a.no.localeCompare(b.no)),
    };
  }
  return { mos, group_names: groupName };
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
  /** open_mo / link_mo: เฉพาะรายการนี้ (ปุ่มต่อรายการในหน้าสถานะ) */
  line_id?: string;
  /** link_mo: ใบสั่งผลิตที่จะผูก */
  mo_id?: string;
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
    // รายการที่อ้างใบสั่งผลิตไว้ (ดึงจากใบสั่งผลิต / กดผูกในตาราง) → ผูกฝั่งใบสั่งผลิตด้วย · ไม่เปิดใบใหม่
    const linked = await openMoForOrder(admin, id, user?.id ?? null, { linkOnly: true });
    await writeAudit(admin, { action: "update", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: order.order_no, grand_total: totals.grand_total, ...(linked.linked ? { linked_mo: linked.linked } : {}), ...(quotes.converted.length || quotes.released.length ? { quotes } : {}) } });
    return NextResponse.json({ ok: true, linked: linked.linked, error: null });
  }

  // ── เปิด/ผูกใบสั่งผลิต ───────────────────────────────────
  if (action === "open_mo") {
    const opened = await openMoForOrder(admin, id, user?.id ?? null, { onlyGroupId: b.group_id || undefined, onlyLineId: b.line_id || undefined });
    return NextResponse.json({ ok: true, opened, error: null });
  }

  // ── ผูกใบสั่งผลิตที่มีอยู่เข้ารายการ (ปุ่ม "ผูกใบสั่งผลิต" ต่อรายการ) ──
  if (action === "link_mo") {
    if (order.status === "cancelled") return NextResponse.json({ error: "ใบที่ยกเลิกแล้ว ผูกใบสั่งผลิตไม่ได้" }, { status: 400 });
    const lineId = String(b.line_id ?? ""), moId = String(b.mo_id ?? "");
    if (!lineId || !moId) return NextResponse.json({ error: "ระบุรายการและใบสั่งผลิต" }, { status: 400 });
    const [{ data: ln }, { data: mo }] = await Promise.all([
      admin.from("so_order_lines").select("id, order_id, sku, mo_id, mo_no").eq("id", lineId).maybeSingle(),
      admin.from("manufacturing_orders").select("id, mo_no, product_sku, so_order_id, so_order_no, is_active").eq("id", moId).maybeSingle(),
    ]);
    const line = ln as { id: string; order_id: string; sku: string | null; mo_id: string | null; mo_no: string | null } | null;
    const m = mo as { id: string; mo_no: string; product_sku: string | null; so_order_id: string | null; so_order_no: string | null; is_active: boolean } | null;
    if (!line || line.order_id !== id) return NextResponse.json({ error: "ไม่พบรายการนี้ในใบ — ปิดแล้วเปิดใบใหม่อีกครั้ง" }, { status: 400 });
    if (line.mo_id && line.mo_id !== moId) return NextResponse.json({ error: `รายการนี้ผูก ${line.mo_no ?? "ใบสั่งผลิตอื่น"} อยู่แล้ว` }, { status: 400 });
    if (!m || m.is_active === false) return NextResponse.json({ error: "ไม่พบใบสั่งผลิต (อาจถูกยกเลิกแล้ว)" }, { status: 400 });
    if (m.so_order_id && m.so_order_id !== id) return NextResponse.json({ error: `ใบสั่งผลิต ${m.mo_no} ผูกใบสั่งขาย ${m.so_order_no ?? "อื่น"} อยู่แล้ว` }, { status: 400 });
    const norm = (s: string | null) => String(s ?? "").trim().toUpperCase();
    if (line.sku && m.product_sku && norm(line.sku) !== norm(m.product_sku)) {
      return NextResponse.json({ error: `รหัสสินค้าไม่ตรง: รายการ ${line.sku} · ใบสั่งผลิต ${m.product_sku}` }, { status: 400 });
    }
    await admin.from("so_order_lines").update({ mo_id: m.id, mo_no: m.mo_no }).eq("id", lineId);
    await openMoForOrder(admin, id, user?.id ?? null, { onlyLineId: lineId, linkOnly: true });   // ผูกฝั่งใบสั่งผลิต + สถานะ/กำหนดส่ง กติกาเดียวกับเปิดใบ
    await writeAudit(admin, { action: "so_order.link_mo", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: order.order_no, mo_no: m.mo_no, line_id: lineId, from: "line_button" } });
    await writeAudit(admin, { action: "mo.so_link", entityType: "mo", entityId: m.id, ...actor, metadata: { mo_no: m.mo_no, so_order_no: order.order_no, line_id: lineId } });
    return NextResponse.json({ ok: true, mo_no: m.mo_no, error: null });
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
