/**
 * ออเดอร์จากเว็บร้าน (ฝั่ง ERP) — /api/website/orders (แท็บ "🧾 ออเดอร์")
 *
 * GET   ?shop=<slug>[&status=pending|...|all]  → รายการออเดอร์ของร้าน (ล่าสุด 300) พร้อมรายการสินค้า
 * PATCH { orderId, status?, paymentStatus?, note?, trackingNo?, trackingCarrier? } → เปลี่ยนสถานะ/สถานะจ่าย/โน้ต/🚚 เลขพัสดุ + audit
 *       เปลี่ยนสถานะแล้ว → ✉️ อีเมลแจ้งลูกค้าอัตโนมัติในภาษาที่ลูกค้าสั่ง (ถ้าร้านเปิด · lib/order-notify) → ตอบ notify
 * PATCH { orderId, notify: "<เรื่อง>" } → พนักงานกดส่งอีเมลแจ้งลูกค้าเอง (ไม่ต้องเปิดอัตโนมัติ)
 * PATCH { slipId, slipAction: "approve"|"reject", reason? } → 💳 พนักงานยืนยันรับเงิน / ปฏิเสธสลิป (lib/website-payments-server)
 * PATCH { bulk: { orderIds, status } | { tracking:[{orderId,trackingNo,carrier}], markShipped } } → 📦 ทำทีละหลายใบ (ทีละใบผ่าน applyOne — audit/แต้ม/แจ้งลูกค้าครบ)
 * GET ส่ง counts.toPack (📦 พร้อมแพ็ก — lib/website-fulfillment) + sender (ผู้ส่งบนใบปะหน้า)
 * GET ส่ง slips (สลิปที่ลูกค้าแนบ + ลิงก์ดูรูป 15 นาที) ต่อออเดอร์ + slipAuto (สถานะตรวจอัตโนมัติของร้าน)
 * GET ส่ง messaging (ชื่อร้าน/ลิงก์เว็บ/ข้อความร้าน) + msgItems (ชื่อสินค้าภาษาลูกค้า) ให้ปุ่ม "📋 คัดลอกข้อความถึงลูกค้า"
 *
 * ไม่มีลบ: ออเดอร์เป็นเอกสารที่ลูกค้าถืออยู่ (มีเลขที่) จึงให้ "ยกเลิก" (status=cancelled) แทน
 * ⭐ เปลี่ยนสถานะออเดอร์ของสมาชิก = ปรับแต้มให้อัตโนมัติ (สำเร็จ = ได้แต้ม · ถอย/ยกเลิก = เรียกคืน · ยกเลิก = คืนแต้มที่ใช้) — lib/member-points-db
 * ของกลาง: lib/website-orders.ts · guardApi(products.view/edit) · writeAudit
 */
