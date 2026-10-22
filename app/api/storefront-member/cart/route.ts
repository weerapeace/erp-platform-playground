/**
 * 🛒 ตะกร้าของสมาชิก (ไว้เตือนลืมของ · ชุด 5) — /api/storefront-member/cart
 * PUT { items: [{ code, name, variant, qty, price, slug }], lang } → บันทึก/แทนที่ (ว่าง = ลบ) · ร้านปิดเตือนตะกร้า = ไม่เก็บ
 * เว็บร้านส่งมาเมื่อของในตะกร้าเปลี่ยน (หน่วงไว้) · ไม่ใช่ที่เก็บตะกร้าจริง (ตะกร้าจริงอยู่ในเครื่องลูกค้า)
 * ด่าน: กุญแจภายใน + สมาชิก (lib/storefront-internal guardMember)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { readSiteInfo } from "@/lib/website-site-info";
import { cleanCartItems } from "@/lib/webshop-reminders";
import { customerLang } from "@/lib/customer-messages";

export const dynamic = "force-dynamic";

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const info = await readSiteInfo(g.sb, g.shop.id);
  if (!info.cart_reminder_enabled) return storefrontJson({ ok: true, skipped: true }, 200);
  const body = (await request.json().catch(() => null)) as { items?: unknown; lang?: unknown } | null;
  const items = cleanCartItems(body?.items);
  const lang = customerLang(body?.lang);
  if (!items.length) {
    await g.sb.from("store_member_carts").delete().eq("customer_id", g.member.id);
    return storefrontJson({ ok: true }, 200);
  }
  const total = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  const { error } = await g.sb
    .from("store_member_carts")
    .upsert({ customer_id: g.member.id, shop_id: g.shop.id, items, total, item_count: items.reduce((s, i) => s + i.qty, 0), lang, updated_at: new Date().toISOString() }, { onConflict: "customer_id" });
  return storefrontJson({ ok: !error }, error ? 500 : 200);
}
