/**
 * ไลน์บริษัท รอบ 4 — ดึงงานของ "ร้านที่ผูกไลน์นี้" เท่านั้น (server) · กติกา lib/line-customer-view.ts
 *
 * ทุกครั้งที่เปิด: ตรวจ id_token จาก LINE ใหม่ → หาไลน์นี้ใน line_customer_links (linked + ร้านยังใช้งาน)
 *   → ดึงใบสั่งขายของร้านนั้น (ไม่ยกเลิก · ไม่ถูกรวมเข้าใบอื่น · ส่งแล้วย้อนหลัง 90 วัน)
 *   → ขั้นงานคิดด้วยกติกาเดียวกับหน้าสถานะใบสั่งขาย (soLineProgress + loadMoDispatch + soLineStageMulti)
 *   → ส่งออกเฉพาะช่องที่ลูกค้าเห็นได้ (ไม่มีราคา/ยอดเงิน/ชื่อช่าง) → ลงประวัติการเปิดดู
 * ไม่รับรหัสร้านจากหน้าเว็บเด็ดขาด — ยกเว้นแอดมิน (ไลน์ที่ผูกบัญชี ERP สิทธิ์แอดมิน) เลือก "ดูแทนร้าน" ได้ (as_partner · เจ้าของเลือกข้อ 2.1 · 2026-11-23)
 * ดูบน PC จากหน้าจัดการ LINE: customerPreview (ล็อกอิน ERP + admin.users · ข้อ 2.3)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";
import { APPROVE_CHANNEL_ID } from "@/lib/approval-token";
import { writeAudit } from "@/lib/audit";
import { verifyLineIdToken } from "@/lib/line-employee-portal-db";
import { resolveLineIdentity } from "@/lib/line-identity";
import { loadMoDispatch } from "@/lib/mo-dispatch";
import { soLineProgress } from "@/lib/mo-so-rule";
import { soLineStageMulti, soShipState } from "@/lib/so-order-stage";
import { SKU_COVER_SELECT, coverUrl, resolveSkuCover } from "@/lib/sku-cover";
import {
  buildSchedule, isLineCustomerPage, lineDueOf, orderStageOf, thaiToday,
  type CustomerLine, type CustomerOrder, type LineCustomerGate, type LineCustomerPage, type ScheduleItem,
} from "@/lib/line-customer-view";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;
const t = (v: unknown) => String(v ?? "").trim();
const n = (v: unknown) => Number(v) || 0;
const one = (v: unknown): Row | null => (Array.isArray(v) ? ((v[0] as Row) ?? null) : v && typeof v === "object" ? (v as Row) : null);
const chunks = <T,>(a: T[], size = 200) => Array.from({ length: Math.ceil(a.length / size) }, (_, i) => a.slice(i * size, i * size + size));

/** ร้านที่แอดมินเลือกดูแทนได้ */
export type AdminShopChoice = { id: string; name: string };
type PageData =
  | { gate: "ok"; page: "orders"; shop: string; orders: CustomerOrder[] }
  | { gate: "ok"; page: "schedule"; shop: string; items: ScheduleItem[]; no_date: number; today: string };
/** admin = ไลน์แอดมินที่ดูแทนร้าน (มีช่องเลือกร้าน) */
export type LineCustomerResult = ({ gate: Exclude<LineCustomerGate, "ok"> } | PageData) & { admin?: { shops: AdminShopChoice[]; partner_id: string | null } };

const UUID = /^[0-9a-f-]{36}$/i;

/** ร้านที่มีงาน (ใบสั่งขาย 180 วันล่าสุด ไม่ยกเลิก) + ร้านที่มีคนผูกไลน์ — ใหม่สุดก่อน · ใช้กับช่อง "ดูแทนร้าน" */
export async function adminShopChoices(admin: Admin): Promise<AdminShopChoice[]> {
  const since = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const [so, links] = await Promise.all([
    admin.from("so_orders").select("customer_id,order_date,partners_v2(display_name,code,is_active)")
      .neq("status", "cancelled").is("merged_into_id", null).gte("order_date", since).order("order_date", { ascending: false }).limit(1000),
    admin.from("line_customer_links").select("partner_id,partners_v2(display_name,code,is_active)").in("status", ["linked", "blocked"]).limit(1000),
  ]);
  if (so.error || links.error) throw new Error("โหลดรายชื่อร้านไม่สำเร็จ กรุณาลองใหม่");
  const out = new Map<string, AdminShopChoice>();
  for (const r of [...((so.data ?? []) as Row[]).map((x) => ({ id: t(x.customer_id), p: one(x.partners_v2) })), ...((links.data ?? []) as Row[]).map((x) => ({ id: t(x.partner_id), p: one(x.partners_v2) }))]) {
    if (!r.id || out.has(r.id) || r.p?.is_active === false) continue;
    out.set(r.id, { id: r.id, name: t(r.p?.display_name) || t(r.p?.code) || "ร้านไม่มีชื่อ" });
  }
  return [...out.values()].slice(0, 300);
}

