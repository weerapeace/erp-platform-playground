/**
 * ใบสั่งขาย → "อัปเดตสถานะ" จากใบขาย (บิล) — /api/so-orders/[id]/bill-match
 *   GET  → แผนต่อรายการ: สั่ง / ส่งแล้วในระบบ / หมายเหตุชีต / บิลที่จะผูก (ว่าง · ย้ายจากใบผลิตอื่น · ร่าง) + บิลว่างให้ใบที่ถูกย้ายออก (refill)
 *          กติกาจับคู่ lib/so-bill-match.ts (ชีตก่อน · ไม่มีชีต = บิลว่างหลังวันเปิดใบ ใบเก่าได้ก่อน)
 *   POST { items: [{ sale_line_id, to_mo_id, qty, from_mo_id? }] } → ผูก/ย้ายจริง (ตรวจยอดคงเหลือของบิลซ้ำที่เซิร์ฟเวอร์ก่อนเขียน)
 *          → ใบสั่งขายเห็น "ส่งลูกค้าแล้ว" ทันที (ขั้นคิดสดจาก mo_sales_links) · ใบผลิตขายครบ = ออกจากบอร์ดรอจ่าย
 *          → ปิด/เปิดใบผลิตอัตโนมัติ (lib/mo-auto-close) · คืน needs_production = ใบที่ขายครบแต่ยังไม่บันทึกผลิต (ไปบอร์ด › อัปเดตเป็นชุด ระบุโต๊ะ/ช่าง)
 * สิทธิ์: ดู so.view · บันทึก products.edit (เท่ากับผูกใบขายที่บอร์ด /api/mo/sales-match) · audit mo.sales_link / mo.sales_unlink + so_order
 * ใบขาย = erp_playground_sales_orders + so_lines · ร่างผูกไม่ได้ (ยืนยันก่อน) · ลูกค้าเดียวกัน = id ตรง หรือบริษัทเดียวกันคนละสาขา
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit, writeAuditMany } from "@/lib/audit";
import { soLineProgress } from "@/lib/mo-so-rule";
import { bkkDate } from "@/lib/mo-sales-match";
import { MO_QTY_EPS } from "@/lib/mo-status";
import { parseSheetShips, planLineBills, planRefills, newUsage, sameCustomer, type BillLineFact, type PlanItem, type SheetShip } from "@/lib/so-bill-match";
import { syncAutoClose } from "@/app/api/mo/auto-close";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const n = (v: unknown) => Number(v) || 0;
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const CHUNK = 200;
const chunks = <T,>(a: T[]) => { const o: T[][] = []; for (let i = 0; i < a.length; i += CHUNK) o.push(a.slice(i, i + CHUNK)); return o; };
const up = (s: unknown) => String(s ?? "").trim().toUpperCase();

/** ใบผลิตที่ถูกลบ/ยกเลิกแล้ว — การผูกบิลกับใบพวกนี้ "ค้าง" (เช่น MO-00038 ใบซ้ำที่ลบไป) → ถือว่าบิลว่าง และปิดการผูกค้างตอนผูกใหม่ */
async function deadMoIds(admin: Admin, ids: string[]): Promise<Set<string>> {
  const dead = new Set<string>();
  for (const part of chunks([...new Set(ids)])) {
    const { data } = await admin.from("manufacturing_orders").select("id, is_active, status").in("id", part);
    const seen = new Set<string>();
    for (const m of (data ?? []) as Row[]) { seen.add(String(m.id)); if (m.is_active === false || m.status === "cancelled") dead.add(String(m.id)); }
    for (const x of part) if (!seen.has(x)) dead.add(x);   // ไม่มีใบนี้แล้ว
  }
  return dead;
}

export type BillMatchMo = { id: string; mo_no: string; status: string | null; qty: number; received: number };
export type BillMatchLine = {
  line_id: string; line_no: number; sku: string | null; name: string; ordered: number; shipped: number;
  sheet: SheetShip[]; mo: BillMatchMo | null; items: PlanItem[]; short: number;
  /** done = ส่งครบแล้ว · todo = มีบิลให้ผูก · short = หาบิลไม่ครบ · no_mo = ยังไม่มีใบผลิต */
  state: "done" | "todo" | "short" | "no_mo";
  /** ผูกตามแผนแล้วขายครบ แต่ยังไม่บันทึกผลิตครบ → ต้องไปบันทึกผลิตที่บอร์ด */
  needs_production: boolean;
};
export type BillMatchPlan = { order_no: string | null; lines: BillMatchLine[]; refills: PlanItem[] };

