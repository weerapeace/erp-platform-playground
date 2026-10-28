/**
 * ข้อมูลร้านของเว็บร้านออนไลน์ — /api/website/settings (แท็บ "🏪 ข้อมูลร้าน")
 *
 * GET ?shop=<slug>           → ค่าปัจจุบัน + นิยามฟิลด์ (label/hint/กลุ่ม) ให้หน้าจอวาดฟอร์มเอง
 * PUT { shopId, info:{...} } → บันทึก (upsert ลง store_settings) + audit
 * PUT { shopId, patch:{...} } → แก้เฉพาะบางช่อง (ช่องอื่นคงเดิม) — ใช้โดยป๊อป 🌐 โซเชียล (components/website-social-links.tsx)
 *
 * ของกลาง: lib/website-site-info.ts · guardWebsite (สิทธิ์เว็บไซต์ · lib/website-access) · writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { pointsSettingsProblem } from "@/lib/member-points";
import {
  SITE_INFO_FIELDS,
  SITE_INFO_GROUPS,
  normalizeSiteInfo,
  readSiteInfo,
  siteInfoToRows,
  orderPrefixFor,
  maskSiteInfoSecrets,
  restoreMaskedSecrets,
  SITE_INFO_SECRET_KEYS,
} from "@/lib/website-site-info";
import { loadShopSiteUrls } from "@/lib/website-site-url";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;

  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const shop = await shopBySlug<{ id: string; name: string; slug: string }>(sb, shopSlug, "id, name, slug");
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; name: string; slug: string };

  const info = await readSiteInfo(sb, s.id);
  // ที่อยู่เว็บจริงของร้าน (โชว์ลิงก์ฟีดสินค้าในกลุ่ม 📊 วัดผล & โฆษณา)
  const siteUrl = (await loadShopSiteUrls(sb, [s.id])).get(s.id) ?? null;
  return NextResponse.json({
    shop: s,
    // 🔒 ช่องความลับ (โทเค็น) = mask — หน้าจอไม่เห็นของจริง · ส่ง mask กลับมา = คงค่าเดิม
    info: maskSiteInfoSecrets(info),
    /** ตัวย่อที่ระบบจะใช้จริงถ้าช่อง order_prefix เว้นว่าง */
    effectiveOrderPrefix: orderPrefixFor(info, s.slug),
    fields: SITE_INFO_FIELDS,
    groups: SITE_INFO_GROUPS,
    siteUrl,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  // info = ทั้งชุด (แท็บข้อมูลร้าน) · patch = แก้เฉพาะบางช่อง (เช่น ป๊อป 🌐 โซเชียลในหน้าดีไซน์) — ช่องอื่นคงค่าเดิม
  let body: { shopId?: string; info?: unknown; patch?: unknown };
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

  const before = await readSiteInfo(sb, s.id);
  const patch = body.patch && typeof body.patch === "object" && !Array.isArray(body.patch) ? (body.patch as Record<string, unknown>) : null;
  const raw = patch ? { ...before, ...patch } : body.info && typeof body.info === "object" ? (body.info as Record<string, unknown>) : {};
  const info = normalizeSiteInfo(restoreMaskedSecrets(raw, before as unknown as Record<string, unknown>));
  // patch ที่ไม่แตะป๊อปอัป ไม่ต้องตรวจคูปองซ้ำ (กันบันทึกโซเชียลไม่ได้เพราะคูปองเก่ามีปัญหา)
  if (info.promo_enabled && (!patch || Object.keys(patch).some((k) => k.startsWith("promo_")))) {
    if (!info.promo_code) return NextResponse.json({ error: "เปิดป๊อปอัปลูกค้าใหม่แล้ว แต่ยังไม่ได้ใส่โค้ดที่แจก" }, { status: 400 });
    const { data: cp } = await sb.from("store_coupons").select("id, active, members_only, min_tier").eq("shop_id", s.id).eq("code", info.promo_code).maybeSingle();
    if (!cp) return NextResponse.json({ error: `ไม่พบคูปอง ${info.promo_code} ในร้านนี้ — สร้างที่แท็บ 🎟️ คูปอง ก่อน` }, { status: 400 });
    if (!(cp as { active: boolean }).active) return NextResponse.json({ error: `คูปอง ${info.promo_code} ปิดใช้งานอยู่ — เปิดที่แท็บ 🎟️ คูปอง ก่อน` }, { status: 400 });
    const c = cp as { members_only: boolean; min_tier: string | null };
    if (c.members_only || c.min_tier) return NextResponse.json({ error: `คูปอง ${info.promo_code} เป็นคูปองเฉพาะสมาชิก — ลูกค้าใหม่ใช้ไม่ได้ เลือกคูปองทั่วไปแทน` }, { status: 400 });
  }
  const pointsErr = pointsSettingsProblem(info);
  if (pointsErr) return NextResponse.json({ error: pointsErr }, { status: 400 });
  const { error } = await sb.from("store_settings").upsert(siteInfoToRows(s.id, info), { onConflict: "shop_id,key" });
  if (error) {
    console.error("[website/settings] upsert", error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }

  // เก็บเฉพาะช่องที่เปลี่ยน จะได้ไล่ย้อนได้ว่าใครแก้อะไร
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(info) as (keyof typeof info)[]) {
    if (before[k] === info[k]) continue;
    // 🔒 ความลับไม่ลงประวัติ — บอกแค่ว่าเปลี่ยน
    changed[k] = (SITE_INFO_SECRET_KEYS as readonly string[]).includes(k as string) ? { from: before[k] ? "(มีค่า)" : "", to: info[k] ? "(ตั้งค่าใหม่)" : "" } : { from: before[k], to: info[k] };
  }
  await writeAudit(sb, {
    action: "update",
    entityType: "shop_site_info",
    entityId: s.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { shop: s.slug, changed },
  });

  // ข้อมูลร้านมีผลกับทุกหน้า (ท้ายเว็บ/ติดต่อ/ปิดเว็บชั่วคราว) → สั่งเว็บร้านล้างแคชทันที
  const purged = await purgeStorefrontCache(sb, s.id);

  return NextResponse.json({ ok: true, info: maskSiteInfoSecrets(info), effectiveOrderPrefix: orderPrefixFor(info, s.slug), purged });
}
