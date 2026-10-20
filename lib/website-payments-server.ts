/**
 * 💳 ของกลาง (ฝั่งเซิร์ฟเวอร์เท่านั้น) — รับสลิปโอนจากลูกค้า · ตรวจอัตโนมัติ (EasySlip) · พนักงานยืนยัน/ปฏิเสธ
 *
 * กติกา/ป้ายภาษาคน/ตัดสินผล (pure) = lib/website-payments.ts
 * ไฟล์สลิป = Supabase Storage bucket "payment-slips" (private) → พนักงานดูผ่านลิงก์ชั่วคราว (signed URL 15 นาที)
 * บันทึก = ตาราง store_payments (1 แถว / 1 สลิป) · ออเดอร์ = store_orders.payment_status (unpaid → verifying → paid)
 * ทุกการเปลี่ยนสถานะเขียน audit_logs (entity store_orders)
 *
 * ⚙️ ตรวจอัตโนมัติ: ร้านติ๊ก "🤖 ตรวจสลิปอัตโนมัติ" (store_settings.slip_auto_verify) + มี env EASYSLIP_API_KEY
 *    ไม่ครบ = ข้ามไปให้พนักงานตรวจเอง (ระบบยังรับสลิปได้ปกติ)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { writeAudit } from "@/lib/audit";
import { notifyOrderCustomer } from "@/lib/order-notify";
import {
  AUTO_RESULT,
  SLIP_BUCKET,
  SLIP_MAX_BYTES,
  SLIP_MAX_PER_ORDER,
  SLIP_REJECT_REASONS,
  decideSlip,
  parseEasySlip,
  sniffImage,
  type AutoResult,
  type SlipCheck,
  type SlipStatus,
} from "@/lib/website-payments";

type Admin = ReturnType<typeof supabaseAdmin>;

const EASYSLIP_URL = "https://api.easyslip.com/v2/verify/bank";
const AUTO_ACTOR = "ระบบตรวจสลิปอัตโนมัติ (EasySlip)";
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** มีรหัส EasySlip ใน env ไหม (ไม่บอกค่า) */
export const slipVerifierConfigured = (): boolean => !!process.env.EASYSLIP_API_KEY?.trim();

/** ส่งรูปสลิปไปให้ EasySlip ตรวจ — เทียบยอด + บัญชีผู้รับที่ลงทะเบียนไว้ + สลิปซ้ำ · ล่ม/ช้าเกิน 15 วิ = failure "error" */
async function checkWithEasySlip(bytes: Uint8Array, mime: string, expectedAmount: number, remark: string): Promise<SlipCheck> {
  const key = process.env.EASYSLIP_API_KEY?.trim();
  if (!key) return { ok: false, failure: "off" };
  const form = new FormData();
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  form.append("image", new Blob([bytes as BlobPart], { type: mime }), `slip.${ext}`);
  form.append("matchAmount", String(Math.round(expectedAmount * 100) / 100));
  form.append("matchAccount", "true");
  form.append("checkDuplicate", "true");
  form.append("remark", remark.slice(0, 255));
  try {
    const res = await fetch(EASYSLIP_URL, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(15000) });
    const body = await res.json().catch(() => null);
    return parseEasySlip(res.status, body);
  } catch (e) {
    return { ok: false, failure: "error", code: "FETCH_FAILED", message: String((e as Error)?.message ?? e).slice(0, 200) };
  }
}

type OrderLite = {
  id: string;
  shop_id: string;
  order_no: string;
  status: string;
  payment_method: string;
  payment_status: string;
  customer_phone: string;
  grand_total: number | string;
};

export type SubmitSlipResult =
  | { ok: true; paymentStatus: "paid" | "verifying"; result: AutoResult; message: { th: string; en: string } }
  | { ok: false; status: number; error: string; errorEn: string };

const fail = (status: number, error: string, errorEn: string): SubmitSlipResult => ({ ok: false, status, error, errorEn });

/**
 * ลูกค้าแนบสลิป (API สาธารณะ) — ต้องรู้ทั้งเลขที่ออเดอร์และเบอร์โทร (เทียบ 9 หลักท้าย) เหมือนหน้าติดตามออเดอร์
 * ผ่านตรวจอัตโนมัติ = ออเดอร์ "ชำระแล้ว" ทันที · อย่างอื่น = "แจ้งโอนแล้ว · รอตรวจ" เข้าคิวพนักงาน
 */
