/**
 * ตั้งค่า "จับคู่ฟิลด์" ของเว็บร้านออนไลน์ — /api/website/field-map
 *
 * GET  ?shop=<slug>  → การจับคู่ปัจจุบัน + รายชื่อหมวดใน ERP (ไว้จับคู่เป็นหมวดเว็บ)
 * PUT  { shopId, fieldMap } → บันทึก (เก็บที่ shops.field_map)
 *
 * ของกลาง: guardApi(products.view/edit) + supabaseAdmin + writeAudit + lib/website-field-map
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { normalizeFieldMap, DEFAULT_FIELD_MAP } from "@/lib/website-field-map";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;

  const shopSlug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();

  const { data: shops } = await sb
    .from("shops")
    .select("id, name, slug, is_default, field_map")
    .order("is_default", { ascending: false })
    .order("name");
  const list = (shops ?? []) as { id: string; name: string; slug: string; is_default: boolean; field_map: unknown }[];
  if (!list.length) return NextResponse.json({ shop: null, fieldMap: DEFAULT_FIELD_MAP, categories: [] });

  const shop = list.find((s) => s.slug === shopSlug) ?? list[0];

  // หมวดใน ERP ที่มีสินค้าใช้งานจริง — ไว้ให้จับคู่เป็นหมวดเว็บ
  const { data: cats } = await sb
    .from("product_categories")
    .select("id, name")
    .order("name")
    .limit(300);

  // นับจำนวนสินค้าต่อหมวด (เฉพาะที่ active) เพื่อเรียงหมวดที่ใช้บ่อยขึ้นก่อน
  const { data: counts } = await sb
    .from("parent_skus_v2")
    .select("category_id")
    .eq("is_active", true)
    .limit(5000);
  const countByCat = new Map<string, number>();
  for (const r of (counts ?? []) as { category_id: string | null }[]) {
    if (r.category_id) countByCat.set(r.category_id, (countByCat.get(r.category_id) ?? 0) + 1);
  }

  const categories = ((cats ?? []) as { id: string; name: string }[])
    .map((c) => ({ name: c.name, count: countByCat.get(c.id) ?? 0 }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    shops: list.map((s) => ({ id: s.id, name: s.name, slug: s.slug, isDefault: s.is_default })),
    shop: { id: shop.id, name: shop.name, slug: shop.slug },
    fieldMap: normalizeFieldMap(shop.field_map),
    categories,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();

  let body: { shopId?: string; fieldMap?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });

  const fieldMap = normalizeFieldMap(body.fieldMap);
  const sb = supabaseAdmin();

  const { error } = await sb.from("shops").update({ field_map: fieldMap }).eq("id", body.shopId);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });

  await writeAudit(sb, {
    action: "update",
    entityType: "shop_field_map",
    entityId: body.shopId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { fieldMap },
  });

  return NextResponse.json({ ok: true, fieldMap });
}
