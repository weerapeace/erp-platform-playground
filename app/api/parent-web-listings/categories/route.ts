/**
 * 🌐 หมวดบนเว็บของ Parent SKU ทุกร้าน (แบบเบา) — /api/parent-web-listings/categories
 * ใช้ในกล่อง "หมวดบนเว็บ" ใต้ช่อง "หมวดกลางสำหรับลงขาย" ของ Parent SKU (components/parent-web-categories)
 *
 * GET ?parentId= → { parent:{ id, code, centralName }, shops:[{ shopId, name, slug, listed, published,
 *                    manual (หมวดที่จัดเอง · null = ยังไม่ได้จัด), auto:{ keys, source } (ที่เว็บใส่ให้ตอนนี้),
 *                    suggest (หมวดจากกฎหมวดกลางของร้าน [แม่, ย่อย] · null = ไม่มีกฎ), shopCategories }] }
 *   ร้านที่โชว์ = ตั้งหมวดของตัวเองแล้ว หรือมีรุ่นนี้อยู่บนร้าน
 *   ลำดับที่เว็บใส่ให้ (ยังไม่ได้จัดเอง): กฎแท็ก → หมวดกลาง → หมวด ERP → ค่าตั้งต้นของร้าน (ตัวเดียวกับหน้าเว็บ · lib/website-field-map)
 * บันทึก = POST /api/parent-web-listings { parentId, shopId, patch:{ webCategories } } ตัวเดิม (audit + ล้างแคชเว็บร้าน)
 * ของกลาง: guardApi(products.view) + supabaseAdmin + lib/website-field-map + lib/website-tag-categories
 */
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { guardApi } from "@/lib/api-auth";
import { normalizeFieldMap, resolveCategories, autoCategory } from "@/lib/website-field-map";
import { categoryPathLabel } from "@/lib/website-category-tree";
import { hasManualCategories, tagRuleCategories } from "@/lib/website-tag-categories";
import { loadTagContext } from "@/lib/website-tag-categories-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ShopRow = { id: string; name: string; slug: string; field_map: unknown };
type ListingRow = { shop_id: string; web_categories: string[] | null; web_category: string | null; is_published: boolean | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view");
  if (denied) return denied;
  const parentId = (new URL(request.url).searchParams.get("parentId") ?? "").trim();
  if (!parentId) return NextResponse.json({ error: "ต้องระบุ parentId" }, { status: 400 });

  const sb = supabaseAdmin();
  const [{ data: parent }, { data: listings }, { data: shops }] = await Promise.all([
    sb.from("parent_skus_v2").select("id, code, category_id, platform_category_id").eq("id", parentId).maybeSingle(),
    sb.from("store_listings").select("shop_id, web_categories, web_category, is_published").eq("parent_sku_id", parentId),
    sb.from("shops").select("id, name, slug, field_map").order("is_default", { ascending: false }).order("name"),
  ]);
  if (!parent) return NextResponse.json({ error: "ไม่พบสินค้า" }, { status: 404 });
  const p = parent as { id: string; code: string | null; category_id: string | null; platform_category_id: string | null };

  const [{ data: erpCat }, { data: central }] = await Promise.all([
    p.category_id ? sb.from("product_categories").select("name").eq("id", p.category_id).maybeSingle() : Promise.resolve({ data: null }),
    p.platform_category_id ? sb.from("platform_central_categories").select("name").eq("id", p.platform_category_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const catName = (erpCat as { name?: string } | null)?.name ?? null;

  const byShop = new Map(((listings ?? []) as ListingRow[]).map((l) => [l.shop_id, l]));
  const rows = ((shops ?? []) as ShopRow[]).filter((s) => {
    const raw = (s.field_map ?? {}) as { categories?: unknown };
    return byShop.has(s.id) || (Array.isArray(raw.categories) && raw.categories.length > 0);
  });
  // 🏷️ กฎแท็ก — โหลดแท็กของรุ่นเฉพาะเมื่อมีร้านตั้งกฎไว้
  const anyTag = rows.some((s) => Object.keys(normalizeFieldMap(s.field_map).category.tagRules).length > 0);
  const tagCtx = anyTag ? await loadTagContext(sb, [p.id]) : null;

  const out = rows.map((s) => {
    const fm = normalizeFieldMap(s.field_map);
    const keys = new Set(fm.categories.map((c) => c.key));
    const l = byShop.get(s.id) ?? null;
    const manual = hasManualCategories(l) ? resolveCategories(fm, l!.web_categories, String(l!.web_category ?? "").trim()) : null;
    const tags = tagCtx ? tagRuleCategories(fm.category.tagRules, tagCtx.tagsOf(p.id), tagCtx.depthOf).filter((k) => keys.has(k)) : [];
    const auto = autoCategory(fm, catName, p.platform_category_id);
    const suggest = p.platform_category_id ? fm.category.centralRules[p.platform_category_id] ?? null : null;
    // หมวดย่อย = ใส่แม่คู่ไปด้วย (แม่ก่อนลูก · กติกาเดียวกับกระดานจัดหมวด)
    const withParent = (k: string) => {
      const par = fm.categories.find((c) => c.key === k)?.parent;
      return par && keys.has(par) ? [par, k] : [k];
    };
    return {
      shopId: s.id,
      name: s.name,
      slug: s.slug,
      listed: !!l,
      published: !!l?.is_published,
      manual,
      auto: tags.length ? { keys: tags, source: "tag" as const } : { keys: auto.key && keys.has(auto.key) ? [auto.key] : [], source: auto.source },
      suggest: suggest && keys.has(suggest) ? withParent(suggest) : null,
      shopCategories: fm.categories.map((c) => ({ key: c.key, label: categoryPathLabel(fm.categories, c.key), icon: c.icon ?? "" })),
    };
  });

  return NextResponse.json({
    parent: { id: p.id, code: p.code, centralName: (central as { name?: string } | null)?.name ?? null },
    shops: out,
  });
}