import { NextRequest, NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { maybeRunWebshopReminders } from "@/lib/webshop-reminders-db";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_METHOD_LABEL, toOrderView, orderStatusLabel, paymentStatusLabel } from "@/lib/website-orders";
import { moveError } from "@/lib/website-order-status";
import { syncOrderPoints } from "@/lib/member-points-db";
import { rewardReferral } from "@/lib/website-referral-db";
import { readSiteInfo } from "@/lib/website-site-info";
import { loadShopSiteUrls } from "@/lib/website-site-url";
import { emailConfigured } from "@/lib/email";
import { ORDER_EVENTS, customerLang, orderEventOf, type OrderEvent } from "@/lib/customer-messages";
import { notifyOrderCustomer, notifyNote, type NotifyResult } from "@/lib/order-notify";
import { cleanCarrier, cleanTrackingNo } from "@/lib/parcel-tracking";
import { slipsForOrders, slipVerifierConfigured, staffDecideSlip } from "@/lib/website-payments-server";
import { AUTO_RESULT, SLIP_REJECT_REASONS, SLIP_STATUS } from "@/lib/website-payments";
import { isReadyToPack } from "@/lib/website-fulfillment";
import { shippopMode } from "@/lib/shippop";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const STATUS_KEYS = new Set(ORDER_STATUSES.map((s) => s.key));
const PAY_KEYS = new Set(PAYMENT_STATUSES.map((s) => s.key));

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const url = new URL(request.url);
  const shopSlug = (url.searchParams.get("shop") ?? "").trim();
  const status = (url.searchParams.get("status") ?? "all").trim();

  const sb = supabaseAdmin();
  const shop = await shopBySlug<{ id: string; name: string; slug: string }>(sb, shopSlug, "id, name, slug");
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; name: string; slug: string };

  let q = sb
    .from("store_orders")
    .select(
      "id, order_no, status, payment_method, payment_status, customer_name, customer_phone, customer_email, ship_address_line, ship_subdistrict, ship_district, ship_province, ship_postal, subtotal, shipping_fee, shipping_method, shipping_method_label, shipping_box, cod_fee, discount, coupon_code, promos, deposit_amount, points_used, points_discount, points_earned, gift_wrap, gift_fee, gift_card_fee, gift_message, gift_hide_price, gift_card, gift_wrap_style, customer_id, grand_total, note, created_at, erp_so_number, lang, tracking_no, tracking_carrier, source, tax_invoice, tax_invoice_no, tax_invoice_at, shippop"
    )
    .eq("shop_id", s.id)
    .order("created_at", { ascending: false })
    .limit(300);
  if (status !== "all" && STATUS_KEYS.has(status as never)) q = q.eq("status", status);
  const { data: orders, error } = await q;
  if (error) return NextResponse.json({ error: "โหลดออเดอร์ไม่สำเร็จ" }, { status: 500 });

  const rows = (orders ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => r.id as string);
  const itemsByOrder = new Map<string, Record<string, unknown>[]>();
  if (ids.length) {
    const { data: items } = await sb
      .from("store_order_items")
      .select("order_id, name, variant_label, name_en, variant_label_en, sku_code, unit_price, qty, line_total, gift, personalize")
      .in("order_id", ids)
      .order("id");
    for (const it of (items ?? []) as Record<string, unknown>[]) {
      const arr = itemsByOrder.get(it.order_id as string) ?? [];
      arr.push(it);
      itemsByOrder.set(it.order_id as string, arr);
    }
  }

  // นับทุกสถานะไว้โชว์ตัวเลขบนตัวกรอง (นับจากทั้งร้าน ไม่ใช่แค่หน้าที่กรอง) · 💳 verifying = รอตรวจเงิน
  const { data: allStatus } = await sb.from("store_orders").select("status, payment_status, payment_method").eq("shop_id", s.id);
  const counts: Record<string, number> = {};
  for (const r of (allStatus ?? []) as { status: string; payment_status: string; payment_method: string }[]) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
    if (r.payment_status === "verifying" && r.status !== "cancelled") counts.verifying = (counts.verifying ?? 0) + 1;
    if (isReadyToPack({ status: r.status, paymentMethod: r.payment_method, paymentStatus: r.payment_status })) counts.toPack = (counts.toPack ?? 0) + 1;
  }
  const slips = await slipsForOrders(sb, ids);

  // 💬 ข้อมูลประกอบข้อความถึงลูกค้า (ปุ่มคัดลอก/ส่งอีเมล ในรายละเอียดออเดอร์)
  const [info, urls] = await Promise.all([readSiteInfo(sb, s.id), loadShopSiteUrls(sb, [s.id])]);
  // 🔔 รอบเตือนตะกร้าค้าง/ของถูกใจลดราคา (ห่างกัน ≥ 30 นาที/ร้าน · lib/webshop-reminders-db)
  after(() => maybeRunWebshopReminders(sb, s.id));

  return NextResponse.json({
    shop: s,
    counts,
    statuses: ORDER_STATUSES,
    paymentStatuses: PAYMENT_STATUSES,
    paymentMethods: PAYMENT_METHOD_LABEL,
    slipMeta: { statuses: SLIP_STATUS, autoResults: AUTO_RESULT, rejectReasons: SLIP_REJECT_REASONS },
    messaging: {
      shopName: s.name,
      siteUrl: urls.get(s.id) ?? null,
      orderNote: { th: info.order_note, en: info.order_note_en || "" },
      contactLine: info.contact_line,
      contactPhone: info.contact_phone,
      autoEmail: info.order_email_enabled,
      emailReady: emailConfigured(),
    },
    /** 📦 ผู้ส่งบนใบปะหน้า (ชื่อร้าน + เบอร์/ที่อยู่จากแท็บข้อมูลร้าน) */
    sender: { name: s.name, phone: info.contact_phone, address: info.contact_address },
    // 🤖 ตรวจสลิปอัตโนมัติ: ร้านเปิดไหม + มีรหัส EasySlip ใน env ไหม (ไม่บอกค่ารหัส)
    slipAuto: { enabled: info.slip_auto_verify, configured: slipVerifierConfigured(), uploadEnabled: info.slip_upload_enabled },
    // 🚚 Shippop: ร้านเปิดไหม · ขนส่งประจำ · โหมด (ยังไม่มี API KEY = จำลอง)
    shippop: { enabled: info.shippop_enabled, courier: info.shippop_courier, mode: shippopMode() },
    orders: rows.map((r) => {
      const items = itemsByOrder.get(r.id as string) ?? [];
      const row = r as unknown as Parameters<typeof toOrderView>[0];
      const lines = items as unknown as Parameters<typeof toOrderView>[1];
      // พนักงานเห็นชื่อไทยเสมอ · ข้อความถึงลูกค้าใช้ชื่อในภาษาที่ลูกค้าสั่ง
      const view = toOrderView(row, lines, info, "th");
      const lang = customerLang(r.lang);
      return {
        id: r.id,
        ...view,
        lang,
        msgItems: lang === "en" ? toOrderView(row, lines, null, "en").items : view.items,
        customerEmail: (r.customer_email as string | null) ?? "",
        erpSoNumber: (r.erp_so_number as string | null) ?? null,
        isMember: !!r.customer_id,
        source: (r.source as string | null) ?? null,
        // 🧾 ขอใบกำกับภาษี + เลขที่ออกแล้ว (null = ยังไม่ออก)
        taxInvoice: (r.tax_invoice as Record<string, unknown> | null) ?? null,
        taxInvoiceNo: (r.tax_invoice_no as string | null) ?? null,
        shippop: (r.shippop as Record<string, unknown> | null) ?? null,
        skuCodes: items.map((i) => i.sku_code).filter(Boolean),
        slips: slips.get(r.id as string) ?? [],
      };
    }),
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { orderId?: string; status?: string; paymentStatus?: string; note?: string; trackingNo?: string; trackingCarrier?: string; notify?: string; cardPrinted?: { orderIds?: unknown; printed?: unknown }; slipId?: string; slipAction?: string; reason?: string; bulk?: { orderIds?: unknown; status?: unknown; tracking?: unknown; markShipped?: unknown } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  // 🎴 ติ๊ก/เอาติ๊ก "พิมพ์การ์ดแล้ว" หลายออเดอร์พร้อมกัน (หน้า /print/gift-cards) — เก็บใน gift_card.printedAt/printedBy
  if (body.cardPrinted) return markCardsPrinted(body.cardPrinted, user?.id ?? null, user?.email ?? null);
  // 💳 ยืนยันรับเงิน / สลิปไม่ถูกต้อง
  if (body.slipId) {
    if (body.slipAction !== "approve" && body.slipAction !== "reject") return NextResponse.json({ error: "คำสั่งไม่ถูกต้อง" }, { status: 400 });
    const r = await staffDecideSlip(supabaseAdmin(), { slipId: body.slipId, action: body.slipAction, reason: body.reason ?? null, actorId: user?.id ?? null, actorName: user?.email ?? null });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true, paymentStatus: r.paymentStatus });
  }
  // 📦 ทำทีละหลายใบ (เปลี่ยนสถานะ / ใส่เลขพัสดุ + จัดส่งแล้ว)
  if (body.bulk) return bulkApply(user, body.bulk);
  if (!body.orderId) return NextResponse.json({ error: "ต้องระบุ orderId" }, { status: 400 });

  // ✉️ พนักงานกดส่งอีเมลแจ้งลูกค้าเอง (ภาษาของลูกค้า) — ไม่ขึ้นกับสวิตช์อัตโนมัติ
  if (body.notify !== undefined) {
    const ev = ORDER_EVENTS.find((e) => e.key === body.notify)?.key;
    if (!ev) return NextResponse.json({ error: "เรื่องที่จะแจ้งไม่ถูกต้อง" }, { status: 400 });
    const r = await notifyOrderCustomer(supabaseAdmin(), body.orderId, ev, { force: true, actorId: user?.id ?? null, actorName: user?.email ?? null });
    if (r.reason === "not-found") return NextResponse.json({ error: "ไม่พบออเดอร์" }, { status: 404 });
    return r.sent ? NextResponse.json({ ok: true, notify: r, message: notifyNote(r) }) : NextResponse.json({ ok: false, notify: r, error: notifyNote(r) });
  }

  const r = await applyOne(supabaseAdmin(), user, body as OnePatch);
  return NextResponse.json(r.json, { status: r.status });
}


