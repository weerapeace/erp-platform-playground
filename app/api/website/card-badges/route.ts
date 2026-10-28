/**
 * 🏷 รายการป้ายบนการ์ดของร้าน — /api/website/card-badges
 *
 * GET ?shop=<slug> | ?shopId=<id>  → { shopId, badges } (ยังไม่เคยตั้ง = ชุดตั้งต้น ขายดี/ใหม่/ลดราคา/Limited)
 * PUT { shopId, badges }           → ทำความสะอาด + บันทึก (store_settings "card_badges") + เปลี่ยนชื่อป้ายในสินค้าที่ใช้อยู่ตาม + audit + ล้างแคชเว็บ
 * ของกลาง: lib/website-card-badges(.ts | -db.ts) · guardWebsite (สิทธิ์เว็บไซต์ · lib/website-access) · writeAudit · purgeStorefrontCache
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { normalizeCardBadges } from "@/lib/website-card-badges";
import { readCardBadges, writeCardBadges } from "@/lib/website-card-badges-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const sb = supabaseAdmin();
  const q = sb.from("shops").select("id, slug");
  const { data: shop } = await (sp.get("shopId") ? q.eq("id", sp.get("shopId")!) : q.eq("slug", (sp.get("shop") ?? "").trim())).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; slug: string };
  return NextResponse.json({ shopId: s.id, badges: await readCardBadges(sb, s.id) });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  let body: { shopId?: string; badges?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId || !Array.isArray(body.badges)) return NextResponse.json({ error: "ต้องระบุ shopId + badges" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, slug").eq("id", body.shopId).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; slug: string };

  const badges = normalizeCardBadges(body.badges);
  const before = await readCardBadges(sb, s.id);
  const r = await writeCardBadges(sb, s.id, badges);
  if (r.error) {
    console.error("[website/card-badges] upsert", r.error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  await writeAudit(sb, {
    action: "update",
    entityType: "shop_card_badges",
    entityId: s.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { shop: s.slug, before, after: badges, renames: r.renames, renamedListings: r.renamed },
  });
  await purgeStorefrontCache(sb, s.id);
  return NextResponse.json({ ok: true, badges, renamed: r.renamed });
}
