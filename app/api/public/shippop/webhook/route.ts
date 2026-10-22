/**
 * 🚚 Shippop แจ้งสถานะพัสดุ (webhook) — POST /api/public/shippop/webhook?k=<SHIPPOP_WEBHOOK_SECRET>
 * ตั้ง URL นี้ในบัญชี Shippop · body (form หรือ JSON): tracking_code, order_status, courier_tracking_code, data[datetime], data[message]
 * Shippop ไม่เซ็นข้อความ → กัน 2 ชั้น: (1) รหัสลับใน URL (2) ถามสถานะซ้ำจาก Shippop เอง (/tracking/) แล้วใช้ค่านั้น
 * ตอบ 200 {"success":1} เสมอเมื่อรหัสถูก (ไม่เจอออเดอร์ก็ 200 — กัน Shippop ส่งซ้ำ 12 รอบ) · ผิด/ไม่ได้ตั้งรหัส = 401/503
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { shippopTrack } from "@/lib/shippop";
import { SHIPPOP_ORDER_SELECT, applyShippopStatus, type ShippopOrderRow } from "@/lib/shippop-db";

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
  const { data } = await sb.from("store_orders").select(SHIPPOP_ORDER_SELECT).eq("shippop->>trackingCode", code).limit(1).maybeSingle();
  const o = data as unknown as ShippopOrderRow | null;
  if (!o?.shippop || o.shippop.mode !== "live") return NextResponse.json({ success: 1 });
  // ถามซ้ำจาก Shippop — ใช้สถานะจริงจากต้นทาง ไม่เชื่อข้อความที่ส่งมาเฉย ๆ
  const real = await shippopTrack(code).catch(() => null);
  const status = real?.status || "";
  if (!status || status === o.shippop.status) return NextResponse.json({ success: 1 });
  const at = /^\d{4}-\d{2}-\d{2}/.test(b.datetime) ? `${b.datetime.replace(" ", "T")}+07:00` : new Date().toISOString();
  await applyShippopStatus(sb, o, status, at, b.message.slice(0, 300) || undefined, "Shippop (webhook)");
  return NextResponse.json({ success: 1 });
}
