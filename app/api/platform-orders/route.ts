/**
 * ออเดอร์จากแพลตฟอร์ม (ศูนย์ออเดอร์) — /api/platform-orders
 * GET  ?id=                                   → ออเดอร์ + รายการ (detail)
 * GET  ?platform_id=&brand_id=&view=&status=&q=&due=&invoice=&page=&page_size=
 *        view   todo (ค่าเริ่ม) = ออเดอร์ที่ต้องจัดการ (ไม่รวมออเดอร์จากเมล) · history = ยอดขายจากเมล (ส่งแล้วนอกระบบ) · all
 *        due    late = เลยกำหนดส่ง · today = ต้องส่งวันนี้ (เวลาไทย)  ·  invoice  requested = ขอใบกำกับแต่ยังไม่ออก · issued
 *        → { orders (หน้าเดียว), total (ทั้งหมดตามตัวกรอง), summary (นับต่อสถานะ + การ์ด) }
 *        ?demo=1 = ออเดอร์ตัวอย่าง (lib/platform-order-demo) ไม่แตะฐานข้อมูล
 * PATCH { id | ids[], status?, tracking_no?, carrier? }  (platform_orders.manage)
 *   - ตรวจด้วยกติกากลาง lib/platform-order-status: ออเดอร์จากเมลเปลี่ยนไม่ได้ · เส้นทางสถานะต้องถูก
 *   - status=confirmed → ตัดสต๊อก (ledger เดิม, ครั้งเดียว) · status=cancelled → คืนสต๊อกถ้าเคยตัด
 *   - id ขึ้นต้น demo- = ตอบผลจำลอง ไม่บันทึก
 *
 * POST  { channel, brand_id, ship_to, items[], cod_amount?, note? }  (platform_orders.manage) → สร้างออเดอร์เอง (แชต/โทร) source=manual
 * PATCH ...ship_to? cod_amount? — แก้ที่อยู่ผู้รับ/ยอดเก็บปลายทาง (ช่องทางของเรา · ยังไม่จองขนส่ง) · ขนส่ง = /api/platform-orders/ship
 *
 * 🐛 แก้ 2026-11-10: เดิม .limit(1000) (มี 5,667 ใบ) → รายการ/ตัวเลขสถานะผิด · เดิมกดยืนยันออเดอร์จากเมลแล้วตัดสต๊อกคลังออนไลน์ได้
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { auditChangeMeta, writeAudit } from "@/lib/audit";
import {
  PLATFORM_ORDER_STATUSES, bangkokDayRange, checkTransition, isPlatformOrderStatus, needsAction, shipDue,
  type PlatformOrderRow,
} from "@/lib/platform-order-status";
import { demoOrder, demoOrders, isDemoId } from "@/lib/platform-order-demo";
import { cleanShipTo, isManualChannel, isOpenManualChannel, isMarketplace, isShippingActive, manualOrderNo, type OrderShipping } from "@/lib/order-shipping";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
const LIST_COLS = "id, platform_id, brand_id, external_order_id, order_no, customer_name, status, platform_status, total, currency, ordered_at, ship_by_at, tracking_no, carrier, stock_deducted, source, invoice_so_id, tax_invoice_request, shipping, cod_amount, raw->>channel, created_at";
const PAGE_MAX = 200;
const OPEN_STATUSES = ["new", "confirmed", "packed"];

async function defaultWarehouse(admin: Admin): Promise<string | null> {
  // ขายออนไลน์ตัดจากโกดังออนไลน์ (WH-ONLINE) · ถ้ายังไม่มีของในนั้นใช้โซนสินค้าสำเร็จ (WH-FG)
  for (const code of ["WH-ONLINE", "WH-FG"]) {
    const { data } = await admin.from("erp_playground_warehouses").select("id").eq("code", code).maybeSingle();
    if ((data as { id?: string } | null)?.id) return String((data as { id: string }).id);
  }
  const { data: any1 } = await admin.from("erp_playground_warehouses").select("id").limit(1).maybeSingle();
  return (any1 as { id?: string } | null)?.id ?? null;
}

type ListParams = { platformId: string; brandId: string; view: string; status: string; q: string; due: string; invoice: string; active?: boolean };

/** คำค้น → ปลอดภัยสำหรับ or() ของ PostgREST (ตัด , ( ) ที่ทำให้ตัวกรองพัง) */
const cleanQ = (q: string) => q.replace(/[,()*%\\]/g, " ").trim().slice(0, 60);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ตัวสร้าง query ของ supabase-js มี type ซับซ้อน ใช้ร่วมกันทั้งรายการและตัวนับ
function applyFilters(q: any, p: ListParams) {
  if (p.platformId) q = q.eq("platform_id", p.platformId);
  if (p.brandId) q = q.eq("brand_id", p.brandId);
  // view: ไม่ใช้ .neq("source","email") เพราะ PostgREST ตัดแถวที่ source เป็น null ทิ้ง
  if (p.view === "history") q = q.eq("source", "email");
  else if (p.view !== "all") q = q.or("source.is.null,source.neq.email");
  if (p.status && isPlatformOrderStatus(p.status)) q = q.eq("status", p.status);
  // ต้องลงมือ = ยังไม่ส่ง/ไม่ยกเลิก และผู้ซื้อจ่ายแล้ว (ตรงกับ needsAction · TikTok ON_HOLD = ผู้ซื้อยังยกเลิกได้ ยังไม่นับ)
  if (p.active) q = q.in("status", OPEN_STATUSES).or("platform_status.is.null,platform_status.not.in.(UNPAID,ON_HOLD)");
  const s = cleanQ(p.q);
  if (s) q = q.or(`order_no.ilike.*${s}*,external_order_id.ilike.*${s}*,customer_name.ilike.*${s}*`);
  if (p.due === "late") q = q.lt("ship_by_at", new Date().toISOString()).in("status", OPEN_STATUSES);
  if (p.due === "today") q = q.gte("ship_by_at", new Date().toISOString()).lt("ship_by_at", bangkokDayRange().end).in("status", OPEN_STATUSES);
  if (p.invoice === "requested") q = q.not("tax_invoice_request", "is", null).is("invoice_so_id", null).neq("status", "cancelled");
  if (p.invoice === "issued") q = q.not("invoice_so_id", "is", null);
  return q;
}

