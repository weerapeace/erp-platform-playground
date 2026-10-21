/**
 * ⭐ ระดับสมาชิกของร้าน (ERP แท็บสมาชิก) — /api/website/members/tiers
 * GET ?shop=<slug> → { tiers, suggested }
 * PUT { shop, tiers: [{ key?, name, minSpend, earnMultiplier, color, discountPct?, freeShipping? }] } → แทนทั้งชุด (ตรวจด้วย sanitizeTiers) + audit
 *   ไม่มีระดับเลย = ไม่โชว์ระดับ (ทุกคนได้แต้มตัวคูณ 1)
 * ด่าน: guardApi (พนักงาน)
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { sanitizeTiers, SUGGESTED_TIERS } from "@/lib/member-points";
import { readTiers } from "@/lib/member-points-db";

export const dynamic = "force-dynamic";

async function shopBySlug(sb: ReturnType<typeof supabaseAdmin>, slug: string) {
  const { data } = await sb.from("shops").select("id, slug").eq("slug", slug).maybeSingle();
  return data as { id: string; slug: string } | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const sb = supabaseAdmin();
  const shop = await shopBySlug(sb, (request.nextUrl.searchParams.get("shop") ?? "").trim());
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  return NextResponse.json({ tiers: await readTiers(sb, shop.id), suggested: SUGGESTED_TIERS }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { shop?: string; tiers?: unknown } | null;
  const sb = supabaseAdmin();
  const shop = await shopBySlug(sb, String(body?.shop ?? "").trim());
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const v = sanitizeTiers(body?.tiers);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const before = await readTiers(sb, shop.id);
  const now = new Date().toISOString();
  const keys = v.tiers.map((t) => t.key);
  if (v.tiers.length) {
    const { error } = await sb.from("store_member_tiers").upsert(
      v.tiers.map((t, i) => ({ shop_id: shop.id, key: t.key, name: t.name, min_spend: t.minSpend, earn_multiplier: t.earnMultiplier, color: t.color, discount_pct: t.discountPct ?? 0, free_shipping: t.freeShipping === true, sort: i, updated_at: now })),
      { onConflict: "shop_id,key" }
    );
    if (error) return NextResponse.json({ error: "บันทึกระดับไม่สำเร็จ" }, { status: 500 });
  }
  // ระดับที่เอาออก (ลบได้เลย — ระดับคิดจากยอดซื้อสดทุกครั้ง ไม่มีใครถูกผูกไว้)
  let del = sb.from("store_member_tiers").delete().eq("shop_id", shop.id);
  if (keys.length) del = del.not("key", "in", `(${keys.map((k) => `"${k}"`).join(",")})`);
  const { error: delErr } = await del;
  if (delErr) return NextResponse.json({ error: "บันทึกระดับไม่สำเร็จ" }, { status: 500 });

  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(sb, {
    action: "update",
    entityType: "store_member_tiers",
    entityId: shop.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { shop: shop.slug, before, after: v.tiers },
  });
  return NextResponse.json({ ok: true, tiers: v.tiers });
}