/** บรรทัดใบขายของรหัสชุดนี้ (ลูกค้าเดียวกับใบสั่งขาย · ไม่นับยกเลิก) + ผูกกับใบผลิตไหนอยู่ */
async function loadBills(admin: Admin, skus: string[], cust: { id: string | null; name: string | null }) {
  const variants = [...new Set(skus.flatMap((s) => [s, `${s} `]))];
  const lines: (BillLineFact & { sku: string; sale_id: string })[] = [];
  for (const part of chunks(variants)) {
    const { data } = await admin.from("erp_playground_so_lines")
      .select("id, so_id, sku, qty, erp_playground_sales_orders!inner(id, so_number, status, order_date, customer_name, customer_id)")
      .in("sku", part).limit(5000);
    for (const l of (data ?? []) as Row[]) {
      const h = (Array.isArray(l.erp_playground_sales_orders) ? l.erp_playground_sales_orders[0] : l.erp_playground_sales_orders) as Row | undefined;
      if (!h || h.status === "cancelled" || !(n(l.qty) > 0)) continue;
      if (!sameCustomer(cust, { id: (h.customer_id as string) ?? null, name: (h.customer_name as string) ?? null })) continue;
      lines.push({ id: String(l.id), sale_id: String(h.id), so_number: String(h.so_number ?? "—"), date: String(h.order_date ?? "").slice(0, 10),
        qty: n(l.qty), draft: h.status === "draft", links: [], sku: String(l.sku ?? "").trim() });
    }
  }
  const byId = new Map(lines.map((l) => [l.id, l]));
  const raw: Row[] = [];
  for (const part of chunks([...byId.keys()])) {
    const { data } = await admin.from("mo_sales_links").select("mo_id, mo_no, sale_line_id, qty").in("sale_line_id", part).eq("is_active", true);
    raw.push(...((data ?? []) as Row[]));
  }
  const dead = await deadMoIds(admin, raw.map((k) => String(k.mo_id)));
  for (const k of raw) if (!dead.has(String(k.mo_id))) byId.get(String(k.sale_line_id))?.links.push({ mo_id: String(k.mo_id), mo_no: String(k.mo_no ?? ""), qty: n(k.qty) });
  return lines;
}

