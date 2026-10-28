/**
 * 📖 หน้าคอลเลกชันของเว็บร้าน — /api/website/collections (แท็บ "🎞 คอลเลกชัน" ในหน้าจัดการเว็บ)
 *
 * GET ?shop=<slug>               → คอลเลกชันที่มีสินค้าอยู่บนเว็บร้านนี้ (ชื่อ/จำนวน/รูปตัวอย่าง) + ค่าที่ตั้งไว้
 * PUT { shopId, collections:[] } → บันทึกหน้าตาบนเว็บ (shops.field_map.collections) + audit + ล้างแคชเว็บร้าน
 * ของกลาง: lib/website-collections (normalize) · guardWebsite (สิทธิ์เว็บไซต์ · lib/website-access) · writeAudit · purgeStorefrontCache
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { guardWebsite } from "@/lib/website-api-guard";
import { writeAudit } from "@/lib/audit";
import { normalizeFieldMap } from "@/lib/website-field-map";
import { normalizeWebCollections } from "@/lib/website-collections";
import { purgeStorefrontCache } from "@/lib/storefront-revalidate";
import { shopBySlug } from "@/lib/website-shop";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "view");
  if (denied) return denied;
  const slug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  const sb = supabaseAdmin();
  const shop = await shopBySlug<{ id: string; slug: string; field_map: unknown }>(sb, slug, "id, slug, field_map");
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const s = shop as { id: string; slug: string; field_map: unknown };

  const { data: rows } = await sb.from("store_listings").select("parent_sku_id, is_published").eq("shop_id", s.id);
  const listed = (rows ?? []) as { parent_sku_id: string; is_published: boolean }[];
  const ids = listed.map((r) => r.parent_sku_id);
  const pub = new Set(listed.filter((r) => r.is_published).map((r) => r.parent_sku_id));
  const { data: parents } = ids.length ? await sb.from("parent_skus_v2").select("id, collection_id, cover_image_r2_key").in("id", ids) : { data: [] };
  const by = new Map<string, { count: number; published: number; image: string | null }>();
  for (const p of (parents ?? []) as { id: string; collection_id: string | null; cover_image_r2_key: string | null }[]) {
    if (!p.collection_id) continue;
    const cur = by.get(p.collection_id) ?? { count: 0, published: 0, image: null };
    cur.count++;
    if (pub.has(p.id)) cur.published++;
    if (!cur.image && p.cover_image_r2_key) cur.image = p.cover_image_r2_key;
    by.set(p.collection_id, cur);
  }
  const config = normalizeFieldMap(s.field_map).collections;
  const allIds = [...new Set([...by.keys(), ...config.map((c) => c.id)])];
  const { data: cols } = allIds.length ? await sb.from("collections").select("id, name").in("id", allIds) : { data: [] };
  const name = new Map(((cols ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  const items = allIds
    .map((id) => ({ id, name: name.get(id) ?? "(ไม่พบคอลเลกชัน)", count: by.get(id)?.count ?? 0, published: by.get(id)?.published ?? 0, imageKey: by.get(id)?.image ?? null }))
    .sort((a, b) => {
      const ia = config.findIndex((c) => c.id === a.id);
      const ib = config.findIndex((c) => c.id === b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
      return b.count - a.count || a.name.localeCompare(b.name);
    });
  return NextResponse.json({ shopId: s.id, items, collections: config });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardWebsite(request, "edit");
  if (denied) return denied;
  const {
    data: { user },
  } = await supabaseFromRequest(request).auth.getUser();
  let body: { shopId?: string; collections?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.shopId) return NextResponse.json({ error: "ต้องระบุ shopId" }, { status: 400 });
  const sb = supabaseAdmin();
  const { data: shop } = await sb.from("shops").select("field_map").eq("id", body.shopId).maybeSingle();
  if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });
  const raw = ((shop as { field_map: unknown }).field_map ?? {}) as Record<string, unknown>;
  const before = normalizeFieldMap(raw).collections;
  const collections = normalizeWebCollections(body.collections);
  // เก็บเฉพาะช่อง collections — ช่องจับคู่ฟิลด์อื่นคงเดิม
  const { error } = await sb.from("shops").update({ field_map: { ...raw, collections } }).eq("id", body.shopId);
  if (error) return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  await writeAudit(sb, {
    action: "update",
    entityType: "shop_field_map",
    entityId: body.shopId,
    actorId: user?.id ?? null,
    actorName: user?.email ?? null,
    metadata: { field: "collections", before, after: collections },
  });
  const purged = await purgeStorefrontCache(sb, body.shopId);
  return NextResponse.json({ ok: true, collections, purged });
}
