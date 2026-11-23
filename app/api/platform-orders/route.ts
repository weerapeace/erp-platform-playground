/**
 * ออเดอร์จากแพลตฟอร์ม (ศูนย์ออเดอร์) — /api/platform-orders
 * GET  ?id=                                   → ออเดอร์ + รายการ (detail)
 * GET  ?platform_id=&brand_id=&view=&status=&q=&due=&invoice=&page=&page_size=
 *        view   todo (ค่าเริ่ม) = ออเดอร์ที่ต้องจัดการ (ไม่รวมออเดอร์จากเมล) · history = ยอดขายจากเมล (ส่งแล้วนอกระบบ) · all
 *        due    late = เลยกำหนดส่ง · today = ต้องส่งวันนี้ (เวลาไทย)  ·  invoice  requested = ขอใบกำกับแต่ยังไม่ออก · issued
 *        booked=1 = จองขนส่งแล้ว รอขนส่งรับ (ยังไม่ส่ง · การจองไม่ถูกยกเลิก) · q ค้นเลขออเดอร์/ลูกค้า + ชื่อสินค้า/รหัส SKU (2026-11-19)
 *        แต่ละออเดอร์มี products (3 รายการแรก + รูป) + item_count — คอลัมน์ "สินค้า" (lib/platform-order-items-server)
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
  type PlatformOrderRow, type PlatformBrandCard,
} from "@/lib/platform-order-status";
import { demoOrder, demoOrders, isDemoId } from "@/lib/platform-order-demo";
import { cleanShipTo, isManualChannel, isOpenManualChannel, isMarketplace, isShippingActive, manualOrderNo, manualShipBy, type OrderShipping } from "@/lib/order-shipping";
import { orderIdsByProduct, orderItemsWithMedia, productSummary } from "@/lib/platform-order-items-server";
import { printSummaryOf } from "@/lib/print-log-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Admin = ReturnType<typeof supabaseAdmin>;
const LIST_COLS = "id, platform_id, brand_id, external_order_id, order_no, customer_name, status, platform_status, total, currency, ordered_at, ship_by_at, tracking_no, carrier, stock_deducted, source, invoice_so_id, tax_invoice_request, shipping, cod_amount, raw->>channel, created_at, packed_at, buyer_message:raw->shopee->>message_to_seller, tt_message:raw->tiktok->>buyer_message, delivery_option:raw->tiktok->>delivery_option_name";
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

type ListParams = {
  platformId: string; brandId: string; view: string; status: string; q: string; due: string; invoice: string; active?: boolean; booked?: boolean; qIds?: string[];
  /** วงกลมแพลตฟอร์มที่ปิดไว้ (การ์ดแบรนด์ 2026-11-22) — คู่ แบรนด์|* : แพลตฟอร์ม|phone */
  off?: OffPair[];
  /** แท็บแบบ Zort (2026-11-23): รอชำระ = ผู้ซื้อยังไม่จ่าย · ส่งด่วน = ยังไม่ส่ง + ขนส่งด่วน (Instant/Same day) */
  unpaid?: boolean; urgent?: boolean;
  /** ยอดขายจากเมล: ซ่อนคู่ แบรนด์×แพลตฟอร์ม ที่ดึงจาก API แล้ว (เจ้าของเลือก E2 — LM ไม่ใช้เมลแล้ว · IG Shopee ยังใช้) */
  apiPairs?: { brand_id: string; platform_id: string }[];
};
type OffPair = { brand: string; platform: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** ?off=brandId|*:platformId|phone,... → คู่ที่ปิด (ตรวจรูปแบบ กันตัวกรองพัง · ≤ 40 คู่) */
function parseOff(raw: string): OffPair[] {
  return raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40).map((s) => {
    const [brand, platform] = s.split(":");
    return { brand: brand ?? "", platform: platform ?? "" };
  }).filter((p) => (p.brand === "*" || UUID_RE.test(p.brand)) && (p.platform === "phone" || UUID_RE.test(p.platform)));
}
/** ยังไม่จ่าย (ไม่นับงาน) — ตรงกับ isUnpaidPlatformStatus + ON_HOLD · Lazada เก็บตัวพิมพ์เล็ก */
const NOT_ACTIVE_PS = "UNPAID,ON_HOLD,unpaid,LINE_UNPAID,LINE_EXPIRED,WEB_UNPAID,WEB_VERIFYING";
const UNPAID_PS = ["UNPAID", "unpaid", "LINE_UNPAID", "WEB_UNPAID", "WEB_VERIFYING"];