/** softShip = มาจาก "ใส่เลขพัสดุ + จัดส่งแล้ว" หลายใบ: ออเดอร์ที่สำเร็จไปแล้ว บันทึกแค่เลขพัสดุ ไม่ย้อนสถานะ */
type OnePatch = { orderId: string; status?: string; paymentStatus?: string; note?: string; trackingNo?: string; trackingCarrier?: string; softShip?: boolean };
type Actor = { id?: string; email?: string } | null;

/** แก้ 1 ออเดอร์ (สถานะ/สถานะจ่าย/โน้ต/เลขพัสดุ) + แต้มสมาชิก + audit + แจ้งลูกค้า — ใช้ทั้ง PATCH ทีละใบและทีละหลายใบ */
async function applyOne(sb: ReturnType<typeof supabaseAdmin>, user: Actor, body: OnePatch): Promise<{ status: number; json: Record<string, unknown> }> {
  const patch: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!STATUS_KEYS.has(body.status as never)) return { status: 400, json: { error: "สถานะไม่ถูกต้อง" } };
    patch.status = body.status;
  }
  if (body.paymentStatus !== undefined) {
    if (!PAY_KEYS.has(body.paymentStatus as never)) return { status: 400, json: { error: "สถานะชำระเงินไม่ถูกต้อง" } };
    patch.payment_status = body.paymentStatus;
  }
  if (body.note !== undefined) patch.note = String(body.note).trim().slice(0, 1000) || null;
  // 🚚 เลขพัสดุ (ว่าง = ลบเลข) — ลูกค้าเห็นในหน้า ติดตามคำสั่งซื้อ / บัญชีสมาชิก / อีเมลจัดส่งแล้ว
  if (body.trackingNo !== undefined) {
    patch.tracking_no = cleanTrackingNo(body.trackingNo) || null;
    patch.tracking_carrier = patch.tracking_no ? cleanCarrier(body.trackingCarrier) || "other" : null;
  }
  if (!Object.keys(patch).length) return { status: 400, json: { error: "ไม่มีอะไรให้แก้" } };

  const { data: before } = await sb
    .from("store_orders")
    .select("id, shop_id, order_no, status, payment_status, note, tracking_no, tracking_carrier")
    .eq("id", body.orderId)
    .maybeSingle();
  if (!before) return { status: 404, json: { error: "ไม่พบออเดอร์" } };
  const b = before as { id: string; shop_id: string; order_no: string; status: string; payment_status: string; note: string | null; tracking_no: string | null; tracking_carrier: string | null };

  // 🔁 เส้นทางสถานะ (lib/website-order-status) — กันข้ามขั้น/ย้อนผิด · เลือกสถานะเดิมซ้ำ = ไม่ต้องเปลี่ยน
  if (patch.status !== undefined) {
    if (patch.status === b.status || (body.softShip && b.status === "completed")) delete patch.status;
    else {
      const err = moveError("status", b.status, String(patch.status), orderStatusLabel);
      if (err) return { status: 400, json: { error: err } };
    }
  }
  if (patch.payment_status !== undefined) {
    if (patch.payment_status === b.payment_status) delete patch.payment_status;
    else {
      const err = moveError("payment", b.payment_status, String(patch.payment_status), paymentStatusLabel);
      if (err) return { status: 400, json: { error: err } };
    }
  }
  if (!Object.keys(patch).length) return { status: 200, json: { ok: true, unchanged: true } };

  // ↩️ เปลี่ยนเป็น "สำเร็จ" = วันที่ลูกค้าได้รับของ (นับวันขอคืน/เปลี่ยน · lib/website-returns returnDeadline)
  if (patch.status === "completed" && b.status !== "completed") patch.completed_at = new Date().toISOString();
  const { error } = await sb.from("store_orders").update(patch).eq("id", b.id);
  if (error) return { status: 500, json: { error: "บันทึกไม่สำเร็จ" } };

  // ⭐ แต้มสมาชิก: ปรับตามสถานะใหม่ (ไม่ใช่สมาชิก = ไม่มีอะไร) · พังไม่ล้มการเปลี่ยนสถานะ แต่บอกพนักงาน
  let points: { kind: string; delta: number }[] | null = [];
  if (patch.status !== undefined && patch.status !== b.status) {
    points = await syncOrderPoints(sb, b.id, `staff:${user?.email ?? user?.id ?? "unknown"}`).then((r) => r?.rows ?? null).catch(() => null);
    // 🎁 ออเดอร์ที่ใช้โค้ดชวนเพื่อน "สำเร็จ" → คนชวนได้แต้ม (ครั้งเดียวต่อออเดอร์ · lib/website-referral-db)
    if (patch.status === "completed") await rewardReferral(sb, b.id, `staff:${user?.email ?? user?.id ?? "unknown"}`).catch((e) => console.error("[orders] referral reward", e));
  }

  await writeAudit(sb, {
    action: patch.status === "cancelled" ? "cancel" : "update",
    entityType: "store_orders",
    entityId: b.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: {
      orderNo: b.order_no,
      shopId: b.shop_id,
      before: { status: b.status, paymentStatus: b.payment_status, note: b.note, trackingNo: b.tracking_no, trackingCarrier: b.tracking_carrier },
      after: patch,
      ...(points?.length ? { points } : {}),
    },
  });

  // ✉️ แจ้งลูกค้าอัตโนมัติ (ภาษาของลูกค้า · ร้านเปิดไว้ + ลูกค้ามีอีเมล) — พังไม่ล้มการเปลี่ยนสถานะ
  let notify: NotifyResult | null = null;
  const ev: OrderEvent | null = orderEventOf(
    { status: b.status, paymentStatus: b.payment_status },
    { status: (patch.status as string | undefined) ?? b.status, paymentStatus: (patch.payment_status as string | undefined) ?? b.payment_status }
  );
  if (ev) notify = await notifyOrderCustomer(sb, b.id, ev, { actorId: user?.id ?? null, actorName: user?.email ?? null }).catch(() => null);
  const notifyMsg = notify && notify.reason !== "off" ? notifyNote(notify) : "";

  if (points === null) return { status: 200, json: { ok: true, notify, notifyMsg, warning: "เปลี่ยนสถานะแล้ว แต่ปรับแต้มสมาชิกไม่สำเร็จ — ลองเปลี่ยนสถานะอีกครั้ง หรือปรับแต้มเองที่แท็บ 👥 สมาชิก" } };
  return { status: 200, json: { ok: true, points, notify, notifyMsg } };
}

