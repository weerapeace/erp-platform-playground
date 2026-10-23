/**
 * 🎴 ตั้งค่าการ์ดของขวัญของร้าน — /api/website/gift-cards
 *
 * GET ?shop=<slug>          → { shop, config }  (ยังไม่เคยตั้ง = ค่าเริ่มต้น: การ์ดเรียบ 1 ลาย + โอกาส 4 แบบ)
 * PUT { shopId, config }    → ทำความสะอาด (normalizeGiftCards) แล้วบันทึกลง store_settings "gift_cards" + audit + ล้างแคชเว็บร้าน
 *
 * ของกลาง: lib/website-gift-cards(.ts | -db.ts) · guardApi(products.view/edit) · writeAudit · purgeStorefrontCache
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { normalizeGiftCards } from "@/lib/website-gift-cards";
import { readGiftCards, writeGiftCards } from "@/lib/website-gift-cards-db";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const slug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const shop = await shopBySlug<{ id: string; name: string; slug: string }>(sb, slug, "id, name, slug");
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; name: string; slug: string };
  return NextResponse.json({ shop: s, config: await readGiftCards(sb, s.id) });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; config?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });

  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, slug").eq("id", body.shopId).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; slug: string };

  const config = normalizeGiftCards(body.config);
  if (!config.designs.some((d) => d.enabled)) return NextResponse.json({ error: "ต้องเปิดลายการ์ดอย่างน้อย 1 ลาย" }, { status: 400 });

  const before = await readGiftCards(sb, s.id);
  const { error } = await writeGiftCards(sb, s.id, config);
  if (error) {
    console.error("[website/gift-cards] upsert", error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  await writeAudit(sb, {
    action: "update",
    entityType: "shop_gift_cards",
    entityId: s.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { shop: s.slug, before, after: config },
  });
  const purged = await purgeStorefrontCache(sb, s.id);
  return NextResponse.json({ ok: true, config, purged });
}