/** คำค้น → ปลอดภัยสำหรับ or() ของ PostgREST (ตัด , ( ) ที่ทำให้ตัวกรองพัง) */
const cleanQ = (q: string) => q.replace(/[,()*%\\]/g, " ").trim().slice(0, 60);

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ตัวสร้าง query ของ supabase-js มี type ซับซ้อน ใช้ร่วมกันทั้งรายการและตัวนับ
function applyFilters(q: any, p: ListParams) {
  if (p.platformId) q = q.eq("platform_id", p.platformId);
  if (p.brandId) q = q.eq("brand_id", p.brandId);
  // view: ไม่ใช้ .neq("source","email") เพราะ PostgREST ตัดแถวที่ source เป็น null ทิ้ง
  if (p.view === "history") {
    q = q.eq("source", "email");
    // E2: ร้านที่ดึงจาก API แล้ว ไม่ต้องเห็นยอดจากเมล (ยังนับในรายงานยอดขายเหมือนเดิม)
    for (const a of p.apiPairs ?? []) q = q.or(`brand_id.is.null,brand_id.neq.${a.brand_id},platform_id.neq.${a.platform_id}`);
  } else if (p.view !== "all") q = q.or("source.is.null,source.neq.email");
  // วงกลมแพลตฟอร์มที่ปิด · ไม่ใช้ .neq ตรง ๆ เพราะตัดแถวที่ค่าเป็น null ทิ้ง
  for (const o of p.off ?? []) {
    const pf = o.platform === "phone" ? "platform_id.not.is.null" : `platform_id.is.null,platform_id.neq.${o.platform}`;
    q = o.brand === "*" ? q.or(pf) : q.or(`brand_id.is.null,brand_id.neq.${o.brand},${pf}`);
  }
  if (p.status && isPlatformOrderStatus(p.status)) q = q.eq("status", p.status);
  if (p.unpaid) q = q.neq("status", "cancelled").in("platform_status", UNPAID_PS);
  if (p.urgent) q = q.in("status", OPEN_STATUSES).or("carrier.ilike.*instant*,carrier.ilike.*same*day*,carrier.ilike.*express*delivery*,carrier.ilike.*ส่งด่วน*");
  // ต้องลงมือ = ยังไม่ส่ง/ไม่ยกเลิก และผู้ซื้อจ่ายแล้ว (ตรงกับ needsAction · TikTok ON_HOLD = ผู้ซื้อยังยกเลิกได้ ยังไม่นับ)
  if (p.active) q = q.in("status", OPEN_STATUSES).or(`platform_status.is.null,platform_status.not.in.(${NOT_ACTIVE_PS})`);
  const s = cleanQ(p.q);
  if (s) q = q.or(`order_no.ilike.*${s}*,external_order_id.ilike.*${s}*,customer_name.ilike.*${s}*${p.qIds?.length ? `,id.in.(${p.qIds.join(",")})` : ""}`);
  // จองขนส่งแล้ว รอรับ = ยังไม่ส่ง + มีการจองที่ไม่ถูกยกเลิก
  if (p.booked) q = q.in("status", OPEN_STATUSES).not("shipping", "is", null).neq("shipping->>status", "cancel");
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
    packed_at: (r.packed_at as string) ?? null, buyer_message: (r.buyer_message as string) || (r.tt_message as string) || null,
    delivery_option: (r.delivery_option as string) ?? null,
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
    if (p.booked && !(o.shipping_status && o.shipping_status !== "cancel" && o.status !== "shipped" && o.status !== "cancelled")) return false;
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
    booked: all.filter((o) => o.shipping_status && o.shipping_status !== "cancel" && o.status !== "shipped" && o.status !== "cancelled").length,
    view_total: { todo: all.length, history: 0 },
  };
  const orders = rows.slice((page - 1) * size, page * size).map(({ items, recipient: _r, note: _n, tax_invoice_request: _t, ...row }) => ({
    ...row, ...productSummary(items.map((i) => ({ sku_code: i.sku_code, name: i.name, qty: Number(i.qty) || 0, image_key: null }))),
  }));
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
    const [{ data: items }, media, platform_code] = await Promise.all([
      admin.from("platform_order_items").select("*").eq("order_id", id),
      orderItemsWithMedia(admin, [id]),
      platformCodeOf(admin, (order as Record<string, unknown>).platform_id),
    ]);
    // รูป/สี/กล่อง/น้ำหนัก ต่อรายการ (ลิ้นชักออเดอร์)
    const mById = new Map((media.get(id) ?? []).map((m) => [m.id, m]));
    const withMedia = ((items ?? []) as Record<string, unknown>[]).map((it) => {
      const m = mById.get(String(it.id));
      return { ...it, image_key: m?.image_key ?? null, color: m?.color ?? null, box_name: m?.box_name ?? null, weight_g: m?.weight_g ?? null };
    });
    // หน้ารายละเอียดแบบ Zort (2026-11-23): ชื่อแบรนด์/ร้าน · เอกสารที่พิมพ์แล้ว · คนแพ็ก · ประวัติ (audit)
    const o = order as Record<string, unknown>;
    const [brand, pfName, pk, pc, lb, packer, logs] = await Promise.all([
      o.brand_id ? admin.from("brands").select("name").eq("id", String(o.brand_id)).maybeSingle() : Promise.resolve({ data: null }),
      o.platform_id ? admin.from("erp_platforms").select("name_th").eq("id", String(o.platform_id)).maybeSingle() : Promise.resolve({ data: null }),
      printSummaryOf(admin, "po_pick", [id]), printSummaryOf(admin, "po_pack", [id]), printSummaryOf(admin, "po_label", [id]),
      o.packed_by ? admin.from("user_profiles").select("display_name").eq("id", String(o.packed_by)).maybeSingle() : Promise.resolve({ data: null }),
      admin.from("audit_logs").select("action, metadata, created_at").eq("entity_type", "platform_orders").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
    ]);
    const extra = {
      brand_name: (brand.data as { name?: string } | null)?.name ?? null,
      platform_name: (pfName.data as { name_th?: string } | null)?.name_th ?? null,
      docs: { pick: pk.get(id)?.last ?? null, pack: pc.get(id)?.last ?? null, label: lb.get(id)?.last ?? null },
      packed_by_name: (packer.data as { display_name?: string } | null)?.display_name ?? null,
      history: ((logs.data ?? []) as { action: string; metadata: Record<string, unknown> | null; created_at: string }[]).map((l) => ({
        at: l.created_at, action: l.action, by: (l.metadata?.actor as string | undefined) ?? null,
        status: ((l.metadata?.changes as { field?: string; after?: unknown; new?: unknown }[] | undefined) ?? []).filter((c) => c.field === "status").map((c) => String(c.after ?? c.new ?? ""))[0] || null,
        note: (l.metadata?.source as string | undefined) ?? null,
      })),
    };
    return NextResponse.json({ order: { ...o, platform_code, ...extra }, items: withMedia, error: null });
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
    due: (sp.get("due") ?? "").trim(), invoice: (sp.get("invoice") ?? "").trim(), active: sp.get("active") === "1", booked: sp.get("booked") === "1", unpaid: sp.get("unpaid") === "1", urgent: sp.get("urgent") === "1",
    off: parseOff(sp.get("off") ?? ""),
  };
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const size = Math.min(PAGE_MAX, Math.max(10, Number(sp.get("page_size")) || 50));
  if (demo) return NextResponse.json({ ...demoList(p, page, size), page, page_size: size, demo: true, error: null });

  const admin = supabaseAdmin();
  if (cleanQ(p.q)) p.qIds = await orderIdsByProduct(admin, cleanQ(p.q));   // ค้นชื่อสินค้า/รหัส SKU ด้วย
  p.apiPairs = await apiConnectedPairs(admin);
  const count = (extra: Partial<ListParams>): Promise<number> =>
    applyFilters(admin.from("platform_orders").select("id", { count: "exact", head: true }), { ...p, ...extra })
      .then((r: { count: number | null }) => r.count ?? 0);
  // การ์ด = ทั้งร้าน/ทั้งมุมมอง ไม่ขึ้นกับตัวกรองย่อย (สถานะ/คำค้น/กำหนดส่ง/ใบกำกับ)
  const scope: Partial<ListParams> = { status: "", due: "", invoice: "", q: "", active: false, booked: false, unpaid: false, urgent: false };

  // เรียง: ออเดอร์ล่าสุดก่อน (เจ้าของขอ 2026-11-22) · การ์ด "เลยกำหนดส่ง/ต้องส่งวันนี้" หรือ ?sort=due = ใกล้กำหนดส่งก่อน
  const byDue = sp.get("sort") === "due" || p.due === "late" || p.due === "today";
  let listQ = applyFilters(admin.from("platform_orders").select(LIST_COLS, { count: "exact" }), p);
  listQ = byDue
    ? listQ.order("ship_by_at", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false })
    : listQ.order("ordered_at", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false });
  listQ = listQ.range((page - 1) * size, page * size - 1);
  const [list, byStatus, todo, late, today, invReq, viewTodo, viewHist, booked, brandCards, unpaidN, urgentN] = await Promise.all([
    listQ,
    Promise.all(PLATFORM_ORDER_STATUSES.map((st) => count({ ...scope, status: st }))),
    count({ ...scope, view: "todo", active: true }),
    count({ ...scope, view: "todo", due: "late" }),
    count({ ...scope, view: "todo", due: "today" }),
    count({ ...scope, view: "all", invoice: "requested" }),
    count({ ...scope, view: "todo" }),
    count({ ...scope, view: "history" }),
    count({ ...scope, view: "todo", booked: true }),
    loadBrandCards(admin, { ...p, ...scope, brandId: "", platformId: "", off: [], view: "todo", active: true }).catch(() => []),
    count({ ...scope, view: "todo", unpaid: true }),
    count({ ...scope, view: "todo", urgent: true }),
  ]);
  if (list.error) return NextResponse.json({ error: "โหลดออเดอร์ไม่สำเร็จ กรุณาลองใหม่" }, { status: 500 });
  const by: Record<string, number> = {};
  PLATFORM_ORDER_STATUSES.forEach((st, i) => { by[st] = byStatus[i]; });
  const listRows = ((list.data ?? []) as Record<string, unknown>[]).map(toRow);
  const ids = listRows.map((r) => r.id);
  const [media, pk, pc, lb] = await Promise.all([
    orderItemsWithMedia(admin, ids).catch(() => new Map()),   // คอลัมน์สินค้า — พลาด = แสดงรายการโดยไม่มีสินค้า
    printSummaryOf(admin, "po_pick", ids), printSummaryOf(admin, "po_pack", ids), printSummaryOf(admin, "po_label", ids),   // ป้ายเอกสารใต้เลขออเดอร์
  ]);
  return NextResponse.json({
    orders: listRows.map((r) => ({ ...r, ...productSummary(media.get(r.id) ?? []), docs: { pick: pk.has(r.id), pack: pc.has(r.id) || !!r.packed_at, label: lb.has(r.id) } })),
    total: list.count ?? 0, page, page_size: size,
    summary: { by_status: by, todo, late, today, invoice_requested: invReq, booked, view_total: { todo: viewTodo, history: viewHist }, brand_cards: brandCards, unpaid: unpaidN, urgent: urgentN },
    error: null,
  });
}

