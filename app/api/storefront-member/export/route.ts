/**
 * 👤 สมาชิกขอสำเนาข้อมูลของตัวเอง (PDPA · สิทธิ์ขอรับข้อมูล) — /api/storefront-member/export
 * GET → { ok, data: { ข้อมูลบัญชี · ที่อยู่ · ออเดอร์+รายการ · ประวัติแต้ม · รีวิว · สินค้าที่ถูกใจ } } → เว็บร้านให้ดาวน์โหลดเป็นไฟล์ JSON
 * เฉพาะของบัญชีนี้ (รหัสสมาชิกมาจากคุกกี้ที่เซ็นแล้ว) · ไม่ส่งรหัสภายในของผู้ให้บริการเข้าสู่ระบบ/รหัสผ่าน · บันทึกลง audit_logs (ผู้ทำ = สมาชิกเอง)
 * ด่าน: กุญแจภายใน + สมาชิก (lib/storefront-internal guardMember)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { addressFromRow } from "@/lib/website-members";
import { memberSummary } from "@/lib/website-members-db";
import { pointsHistory } from "@/lib/member-points-db";
import { writeAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const ORDER_COLS =
  "id, order_no, status, payment_method, payment_status, customer_name, customer_phone, customer_email, ship_address_line, ship_subdistrict, ship_district, ship_province, ship_postal, subtotal, shipping_fee, discount, coupon_code, points_used, points_earned, grand_total, note, created_at";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const id = g.member.id;

  const [summary, addrRes, ordRes, points, revRes, wishRes] = await Promise.all([
    memberSummary(g.sb, g.member),
    g.sb.from("store_customer_addresses").select("*").eq("customer_id", id).order("created_at"),
    g.sb.from("store_orders").select(ORDER_COLS).eq("customer_id", id).order("created_at", { ascending: false }).limit(1000),
    pointsHistory(g.sb, id, 1000).catch(() => []),
    g.sb.from("store_reviews").select("parent_code, product_name, variant_label, rating, body, status, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(500),
    g.sb.from("store_wishlists").select("parent_sku_id, created_at").eq("customer_id", id).limit(500),
  ]);
  if (ordRes.error) return storefrontJson({ ok: false, error: "รวบรวมข้อมูลไม่สำเร็จ กรุณาลองใหม่" }, 500);

  const orders = (ordRes.data ?? []) as (Record<string, unknown> & { id: string })[];
  const items: Record<string, unknown>[] = [];
  for (let i = 0; i < orders.length; i += 200) {
    const { data } = await g.sb.from("store_order_items").select("order_id, name, variant_label, qty, unit_price, line_total").in("order_id", orders.slice(i, i + 200).map((o) => o.id));
    items.push(...((data ?? []) as Record<string, unknown>[]));
  }
  const wish = (wishRes.data ?? []) as { parent_sku_id: string; created_at: string }[];
  const { data: wishNames } = wish.length ? await g.sb.from("parent_skus_v2").select("id, code, name_th").in("id", wish.map((w) => w.parent_sku_id)) : { data: [] };
  const nameOf = new Map(((wishNames ?? []) as { id: string; code: string; name_th: string | null }[]).map((p) => [p.id, p]));

  await writeAudit(g.sb, {
    action: "export",
    entityType: "store_customer",
    entityId: id,
    actorId: null,
    actorName: `สมาชิกขอสำเนาข้อมูลตัวเอง (${g.shop.slug})`,
    metadata: { shop_id: g.shop.id, orders: orders.length, reason: "member_self_export" },
  });

  return storefrontJson(
    {
      ok: true,
      data: {
        exportedAt: new Date().toISOString(),
        shop: g.shop.slug,
        account: { ...summary, status: g.member.status },
        addresses: ((addrRes.data ?? []) as Record<string, unknown>[]).map(addressFromRow),
        orders: orders.map(({ id: oid, ...o }) => ({ ...o, items: items.filter((it) => it.order_id === oid).map(({ order_id: _x, ...it }) => it) })),
        points,
        reviews: revRes.data ?? [],
        wishlist: wish.map((w) => ({ code: nameOf.get(w.parent_sku_id)?.code ?? null, name: nameOf.get(w.parent_sku_id)?.name_th ?? null, addedAt: w.created_at })),
      },
    },
    200,
  );
}
