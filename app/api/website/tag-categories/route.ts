/**
 * /api/website/tag-categories — 🏷️ กฎ "แท็ก → หมวดบนเว็บ" ของร้าน (ข้อมูลชุดเดียวกับป๊อป 🔗 ของแท็ก)
 *   GET  ?shop=<slug>                                 → หมวดของร้าน + กฎ + แท็กทั้งหมด + จำนวนรุ่นบนเว็บต่อแท็ก + พรีวิว "ใส่หมวดให้รุ่นที่มีอยู่"
 *   PUT  { shop_id, tag_id, key }                     → ตั้งกฎ (key = รหัสหมวด · null/"" = ลบกฎ)
 *   POST { shop_id, action: "apply", tag_id?, dry_run? } → ใส่หมวดตามกฎให้รุ่นที่มีอยู่ (เพิ่มอย่างเดียว ไม่ลบหมวดเดิม)
 *        tag_id = เฉพาะกฎของแท็กนั้น · ไม่ส่ง = ทุกกฎ · รุ่นที่ยังไม่จัดหมวดเอง (web_categories null) ใช้กฎอยู่แล้ว ข้าม
 * กฎคิดหมวด: lib/website-tag-categories (แท็กย่อยมาก่อน · กฎแท็กมาก่อนกฎหมวด ERP)
 * สิทธิ์: อ่าน products.view · แก้ products.edit (เท่ากับหน้าจับคู่ฟิลด์) · audit ทุกการแก้
 */
import { NextRequest, NextResponse } from "next/server";
import { guardApi } from "@/lib/api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { supabaseFromRequest } from "@/lib/supabase-auth-server";
import { writeAudit } from "@/lib/audit";
import { normalizeFieldMap, type FieldMap } from "@/lib/website-field-map";
import { addCategories, hasManualCategories, isTagId, tagRuleCategories } from "@/lib/website-tag-categories";
import { loadTagContext } from "@/lib/website-tag-categories-db";
import { ancestorTagsOf } from "@/lib/tag-hierarchy";

export const dynamic = "force-dynamic";

type Sb = ReturnType<typeof supabaseAdmin>;
type ListingRow = { id: string; parent_sku_id: string; web_categories: string[] | null; web_category: string | null };
const bad = (error: string, status = 400) => NextResponse.json({ data: null, error }, { status });

async function loadShop(sb: Sb, by: { id?: string; slug?: string }) {
  let q = sb.from("shops").select("id, name, slug, field_map");
  q = by.id ? q.eq("id", by.id) : q.eq("slug", by.slug ?? "");
  const { data } = await q.maybeSingle();
  return data ? { ...(data as { id: string; name: string; slug: string; field_map: unknown }), map: normalizeFieldMap((data as { field_map: unknown }).field_map) } : null;
}

