/**
 * 🚚 วิธีจัดส่งของเว็บร้าน — /api/website/shipping (แท็บ "🚚 การจัดส่ง" ใน /website/<slug>)
 *
 * GET ?shop=<slug>          → config ปัจจุบัน (ยังไม่ตั้ง = 1 วิธีจากค่าส่งเหมาเดิม · legacy:true)
 *                             + ตัวช่วยหน้าจอ: ขนส่ง (PARCEL_CARRIERS) · กล่องมาตรฐานของคลัง (parcel_sizes) · พื้นที่ · รหัสห่างไกลแนะนำ
 * PUT { shopId, config }    → บันทึก (store_settings key shipping_methods) + audit + ล้างแคชเว็บร้าน
 *
 * ของกลาง: lib/website-shipping (กติกา · มิเรอร์ไปเว็บร้าน) · lib/website-shipping-db · guardApi(products.view/edit) · writeAudit
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { readSiteInfo } from "@/lib/website-site-info";
import { PARCEL_CARRIERS } from "@/lib/parcel-tracking";
import { SHIPPING_AREAS, SUGGESTED_REMOTE_POSTALS, normalizeShipping } from "@/lib/website-shipping";
import { readShipping, saveShipping } from "@/lib/website-shipping-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const slug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, name, slug").eq("slug", slug).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; name: string; slug: string };

  const info = await readSiteInfo(sb, s.id);
  const [config, { data: boxes }] = await Promise.all([
    readShipping(sb, s.id, info),
    sb.from("parcel_sizes").select("name, size_text, width_cm, length_cm, height_cm").eq("is_active", true).order("name"),
  ]);
  return NextResponse.json({
    shop: s,
    config,
    carriers: PARCEL_CARRIERS.map((c) => ({ key: c.key, label: c.label })),
    boxes: ((boxes ?? []) as { name: string; size_text: string | null }[]).map((b) => ({ name: b.name, size: b.size_text ?? "" })),
    areas: SHIPPING_AREAS,
    suggestedRemote: SUGGESTED_REMOTE_POSTALS,
    /** สวิตช์เก็บปลายทางของทั้งร้าน (แท็บข้อมูลร้าน) — ปิดอยู่ = ติ๊ก COD รายวิธีไม่มีผล */
    payCod: info.pay_cod,
  });
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

  const info = await readSiteInfo(sb, s.id);
  const before = await readShipping(sb, s.id, info);
  const config = normalizeShipping(body.config, info);
  if (config.legacy) return NextResponse.json({ error: "ต้องมีวิธีจัดส่งอย่างน้อย 1 วิธี" }, { status: 400 });
  if (!config.methods.some((m) => m.enabled)) return NextResponse.json({ error: "เปิดใช้อย่างน้อย 1 วิธี — ไม่งั้นลูกค้าสั่งของไม่ได้" }, { status: 400 });

  const saved = await saveShipping(sb, s.id, config);
  if (saved.error) {
    console.error("[website/shipping] save", saved.error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  await writeAudit(sb, {
    action: "update",
    entityType: "shop_shipping",
    entityId: s.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: {
      shop: s.slug,
      before: before.legacy ? "ค่าส่งเหมาเดิม" : before.methods.map((m) => `${m.enabled ? "" : "(ปิด) "}${m.name}`),
      after: config.methods.map((m) => `${m.enabled ? "" : "(ปิด) "}${m.name}`),
      remotePostals: config.remotePostals.length,
    },
  });
  const purged = await purgeStorefrontCache(sb, s.id);
  return NextResponse.json({ ok: true, config, purged });
}