function toRow(r: Record<string, unknown>): PlatformOrderRow {
  return {
    id: String(r.id), platform_id: (r.platform_id as string) ?? null, brand_id: (r.brand_id as string) ?? null,
    external_order_id: (r.external_order_id as string) ?? null, order_no: (r.order_no as string) ?? null, customer_name: (r.customer_name as string) ?? null,
    status: String(r.status ?? "new"), platform_status: (r.platform_status as string) ?? null,
    total: r.total == null ? null : Number(r.total), currency: (r.currency as string) ?? null,
    ordered_at: (r.ordered_at as string) ?? null, ship_by_at: (r.ship_by_at as string) ?? null,
    tracking_no: (r.tracking_no as string) ?? null, carrier: (r.carrier as string) ?? null,
    stock_deducted: !!r.stock_deducted, source: (r.source as string) ?? null, invoice_so_id: (r.invoice_so_id as string) ?? null,
    tax_invoice_requested: r.tax_invoice_request != null, created_at: String(r.created_at ?? ""),
    shipping_status: (r.shipping as OrderShipping | null)?.status ?? null, shipping_courier: (r.shipping as OrderShipping | null)?.courierCode ?? null,
    shipping_mode: (r.shipping as OrderShipping | null)?.mode ?? null, cod_amount: Number(r.cod_amount) || 0, channel: (r.channel as string) ?? null,
  };
}