/** แผน "ใส่หมวดให้รุ่นที่มีอยู่": เฉพาะรุ่นที่จัดหมวดเองแล้ว + มีหมวดจากกฎที่ยังไม่มี */
async function applyPlan(sb: Sb, shopId: string, map: FieldMap, onlyTag?: string) {
  const rules = onlyTag ? (map.category.tagRules[onlyTag] ? { [onlyTag]: map.category.tagRules[onlyTag] } : {}) : map.category.tagRules;
  const { data } = await sb.from("store_listings").select("id, parent_sku_id, web_categories, web_category").eq("shop_id", shopId).limit(5000);
  const listings = (data ?? []) as ListingRow[];
  if (!Object.keys(rules).length || !listings.length) return { listings, ctx: null, changes: [] as { listing: ListingRow; next: string[]; add: string[] }[], autoCount: 0 };
  const ctx = await loadTagContext(sb, listings.map((l) => l.parent_sku_id));
  const changes: { listing: ListingRow; next: string[]; add: string[] }[] = [];
  let autoCount = 0;
  for (const l of listings) {
    const cats = tagRuleCategories(rules, ctx.tagsOf(l.parent_sku_id), ctx.depthOf);
    if (!cats.length) continue;
    if (!hasManualCategories(l)) { autoCount++; continue; }   // ยังไม่จัดเอง = เว็บใช้กฎแท็กให้อยู่แล้ว
    const existing = Array.isArray(l.web_categories) ? l.web_categories : [String(l.web_category ?? "").trim()].filter(Boolean);
    const next = addCategories(existing, cats);
    if (next) changes.push({ listing: l, next, add: next.filter((k) => !existing.includes(k)) });
  }
  return { listings, ctx, changes, autoCount };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.view"); if (denied) return denied;
  const slug = (new URL(request.url).searchParams.get("shop") ?? "").trim();
  if (!slug) return bad("ต้องระบุร้าน");
  const sb = supabaseAdmin();
  const shop = await loadShop(sb, { slug });
  if (!shop) return bad("ไม่พบร้าน", 404);

  const [{ data: tags }, { data: groups }, plan] = await Promise.all([
    sb.from("product_families").select("id, name, name_en, group_id, sort_order").eq("is_active", true).order("sort_order").order("name"),
    sb.from("product_family_groups").select("id, name, parent_group_id, sort_order").eq("is_active", true).order("sort_order"),
    applyPlan(sb, shop.id, shop.map),
  ]);
  const tagRows = ((tags ?? []) as { id: string; name: string; name_en: string | null; group_id: string | null }[]).map((t) => ({ ...t, id: String(t.id) }));
  const groupRows = ((groups ?? []) as { id: string; name: string; parent_group_id: string | null }[]).map((g) => ({ ...g, id: String(g.id) }));
  const groupById = new Map(groupRows.map((g) => [g.id, g]));
  const pathOf = (gid: string | null) => {
    const out: string[] = [];
    for (let g = gid ? groupById.get(gid) : undefined, i = 0; g && i < 5; g = g.parent_group_id ? groupById.get(g.parent_group_id) : undefined, i++) out.unshift(g.name);
    return out;
  };
  // จำนวนรุ่นบนเว็บร้านนี้ที่ติดแท็กแต่ละตัว
  const ctx = plan.ctx ?? (plan.listings.length ? await loadTagContext(sb, plan.listings.map((l) => l.parent_sku_id)) : null);
  const listedByTag: Record<string, number> = {};
  if (ctx) for (const l of plan.listings) for (const t of new Set(ctx.tagsOf(l.parent_sku_id))) listedByTag[t] = (listedByTag[t] ?? 0) + 1;
  const { data: parents } = plan.changes.length ? await sb.from("parent_skus_v2").select("id, code").in("id", plan.changes.map((c) => c.listing.parent_sku_id)) : { data: [] };
  const codeOf = new Map((parents ?? []).map((p) => [String(p.id), String(p.code ?? "")]));

  return NextResponse.json({
    data: {
      shop: { id: shop.id, name: shop.name, slug: shop.slug },
      categories: shop.map.categories.map((c) => ({ key: c.key, label: c.label, parent: c.parent ?? null })),
      rules: Object.entries(shop.map.category.tagRules).map(([tag_id, key]) => ({ tag_id, key })),
      tags: tagRows.map((t) => ({
        id: t.id, name: t.name, name_en: t.name_en, group_path: pathOf(t.group_id),
        depth: ancestorTagsOf(t.id, tagRows, groupRows, (x) => x.name).length, listed: listedByTag[t.id] ?? 0,
      })),
      listed_total: plan.listings.length,
      apply_preview: {
        changes: plan.changes.length, auto: plan.autoCount,
        items: plan.changes.slice(0, 100).map((c) => ({ code: codeOf.get(c.listing.parent_sku_id) ?? "", add: c.add })),
      },
    },
    error: null,
  });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let b: { shop_id?: unknown; tag_id?: unknown; key?: unknown };
  try { b = await request.json(); } catch { return bad("invalid JSON"); }
  if (!isTagId(b.tag_id)) return bad("ไม่พบแท็ก");
  const sb = supabaseAdmin();
  const shop = await loadShop(sb, { id: String(b.shop_id ?? "") });
  if (!shop) return bad("ไม่พบร้าน", 404);
  const key = typeof b.key === "string" ? b.key.trim() : "";
  if (key && !shop.map.categories.some((c) => c.key === key)) return bad("ไม่พบหมวดนี้ในร้าน (อาจถูกลบไปแล้ว) ลองโหลดหน้าใหม่");
  const { data: tag } = await sb.from("product_families").select("id, name").eq("id", b.tag_id).maybeSingle();
  if (!tag) return bad("ไม่พบแท็ก (อาจถูกลบไปแล้ว)", 404);

  // แก้เฉพาะ category.tagRules บนค่าดิบใน DB (ไม่ normalize ทั้งก้อน กันช่องอื่นเปลี่ยนโดยไม่ตั้งใจ)
  const raw = ((shop.field_map ?? {}) as Record<string, unknown>);
  const cat = { ...((raw.category ?? {}) as Record<string, unknown>) };
  const before = { ...shop.map.category.tagRules };
  const next = { ...before };
  if (key) next[String(b.tag_id)] = key; else delete next[String(b.tag_id)];
  cat.tagRules = next;
  const { error } = await sb.from("shops").update({ field_map: { ...raw, category: cat } }).eq("id", shop.id);
  if (error) return bad("บันทึกไม่สำเร็จ: " + error.message, 500);

  const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
  await writeAudit(sb, {
    action: "website.tag_rule.set", entityType: "shop_field_map", entityId: shop.id, actorId: user?.id ?? null, actorName: user?.email ?? null,
    metadata: { shop: shop.slug, tag_id: b.tag_id, tag_name: tag.name, key: key || null, before: before[String(b.tag_id)] ?? null },
  });
  return NextResponse.json({ data: { rules: Object.entries(next).map(([tag_id, k]) => ({ tag_id, key: k })) }, error: null });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await guardApi(request, "products.edit"); if (denied) return denied;
  let b: { shop_id?: unknown; action?: unknown; tag_id?: unknown; dry_run?: unknown };
  try { b = await request.json(); } catch { return bad("invalid JSON"); }
  if (b.action !== "apply") return bad("ไม่รู้จักคำสั่ง");
  if (b.tag_id != null && !isTagId(b.tag_id)) return bad("ไม่พบแท็ก");
  const sb = supabaseAdmin();
  const shop = await loadShop(sb, { id: String(b.shop_id ?? "") });
  if (!shop) return bad("ไม่พบร้าน", 404);
  const plan = await applyPlan(sb, shop.id, shop.map, (b.tag_id as string | undefined) ?? undefined);
  const { data: parents } = plan.changes.length ? await sb.from("parent_skus_v2").select("id, code").in("id", plan.changes.map((c) => c.listing.parent_sku_id)) : { data: [] };
  const codeOf = new Map((parents ?? []).map((p) => [String(p.id), String(p.code ?? "")]));
  const items = plan.changes.map((c) => ({ code: codeOf.get(c.listing.parent_sku_id) ?? "", add: c.add }));
  if (b.dry_run === true) return NextResponse.json({ data: { changes: plan.changes.length, auto: plan.autoCount, items }, error: null });

  const now = new Date().toISOString();
  let done = 0;
  for (const c of plan.changes) {
    const { error } = await sb.from("store_listings").update({ web_categories: c.next, updated_at: now }).eq("id", c.listing.id);
    if (error) return bad(`ใส่หมวดไม่สำเร็จ (สำเร็จไปแล้ว ${done} รุ่น): ${error.message}`, 500);
    done++;
  }
  if (done) {
    const { data: { user } } = await supabaseFromRequest(request).auth.getUser();
    await writeAudit(sb, {
      action: "website.tag_rule.apply", entityType: "store_listings", entityId: null, actorId: user?.id ?? null, actorName: user?.email ?? null,
      metadata: {
        shop: shop.slug, tag_id: b.tag_id ?? null, count: done,
        changes: plan.changes.map((c) => ({ listing_id: c.listing.id, code: codeOf.get(c.listing.parent_sku_id) ?? "", before: c.listing.web_categories ?? (c.listing.web_category ? [c.listing.web_category] : null), after: c.next })),
      },
    });
  }
  return NextResponse.json({ data: { changes: done, auto: plan.autoCount, items }, error: null });
}
