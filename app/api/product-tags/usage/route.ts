/**
 * GET /api/product-tags/usage?tag_id= — แท็กนี้ "ลิงก์อยู่กับอะไรบ้าง" (ป๊อป 🔗 ในหน้า Tags Manager / ป๊อปจัดการแท็ก)
 *   - ตัวแท็ก: ชื่อไทย/EN · กลุ่ม (↳ หมวดย่อย) · แท็กแม่ / แท็กย่อย (lib/tag-hierarchy) · รหัสนำหน้า SKU · ชื่อตั้งต้น
 *   - สินค้าที่ติดแท็ก: Parent SKU (รายการ) + จำนวน SKU ย่อยที่ติดแท็ก
 *   - เว็บไซต์: ทุกร้านที่มีหมวด — รุ่นที่ติดแท็กนี้ขึ้นเว็บกี่รุ่น อยู่หมวดไหน + 🏷️ กฎ "แท็กนี้ → หมวด" ของร้าน (rule_key)
 *       (คิดหมวดแบบเดียวกับ API สินค้าของหน้าร้าน: จัดเอง web_categories/web_category → กฎแท็ก → กฎหมวด ERP → ค่าเริ่มต้นร้าน)
 *       pending = รุ่นที่จัดหมวดเองแล้วแต่ยังไม่อยู่หมวดตามกฎ (ป๊อปมีปุ่มใส่หมวดให้ → POST /api/website/tag-categories apply)
 *   - กฎ AI เขียนรายละเอียด (erp_ai_product_rules.tag_ids) ที่ใช้แท็กนี้
 * สิทธิ์: products.view (อ่านอย่างเดียว)
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ancestorTagsOf, subGroupOfTag } from "@/lib/tag-hierarchy";
import { normalizeFieldMap, resolveCategories } from "@/lib/website-field-map";
import { hasManualCategories, tagRuleCategories } from "@/lib/website-tag-categories";
import { loadTagContext } from "@/lib/website-tag-categories-db";

export const dynamic = "force-dynamic";

const PARENT_JUNCTION = "parent_skus_v2_product_family_m2m";
const SKU_JUNCTION = "skus_v2_product_family_m2m";
const SAMPLE = 60;      // รายการรุ่นที่ส่งไปโชว์ (ที่เหลือนับอย่างเดียว)
const CHUNK = 300;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown) => String(v ?? "").trim();

type TagRow = { id: string; name: string; name_en: string | null; group_id: string | null; code_prefix: string | null; default_name: string | null };
type GroupRow = { id: string; name: string; parent_group_id: string | null };

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const tagId = (new URL(request.url).searchParams.get("tag_id") ?? "").trim();
  if (!UUID.test(tagId)) return NextResponse.json({ data: null, error: "ไม่พบแท็ก" }, { status: 400 });
  const admin = supabaseAdmin();

  const [tagsRes, groupsRes] = await Promise.all([
    admin.from("product_families").select("id, name, name_en, group_id, code_prefix, default_name").eq("is_active", true),
    admin.from("product_family_groups").select("id, name, parent_group_id").eq("is_active", true),
  ]);
  if (tagsRes.error) return NextResponse.json({ data: null, error: "โหลดแท็กไม่สำเร็จ: " + tagsRes.error.message }, { status: 500 });
  const tags = (tagsRes.data ?? []) as TagRow[];
  const groups = (groupsRes.data ?? []) as GroupRow[];
  const tag = tags.find((t) => t.id === tagId);
  if (!tag) return NextResponse.json({ data: null, error: "ไม่พบแท็ก (อาจถูกลบไปแล้ว)" }, { status: 404 });

  // ── ตำแหน่งในกลุ่ม + แท็กแม่/แท็กย่อย ──
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupPath: string[] = [];
  for (let g = tag.group_id ? groupById.get(tag.group_id) : undefined, i = 0; g && i < 5; g = g.parent_group_id ? groupById.get(g.parent_group_id) : undefined, i++) groupPath.unshift(g.name);
  const nameOf = (t: TagRow) => t.name;
  const parents = ancestorTagsOf(tag.id, tags, groups, nameOf).map((t) => ({ id: t.id, name: t.name }));
  const sub = subGroupOfTag(tag.name, tag.group_id, groups);
  const children = sub ? tags.filter((t) => t.group_id === sub.id).map((t) => ({ id: t.id, name: t.name })) : [];

  // ── สินค้าที่ติดแท็ก ──
  const parentIds: string[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data, error } = await admin.from(PARENT_JUNCTION).select("src_id").eq("tgt_id", tagId).range(from, from + 999);
    if (error) return NextResponse.json({ data: null, error: "โหลดสินค้าที่ติดแท็กไม่สำเร็จ: " + error.message }, { status: 500 });
    parentIds.push(...(data ?? []).map((r) => String(r.src_id)));
    if (!data || data.length < 1000) break;
  }
  const { count: skuCount } = await admin.from(SKU_JUNCTION).select("src_id", { count: "exact", head: true }).eq("tgt_id", tagId);

  type ParentInfo = { id: string; code: string; name: string; image_key: string | null; is_active: boolean; category_id: string | null };
  const parentInfo: ParentInfo[] = [];
  for (let i = 0; i < parentIds.length; i += CHUNK) {
    const { data } = await admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key, is_active, category_id").in("id", parentIds.slice(i, i + CHUNK));
    for (const p of data ?? []) parentInfo.push({ id: String(p.id), code: clean(p.code), name: clean(p.name_th) || clean(p.code), image_key: (p.cover_image_r2_key as string | null) ?? null, is_active: p.is_active !== false, category_id: (p.category_id as string | null) ?? null });
  }
  parentInfo.sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.code.localeCompare(b.code, "th", { numeric: true }));

  // ── เว็บไซต์: รุ่นที่ติดแท็กนี้ อยู่หมวดไหนบนเว็บแต่ละร้าน ──
  const listings: { shop_id: string; parent_sku_id: string; is_published: boolean; web_categories: unknown; web_category: string | null }[] = [];
  for (let i = 0; i < parentIds.length; i += CHUNK) {
    const { data } = await admin.from("store_listings").select("shop_id, parent_sku_id, is_published, web_categories, web_category").in("parent_sku_id", parentIds.slice(i, i + CHUNK));
    listings.push(...((data ?? []) as typeof listings));
  }
  // ทุกร้าน (ไว้ตั้งกฎ "แท็กนี้ → หมวด" ได้แม้ยังไม่มีรุ่นที่ติดแท็กนี้ขึ้นเว็บ)
  const { data: shops } = await admin.from("shops").select("id, name, slug, field_map").order("name");
  const catIds = [...new Set(parentInfo.map((p) => p.category_id).filter(Boolean))] as string[];
  const { data: cats } = catIds.length ? await admin.from("product_categories").select("id, name").in("id", catIds) : { data: [] };
  const catName = new Map((cats ?? []).map((c) => [String(c.id), String(c.name)]));
  const parentById = new Map(parentInfo.map((p) => [p.id, p]));
  // 🏷️ แท็กของรุ่นที่ขึ้นเว็บ (คิดหมวดจากกฎแท็กแบบเดียวกับเว็บจริง)
  const tagCtx = listings.length ? await loadTagContext(admin, listings.map((l) => l.parent_sku_id)) : null;

  const websites = ((shops ?? []) as { id: string; name: string; slug: string; field_map: unknown }[]).map((s) => {
    const map = normalizeFieldMap(s.field_map);
    const label = new Map(map.categories.map((c) => [c.key, c.label]));
    const ruleKey = map.category.tagRules[tagId] ?? null;
    const mine = listings.filter((l) => l.shop_id === s.id);
    const byCat = new Map<string, { key: string; label: string; count: number; codes: string[] }>();
    let noCategory = 0;
    let pending = 0;   // รุ่นที่จัดหมวดเองแล้ว แต่ยังไม่อยู่หมวดตามกฎของแท็กนี้ (ปุ่ม "ใส่หมวดให้")
    for (const l of mine) {
      const p = parentById.get(l.parent_sku_id);
      const cn = p?.category_id ? catName.get(p.category_id) ?? null : null;
      const rule = cn ? map.category.rules[cn] : undefined;
      const manual = hasManualCategories(l);
      const fromTags = !manual && tagCtx ? tagRuleCategories(map.category.tagRules, tagCtx.tagsOf(l.parent_sku_id), tagCtx.depthOf) : [];
      const keys = fromTags.length ? fromTags : resolveCategories(map, l.web_categories, clean(l.web_category) || rule || map.category.default);
      if (manual && ruleKey && !keys.includes(ruleKey)) pending++;
      if (!keys.length) noCategory++;
      for (const k of keys) {
        const cur = byCat.get(k) ?? { key: k, label: label.get(k) ?? k, count: 0, codes: [] };
        cur.count++;
        if (p && cur.codes.length < 8) cur.codes.push(p.code);
        byCat.set(k, cur);
      }
    }
    return {
      shop_id: s.id, shop_name: s.name, slug: s.slug,
      listed: mine.length, published: mine.filter((l) => l.is_published).length,
      not_listed: parentIds.length - mine.length, no_category: noCategory,
      categories: [...byCat.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "th")),
      // ตั้งกฎ "แท็กนี้ → หมวด" ของร้านนี้
      rule_key: ruleKey, pending,
      category_options: map.categories.map((c) => ({ key: c.key, label: c.label, parent: c.parent ?? null })),
    };
  }).filter((w) => w.listed > 0 || w.category_options.length > 0)
    .sort((a, b) => b.listed - a.listed || a.shop_name.localeCompare(b.shop_name, "th"));

  // ── กฎ AI ที่ใช้แท็กนี้ ──
  const { data: rules } = await admin.from("erp_ai_product_rules").select("id, name, is_active").contains("tag_ids", [tagId]);

  return NextResponse.json({
    data: {
      tag: { id: tag.id, name: tag.name, name_en: tag.name_en, code_prefix: tag.code_prefix, default_name: tag.default_name, group_path: groupPath },
      parents, children,
      products: {
        parent_count: parentIds.length,
        active_count: parentInfo.filter((p) => p.is_active).length,
        sku_count: skuCount ?? 0,
        sample: parentInfo.slice(0, SAMPLE).map(({ id, code, name, image_key, is_active }) => ({ id, code, name, image_key, is_active })),
      },
      websites,
      ai_rules: (rules ?? []).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), is_active: r.is_active !== false })),
    },
    error: null,
  });
}
