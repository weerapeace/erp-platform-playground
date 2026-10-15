/**
 * ❤️ รายการโปรดของสมาชิก — /api/storefront-member/wishlist
 * GET              → { ok, ids: string[] }  (รหัสสินค้า = parent sku id · ใหม่สุดก่อน)
 * POST { productId } → กดใจ (เฉพาะสินค้าที่เปิดขายในร้านนี้ · ซ้ำ = ไม่เป็นไร · สูงสุด 200 ชิ้น/คน)
 * DELETE ?id=<productId> → เอาออก
 * ด่าน: กุญแจภายใน + สมาชิก
 */
import { NextRequest, NextResponse } from "next/server";
import { guardMember, storefrontJson } from "@/lib/storefront-internal";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ITEMS = 200;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const { data } = await g.sb.from("store_wishlists").select("parent_sku_id").eq("customer_id", g.member.id).order("created_at", { ascending: false }).limit(MAX_ITEMS);
  return storefrontJson({ ok: true, ids: ((data ?? []) as { parent_sku_id: string }[]).map((r) => r.parent_sku_id) }, 200);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const body = (await request.json().catch(() => null)) as { productId?: string } | null;
  const id = String(body?.productId ?? "");
  if (!UUID.test(id)) return storefrontJson({ ok: false, error: "สินค้าไม่ถูกต้อง" }, 400);
  const { data: listing } = await g.sb.from("store_listings").select("parent_sku_id").eq("shop_id", g.shop.id).eq("parent_sku_id", id).eq("is_published", true).maybeSingle();
  if (!listing) return storefrontJson({ ok: false, error: "ไม่พบสินค้านี้ในร้าน" }, 404);
  const { count } = await g.sb.from("store_wishlists").select("id", { count: "exact", head: true }).eq("customer_id", g.member.id);
  if ((count ?? 0) >= MAX_ITEMS) return storefrontJson({ ok: false, error: `รายการโปรดเต็มแล้ว (สูงสุด ${MAX_ITEMS} ชิ้น) — เอาบางชิ้นออกก่อน` }, 400);
  const { error } = await g.sb.from("store_wishlists").insert({ shop_id: g.shop.id, customer_id: g.member.id, parent_sku_id: id });
  if (error && (error as { code?: string }).code !== "23505") return storefrontJson({ ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" }, 500);
  return storefrontJson({ ok: true }, 200);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const g = await guardMember(request);
  if (g instanceof NextResponse) return g;
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return storefrontJson({ ok: false, error: "สินค้าไม่ถูกต้อง" }, 400);
  const { error } = await g.sb.from("store_wishlists").delete().eq("customer_id", g.member.id).eq("parent_sku_id", id);
  if (error) return storefrontJson({ ok: false, error: "เอาออกไม่สำเร็จ กรุณาลองใหม่" }, 500);
  return storefrontJson({ ok: true }, 200);
}
