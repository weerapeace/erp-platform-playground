/**
 * ส่งของจากใบสั่งขาย → ใบขาย (บิล) → ใบสั่งผลิตรู้เอง — ฝั่งเซิร์ฟเวอร์ (เจ้าของสั่ง 2026-11-21)
 *
 *   loadLineShipState  — ต่อรายการใบสั่งขาย: สั่ง / ส่งแล้ว / ค้างส่ง + ใบสั่งผลิตของรายการ (กติกา lib/mo-so-rule soLineProgress
 *                        ตัวเดียวกับลิ้นชักใบสั่งขาย · "ส่งแล้ว" = ใบขายที่ผูกใบสั่งผลิต mo_sales_links)
 *   createInvoice      — ออกใบขาย (RPC erp_playground_so_create) จากรายการที่เลือก + ยืนยัน/จัดส่ง (ตัดสต็อก) ผ่านกติกาสถานะกลางของใบขาย
 *   linkBillToSoLines  — ผูกบรรทัดใบขายเข้าใบสั่งผลิตของรายการ (mo_sales_links + audit mo.sales_link + ปิดงานอัตโนมัติ lib/mo-auto-close)
 *                        แล้วอัปเดตใบสั่งขาย: ส่งครบทุกรายการ = "ส่งแล้ว"
 *
 * ใช้โดย POST /api/so-orders/bill (ลิ้นชักใบสั่งขาย "เปิดใบขาย") · POST /api/so-orders/link-bill (ป๊อปสร้างใบขาย "ดึงจากใบสั่งขาย")
 *        · PATCH /api/so-orders/[id] action=ship (ส่งทั้งใบ)
 * ข้อจำกัด: รายการที่ไม่มีใบสั่งผลิต นับ "ส่งแล้ว" ไม่ได้ (ระบบนับส่งผ่านใบสั่งผลิต) → ค้างส่ง = จำนวนสั่งเสมอ
 */
