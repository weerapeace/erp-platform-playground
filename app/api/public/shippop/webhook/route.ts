/**
 * 🚚 Shippop แจ้งสถานะพัสดุ (webhook) — POST /api/public/shippop/webhook?k=<SHIPPOP_WEBHOOK_SECRET>
 * ตั้ง URL นี้ในบัญชี Shippop · body (form หรือ JSON): tracking_code, order_status, courier_tracking_code, data[datetime], data[message]
 * Shippop ไม่เซ็นข้อความ → กัน 2 ชั้น: (1) รหัสลับใน URL (2) ถามสถานะซ้ำจาก Shippop เอง (/tracking/) แล้วใช้ค่านั้น
 * หา 2 ที่: ออเดอร์เว็บร้าน + ออเดอร์ศูนย์ออเดอร์ (เฟส 1 · 2026-11-19)
 * ตอบ 200 {"success":1} เมื่อจัดการแล้ว/ไม่ใช่ของเรา · อ่าน-เขียนฐานข้อมูลหรือถามสถานะไม่ได้ = 503 (SHIPPOP ส่งซ้ำเฉพาะ 5xx) · รหัสผิด = 401 · ไม่ได้ตั้งรหัส = 503
 * "cancel" จาก webhook อาจชั่วคราว (คู่มือ) → จดประวัติแต่ไม่ปลดการจอง (statusFromWebhook)
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { shippopTrack, statusFromWebhook } from "@/lib/shippop";
import { SHIPPOP_ORDER_SELECT, applyShippopStatus, type ShippopOrderRow } from "@/lib/shippop-db";
import { ORDER_SHIPPING_SELECT, applyOrderShippingStatus, type OrderShippingRow } from "@/lib/shipping/order-status-db";

export const dynamic = "force-dynamic";

function keyOk(k: string | null): boolean {
  const secret = process.env.SHIPPOP_WEBHOOK_SECRET ?? "";
  if (!secret || !k) return false;
  const a = Buffer.from(k);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readBody(request: NextRequest): Promise<Record<string, string>> {
  const text = await request.text();
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const d = (j.data ?? {}) as Record<string, unknown>;
    return { tracking_code: String(j.tracking_code ?? ""), order_status: String(j.order_status ?? ""), datetime: String(d.datetime ?? ""), message: String(d.message ?? "") };
  } catch {
    const p = new URLSearchParams(text);
    return { tracking_code: p.get("tracking_code") ?? "", order_status: p.get("order_status") ?? "", datetime: p.get("data[datetime]") ?? "", message: p.get("data[message]") ?? "" };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.SHIPPOP_WEBHOOK_SECRET) return NextResponse.json({ success: 0, error: "webhook not configured" }, { status: 503 });
  if (!keyOk(request.nextUrl.searchParams.get("k"))) return NextResponse.json({ success: 0 }, { status: 401 });
  const b = await readBody(request);
  const code = b.tracking_code.trim().slice(0, 40);
  if (!/^[A-Z0-9]{4,40}$/i.test(code)) return NextResponse.json({ success: 1 });
  const sb = supabaseAdmin();
  // หา 2 ที่: ออเดอร์เว็บร้าน (store_orders.shippop) · ออเดอร์ศูนย์ออเดอร์ (platform_orders.shipping)
  const [st, po] = await Promise.all([
    sb.from("store_orders").select(SHIPPOP_ORDER_SELECT).eq("shippop->>trackingCode", code).limit(1).maybeSingle(),
    sb.from("platform_orders").select(ORDER_SHIPPING_SELECT).eq("shipping->>trackingCode", code).limit(1).maybeSingle(),
  ]);
  if (st.error || po.error) return fail("db read");   // อ่านไม่ได้ = ให้ SHIPPOP ส่งซ้ำ
  const so = st.data as unknown as ShippopOrderRow | null;
  const pr = po.data as unknown as OrderShippingRow | null;
  const cur = so?.shippop?.mode === "live" ? so.shippop.status : pr?.shipping?.mode === "live" ? pr.shipping.status : null;
  if (cur == null) return NextResponse.json({ success: 1 });   // ไม่ใช่การจองจริงของเรา
  // ถามซ้ำจาก Shippop — ใช้สถานะจริงจากต้นทาง ไม่เชื่อข้อความที่ส่งมาเฉย ๆ · ถามไม่ได้ = ให้ส่งซ้ำ
  const real = await shippopTrack(code).catch(() => null);
  if (!real) return fail("tracking unavailable");
  const status = real.status;
  if (!status || status === cur) return NextResponse.json({ success: 1 });
  const at = /^\d{4}-\d{2}-\d{2}/.test(b.datetime) ? `${b.datetime.replace(" ", "T")}+07:00` : new Date().toISOString();
  const note = b.message.slice(0, 300) || undefined;
  if (so?.shippop) {
    const eff = statusFromWebhook(so.shippop.status, status);   // "cancel" จาก webhook อาจชั่วคราว → ไม่ปลดการจอง
    await applyShippopStatus(sb, so, eff.status, at, [note, eff.note].filter(Boolean).join(" · ") || undefined, "Shippop (webhook)");
  } else if (pr) {
    const r = await applyOrderShippingStatus(sb, pr, status, at, note, "Shippop (webhook)", { fromWebhook: true });
    if (!r.ok) return fail("db write");
  }
  return NextResponse.json({ success: 1 });
}

/** ตอบ 5xx = SHIPPOP ส่งซ้ำ (สูงสุด 12 ครั้ง · คู่มือ: ส่งซ้ำเฉพาะ 5xx) */
const fail = (why: string) => NextResponse.json({ success: 0, error: why }, { status: 503 });
