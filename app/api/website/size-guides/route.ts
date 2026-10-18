/**
 * 📏 ตารางไซส์ของร้าน — /api/website/size-guides
 *
 * GET ?shop=<slug> | ?shopId=<id> → { shopId, guides, categories } (categories = หมวดเว็บของร้าน ไว้เลือกว่าตารางใช้กับหมวดไหน)
 * PUT { shopId, guides }          → ทำความสะอาด + บันทึก (store_settings "size_guides") + audit + ล้างแคชเว็บ
 * ของกลาง: lib/website-size-guides(.ts | -db.ts) · guardApi(products.view/edit) · writeAudit · purgeStorefrontCache
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { normalizeFieldMap } from "@/lib/website-field-map";
import { categoryPathLabel } from "@/lib/website-category-tree";
import { normalizeSizeGuides } from "@/lib/website-size-guides";
import { readSizeGuides, writeSizeGuides } from "@/lib/website-size-guides-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const sp = new URL(request.url).searchParams;
  const sb = supabaseAdmin();
  const q = sb.from("shops").select("id, slug, field_map");
  const { data: shop } = await (sp.get("shopId") ? q.eq("id", sp.get("shopId")!) : q.eq("slug", (sp.get("shop") ?? "").trim())).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; slug: string; field_map: unknown };
  const cats = normalizeFieldMap(s.field_map).categories;
  return NextResponse.json({
    shopId: s.id,
    guides: await readSizeGuides(sb, s.id),
    categories: cats.map((c) => ({ key: c.key, label: categoryPathLabel(cats, c.key), parent: c.parent ?? null })),
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  let body: { shopId?: string; guides?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId || !Array.isArray(body.guides)) return NextResponse.json({ error: "ต้องระบุ shopId + guides" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("id, slug").eq("id", body.shopId).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; slug: string };

  const guides = normalizeSizeGuides(body.guides);
  const before = await readSizeGuides(sb, s.id);
  const r = await writeSizeGuides(sb, s.id, guides);
  if (r.error) {
    console.error("[website/size-guides] upsert", r.error);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  await writeAudit(sb, {
    action: "update",
    entityType: "shop_size_guides",
    entityId: s.id,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { shop: s.slug, before, after: guides },
  });
  await purgeStorefrontCache(sb, s.id);
  return NextResponse.json({ ok: true, guides });
}