import type { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { soLineProgress, type SoLineMo } from "@/lib/mo-so-rule";
import { syncAutoClose } from "../mo/auto-close";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;
const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();

export type ShipPick = { so_line_id: string; qty: number };
export type LineShipState = {
  line: Row; order_id: string; ordered: number; shipped: number; remaining: number; mos: SoLineMo[];
};

/** สถานะส่งของต่อรายการ ของใบสั่งขายหลายใบ (key = so_order_lines.id) */
export async function loadLineShipState(admin: Admin, orderIds: string[]): Promise<Map<string, LineShipState>> {
  const out = new Map<string, LineShipState>();
  const ids = [...new Set(orderIds.filter(Boolean))];
  if (!ids.length) return out;
  const [{ data: lines }, { data: mos }] = await Promise.all([
    admin.from("so_order_lines").select("*").in("order_id", ids).order("line_no"),
    admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, status, so_order_id").in("so_order_id", ids).eq("is_active", true).order("mo_no"),
  ]);
  const moRows = (mos ?? []) as { id: string; mo_no: string; product_sku: string | null; qty: number; status: string | null; so_order_id: string }[];
  const shipped = new Map<string, number>();
  for (let i = 0; i < moRows.length; i += 200) {
    const { data: links } = await admin.from("mo_sales_links").select("mo_id, qty").in("mo_id", moRows.slice(i, i + 200).map((m) => m.id)).not("is_active", "is", false);
    for (const l of (links ?? []) as { mo_id: string; qty: number }[]) shipped.set(l.mo_id, (shipped.get(l.mo_id) ?? 0) + n(l.qty));
  }
  const ls = (lines ?? []) as Row[];
  for (const oid of ids) {
    const mine = ls.filter((l) => l.order_id === oid);
    const prog = soLineProgress(
      mine.map((l) => ({ id: String(l.id), sku: (l.sku as string) ?? null, qty: n(l.qty), mo_id: (l.mo_id as string) ?? null })),
      moRows.filter((m) => m.so_order_id === oid).map((m) => ({ ...m, shipped: shipped.get(m.id) ?? 0 })),
    );
    for (const l of mine) {
      const p = prog.byLine[String(l.id)];
      const ordered = n(l.qty), sh = p?.shipped ?? 0;
      out.set(String(l.id), { line: l, order_id: oid, ordered, shipped: sh, remaining: r2(Math.max(0, ordered - sh)), mos: p?.mos ?? [] });
    }
  }
  return out;
}

/**
 * ออกใบขายจากรายการที่เลือก (ทุกรายการต้องเป็นลูกค้าเดียวกัน) แล้วยืนยัน + จัดส่ง (ตัดของ) ผ่านกติกาสถานะกลางของใบขาย
 * คืน id ใบขาย + คำเตือน (ออกใบได้แต่ยืนยัน/จัดส่งไม่ผ่าน = ใบค้างสถานะเดิม ไปกดต่อที่หน้าใบขาย)
 */
export async function createInvoice(
  request: NextRequest, admin: Admin, order: Row,
  lines: { line: Row; qty: number }[], actorEmail: string | null,
  opts: { orderNos?: string[]; orderDate?: string | null; ship?: boolean } = {},
): Promise<{ id: string | null; error: string | null; warning: string | null }> {
  // ใบขายต้องรู้ "บริษัท" (ชุดเลขใบกำกับ ISG/LOUIS) · "คลังที่ขายออก" (WH-FG ค่าเริ่มต้นเดียวกับฟอร์มใบขาย) · รหัสสินค้าต่อบรรทัด
  const skuCodes = [...new Set(lines.map((l) => String(l.line.sku ?? "").trim()).filter(Boolean))];
  const [{ data: fgWh }, { data: skuRows }] = await Promise.all([
    admin.from("erp_playground_warehouses").select("id").eq("code", "WH-FG").maybeSingle(),
    skuCodes.length ? admin.from("skus_v2").select("id, code").in("code", skuCodes).eq("is_active", true) : Promise.resolve({ data: [] as { id: string; code: string }[] }),
  ]);
  const skuIdByCode = new Map(((skuRows ?? []) as { id: string; code: string }[]).map((s) => [s.code, s.id]));
  const nos = opts.orderNos?.length ? opts.orderNos : [String(order.order_no ?? "")];
  const sb = supabaseFromRequest(request);
  const { data: newId, error } = await sb.rpc("erp_playground_so_create", {
    p_header: {
      company_id: order.company_id ?? null, customer_po_no: order.customer_po_no ?? null,
      from_warehouse_id: (fgWh as { id: string } | null)?.id ?? null,
      customer_id: order.customer_id, customer_name: order.customer_name, customer_code: order.customer_code,
      sale_person_name: order.sale_person_name, currency: order.currency, exchange_rate: order.exchange_rate ?? null,
      order_date: opts.orderDate || order.order_date, expected_ship_date: order.due_date,
      header_discount_type: order.header_discount_type, header_discount_value: order.header_discount_value,
      shipping_fee: order.shipping_fee, vat_rate: order.vat_rate, vat_included: order.vat_included,
      wht_rate: order.wht_rate, note: `จากใบสั่งขาย ${nos.filter(Boolean).join(", ")}`.trim(),
    },
    p_lines: lines.map(({ line: l, qty }) => ({
      product_id: (typeof l.sku === "string" && skuIdByCode.get(l.sku.trim())) || null,
      sku: l.sku, product_name: l.product_name, qty, unit: l.unit,
      unit_price: l.unit_price, discount_type: l.discount_type, discount_value: l.discount_value, note: l.note,
    })),
    p_actor: actorEmail,
  });
  if (error) return { id: null, error: `ออกใบขายไม่สำเร็จ: ${error.message}`, warning: null };
  const id = (newId as string) ?? null;
  let warning: string | null = null;
  if (id && opts.ship !== false) {
    // ส่งของแล้ว = ใบขาย "จัดส่งแล้ว" (จุดเดียวที่ตัดสต็อกตอนขาย · กติกา 2026-11-02) — ร่าง → ยืนยัน → จัดส่ง
    const { data: inv } = await admin.from("erp_playground_sales_orders").select("status").eq("id", id).maybeSingle();
    const st = (inv as { status?: string } | null)?.status;
    const steps = st === "draft" ? ["confirm", "ship"] : st === "confirmed" || st === "ready" ? ["ship"] : [];
    for (const step of steps) {
      const { error: tErr } = await sb.rpc("erp_playground_so_transition", { p_id: id, p_action: step, p_actor: actorEmail, p_reason: null });
      if (tErr) { warning = `ออกใบขายแล้ว แต่${step === "confirm" ? "ยืนยัน" : "จัดส่ง"}ใบขายไม่สำเร็จ (${tErr.message}) — ไปกดต่อที่หน้าใบขาย`; break; }
    }
  }
  return { id, error: null, warning };
}

export type MoShipResult = { mo_no: string; mo_qty: number; qty: number; shipped_after: number; left: number; partial: boolean };

/**
 * ผูกบรรทัดใบขาย (saleId) เข้าใบสั่งผลิตของรายการใบสั่งขายที่เลือก
 *   จับคู่บรรทัดใบขายด้วยรหัสสินค้า (ตามลำดับ) · แบ่งจำนวนลงใบสั่งผลิตของรายการ (ใบที่ยังขาดก่อน · ส่งเกิน = ลงใบสุดท้าย)
 *   แล้วปิดงานอัตโนมัติ (ขายครบ + ช่างส่งคืนครบ) + ใบสั่งขายที่ส่งครบทุกรายการ = "ส่งแล้ว"
 */
export async function linkBillToSoLines(
  admin: Admin, saleId: string, picks: ShipPick[],
  me: { id: string | null; name: string | null },
): Promise<{ mos: MoShipResult[]; skipped: string[]; orders_shipped: string[]; error: string | null }> {
  const { data: bill } = await admin.from("erp_playground_sales_orders").select("id, so_number, order_date, status").eq("id", saleId).maybeSingle();
  if (!bill) return { mos: [], skipped: [], orders_shipped: [], error: "ไม่พบใบขาย" };
  const b = bill as Row;
  if (b.status === "cancelled") return { mos: [], skipped: [], orders_shipped: [], error: "ใบขายถูกยกเลิกแล้ว" };
  const { data: billLines } = await admin.from("erp_playground_so_lines").select("id, sku, qty, sort_order").eq("so_id", saleId).order("sort_order");
  const bl = ((billLines ?? []) as Row[]).map((l) => ({ id: String(l.id), sku: norm(l.sku), left: n(l.qty) }));
  // ที่ผูกไว้แล้วของบรรทัดใบขายนี้ (กันผูกซ้ำเมื่อกดซ้ำ)
  if (bl.length) {
    const { data: prev } = await admin.from("mo_sales_links").select("sale_line_id, qty").in("sale_line_id", bl.map((x) => x.id)).eq("is_active", true);
    for (const p of (prev ?? []) as Row[]) { const x = bl.find((y) => y.id === p.sale_line_id); if (x) x.left -= n(p.qty); }
  }
  const { data: pl } = await admin.from("so_order_lines").select("order_id").in("id", picks.map((p) => p.so_line_id));
  const orderIds = [...new Set(((pl ?? []) as Row[]).map((r) => String(r.order_id)))];
  const state = await loadLineShipState(admin, orderIds);

  const rows: Row[] = [];
  const skipped: string[] = [];
  const perMo = new Map<string, { mo: SoLineMo; qty: number }>();
  for (const p of picks) {
    const st = state.get(p.so_line_id);
    let want = r2(n(p.qty));
    if (!st || !(want > 0)) continue;
    const label = String(st.line.sku ?? st.line.product_name ?? "");
    if (!st.mos.length) { skipped.push(`${label} (ยังไม่มีใบสั่งผลิต)`); continue; }
    const sku = norm(st.line.sku);
    while (want > 0.0001) {
      const target = bl.find((x) => x.sku === sku && x.left > 0.0001);
      if (!target) { skipped.push(`${label} (ไม่พบบรรทัดในใบขาย)`); break; }
      let take = Math.min(want, target.left);
      want = r2(want - take); target.left = r2(target.left - take);
      // แบ่งลงใบสั่งผลิตของรายการ: ใบที่ยังส่งไม่ครบก่อน
      for (let i = 0; i < st.mos.length && take > 0.0001; i++) {
        const m = st.mos[i];
        const used = (perMo.get(m.id)?.qty ?? 0);
        const room = i === st.mos.length - 1 ? take : Math.max(0, m.qty - m.shipped - used);
        const q = r2(Math.min(room, take));
        if (!(q > 0)) continue;
        take = r2(take - q);
        perMo.set(m.id, { mo: m, qty: r2(used + q) });
        rows.push({ mo_id: m.id, mo_no: m.mo_no, sale_id: saleId, sale_line_id: target.id, so_number: b.so_number ?? null, sku: String(st.line.sku ?? "").trim(), qty: q, sale_date: String(b.order_date ?? "").slice(0, 10) || null });
      }
    }
  }
  if (rows.length) {
    const { error } = await admin.from("mo_sales_links").insert(rows.map((r) => ({ ...r, linked_by: me.id, linked_by_name: me.name })));
    if (error) return { mos: [], skipped, orders_shipped: [], error: "ผูกใบขายเข้าใบสั่งผลิตไม่สำเร็จ" };
  }
  const mos: MoShipResult[] = [];
  for (const { mo, qty } of perMo.values()) {
    const after = r2(mo.shipped + qty);
    mos.push({ mo_no: mo.mo_no, mo_qty: mo.qty, qty, shipped_after: after, left: r2(Math.max(0, mo.qty - after)), partial: after < mo.qty - 0.0001 });
    await writeAudit(admin, { action: "mo.sales_link", entityType: "mo", entityId: mo.id, actorId: me.id, actorName: me.name,
      metadata: { mo_no: mo.mo_no, from: "so_order_bill", parts: rows.filter((r) => r.mo_id === mo.id).map((r) => ({ so_number: r.so_number, qty: r.qty, sale_date: r.sale_date })) } });
  }
  if (perMo.size) await syncAutoClose(admin, [...perMo.values()].map((x) => x.mo.mo_no), { id: me.id ?? undefined, name: me.name ?? undefined }, "sales_link");

  // ใบสั่งขายที่ส่งครบทุกรายการแล้ว → "ส่งแล้ว" + จำใบขายใบแรกไว้ที่หัวใบ
  const ordersShipped: string[] = [];
  const after = await loadLineShipState(admin, orderIds);
  const now = new Date().toISOString();
  for (const oid of orderIds) {
    const ls = [...after.values()].filter((s) => s.order_id === oid);
    const { data: o } = await admin.from("so_orders").select("order_no, status, invoice_so_id").eq("id", oid).maybeSingle();
    const ord = o as Row | null;
    if (!ord || ord.status === "cancelled") continue;
    const patch: Row = { updated_at: now };
    if (!ord.invoice_so_id) patch.invoice_so_id = saleId;
    const allDone = ls.length > 0 && ls.every((s) => s.mos.length === 0 ? false : s.remaining <= 0.0001);
    if (allDone && ord.status !== "shipped") { patch.status = "shipped"; patch.shipped_at = now; ordersShipped.push(String(ord.order_no ?? "")); }
    await admin.from("so_orders").update(patch).eq("id", oid);
    await writeAudit(admin, { action: "so_order.bill", entityType: "so_order", entityId: oid, actorId: me.id, actorName: me.name,
      metadata: { order_no: ord.order_no, bill: b.so_number ?? null, sale_id: saleId, lines: picks.filter((p) => after.get(p.so_line_id)?.order_id === oid).length, ...(allDone ? { shipped_all: true } : {}) } });
  }
  return { mos, skipped: [...new Set(skipped)], orders_shipped: ordersShipped, error: null };
}

/** ชื่อผู้ใช้สำหรับประวัติ (เหมือน /api/mo/sales-match) */
export async function actorOf(request: NextRequest, admin: Admin): Promise<{ id: string | null; name: string | null; email: string | null }> {
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  if (!user) return { id: null, name: null, email: null };
  const { data: p } = await admin.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle();
  const prof = p as { display_name: string | null; email: string | null } | null;
  return { id: user.id, name: prof?.display_name?.trim() || prof?.email || user.email || "ผู้ใช้", email: user.email ?? null };
}