/** 📦 ทำหลายออเดอร์ทีละใบผ่าน applyOne (สูงสุด 200 ใบ/ครั้ง) — คืนจำนวนที่สำเร็จ + รายการที่ไม่สำเร็จพร้อมเหตุผล */
async function bulkApply(user: Actor, raw: { orderIds?: unknown; status?: unknown; tracking?: unknown; markShipped?: unknown }): Promise<NextResponse> {
  const sb = supabaseAdmin();
  const results: { orderId: string; ok: boolean; error?: string }[] = [];
  if (Array.isArray(raw.tracking)) {
    for (const t of (raw.tracking as { orderId?: unknown; trackingNo?: unknown; carrier?: unknown }[]).slice(0, 200)) {
      if (typeof t?.orderId !== "string" || !cleanTrackingNo(t.trackingNo)) continue;
      const r = await applyOne(sb, user, { orderId: t.orderId, trackingNo: String(t.trackingNo), trackingCarrier: String(t.carrier ?? ""), ...(raw.markShipped === true ? { status: "shipped", softShip: true } : {}) });
      results.push({ orderId: t.orderId, ok: r.status === 200, error: r.status === 200 ? undefined : String(r.json.error ?? "") });
    }
  } else if (typeof raw.status === "string" && Array.isArray(raw.orderIds)) {
    if (!STATUS_KEYS.has(raw.status as never)) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    for (const id of (raw.orderIds as unknown[]).slice(0, 200)) {
      if (typeof id !== "string") continue;
      const r = await applyOne(sb, user, { orderId: id, status: raw.status });
      results.push({ orderId: id, ok: r.status === 200, error: r.status === 200 ? undefined : String(r.json.error ?? "") });
    }
  } else return NextResponse.json({ error: "ไม่มีอะไรให้ทำ" }, { status: 400 });
  return NextResponse.json({ ok: true, done: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok) });
}