/** ยอดผลิต/ขายของใบผลิต: รับคืนแล้วรวม (ใบจ่ายงานที่ยังใช้ ไม่นับยกเลิก) · ขายแล้วรวม (mo_sales_links) */
async function moFacts(admin: Admin, mos: { id: string; mo_no: string }[]) {
  const recv = new Map<string, number>(), sold = new Map<string, number>();
  for (const part of chunks(mos)) {
    const [{ data: wos }, { data: links }] = await Promise.all([
      admin.from("mo_work_orders").select("mo_no, received_qty, status").in("mo_no", part.map((m) => m.mo_no)).eq("is_active", true),
      admin.from("mo_sales_links").select("mo_id, qty").in("mo_id", part.map((m) => m.id)).eq("is_active", true),
    ]);
    for (const w of (wos ?? []) as Row[]) if (w.status !== "cancelled") recv.set(String(w.mo_no), (recv.get(String(w.mo_no)) ?? 0) + n(w.received_qty));
    for (const k of (links ?? []) as Row[]) sold.set(String(k.mo_id), (sold.get(String(k.mo_id)) ?? 0) + n(k.qty));
  }
  return { recv, sold };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "so.view"); if (denied) return denied;
  const { id } = await params;
  const admin = supabaseAdmin();
  const [{ data: order }, { data: lineRows }, { data: moRows }] = await Promise.all([
    admin.from("so_orders").select("id, order_no, customer_id, customer_name, status").eq("id", id).maybeSingle(),
    admin.from("so_order_lines").select("id, line_no, sku, product_name, qty, mo_id, note").eq("order_id", id).order("line_no"),
    admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, status, created_at").eq("so_order_id", id).eq("is_active", true),
  ]);
  if (!order) return bad("ไม่พบใบสั่งขาย", 404);
  const o = order as Row;
  const ls = (lineRows ?? []) as Row[];
  const mos = new Map<string, Row>(((moRows ?? []) as Row[]).filter((m) => m.status !== "cancelled").map((m) => [String(m.id), m]));
  // ใบที่รายการอ้างตรง ๆ แต่ไม่ได้ผูกใบสั่งขาย (ข้อมูลเก่า)
  const extra = ls.map((l) => String(l.mo_id ?? "")).filter((x) => x && !mos.has(x));
  if (extra.length) {
    const { data } = await admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, status, created_at").in("id", extra).eq("is_active", true);
    for (const m of (data ?? []) as Row[]) if (m.status !== "cancelled") mos.set(String(m.id), m);
  }
  const moList = [...mos.values()].map((m) => ({ id: String(m.id), mo_no: String(m.mo_no) }));
  const facts = await moFacts(admin, moList);
  const prog = soLineProgress(
    ls.map((l) => ({ id: String(l.id), sku: (l.sku as string) ?? null, qty: n(l.qty), mo_id: (l.mo_id as string) ?? null })),
    [...mos.values()].map((m) => ({ id: String(m.id), mo_no: String(m.mo_no), product_sku: (m.product_sku as string) ?? null, qty: n(m.qty), status: (m.status as string) ?? null, shipped: facts.sold.get(String(m.id)) ?? 0 })),
  );

  const skus = [...new Set(ls.map((l) => String(l.sku ?? "").trim()).filter(Boolean))];
  const bills = skus.length ? await loadBills(admin, skus, { id: (o.customer_id as string) ?? null, name: (o.customer_name as string) ?? null }) : [];
  const billsOf = (sku: string) => bills.filter((b) => up(b.sku) === up(sku));
  const usage = newUsage();
  const protect = [...mos.keys()];

  const outLines: BillMatchLine[] = [];
  for (const l of ls) {
    const p = prog.byLine[String(l.id)];
    const sku = (l.sku as string) ?? null;
    const sheet = parseSheetShips(l.note as string);
    const base = { line_id: String(l.id), line_no: n(l.line_no), sku, name: String(l.product_name ?? ""), ordered: n(l.qty), shipped: p?.shipped ?? 0, sheet };
    // ใบที่จะผูกบิลใหม่เข้า: ใบที่รายการอ้างก่อน → ไม่งั้นใบแรกของรายการ
    const tId = (l.mo_id && mos.has(String(l.mo_id)) ? String(l.mo_id) : p?.mos[0]?.id) ?? null;
    const t = tId ? mos.get(tId) : undefined;
    if (!t || !sku) { outLines.push({ ...base, mo: null, items: [], short: Math.max(0, base.ordered - base.shipped), state: base.shipped >= base.ordered - MO_QTY_EPS && base.ordered > 0 ? "done" : "no_mo", needs_production: false }); continue; }
    const mo: BillMatchMo = { id: String(t.id), mo_no: String(t.mo_no), status: (t.status as string) ?? null, qty: n(t.qty), received: facts.recv.get(String(t.mo_no)) ?? 0 };
    const plan = planLineBills({ ordered: base.ordered, shipped: base.shipped, lineMoIds: (p?.mos ?? []).map((m) => m.id),
      target: { id: mo.id, mo_no: mo.mo_no, from: bkkDate(String(t.created_at ?? "")) }, sheet, bills: billsOf(sku), usage, protect });
    const add = plan.items.filter((i) => i.kind !== "draft").reduce((a, i) => a + i.qty, 0);
    const soldAfter = (facts.sold.get(mo.id) ?? 0) + add;
    outLines.push({ ...base, mo, items: plan.items, short: plan.short,
      state: plan.need <= MO_QTY_EPS ? "done" : plan.items.length ? "todo" : "short",
      needs_production: mo.status !== "done" && mo.qty > 0 && soldAfter >= mo.qty - MO_QTY_EPS && mo.received < mo.qty - MO_QTY_EPS });
  }

  // ใบผลิตที่ถูกย้ายบิลออก → บิลว่างให้แทน
  const lost = new Map<string, { mo_id: string; mo_no: string; lost: number }>();
  for (const it of outLines.flatMap((x) => x.items)) if (it.kind === "move" && it.from) {
    const cur = lost.get(it.from.mo_id) ?? { mo_id: it.from.mo_id, mo_no: it.from.mo_no, lost: 0 };
    cur.lost += it.qty; lost.set(it.from.mo_id, cur);
  }
  let refills: PlanItem[] = [];
  if (lost.size) {
    const { data } = await admin.from("manufacturing_orders").select("id, product_sku, created_at").in("id", [...lost.keys()]);
    const srcs = ((data ?? []) as Row[]).map((m) => ({ ...lost.get(String(m.id))!, from: bkkDate(String(m.created_at ?? "")), bills: billsOf(String(m.product_sku ?? "")) }));
    refills = planRefills(srcs, usage);
  }
  const data: BillMatchPlan = { order_no: (o.order_no as string) ?? null, lines: outLines, refills };
  return NextResponse.json({ data, error: null });
}