/** คู่ แบรนด์×แพลตฟอร์ม ที่ดึงออเดอร์จาก API อยู่ (Shopee/Lazada เชื่อมแล้ว) — ใช้ซ่อนยอดจากเมลของร้านนั้น */
async function apiConnectedPairs(admin: Admin): Promise<{ brand_id: string; platform_id: string }[]> {
  const { data: pf } = await admin.from("erp_platforms").select("id, code").in("code", ["shopee", "lazada"]);
  const ids = ((pf ?? []) as { id: string }[]).map((x) => x.id);
  if (!ids.length) return [];
  const { data } = await admin.from("platform_credentials").select("brand_id, platform_id, meta").in("platform_id", ids);
  return ((data ?? []) as { brand_id: string; platform_id: string; meta: { stage?: string } | null }[])
    .filter((r) => r.meta?.stage === "connected" && UUID_RE.test(r.brand_id)).map((r) => ({ brand_id: r.brand_id, platform_id: r.platform_id }));
}

type BrandCard = PlatformBrandCard;
/**
 * การ์ดแบรนด์ (เจ้าของเลือก 2026-11-22): ต่อแบรนด์ = งานต้องจัดส่ง + วงกลมแพลตฟอร์ม (ร้านที่เปิดบัญชีไว้ + ร้านที่มีงานค้าง)
 * นับจากออเดอร์ "ต้องจัดส่ง" (ไม่ขึ้นกับตัวกรองแบรนด์/วงกลมที่ปิด) · email = ยอดจากเมลที่ยังโชว์ (ร้านที่ยังไม่มี API)
 */
