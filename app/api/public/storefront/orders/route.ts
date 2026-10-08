/**
 * API สาธารณะ — รับออเดอร์จากเว็บร้าน : /api/public/storefront/orders
 *
 * POST { shop, items:[{productId, optionId?, option2Id?, qty}], customer:{name,phone,email?},
 *        ship:{addressLine, subdistrict?, district?, province?, postal?}, paymentMethod:"cod"|"promptpay", note? }
 *      → { ok:true, order:{orderNo, grandTotal, promptpay, ...} }
 * GET  ?shop=<slug>&no=<เลขที่>&phone=<เบอร์>  → ลูกค้าตามออเดอร์ของตัวเอง (ต้องรู้ทั้งเลขที่และเบอร์)
 *
 * ⚠️ ไม่มี guardApi โดยเจตนา (ลูกค้าไม่ได้ล็อกอิน) + CORS
 * ปลอดภัยเพราะ: ราคาคิดใหม่ฝั่งเซิร์ฟเวอร์จาก lib/website-orders.ts เสมอ · รับเฉพาะสินค้าที่เผยแพร่ของร้านนั้น
 * · จำกัด 50 รายการ/ออเดอร์ · ไม่คืนข้อมูลลูกค้าคนอื่น
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createStorefrontOrder, findStorefrontOrder } from "@/lib/website-orders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store" } });

async function loadShop(slug: string) {
  const sb = supabaseAdmin();
  const { data } = await sb.from("shops").select("id, slug, status, field_map").eq("slug", slug).maybeSingle();
  const s = data as { id: string; slug: string; status: string; field_map: unknown } | null;
  if (!s || s.status !== "active") return null;
  return { sb, shop: s };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, 400);
  }

  const slug = String(body.shop ?? new URL(request.url).searchParams.get("shop") ?? "").trim();
  if (!slug) return json({ ok: false, error: "ต้องระบุ shop" }, 400);

  const ctx = await loadShop(slug);
  if (!ctx) return json({ ok: false, error: "ไม่พบร้าน" }, 404);

  const result = await createStorefrontOrder(ctx.sb, ctx.shop, body);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  return json({ ok: true, order: result.order }, 201);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const slug = (url.searchParams.get("shop") ?? "").trim();
  const no = (url.searchParams.get("no") ?? "").trim();
  const phone = (url.searchParams.get("phone") ?? "").trim();
  if (!slug) return json({ error: "ต้องระบุ shop" }, 400);
  if (!no || !phone) return json({ error: "ต้องระบุเลขที่ออเดอร์และเบอร์โทร" }, 400);

  const ctx = await loadShop(slug);
  if (!ctx) return json({ error: "ไม่พบร้าน" }, 404);

  const order = await findStorefrontOrder(ctx.sb, ctx.shop.id, no, phone);
  if (!order) return json({ error: "ไม่พบออเดอร์ — ตรวจเลขที่และเบอร์โทรอีกครั้ง" }, 404);
  return json({ order });
}