export async function submitSlip(
  sb: Admin,
  args: { shopId: string; orderNo: string; phone: string; file: File; uploadEnabled: boolean; autoVerify: boolean },
): Promise<SubmitSlipResult> {
  if (!args.uploadEnabled) return fail(403, "ร้านนี้ยังไม่เปิดให้แนบสลิปบนเว็บ — ส่งสลิปทางช่องทางติดต่อของร้าน", "This shop doesn't accept slip uploads on the website yet — please send your slip via the shop's contact channel.");
  const no = String(args.orderNo ?? "").trim().toUpperCase().slice(0, 40);
  const ph = digits(args.phone);
  if (!no || ph.length < 9) return fail(400, "ต้องระบุเลขที่ออเดอร์และเบอร์โทร", "Order number and phone are required.");

  const { data: o } = await sb
    .from("store_orders")
    .select("id, shop_id, order_no, status, payment_method, payment_status, customer_phone, grand_total")
    .eq("shop_id", args.shopId)
    .eq("order_no", no)
    .maybeSingle();
  const order = o as OrderLite | null;
  if (!order || digits(order.customer_phone).slice(-9) !== ph.slice(-9)) return fail(404, "ไม่พบออเดอร์ — ตรวจเลขที่และเบอร์โทรอีกครั้ง", "Order not found — please check the order number and phone.");
  if (order.status === "cancelled") return fail(409, "ออเดอร์นี้ถูกยกเลิกแล้ว", "This order was cancelled.");
  if (order.payment_method !== "promptpay") return fail(400, "ออเดอร์นี้เลือกเก็บเงินปลายทาง ไม่ต้องแนบสลิป", "This order is cash on delivery — no slip needed.");
  if (order.payment_status === "paid" || order.payment_status === "refunded") return fail(409, "ออเดอร์นี้ได้รับชำระเงินแล้ว", "This order is already paid.");

  const { count } = await sb.from("store_payments").select("id", { count: "exact", head: true }).eq("order_id", order.id);
  if ((count ?? 0) >= SLIP_MAX_PER_ORDER) return fail(429, "แนบสลิปครบจำนวนแล้ว — กรุณาติดต่อร้าน", "Too many slips for this order — please contact the shop.");

  const bytes = new Uint8Array(await args.file.arrayBuffer());
  if (!bytes.length) return fail(400, "ไม่พบไฟล์สลิป", "No slip file received.");
  if (bytes.length > SLIP_MAX_BYTES) return fail(413, "รูปใหญ่เกิน 4MB — ลองถ่ายใหม่หรือแคปหน้าจอสลิป", "The image is over 4MB — try a screenshot of the slip instead.");
  const mime = sniffImage(bytes);
  if (!mime) return fail(415, "ไฟล์ต้องเป็นรูป JPG / PNG / WEBP", "The file must be a JPG, PNG or WEBP image.");

  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `${order.shop_id}/${order.order_no}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const up = await sb.storage.from(SLIP_BUCKET).upload(path, bytes, { contentType: mime, upsert: false });
  if (up.error) {
    console.error("[slip] upload", up.error.message);
    return fail(500, "อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่", "Couldn't upload the slip. Please try again.");
  }

  const total = Number(order.grand_total) || 0;
  const now = new Date().toISOString();
  const { data: ins, error: insErr } = await sb
    .from("store_payments")
    .insert({ order_id: order.id, shop_id: order.shop_id, method: "promptpay", amount: total, status: "pending", slip_path: path, slip_uploaded_at: now, slip_mime: mime, slip_size: bytes.length })
    .select("id")
    .single();
  if (insErr || !ins) {
    console.error("[slip] insert", insErr?.message);
    await sb.storage.from(SLIP_BUCKET).remove([path]).catch(() => undefined);
    return fail(500, "บันทึกสลิปไม่สำเร็จ กรุณาลองใหม่", "Couldn't save the slip. Please try again.");
  }
  const slipId = (ins as { id: string }).id;

  // 🤖 ตรวจอัตโนมัติ (ร้านเปิด + มีรหัส) — ไม่งั้น off = พนักงานตรวจเอง
  const check: SlipCheck = args.autoVerify && slipVerifierConfigured() ? await checkWithEasySlip(bytes, mime, total, order.order_no) : { ok: false, failure: "off" };
  let usedElsewhere = false;
  let seenOnThisOrder = false;
  if (check.ok && check.transRef) {
    const { data: same } = await sb.from("store_payments").select("id, order_id").eq("trans_ref", check.transRef).neq("status", "rejected").neq("id", slipId);
    for (const r of (same ?? []) as { order_id: string }[]) {
      if (r.order_id === order.id) seenOnThisOrder = true;
      else usedElsewhere = true;
    }
  }
  const decision = decideSlip(check, total, { usedElsewhere, seenOnThisOrder });
  const passed = decision.result === "passed";
  const slipDate = check.date && !Number.isNaN(new Date(check.date).getTime()) ? new Date(check.date).toISOString() : null;

  await sb
    .from("store_payments")
    .update({
      auto_result: decision.result,
      auto_note: decision.note || null,
      auto_raw: check.failure === "off" ? null : { ...check },
      trans_ref: check.transRef ?? null,
      slip_amount: check.amount ?? null,
      slip_date: slipDate,
      slip_sender: check.sender ?? null,
      slip_receiver: check.receiver ?? null,
      ...(passed ? { status: "verified" as SlipStatus, verified_at: now, verified_by: "auto:easyslip", verified_by_name: AUTO_ACTOR } : {}),
    })
    .eq("id", slipId);

  const nextPay = passed ? "paid" : "verifying";
  if (order.payment_status !== nextPay) await sb.from("store_orders").update({ payment_status: nextPay }).eq("id", order.id);

  await writeAudit(sb, {
    action: "update",
    entityType: "store_orders",
    entityId: order.id,
    actorId: null,
    actorName: passed ? AUTO_ACTOR : "ลูกค้า (แนบสลิปบนเว็บ)",
    metadata: {
      orderNo: order.order_no,
      shopId: order.shop_id,
      slip: { id: slipId, autoResult: decision.result, note: decision.note || undefined, slipAmount: check.amount ?? undefined },
      before: { paymentStatus: order.payment_status },
      after: { payment_status: nextPay },
    },
  });

  // ✉️ ผ่านอัตโนมัติ = แจ้งลูกค้า "ได้รับชำระเงินแล้ว" (ตามสวิตช์อีเมลอัตโนมัติของร้าน)
  if (passed) await notifyOrderCustomer(sb, order.id, "paid", { actorName: AUTO_ACTOR }).catch(() => null);

  return { ok: true, paymentStatus: nextPay, result: decision.result, message: AUTO_RESULT[decision.result].customer };
}

/** 🧾 สลิปของหลายออเดอร์ (แท็บออเดอร์ ERP) + ลิงก์ดูรูปชั่วคราว 15 นาที */
export type SlipRow = {
  id: string;
  orderId: string;
  status: SlipStatus;
  autoResult: AutoResult | null;
  autoNote: string | null;
  transRef: string | null;
  slipAmount: number | null;
  slipDate: string | null;
  sender: string | null;
  receiver: string | null;
  uploadedAt: string | null;
  rejectReason: string | null;
  verifiedByName: string | null;
  verifiedAt: string | null;
  url: string | null;
};

export async function slipsForOrders(sb: Admin, orderIds: string[]): Promise<Map<string, SlipRow[]>> {
  const out = new Map<string, SlipRow[]>();
  if (!orderIds.length) return out;
  const { data } = await sb
    .from("store_payments")
    .select("id, order_id, status, auto_result, auto_note, trans_ref, slip_amount, slip_date, slip_sender, slip_receiver, slip_uploaded_at, reject_reason, verified_by_name, verified_at, slip_path")
    .in("order_id", orderIds)
    .not("slip_path", "is", null)
    .order("slip_uploaded_at", { ascending: false });
  const rows = (data ?? []) as Record<string, unknown>[];
  const paths = rows.map((r) => String(r.slip_path));
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await sb.storage.from(SLIP_BUCKET).createSignedUrls(paths, 900);
    for (const s of (signed ?? []) as { path: string | null; signedUrl: string | null }[]) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  for (const r of rows) {
    const oid = String(r.order_id);
    const list = out.get(oid) ?? [];
    list.push({
      id: String(r.id),
      orderId: oid,
      status: (r.status as SlipStatus) ?? "pending",
      autoResult: (r.auto_result as AutoResult | null) ?? null,
      autoNote: (r.auto_note as string | null) ?? null,
      transRef: (r.trans_ref as string | null) ?? null,
      slipAmount: r.slip_amount == null ? null : Number(r.slip_amount),
      slipDate: (r.slip_date as string | null) ?? null,
      sender: (r.slip_sender as string | null) ?? null,
      receiver: (r.slip_receiver as string | null) ?? null,
      uploadedAt: (r.slip_uploaded_at as string | null) ?? null,
      rejectReason: (r.reject_reason as string | null) ?? null,
      verifiedByName: (r.verified_by_name as string | null) ?? null,
      verifiedAt: (r.verified_at as string | null) ?? null,
      url: urls.get(String(r.slip_path)) ?? null,
    });
    out.set(oid, list);
  }
  return out;
}

/**
 * 👤 พนักงานตัดสินสลิป (แท็บออเดอร์ ERP)
 *   approve = ยืนยันรับเงิน → สลิป verified + ออเดอร์ "ชำระแล้ว" (+ อีเมลแจ้งลูกค้าตามสวิตช์ร้าน)
 *   reject  = สลิปไม่ถูกต้อง (ต้องเลือกเหตุผล) → ถ้าไม่มีสลิปอื่นรอตรวจ ออเดอร์กลับเป็น "ยังไม่ชำระ" ให้ลูกค้าแนบใหม่ได้
 */
export async function staffDecideSlip(
  sb: Admin,
  args: { slipId: string; action: "approve" | "reject"; reason?: string | null; actorId: string | null; actorName: string | null },
): Promise<{ ok: true; paymentStatus: string } | { ok: false; status: number; error: string }> {
  const { data: s } = await sb.from("store_payments").select("id, order_id, status").eq("id", args.slipId).maybeSingle();
  const slip = s as { id: string; order_id: string; status: string } | null;
  if (!slip) return { ok: false, status: 404, error: "ไม่พบสลิป" };
  const { data: o } = await sb.from("store_orders").select("id, shop_id, order_no, payment_status").eq("id", slip.order_id).maybeSingle();
  const order = o as { id: string; shop_id: string; order_no: string; payment_status: string } | null;
  if (!order) return { ok: false, status: 404, error: "ไม่พบออเดอร์ของสลิปนี้" };
  const now = new Date().toISOString();

  let nextPay = order.payment_status;
  if (args.action === "approve") {
    await sb.from("store_payments").update({ status: "verified", verified_at: now, verified_by: args.actorId ?? args.actorName, verified_by_name: args.actorName, reject_reason: null }).eq("id", slip.id);
    if (order.payment_status !== "refunded") nextPay = "paid";
  } else {
    const reason = SLIP_REJECT_REASONS.some((r) => r.key === args.reason) ? args.reason! : null;
    if (!reason) return { ok: false, status: 400, error: "เลือกเหตุผลที่สลิปไม่ถูกต้องก่อน (ลูกค้าจะเห็นข้อความนี้)" };
    await sb.from("store_payments").update({ status: "rejected", reject_reason: reason, verified_at: now, verified_by: args.actorId ?? args.actorName, verified_by_name: args.actorName }).eq("id", slip.id);
    const { count } = await sb.from("store_payments").select("id", { count: "exact", head: true }).eq("order_id", order.id).eq("status", "pending");
    if (order.payment_status === "verifying" && !(count ?? 0)) nextPay = "unpaid";
  }
  if (nextPay !== order.payment_status) await sb.from("store_orders").update({ payment_status: nextPay }).eq("id", order.id);

  await writeAudit(sb, {
    action: args.action === "approve" ? "approve" : "reject",
    entityType: "store_orders",
    entityId: order.id,
    actorId: args.actorId,
    actorName: args.actorName,
    metadata: {
      orderNo: order.order_no,
      shopId: order.shop_id,
      slip: { id: slip.id, action: args.action, reason: args.reason ?? undefined, before: slip.status },
      before: { paymentStatus: order.payment_status },
      after: { payment_status: nextPay },
    },
  });
  if (args.action === "approve" && order.payment_status !== "paid" && nextPay === "paid") {
    await notifyOrderCustomer(sb, order.id, "paid", { actorId: args.actorId, actorName: args.actorName }).catch(() => null);
  }
  return { ok: true, paymentStatus: nextPay };
}