async function loadBrandCards(admin: Admin, p: ListParams): Promise<BrandCard[]> {
  const [{ data: pf }, { data: brands }, { data: accts }, active, emailRows] = await Promise.all([
    admin.from("erp_platforms").select("id, code, is_active"),
    admin.from("brands").select("id, name"),
    admin.from("platform_accounts").select("brand_id, platform_id, is_active"),
    applyFilters(admin.from("platform_orders").select("brand_id, platform_id"), p).limit(5000),
    applyFilters(admin.from("platform_orders").select("brand_id, platform_id"), { ...p, view: "history", active: false }).limit(5000),
  ]);
  const code = new Map(((pf ?? []) as { id: string; code: string; is_active: boolean }[]).map((x) => [x.id, x]));
  const brandName = new Map(((brands ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const SELLING = new Set(["shopee", "lazada", "tiktok", "line_shopping", "website"]);
  const map = new Map<string, Map<string, { todo: number; email: number }>>();   // brand → platform → นับ
  const touch = (b: string | null, pl: string | null) => {
    const bk = b ?? "", pk = pl ?? "phone";
    const m = map.get(bk) ?? map.set(bk, new Map()).get(bk)!;
    return m.get(pk) ?? m.set(pk, { todo: 0, email: 0 }).get(pk)!;
  };
  for (const a of (accts ?? []) as { brand_id: string; platform_id: string; is_active: boolean }[]) {
    const c = code.get(a.platform_id);
    if (a.is_active && c && SELLING.has(c.code)) touch(a.brand_id, a.platform_id);
  }
  for (const r of ((active as { data: unknown }).data ?? []) as { brand_id: string | null; platform_id: string | null }[]) touch(r.brand_id, r.platform_id).todo++;
  for (const r of ((emailRows as { data: unknown }).data ?? []) as { brand_id: string | null; platform_id: string | null }[]) touch(r.brand_id, r.platform_id).email++;
  const ORDER = ["shopee", "lazada", "tiktok", "line_shopping", "website"];
  const rank = (c: string) => { const i = ORDER.indexOf(c); return i < 0 ? 99 : i; };
  return [...map.entries()].map(([b, m]) => {
    const platforms = [...m.entries()].map(([pid, n]) => ({ platform_id: pid === "phone" ? null : pid, code: pid === "phone" ? "phone" : code.get(pid)?.code ?? "other", todo: n.todo, email: n.email }))
      .sort((x, y) => rank(x.code) - rank(y.code) || x.code.localeCompare(y.code));
    return { brand_id: b || null, name: b ? brandName.get(b) ?? "ไม่ทราบแบรนด์" : "ไม่ระบุแบรนด์", todo: platforms.reduce((a, x) => a + x.todo, 0), platforms };
  }).sort((a, b) => b.todo - a.todo || a.name.localeCompare(b.name));
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
      status: "new", total, currency: "THB", ordered_at: now, ship_by_at: manualShipBy(), ship_to: st.value, cod_amount: cod,
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