type ApplyItem = { sale_line_id?: unknown; to_mo_id?: unknown; qty?: unknown; from_mo_id?: unknown };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  const { id } = await params;
  const body = await request.json().catch(() => null) as { items?: unknown } | null;
  const raw = (Array.isArray(body?.items) ? body!.items : []) as ApplyItem[];
  const items = raw.map((r) => ({ sale_line_id: String(r.sale_line_id ?? ""), to_mo_id: String(r.to_mo_id ?? ""), qty: n(r.qty), from_mo_id: r.from_mo_id ? String(r.from_mo_id) : null }))
    .filter((r) => r.sale_line_id && r.to_mo_id && r.qty > 0);
  if (!items.length) return bad("ยังไม่ได้เลือกบิลที่จะผูก");
  if (items.length > 300) return bad("เลือกได้ไม่เกิน 300 รายการต่อครั้ง");

  const admin = supabaseAdmin();
  const { data: order } = await admin.from("so_orders").select("id, order_no").eq("id", id).maybeSingle();
  if (!order) return bad("ไม่พบใบสั่งขาย", 404);
  const orderNo = String((order as Row).order_no ?? "");

  // ใบผลิตที่เกี่ยว (ปลายทาง + ต้นทางที่ย้ายออก)
  const moIds = [...new Set(items.flatMap((i) => [i.to_mo_id, i.from_mo_id].filter(Boolean) as string[]))];
  const { data: moData } = await admin.from("manufacturing_orders").select("id, mo_no, product_sku, qty, status, is_active").in("id", moIds);
  const mos = new Map(((moData ?? []) as Row[]).map((m) => [String(m.id), m]));
  // บรรทัดใบขาย (ต้องยืนยันแล้ว) + ที่ผูกอยู่ตอนนี้
  const billIds = [...new Set(items.map((i) => i.sale_line_id))];
  const blData: Row[] = [], links: Row[] = [];
  for (const part of chunks(billIds)) {
    const [{ data: a }, { data: b }] = await Promise.all([
      admin.from("erp_playground_so_lines").select("id, sku, qty, erp_playground_sales_orders!inner(id, so_number, status, order_date)").in("id", part),
      admin.from("mo_sales_links").select("id, mo_id, mo_no, sale_id, sale_line_id, so_number, sku, qty, sale_date").in("sale_line_id", part).eq("is_active", true),
    ]);
    blData.push(...((a ?? []) as Row[])); links.push(...((b ?? []) as Row[]));
  }
  // ผูกค้างกับใบผลิตที่ลบ/ยกเลิกแล้ว → ไม่นับ + ปิดทิ้งตอนผูกใหม่
  const dead = await deadMoIds(admin, links.map((k) => String(k.mo_id)));
  const stale = links.filter((k) => dead.has(String(k.mo_id)));
  const live = links.filter((k) => !dead.has(String(k.mo_id)));
  const bills = new Map<string, { id: string; sale_id: string; so_number: string; date: string; sku: string; qty: number; status: string }>();
  for (const l of blData) {
    const h = (Array.isArray(l.erp_playground_sales_orders) ? l.erp_playground_sales_orders[0] : l.erp_playground_sales_orders) as Row;
    bills.set(String(l.id), { id: String(l.id), sale_id: String(h.id), so_number: String(h.so_number ?? ""), date: String(h.order_date ?? "").slice(0, 10), sku: String(l.sku ?? "").trim(), qty: n(l.qty), status: String(h.status ?? "") });
  }

  // ── ตรวจทั้งหมดก่อนเขียน (ไม่ให้ผูกครึ่ง ๆ) ──
  const offRows = new Set<string>(stale.map((k) => String(k.id)));   // แถวผูกเดิมที่ต้องปิด (ย้ายออก + ผูกค้างกับใบที่ลบแล้ว)
  const remain: Row[] = [];                           // ส่วนที่เหลือของแถวเดิม (ย้ายออกบางส่วน) → ผูกกลับให้ใบเดิม
  const used = new Map<string, number>();
  for (const k of live) used.set(String(k.sale_line_id), (used.get(String(k.sale_line_id)) ?? 0) + n(k.qty));
  for (const it of items) {
    const b = bills.get(it.sale_line_id);
    if (!b) return bad("ไม่พบบรรทัดใบขาย");
    if (b.status === "draft") return bad(`${b.so_number} ยังเป็นร่าง — ยืนยันใบขายก่อนแล้วค่อยผูก`);
    if (b.status === "cancelled") return bad(`${b.so_number} ถูกยกเลิกแล้ว`);
    const to = mos.get(it.to_mo_id);
    if (!to || to.is_active === false || to.status === "cancelled") return bad("ไม่พบใบสั่งผลิตปลายทาง (หรือยกเลิกแล้ว)");
    if (up(to.product_sku) !== up(b.sku)) return bad(`รหัสสินค้าใน ${b.so_number} ไม่ตรงกับ ${to.mo_no}`);
    if (it.from_mo_id) {
      const rows = live.filter((k) => String(k.sale_line_id) === it.sale_line_id && String(k.mo_id) === it.from_mo_id && !offRows.has(String(k.id)));
      let need = it.qty;
      for (const k of rows) {
        if (need <= MO_QTY_EPS) break;
        offRows.add(String(k.id));
        used.set(it.sale_line_id, (used.get(it.sale_line_id) ?? 0) - n(k.qty));
        const take = Math.min(need, n(k.qty));
        if (n(k.qty) - take > MO_QTY_EPS) {   // ย้ายบางส่วน → ส่วนที่เหลือคงไว้ที่ใบเดิม
          remain.push({ mo_id: k.mo_id, mo_no: k.mo_no, sale_id: k.sale_id, sale_line_id: k.sale_line_id, so_number: k.so_number, sku: k.sku, qty: n(k.qty) - take, sale_date: k.sale_date });
          used.set(it.sale_line_id, (used.get(it.sale_line_id) ?? 0) + (n(k.qty) - take));
        }
        need -= take;
      }
      if (need > MO_QTY_EPS) return bad(`${b.so_number} ผูกกับใบเดิมไม่ถึง ${it.qty} ชิ้น — ข้อมูลเปลี่ยนแล้ว ลองกดอัปเดตสถานะใหม่`);
    }
    const left = b.qty - (used.get(it.sale_line_id) ?? 0);
    if (it.qty > left + MO_QTY_EPS) return bad(`${b.so_number} เหลือให้ผูกได้ ${Math.max(0, Math.round(left * 100) / 100)} ชิ้น — ลองกดอัปเดตสถานะใหม่`);
    used.set(it.sale_line_id, (used.get(it.sale_line_id) ?? 0) + it.qty);
  }

  // ── เขียนจริง ──
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let meName: string | null = user?.email ?? null;
  if (user) { const { data: p } = await admin.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle(); meName = ((p as Row | null)?.display_name as string)?.trim() || meName; }
  const now = new Date().toISOString();
  if (offRows.size) {
    const { error } = await admin.from("mo_sales_links").update({ is_active: false, unlinked_at: now, unlinked_by_name: meName }).in("id", [...offRows]);
    if (error) return bad("ย้ายใบขายไม่สำเร็จ", 500);
  }
  const newRows = [...remain, ...items.map((it) => {
    const b = bills.get(it.sale_line_id)!, to = mos.get(it.to_mo_id)!;
    return { mo_id: it.to_mo_id, mo_no: to.mo_no, sale_id: b.sale_id, sale_line_id: b.id, so_number: b.so_number, sku: b.sku, qty: it.qty, sale_date: b.date || null };
  })].map((r) => ({ ...r, linked_by: user?.id ?? null, linked_by_name: meName }));
  const { error: insErr } = await admin.from("mo_sales_links").insert(newRows);
  if (insErr) return bad("ผูกใบขายไม่สำเร็จ", 500);

  // ประวัติ: ต่อใบผลิต (ผูก / ย้ายออก) + ที่ใบสั่งขาย
  const actor = { actorId: user?.id ?? null, actorName: meName };
  const byTo = new Map<string, { so_number: string; qty: number; from: string | null }[]>();
  const byFrom = new Map<string, { so_number: string; qty: number; to: string }[]>();
  for (const it of items) {
    const b = bills.get(it.sale_line_id)!, to = mos.get(it.to_mo_id)!, from = it.from_mo_id ? mos.get(it.from_mo_id) : undefined;
    byTo.set(it.to_mo_id, [...(byTo.get(it.to_mo_id) ?? []), { so_number: b.so_number, qty: it.qty, from: from ? String(from.mo_no) : null }]);
    if (from) byFrom.set(String(from.id), [...(byFrom.get(String(from.id)) ?? []), { so_number: b.so_number, qty: it.qty, to: String(to.mo_no) }]);
  }
  await writeAuditMany(admin, [
    ...stale.map((k) => ({ action: "mo.sales_unlink", entityType: "mo", entityId: String(k.mo_id), ...actor, metadata: { mo_no: k.mo_no, parts: [{ so_number: k.so_number, qty: n(k.qty) }], via: "so_bill_match", so_order_no: orderNo, reason: "ใบสั่งผลิตถูกลบ/ยกเลิกแล้ว — ปิดการผูกค้าง" } })),
    ...[...byFrom].map(([moId, parts]) => ({ action: "mo.sales_unlink", entityType: "mo", entityId: moId, ...actor, metadata: { mo_no: mos.get(moId)?.mo_no, parts, via: "so_bill_match", so_order_no: orderNo, moved: true } })),
    ...[...byTo].map(([moId, parts]) => ({ action: "mo.sales_link", entityType: "mo", entityId: moId, ...actor, metadata: { mo_no: mos.get(moId)?.mo_no, parts, via: "so_bill_match", so_order_no: orderNo } })),
  ]);
  const moved = items.filter((i) => i.from_mo_id).length;
  await writeAudit(admin, { action: "update", entityType: "so_order", entityId: id, ...actor, metadata: { order_no: orderNo,
    changes: [{ label: "อัปเดตสถานะจากใบขาย", old: "", new: `ผูกบิล ${items.length} รายการ${moved ? ` (ย้ายจากใบผลิตอื่น ${moved})` : ""}` }] } });

  // ปิด/เปิดใบผลิตอัตโนมัติ (ขายครบ + ส่งคืนครบ) — ทั้งใบปลายทางและใบที่ถูกย้ายออก
  const touched = [...mos.values()].map((m) => String(m.mo_no));
  const auto = await syncAutoClose(admin, touched, { id: user?.id, name: meName }, "so_bill_match");

  // ใบที่ขายครบแล้วแต่ยังไม่บันทึกผลิต → ให้ไปบันทึกที่บอร์ด (ระบุโต๊ะ/ช่าง)
  const toMos = [...byTo.keys()].map((x) => mos.get(x)!).map((m) => ({ id: String(m.id), mo_no: String(m.mo_no), qty: n(m.qty), sku: (m.product_sku as string) ?? null, status: String(m.status ?? "") }));
  const facts = await moFacts(admin, toMos);
  const needsProduction = toMos.filter((m) => !auto.closed.includes(m.mo_no) && m.status !== "done" && m.qty > 0
    && (facts.sold.get(m.id) ?? 0) >= m.qty - MO_QTY_EPS && (facts.recv.get(m.mo_no) ?? 0) < m.qty - MO_QTY_EPS)
    .map((m) => ({ mo_no: m.mo_no, sku: m.sku }));
  return NextResponse.json({ ok: true, linked: items.length, moved, auto_closed: auto.closed, auto_reopened: auto.reopened, needs_production: needsProduction });
}