async function pageData(admin: Admin, partnerId: string, shop: string, page: LineCustomerPage): Promise<PageData & { count: number }> {
  const orders = await customerOrders(admin, partnerId);
  const today = thaiToday();
  return page === "orders"
    ? { gate: "ok", page, shop, orders, count: orders.length }
    : { gate: "ok", page, shop, today, ...buildSchedule(orders, today), count: orders.length };
}

async function shopOf(admin: Admin, lineUserId: string): Promise<{ gate: Exclude<LineCustomerGate, "ok"> } | { gate: "ok"; partnerId: string; shop: string; linkId: string }> {
  const { data, error } = await admin.from("line_customer_links")
    .select("id,status,partner_id,partners_v2(display_name,code,is_active)")
    .eq("line_user_id", lineUserId).in("status", ["linked", "blocked", "pending"]).order("created_at", { ascending: false }).limit(5);
  if (error) throw new Error("โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่");
  const rows = (data ?? []) as Row[];
  const live = rows.find((r) => t(r.status) === "linked" || t(r.status) === "blocked");
  if (!live) return { gate: rows.some((r) => t(r.status) === "pending") ? "pending" : "not_linked" };
  const p = one(live.partners_v2);
  if (t(live.status) === "blocked" || p?.is_active === false || !t(live.partner_id)) return { gate: "blocked" };
  return { gate: "ok", partnerId: t(live.partner_id), shop: t(p?.display_name) || t(p?.code), linkId: t(live.id) };
}

/** ใบสั่งขายของร้าน + ขั้นงานต่อรายการ (ไม่มีราคา) */
export async function customerOrders(admin: Admin, partnerId: string): Promise<CustomerOrder[]> {
  const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  const { data: os, error } = await admin.from("so_orders")
    .select("id,order_no,customer_po_no,order_date,due_date,status,shipped_at")
    .eq("customer_id", partnerId).neq("status", "cancelled").is("merged_into_id", null)
    .or(`status.neq.shipped,shipped_at.gte.${since.slice(0, 10)}`)
    .order("order_date", { ascending: false }).limit(60);
  if (error) throw new Error("โหลดงานไม่สำเร็จ กรุณาลองใหม่");
  const orders = (os ?? []) as Row[];
  if (!orders.length) return [];
  const ids = orders.map((o) => t(o.id));

  const lines: Row[] = []; const mos: Row[] = [];
  for (const c of chunks(ids)) {
    const [l, m] = await Promise.all([
      admin.from("so_order_lines").select("id,order_id,line_no,sku,product_name,qty,unit,due_date,mo_id").in("order_id", c).order("line_no"),
      admin.from("manufacturing_orders").select("id,mo_no,product_sku,qty,status,skipped_stages,due_date,so_order_id").in("so_order_id", c).eq("is_active", true),
    ]);
    if (l.error || m.error) throw new Error("โหลดงานไม่สำเร็จ กรุณาลองใหม่");
    lines.push(...((l.data ?? []) as Row[])); mos.push(...((m.data ?? []) as Row[]));
  }
  const shipped = new Map<string, number>();
  for (const c of chunks(mos.map((m) => t(m.id)))) {
    const { data } = await admin.from("mo_sales_links").select("mo_id,qty").in("mo_id", c).not("is_active", "is", false);
    for (const r of (data ?? []) as Row[]) shipped.set(t(r.mo_id), (shipped.get(t(r.mo_id)) ?? 0) + n(r.qty));
  }
  const disp = await loadMoDispatch(admin, mos);
  const moDue = new Map(mos.map((m) => [t(m.mo_no), t(m.due_date) || null]));

  const imgOf = new Map<string, string>();
  const codes = [...new Set(lines.map((l) => t(l.sku)).filter(Boolean))];
  for (const c of chunks(codes)) {
    const { data } = await admin.from("skus_v2").select(`code, is_active, ${SKU_COVER_SELECT}`).in("code", c);
    for (const s of ((data ?? []) as Row[]).sort((a, b) => Number(!!a.is_active) - Number(!!b.is_active))) {
      const url = coverUrl(resolveSkuCover(s).key);
      if (url) imgOf.set(t(s.code), `${url}&w=160`);
    }
  }

  return orders.map((o) => {
    const oid = t(o.id);
    const ls = lines.filter((l) => t(l.order_id) === oid);
    const prog = soLineProgress(
      ls.map((l) => ({ id: t(l.id), sku: t(l.sku) || null, qty: n(l.qty), mo_id: t(l.mo_id) || null })),
      mos.filter((m) => t(m.so_order_id) === oid).map((m) => ({ id: t(m.id), mo_no: t(m.mo_no), product_sku: t(m.product_sku) || null, qty: n(m.qty), status: t(m.status) || null, shipped: shipped.get(t(m.id)) ?? 0 })),
    );
    const orderShipped = t(o.status) === "shipped";
    const outLines: CustomerLine[] = ls.map((l) => {
      const p = prog.byLine[t(l.id)];
      const qty = n(l.qty);
      const sent = p?.shipped ?? 0;
      const stage = soLineStageMulti({
        orderShipped, ordered: qty, shipped: sent,
        mos: (p?.mos ?? []).map((m) => ({ status: m.status, dispatched: !!disp.get(m.mo_no)?.dispatched, submitted: !!disp.get(m.mo_no)?.submitted })),
      });
      return {
        id: t(l.id), product: t(l.product_name) || t(l.sku), sku: t(l.sku) || null, qty, unit: t(l.unit) || "ชิ้น",
        image_url: imgOf.get(t(l.sku)) ?? null, stage, shipped: Math.min(sent, qty), ship: orderShipped ? "full" : soShipState(qty, sent),
        ...lineDueOf(t(l.due_date) || null, t(o.due_date) || null, (p?.mos ?? []).map((m) => moDue.get(m.mo_no) ?? null)),
      };
    });
    return {
      id: oid, order_no: t(o.order_no), customer_po_no: t(o.customer_po_no) || null, order_date: t(o.order_date) || null,
      shipped: orderShipped, stage: orderShipped ? 4 : orderStageOf(outLines), lines: outLines,
    };
  }).sort((a, b) => (a.shipped ? 1 : 0) - (b.shipped ? 1 : 0) || (b.order_date ?? "").localeCompare(a.order_date ?? ""));
}