/** โหมดทดลอง: กรอง/นับ/แบ่งหน้าในหน่วยความจำ ด้วยกติกาเดียวกับของจริง */
function demoList(p: ListParams, page: number, size: number) {
  const now = Date.now();
  const all = p.view === "history" ? [] : demoOrders(now);
  const s = cleanQ(p.q).toLowerCase();
  const base = all.filter((o) => {
    if (s && !`${o.order_no} ${o.customer_name}`.toLowerCase().includes(s)) return false;
    if (p.due === "late" && shipDue(o, now) !== "late") return false;
    if (p.due === "today" && shipDue(o, now) !== "today") return false;
    if (p.invoice === "requested" && !(o.tax_invoice_requested && !o.invoice_so_id && o.status !== "cancelled")) return false;
    if (p.invoice === "issued" && !o.invoice_so_id) return false;
    if (p.active && !needsAction(o)) return false;
    return true;
  });
  const rows = p.status ? base.filter((o) => o.status === p.status) : base;
  const by: Record<string, number> = {};
  for (const st of PLATFORM_ORDER_STATUSES) by[st] = all.filter((o) => o.status === st).length;
  const summary = {
    by_status: by,
    todo: all.filter((o) => needsAction(o)).length,
    late: all.filter((o) => shipDue(o, now) === "late").length,
    today: all.filter((o) => shipDue(o, now) === "today").length,
    invoice_requested: all.filter((o) => o.tax_invoice_requested && !o.invoice_so_id && o.status !== "cancelled").length,
    view_total: { todo: all.length, history: 0 },
  };
  const orders = rows.slice((page - 1) * size, page * size).map(({ items: _i, recipient: _r, note: _n, tax_invoice_request: _t, ...row }) => row);
  return { orders, total: rows.length, summary };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.view"); if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const demo = sp.get("demo") === "1";
  const id = (sp.get("id") ?? "").trim();

  if (id) {
    if (isDemoId(id)) {
      const o = demoOrder(id);
      if (!o) return NextResponse.json({ error: "ไม่พบออเดอร์ตัวอย่าง" }, { status: 404 });
      const { items, ...order } = o;
      return NextResponse.json({ order, items, demo: true, error: null });
    }
    const admin = supabaseAdmin();
    const { data: order } = await admin.from("platform_orders").select("*").eq("id", id).maybeSingle();
    if (!order) return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
    const [{ data: items }, platform_code] = await Promise.all([
      admin.from("platform_order_items").select("*").eq("order_id", id),
      platformCodeOf(admin, (order as Record<string, unknown>).platform_id),
    ]);
    return NextResponse.json({ order: { ...(order as Record<string, unknown>), platform_code }, items: items ?? [], error: null });
  }

  // ?ids=a,b,c → ออเดอร์ + รายการ หลายใบ (หน้าพิมพ์ใบหยิบ/ใบแพ็ก/ใบปะหน้า)
  const idsParam = (sp.get("ids") ?? "").trim();
  if (idsParam) {
    const ids = [...new Set(idsParam.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, PAGE_MAX);
    if (ids.every(isDemoId)) {
      const all = demoOrders();
      return NextResponse.json({ orders: ids.map((x) => all.find((o) => o.id === x)).filter(Boolean), demo: true, error: null });
    }
    const real = ids.filter((x) => !isDemoId(x));
    const admin = supabaseAdmin();
    const [{ data: os }, { data: its }] = await Promise.all([
      admin.from("platform_orders").select(LIST_COLS).in("id", real),
      admin.from("platform_order_items").select("order_id, sku_code, name, qty, price, matched_sku_id").in("order_id", real),
    ]);
    const byOrder = new Map<string, Record<string, unknown>[]>();
    for (const it of (its ?? []) as Record<string, unknown>[]) { const k = String(it.order_id); (byOrder.get(k) ?? byOrder.set(k, []).get(k)!).push(it); }
    const rows = ((os ?? []) as Record<string, unknown>[]).map((r) => ({ ...toRow(r), items: byOrder.get(String(r.id)) ?? [], recipient: null, note: null }));
    rows.sort((a, b) => real.indexOf(a.id) - real.indexOf(b.id));
    return NextResponse.json({ orders: rows, error: null });
  }

  const p: ListParams = {
    platformId: (sp.get("platform_id") ?? "").trim(), brandId: (sp.get("brand_id") ?? "").trim(),
    view: (sp.get("view") ?? "todo").trim(), status: (sp.get("status") ?? "").trim(), q: (sp.get("q") ?? "").trim(),
    due: (sp.get("due") ?? "").trim(), invoice: (sp.get("invoice") ?? "").trim(), active: sp.get("active") === "1",
  };
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const size = Math.min(PAGE_MAX, Math.max(10, Number(sp.get("page_size")) || 50));
  if (demo) return NextResponse.json({ ...demoList(p, page, size), page, page_size: size, demo: true, error: null });

  const admin = supabaseAdmin();
  const count = (extra: Partial<ListParams>): Promise<number> =>
    applyFilters(admin.from("platform_orders").select("id", { count: "exact", head: true }), { ...p, ...extra })
      .then((r: { count: number | null }) => r.count ?? 0);
  // การ์ด = ทั้งร้าน/ทั้งมุมมอง ไม่ขึ้นกับตัวกรองย่อย (สถานะ/คำค้น/กำหนดส่ง/ใบกำกับ)
  const scope: Partial<ListParams> = { status: "", due: "", invoice: "", q: "", active: false };

  const listQ = applyFilters(admin.from("platform_orders").select(LIST_COLS, { count: "exact" }), p)
    .order("ship_by_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })
    .range((page - 1) * size, page * size - 1);
  const [list, byStatus, todo, late, today, invReq, viewTodo, viewHist] = await Promise.all([
    listQ,
    Promise.all(PLATFORM_ORDER_STATUSES.map((st) => count({ ...scope, status: st }))),
    count({ ...scope, view: "todo", active: true }),
    count({ ...scope, view: "todo", due: "late" }),
    count({ ...scope, view: "todo", due: "today" }),
    count({ ...scope, view: "all", invoice: "requested" }),
    count({ ...scope, view: "todo" }),
    count({ ...scope, view: "history" }),
  ]);
  if (list.error) return NextResponse.json({ error: "โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const by: Record<string, number> = {};
  PLATFORM_ORDER_STATUSES.forEach((st, i) => { by[st] = byStatus[i]; });
  return NextResponse.json({
    orders: ((list.data ?? []) as Record<string, unknown>[]).map(toRow),
    total: list.count ?? 0, page, page_size: size,
    summary: { by_status: by, todo, late, today, invoice_requested: invReq, view_total: { todo: viewTodo, history: viewHist } },
    error: null,
  });
}

type PatchBody = { id?: string; ids?: string[]; status?: string; tracking_no?: string; carrier?: string; ship_to?: unknown; cod_amount?: unknown };

async function platformCodeOf(admin: Admin, platformId: unknown): Promise<string | null> {
  if (!platformId) return null;
  const { data } = await admin.from("erp_platforms").select("code").eq("id", String(platformId)).maybeSingle();
  return (data as { code?: string } | null)?.code ?? null;
}

/** เปลี่ยนสถานะ/เลขพัสดุ 1 ใบ — คืนผล (ไม่ throw) */
async function patchOne(admin: Admin, id: string, body: PatchBody, actor: { id: string | null; email: string | null }): Promise<{ ok: boolean; error?: string; warnings: string[] }> {
  const warnings: string[] = [];
  const { data: orderRow } = await admin.from("platform_orders").select("*").eq("id", id).maybeSingle();
  const order = orderRow as Record<string, unknown> | null;
  if (!order) return { ok: false, error: "ไม่พบออเดอร์", warnings };
  const cur = String(order.status ?? "new");
  const newStatus = typeof body.status === "string" ? body.status.trim() : null;
  const chk = checkTransition({ status: cur, source: (order.source as string) ?? null }, newStatus ?? cur);
  if (!chk.ok) return { ok: false, error: chk.reason, warnings };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.tracking_no === "string") patch.tracking_no = body.tracking_no.trim() || null;
  if (typeof body.carrier === "string") patch.carrier = body.carrier.trim() || null;
  const label = (order.order_no as string) || (order.external_order_id as string) || "";

  // ที่อยู่ผู้รับ / ยอดเก็บปลายทาง: เฉพาะออเดอร์ช่องทางของเรา และยังไม่จองขนส่ง (จองแล้ว = ยกเลิกการจองก่อน)
  if (body.ship_to !== undefined || body.cod_amount !== undefined) {
    if (isMarketplace(await platformCodeOf(admin, order.platform_id))) return { ok: false, error: "ออเดอร์แพลตฟอร์ม — ที่อยู่ผู้รับแก้บนร้าน", warnings };
    if (isShippingActive(order.shipping as OrderShipping | null)) return { ok: false, error: "จองขนส่งไปแล้ว — ยกเลิกการจองก่อนแก้ที่อยู่/ยอดเก็บปลายทาง", warnings };
    if (cur === "shipped" || cur === "cancelled") return { ok: false, error: "ออเดอร์ส่งแล้ว/ยกเลิกแล้ว แก้ไม่ได้", warnings };
    if (body.ship_to !== undefined) {
      const st = cleanShipTo(body.ship_to);
      if (!st.ok) return { ok: false, error: st.error, warnings };
      patch.ship_to = st.value;
      if (!order.customer_name) patch.customer_name = st.value.name;
    }
    if (body.cod_amount !== undefined) {
      const cod = Math.round((Number(body.cod_amount) || 0) * 100) / 100;
      if (cod < 0) return { ok: false, error: "ยอดเก็บปลายทางติดลบไม่ได้", warnings };
      patch.cod_amount = cod;
    }
  }

  // ยืนยัน → ตัดสต๊อก (ครั้งเดียว)
  if (newStatus === "confirmed" && !order.stock_deducted) {
    const wh = await defaultWarehouse(admin);
    const { data: items } = await admin.from("platform_order_items").select("matched_sku_id, matched_parent_sku_id, qty, name, sku_code").eq("order_id", id);
    if (!wh) warnings.push("ไม่พบคลังออนไลน์ (WH-ONLINE) — ยังไม่ได้ตัดสต๊อก");
    else {
      for (const it of ((items ?? []) as Record<string, unknown>[])) {
        if (!it.matched_sku_id) { warnings.push(it.matched_parent_sku_id ? `${it.sku_code ?? it.name ?? "?"}: นับระดับรุ่น (ไม่รู้สี) ข้ามการตัดสต๊อก — ตัดสต๊อกสีที่ส่งจริงเอง` : `${it.sku_code ?? it.name ?? "?"}: จับคู่ SKU ไม่ได้ ข้ามการตัดสต๊อก`); continue; }
        const { error } = await admin.rpc("erp_stock_post_internal", { p_movement_type: "out", p_product_id: it.matched_sku_id as string, p_to_warehouse_id: null, p_from_warehouse_id: wh, p_qty: Number(it.qty) || 0, p_unit_cost: 0, p_reference_type: "platform_order", p_reference_id: id, p_reference_label: label, p_actor: actor.email });
        if (error) warnings.push(`${it.sku_code ?? "?"}: ตัดสต๊อกไม่สำเร็จ (${error.message})`);
      }
      patch.stock_deducted = true;
    }
  }
  // ยกเลิก → คืนสต๊อกถ้าเคยตัด
  if (newStatus === "cancelled" && order.stock_deducted) {
    const wh = await defaultWarehouse(admin);
    const { data: items } = await admin.from("platform_order_items").select("matched_sku_id, qty").eq("order_id", id);
    if (wh) for (const it of ((items ?? []) as Record<string, unknown>[])) {
      if (it.matched_sku_id) await admin.rpc("erp_stock_post_internal", { p_movement_type: "in", p_product_id: it.matched_sku_id as string, p_to_warehouse_id: wh, p_from_warehouse_id: null, p_qty: Number(it.qty) || 0, p_unit_cost: 0, p_reference_type: "platform_order_cancel", p_reference_id: id, p_reference_label: label, p_actor: actor.email });
    }
    patch.stock_deducted = false;
  }
  if (newStatus) patch.status = newStatus;

  const { error } = await admin.from("platform_orders").update(patch).eq("id", id);
  if (error) return { ok: false, error: "บันทึกไม่สำเร็จ", warnings };
  await writeAudit(admin, {
    action: newStatus ? `order:${newStatus}` : "update", entityType: "platform_order", entityId: id, actorId: actor.id, actorName: actor.email,
    metadata: { order_no: label, warnings, ...auditChangeMeta(order, patch) },
  });
  return { ok: true, warnings };
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  let body: PatchBody;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const ids = [...new Set([...(Array.isArray(body.ids) ? body.ids : []), ...(body.id ? [body.id] : [])].map((x) => String(x).trim()).filter(Boolean))];
  if (!ids.length) return NextResponse.json({ error: "ต้องระบุออเดอร์" }, { status: 400 });
  if (ids.length > PAGE_MAX) return NextResponse.json({ error: `ทำได้ครั้งละไม่เกิน ${PAGE_MAX} ออเดอร์` }, { status: 400 });
  if (body.status != null && !isPlatformOrderStatus(body.status)) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });

  // โหมดทดลอง: ตอบผลเหมือนจริง ไม่บันทึก
  if (ids.every(isDemoId)) return NextResponse.json({ ok: true, demo: true, done: ids.length, failed: [], warnings: ["โหมดทดลอง — ไม่ได้บันทึกจริง"], error: null });
  if (ids.some(isDemoId)) return NextResponse.json({ error: "ปนออเดอร์ตัวอย่างกับของจริงไม่ได้" }, { status: 400 });

  const admin = supabaseAdmin();
  const actor = { id: user?.id ?? null, email: user?.email ?? null };
  const failed: { id: string; error: string }[] = [];
  const warnings: string[] = [];
  let done = 0;
  for (const id of ids) {
    const r = await patchOne(admin, id, body, actor);
    warnings.push(...r.warnings);
    if (r.ok) done++; else failed.push({ id, error: r.error ?? "ไม่สำเร็จ" });
  }
  // ใบเดียวแล้วไม่สำเร็จ = ตอบเป็น error ให้หน้าจอโชว์เหตุผลตรง ๆ
  if (ids.length === 1 && failed.length) return NextResponse.json({ error: failed[0].error, warnings }, { status: 400 });
  return NextResponse.json({ ok: failed.length === 0, done, failed, warnings, error: null });
}

type ManualItem = { sku_id?: string | null; sku_code?: string | null; name?: string | null; qty?: unknown; price?: unknown };
const UUID = /^[0-9a-f-]{36}$/i;

/** สร้างออเดอร์เอง (ลูกค้าสั่งทาง LINE แชต / Facebook / IG / โทร) — ส่งของผ่าน SHIPPOP ได้ทันที */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "platform_orders.manage"); if (denied) return denied;
  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  const b = (await request.json().catch(() => null)) as { channel?: string; brand_id?: string; ship_to?: unknown; items?: ManualItem[]; cod_amount?: unknown; note?: string } | null;
  if (!isManualChannel(b?.channel)) return NextResponse.json({ error: "เลือกช่องทางที่ลูกค้าสั่ง" }, { status: 400 });
  if (!isOpenManualChannel(b?.channel)) return NextResponse.json({ error: "ช่องทางนี้ยังเปิดใช้ไม่ได้ — เลือกช่องทางอื่นไปก่อน" }, { status: 400 });
  const brandId = String(b?.brand_id ?? "").trim();
  if (!UUID.test(brandId)) return NextResponse.json({ error: "เลือกแบรนด์" }, { status: 400 });
  const st = cleanShipTo(b?.ship_to);
  if (!st.ok) return NextResponse.json({ error: st.error }, { status: 400 });
  const raw = (Array.isArray(b?.items) ? b!.items : []).slice(0, 100);
  const items = raw.map((it) => ({ sku_id: UUID.test(String(it.sku_id ?? "")) ? String(it.sku_id) : null, sku_code: String(it.sku_code ?? "").trim() || null, name: String(it.name ?? "").trim(), qty: Math.round(Number(it.qty) || 0), price: Math.round((Number(it.price) || 0) * 100) / 100 }));
  if (!items.length) return NextResponse.json({ error: "เพิ่มสินค้าอย่างน้อย 1 รายการ" }, { status: 400 });
  const bad = items.find((it) => !it.name || it.qty <= 0 || it.price < 0);
  if (bad) return NextResponse.json({ error: `รายการ "${bad.name || bad.sku_code || "?"}" ต้องมีชื่อ จำนวนมากกว่า 0 และราคาไม่ติดลบ` }, { status: 400 });
  const cod = Math.max(0, Math.round((Number(b?.cod_amount) || 0) * 100) / 100);

  const admin = supabaseAdmin();
  // phone = ไม่ผูกแพลตฟอร์ม (platform_id ว่างได้ตั้งแต่ migration 202612020200 · เลขซ้ำกันด้วย unique index เฉพาะใบที่ไม่มีแพลตฟอร์ม)
  let platformId: string | null = null;
  if (b!.channel !== "phone") {
    const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", b!.channel).maybeSingle();
    platformId = (pf as { id?: string } | null)?.id ?? null;
    if (!platformId) return NextResponse.json({ error: "ไม่พบช่องทางนี้ในระบบ" }, { status: 400 });
  }
  // SKU ที่เลือก → รหัสจริง + รุ่น (ใช้ตัดสต๊อก/น้ำหนัก)
  const skuIds = items.map((i) => i.sku_id).filter((x): x is string => !!x);
  const { data: skus } = skuIds.length ? await admin.from("skus_v2").select("id, code, parent_sku_id").in("id", skuIds) : { data: [] };
  const sku = new Map(((skus ?? []) as { id: string; code: string; parent_sku_id: string | null }[]).map((s) => [s.id, s]));

  const total = Math.round(items.reduce((a, i) => a + i.qty * i.price, 0) * 100) / 100;
  const now = new Date().toISOString();
  let order: { id: string; order_no: string } | null = null;
  for (let attempt = 0; attempt < 5 && !order; attempt++) {
    const no = manualOrderNo();
    const { data: ins, error } = await admin.from("platform_orders").insert({
      platform_id: platformId, brand_id: brandId, source: "manual", external_order_id: no, order_no: no, customer_name: st.value.name,
      status: "new", total, currency: "THB", ordered_at: now, ship_to: st.value, cod_amount: cod,
      raw: { channel: b!.channel, note: String(b?.note ?? "").trim().slice(0, 500) || null }, created_by: user?.id ?? null,
    }).select("id, order_no").single();
    if (error && (error as { code?: string }).code === "23505") continue;   // เลขชน → สุ่มใหม่
    if (error || !ins) return NextResponse.json({ error: "สร้างออเดอร์ไม่สำเร็จ" }, { status: 500 });
    order = ins as { id: string; order_no: string };
  }
  if (!order) return NextResponse.json({ error: "ระบบไม่ว่าง กรุณาลองใหม่" }, { status: 503 });
  const { error: itErr } = await admin.from("platform_order_items").insert(items.map((i) => {
    const s = i.sku_id ? sku.get(i.sku_id) : null;
    return { order_id: order!.id, sku_code: s?.code ?? i.sku_code, matched_sku_id: s?.id ?? null, matched_parent_sku_id: s?.parent_sku_id ?? null, name: i.name, qty: i.qty, price: i.price, raw: { source: "manual" } };
  }));
  if (itErr) {
    await admin.from("platform_orders").delete().eq("id", order.id);   // ไม่ทิ้งออเดอร์ว่าง
    return NextResponse.json({ error: "บันทึกรายการสินค้าไม่สำเร็จ" }, { status: 500 });
  }
  await writeAudit(admin, {
    action: "create", entityType: "platform_order", entityId: order.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { order_no: order.order_no, channel: b!.channel, items: items.length, total, cod, source: "manual" },
  });
  return NextResponse.json({ ok: true, id: order.id, order_no: order.order_no, error: null });
}
