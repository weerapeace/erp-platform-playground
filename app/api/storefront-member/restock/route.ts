/**
 * 🔔 "แจ้งฉันเมื่อมีของ" แบบสมาชิก (กดครั้งเดียว ไม่ต้องกรอก) — /api/storefront-member/restock
 * POST { productId | dropId, option?, lang? } → { ok, already? }
 *   เก็บแถว contact_type "member" + customer_id (contact = รหัสสมาชิก) · ระบบส่งทาง LINE ที่เข้าระบบไว้ / อีเมลที่ยืนยันแล้ว
 *   ตอนสินค้ากลับมามีของ / ชุดเปิดขาย (lib/webshop-reminders-db runRestockAlerts · ร้านต้องเปิด restock_auto_enabled)
 * ด่าน: บัตรสมาชิก (guardMember) · ตรวจเป้าหมาย lib/website-restock-db · ฝากซ้ำขณะรอ = ไม่เพิ่มแถว
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";
import { resolveRestockTarget } from "@/lib/website-restock-db";
import { customerLang } from "@/lib/customer-messages";

export const dynamic = "force-dynamic";

/** รอได้พร้อมกันไม่เกินกี่รายการต่อสมาชิก */
const MAX_PENDING = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const body = (await request.json().catch(() => null)) as { productId?: unknown; dropId?: unknown; option?: unknown; lang?: unknown } | null;
  const t = await resolveRestockTarget(g.sb, g.shop.id, body ?? {});
  if (!t.ok) return storefrontJson({ ok: false, error: t.error }, t.status);
  const { count } = await g.sb
    .from("store_restock_requests")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", g.member.id)
    .eq("status", "pending");
  if ((count ?? 0) >= MAX_PENDING) return storefrontJson({ ok: false, error: "ฝากไว้หลายรายการแล้ว เราจะแจ้งเมื่อมีของ" }, 429);
  const option = !t.target.drop_id && typeof body?.option === "string" && body.option.trim() ? body.option.trim().slice(0, 120) : null;
  const { error } = await g.sb.from("store_restock_requests").insert({
    shop_id: g.shop.id,
    ...t.target,
    option_label: option,
    contact_type: "member",
    contact: g.member.id,
    customer_id: g.member.id,
    name: g.member.name?.slice(0, 80) || null,
    lang: customerLang(typeof body?.lang === "string" ? body.lang : undefined),
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") return storefrontJson({ ok: true, already: true }, 200);
    console.error("[member restock] insert", error.message);
    return storefrontJson({ ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, 500);
  }
  return storefrontJson({ ok: true }, 200);
}
