/**
 * API สาธารณะ — ลูกค้าลองใส่โค้ดส่วนลดที่หน้าชำระเงิน : /api/public/storefront/coupon
 *
 * POST { shop, code, subtotal, phone? } → { ok:true, code, discount, label } | { ok:false, error }
 *
 * ⚠️ แค่ "ดูผลล่วงหน้า" — ยอดจริงคิดใหม่ตอนสั่ง (lib/website-orders → checkCoupon) ไม่เชื่อ subtotal/discount จากหน้าเว็บ
 * ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS · ไม่คืนข้อมูลคูปองเกินจำเป็น (ไม่บอกจำนวนที่เหลือ/ลูกค้าคนอื่น)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { overLimit } from "@/lib/rate-limit";
import { checkCoupon } from "@/lib/website-coupons-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 🔒 กันยิงรัว (lib/rate-limit · audit 2026-10-21)
  const limited = await overLimit(request, [{ name: "coupon:ip", limit: 20, windowSec: 600 }]);
  if (limited) return json({ ok: false, error: limited }, 429);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400);
  }
  const slug = String(body.shop ?? "").trim();
  if (!slug) return json({ ok: false, error: "ต้องระบุ shop" }, 400);
  const subtotal = Number(body.subtotal);
  if (!(subtotal >= 0) || subtotal > 10_000_000) return json({ ok: false, error: "ยอดสินค้าไม่ถูกต้อง" }, 400);

  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, status").eq("slug", slug).maybeSingle();
  const s = shop as { id: string; status: string } | null;
  if (!s || s.status !== "active") return json({ ok: false, error: "ไม่พบร้าน" }, 404);

  const r = await checkCoupon(sb, s.id, body.code, subtotal, body.phone);
  if (!r.ok) return json({ ok: false, error: r.error });
  return json({ ok: true, code: r.coupon?.code ?? "", discount: r.discount, label: r.label });
}