/** เปิดหน้าเล็กลูกค้า 1 หน้า (POST /api/line-company/customer-view) · as_partner ใช้ได้เฉพาะไลน์แอดมิน */
export async function lineCustomerView(input: { id_token?: unknown; page?: unknown; as_partner?: unknown }): Promise<LineCustomerResult> {
  if (!isLineCustomerPage(input.page)) throw new Error("ไม่รู้จักหน้านี้");
  const page: LineCustomerPage = input.page;
  const profile = await verifyLineIdToken(input.id_token, undefined, APPROVE_CHANNEL_ID);
  const lineUserId = t(profile.sub);
  const admin = supabaseAdmin();

  // แอดมิน: เลือกร้านดูแทนได้ (ไม่ส่งมา = ร้านที่มีงานล่าสุด)
  const ident = await resolveLineIdentity(admin, lineUserId);
  if (ident.who === "admin") {
    const shops = await adminShopChoices(admin);
    const want = t(input.as_partner);
    const pick = shops.find((x) => x.id === want) ?? shops[0] ?? null;
    if (!pick) return { gate: "not_linked", admin: { shops, partner_id: null } };
    const { count, ...data } = await pageData(admin, pick.id, pick.name, page);
    await writeAudit(admin, {
      action: "line_customer_view", entityType: "partners_v2", entityId: pick.id, actorId: ident.userId, actorName: ident.name,
      metadata: { page, line_user_id: lineUserId, admin_preview: true, orders: count },
    });
    return { ...data, admin: { shops, partner_id: pick.id } };
  }

  const who = await shopOf(admin, lineUserId);
  if (who.gate !== "ok") return { gate: who.gate };
  const { count, ...data } = await pageData(admin, who.partnerId, who.shop, page);
  await writeAudit(admin, {
    action: "line_customer_view", entityType: "partners_v2", entityId: who.partnerId, actorName: who.shop,
    metadata: { page, line_user_id: lineUserId, link_id: who.linkId, orders: count },
  });
  return data;
}

/** ดูหน้าลูกค้าบน PC (หน้าจัดการ LINE · ผู้เรียกตรวจสิทธิ์ admin.users แล้ว) — ข้อมูลเดียวกับที่ร้านเห็นในไลน์ */
export async function customerPreview(input: { partner_id: string; page: unknown; actorId: string | null; actorName: string | null }): Promise<LineCustomerResult> {
  if (!isLineCustomerPage(input.page)) throw new Error("ไม่รู้จักหน้านี้");
  if (!UUID.test(input.partner_id)) throw new Error("เลือกร้านก่อน");
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("partners_v2").select("display_name,code,is_active").eq("id", input.partner_id).maybeSingle();
  const pr = p as Row | null;
  if (!pr) throw new Error("ไม่พบร้านนี้");
  const { count, ...data } = await pageData(admin, input.partner_id, t(pr.display_name) || t(pr.code), input.page);
  await writeAudit(admin, {
    action: "line_customer_view", entityType: "partners_v2", entityId: input.partner_id, actorId: input.actorId, actorName: input.actorName,
    metadata: { page: input.page, admin_preview: "pc", orders: count },
  });
  return data;
}