/** 🎴 ติ๊กว่าพิมพ์การ์ดแล้ว (printed=true) หรือเอาติ๊กออก — เฉพาะออเดอร์ที่มีการ์ด · audit ทีละใบ */
async function markCardsPrinted(raw: { orderIds?: unknown; printed?: unknown }, actorId: string | null, actorName: string | null): Promise<NextResponse> {
  const ids = (Array.isArray(raw.orderIds) ? raw.orderIds : []).filter((x): x is string => typeof x === "string").slice(0, 200);
  if (!ids.length) return NextResponse.json({ error: "ต้องระบุออเดอร์" }, { status: 400 });
  const printed = raw.printed !== false;
  const sb = supabaseAdmin();
  const { data } = await sb.from("store_orders").select("id, shop_id, order_no, gift_card").in("id", ids);
  const all = (data ?? []) as { id: string; shop_id: string; order_no: string; gift_card: unknown }[];
  const rows = all.filter((r) => r.gift_card && typeof r.gift_card === "object");
  const itemOrders = new Set<string>();
  const at = new Date().toISOString();
  let done = 0;
  // 🎴 การ์ดรายชิ้น (store_order_items.gift.cardInfo) — ติ๊ก/เอาติ๊กพร้อมการ์ดทั้งออเดอร์
  const { data: its } = await sb.from("store_order_items").select("id, order_id, gift").in("order_id", ids).not("gift", "is", null);
  for (const it of (its ?? []) as { id: string; order_id: string; gift: Record<string, unknown> | null }[]) {
    const ci = it.gift?.cardInfo;
    if (!it.gift || !ci || typeof ci !== "object") continue;
    const gift = { ...it.gift, cardInfo: { ...(ci as Record<string, unknown>), printedAt: printed ? at : null, printedBy: printed ? actorName : null } };
    const { error } = await sb.from("store_order_items").update({ gift }).eq("id", it.id);
    if (!error) {
      done++;
      itemOrders.add(it.order_id);
    }
  }
  // ออเดอร์ที่มีแต่การ์ดรายชิ้น — ลงประวัติด้วย (ออเดอร์ที่มีการ์ดทั้งออเดอร์ลงในรอบข้างล่าง)
  for (const r of all.filter((x) => itemOrders.has(x.id) && !rows.includes(x))) {
    await writeAudit(sb, { action: "update", entityType: "store_orders", entityId: r.id, actorId, actorName, metadata: { orderNo: r.order_no, shopId: r.shop_id, giftCardPrinted: printed, itemCards: true } });
  }
  for (const r of rows) {
    const card = { ...(r.gift_card as Record<string, unknown>), printedAt: printed ? at : null, printedBy: printed ? actorName : null };
    const { error } = await sb.from("store_orders").update({ gift_card: card }).eq("id", r.id);
    if (error) continue;
    done++;
    await writeAudit(sb, {
      action: "update",
      entityType: "store_orders",
      entityId: r.id,
      actorId,
      actorName,
      metadata: { orderNo: r.order_no, shopId: r.shop_id, giftCardPrinted: printed },
    });
  }
  return NextResponse.json({ ok: true, updated: done });
}
