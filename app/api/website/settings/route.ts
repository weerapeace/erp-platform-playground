/**
 * ข้อมูลร้านของเว็บร้านออนไลน์ — /api/website/settings (แท็บ "🏪 ข้อมูลร้าน")
 *
 * GET ?shop=<slug>           → ค่าปัจจุบัน + นิยามฟิลด์ (label/hint/กลุ่ม) ให้หน้าจอวาดฟอร์มเอง
 * PUT { shopId, info:{...} } → บันทึก (upsert ลง store_settings) + audit
 *
 * ของกลาง: lib/website-site-info.ts · guardApi(products.view/edit) · writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import {
  SITE_INFO_FIELDS,
  SITE_INFO_GROUPS,
  normalizeSiteInfo,
  readSiteInfo,
  siteInfoToRows,
  orderPrefixFor,
} from "@/lib/website-site-info";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, name, slug").eq("slug", shopSlug).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; name: string; slug: string };

  const info = await readSiteInfo(sb, s.id);
  return NextResponse.json({
    shop: s,
    info,
    /** ตัวย่อที่ระบบจะใช้จริงถ้าช่อง order_prefix เว้นว่าง */
    effectiveOrderPrefix: orderPrefixFor(info, s.slug),
    fields: SITE_INFO_FIELDS,
    groups: SITE_INFO_GROUPS,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; info?: unknown };
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
  const info = normalizeSiteInfo(body.info);
  const { error } = await sb.from("store_settings").upsert(siteInfoToRows(s.id, info), { onConflict: "shop_id,key" });
  if (error) {
    console.error("[website/settings] upsert", error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }

  // เก็บเฉพาะช่องที่เปลี่ยน จะได้ไล่ย้อนได้ว่าใครแก้อะไร
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of Object.keys(info) as (keyof typeof info)[]) {
    if (before[k] !== info[k]) changed[k] = { from: before[k], to: info[k] };
  }
  await writeAudit(sb, {
    action: "update",
    entityType: "shop_site_info",
    entityId: s.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { shop: s.slug, changed },
  });

  return NextResponse.json({ ok: true, info, effectiveOrderPrefix: orderPrefixFor(info, s.slug) });
}
