/**
 * 👤 ออเดอร์ของสมาชิก — /api/storefront-member/orders
 * GET  → { ok, orders: OrderView[] } (ผูกกับบัญชี + ออเดอร์เก่าที่อีเมลตรงกับอีเมลที่ยืนยันแล้ว)
 * POST { orderNo, phone } → ผูกออเดอร์เก่าเข้าบัญชี (ต้องรู้ทั้งเลขที่และเบอร์ เหมือนหน้าตามออเดอร์ · ออเดอร์ที่ผูกคนอื่นแล้วผูกไม่ได้)
 * ด่าน: กุญแจภายใน + สมาชิก
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { memberOrderRows } from "@/lib/website-members-db";
import { toOrderView, type ItemRow, type OrderRow } from "@/lib/website-orders";
import { readSiteInfo } from "@/lib/website-site-info";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const rows = await memberOrderRows<OrderRow & { customer_id: string | null; customer_email: string | null }>(g.sb, g.shop.id, g.member, "*");
  if (!rows.length) return storefrontJson({ ok: true, orders: [] }, 200);
  const [{ data: items }, info] = await Promise.all([
    g.sb.from("store_order_items").select("order_id, name, variant_label, unit_price, qty, line_total").in("order_id", rows.map((r) => r.id)).order("id"),
    readSiteInfo(g.sb, g.shop.id),
  ]);
  const byOrder = new Map<string, ItemRow[]>();
  for (const it of (items ?? []) as (ItemRow & { order_id: string })[]) byOrder.set(it.order_id, [...(byOrder.get(it.order_id) ?? []), it]);
  return storefrontJson({ ok: true, orders: rows.map((r) => toOrderView(r, byOrder.get(r.id) ?? [], info)) }, 200);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const body = (await request.json().catch(() => null)) as { orderNo?: string; phone?: string } | null;
  const no = String(body?.orderNo ?? "").trim().toUpperCase().slice(0, 40);
  const phone = String(body?.phone ?? "").replace(/\D/g, "");
  if (!no || phone.length < 9) return storefrontJson({ ok: false, error: "กรอกเลขที่ออเดอร์และเบอร์โทรที่ใช้สั่ง" }, 400);
  const { data } = await g.sb.from("store_orders").select("id, customer_phone, customer_id").eq("shop_id", g.shop.id).eq("order_no", no).maybeSingle();
  const o = data as { id: string; customer_phone: string; customer_id: string | null } | null;
  // ไม่บอกว่าผิดตรงไหน (เลขที่หรือเบอร์) — กันไล่เดาออเดอร์คนอื่น
  if (!o || String(o.customer_phone ?? "").replace(/\D/g, "").slice(-9) !== phone.slice(-9)) return storefrontJson({ ok: false, error: "ไม่พบออเดอร์ — ตรวจเลขที่และเบอร์โทรอีกครั้ง" }, 404);
  if (o.customer_id === g.member.id) return storefrontJson({ ok: true, already: true }, 200);
  if (o.customer_id) return storefrontJson({ ok: false, error: "ออเดอร์นี้อยู่ในบัญชีอื่นแล้ว" }, 409);
  const { error } = await g.sb.from("store_orders").update({ customer_id: g.member.id }).eq("id", o.id).is("customer_id", null);
  if (error) return storefrontJson({ ok: false, error: "ผูกออเดอร์ไม่สำเร็จ" }, 500);
  return storefrontJson({ ok: true }, 200);
}
