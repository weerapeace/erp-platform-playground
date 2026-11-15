/**
 * ตัวโหลดของ "ลงสินค้าใหม่บน Shopee" (ไม่ใช่ route · import ได้) — สินค้า + SKU + ร่าง Shopee + ข้อมูลสดจากร้าน → แผน
 * กฎประกอบ = lib/shopee-create-plan (pure + เทสต์) · ใช้ทั้ง GET (ดูก่อนส่ง) และ POST (ลงจริง · 5B) — ต้องเหมือนกันเสมอ (แบบ TikTok/Lazada)
 * ดึงสดจาก Shopee (แคช 10 นาที): หมวดที่แนะนำจากชื่อ · ช่วงตามหมวด (get_item_limit) · ช่องของหมวด (get_attribute_tree) · สินค้าแบบ (get_item_base_info)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadListingContexts } from "@/lib/product-listing-context";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import { fetchAllPages } from "@/lib/fetch-all";
import { shopeeCategoryRecommend, shopeeErrorText, shopeeGetAttributeTree, shopeeGetCategoryLimit, shopeeGetItemBaseInfo } from "@/lib/shopee";
import {
  planShopeeCreate, shopeeAttrFieldsOf, shopeeCategoryIdOf, shopeeCreateLimitsOf, shopeePickCategory, shopeeTemplateOf, shopeeUniqueCategories,
  type ShopeeCategoryPick, type ShopeeCreatePreview, type ShopeeCreateSku, type ShopeeTemplate,
} from "@/lib/shopee-create-plan";
import type { TtsAttrField } from "@/lib/tiktok-attrs";
import { getPlatformId, shopeeTokenOrReason } from "../shared";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

// แคชในเครื่อง 10 นาที (หมวด/ช่อง/สินค้าแบบเปลี่ยนไม่บ่อย · กันยิง Shopee ทุกครั้งที่เปิดหน้าดูก่อนส่ง)
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; val: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.val as T;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
}

export type ShopeeLastAttempt = { status: string | null; at: string | null; error: string | null; product_id: string | null };
export type ShopeeCreateLoad =
  | { ok: false; status: number; error: string }
  | {
      ok: true; preview: ShopeeCreatePreview; payload: { add_item: Record<string, unknown>; tier: Record<string, unknown> | null }; blockers: string[];
      lastAttempt: ShopeeLastAttempt | null; platformId: string; brandId: string | null; token: { accessToken: string; shopId: string } | null;
    };

/** หมวด Shopee ที่สินค้าประเภทเดียวกัน (หมวดสินค้าในระบบ) บนร้านใช้มากสุด → [{id, n}] เรียงมากไปน้อย */
async function sameTypeCategories(admin: SupabaseClient, platformId: string, productCategoryId: string): Promise<{ id: string; n: number }[]> {
  const [parents, listings] = await Promise.all([
    cached(`pcat:${productCategoryId}`, () => fetchAllPages<{ id: string }>((from, to) => admin.from("parent_skus_v2").select("id").eq("category_id", productCategoryId).range(from, to))),
    cached(`shp-cat:${platformId}`, () => fetchAllPages<{ matched_parent_sku_id: string | null; cat: string | null }>((from, to) => admin.from("platform_catalog_listings")
      .select("matched_parent_sku_id, cat:raw->shopee->>category_id").eq("platform_id", platformId).not("matched_parent_sku_id", "is", null).or(LIVE_LISTING_OR).range(from, to))),
  ]);
  const ids = new Set(parents.map((p) => p.id));
  const count = new Map<string, number>();
  for (const l of listings) if (l.matched_parent_sku_id && ids.has(l.matched_parent_sku_id) && l.cat) count.set(l.cat, (count.get(l.cat) ?? 0) + 1);
  return [...count.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n);
}

/**
 * ผู้สมัครหมวด Shopee ของสินค้า 1 ตัว (เรียงตามลำดับที่ใช้) — ใช้ร่วม: ดูก่อนส่ง/ลงจริง (loadShopeeCreate) + ตารางยืนยันหมวดทีละหลายตัว (./categories)
 *   ร่าง → หมวดกลาง → Shopee แนะนำจากชื่อ (category_recommend · 3 อันดับ · แคช 10 นาที) → หมวดที่สินค้าประเภทเดียวกันบนร้านใช้มากสุด (2 อันดับ)
 */
export async function shopeeCategoryCandidates(admin: SupabaseClient, a: {
  platformId: string; token: { accessToken: string; shopId: string } | null; name: string;
  draftPath: string | null; mappedCategory: string | null; productCategoryId: string | null; productCategoryName: string | null;
}): Promise<ShopeeCategoryPick[]> {
  const cands: ShopeeCategoryPick[] = [];
  const dPath = str(a.draftPath);
  if (shopeeCategoryIdOf(dPath)) cands.push({ id: shopeeCategoryIdOf(dPath)!, label: dPath, kind: "draft", src: "เลือกไว้สำหรับ Shopee" });
  if (shopeeCategoryIdOf(a.mappedCategory)) cands.push({ id: shopeeCategoryIdOf(a.mappedCategory)!, label: str(a.mappedCategory), kind: "central", src: "หมวดกลางของสินค้า → หมวด Shopee" });
  let recIds: string[] = [];
  if (a.token && a.name) {
    const t = a.token, nm = a.name;
    try { recIds = (await cached(`rec:${t.shopId}:${nm}`, () => shopeeCategoryRecommend(t.accessToken, t.shopId, nm))).slice(0, 3); }
    catch (e) { console.warn(`[shopee create] หมวดแนะนำไม่ได้: ${shopeeErrorText(e)}`); }
  }
  let same: { id: string; n: number }[] = [];
  if (a.productCategoryId) { try { same = (await sameTypeCategories(admin, a.platformId, a.productCategoryId)).slice(0, 2); } catch (e) { console.warn(`[shopee create] หมวดสินค้าประเภทเดียวกันไม่ได้: ${(e as Error).message}`); } }
  const labelIds = [...new Set([...recIds, ...same.map((s) => s.id)])];
  const labels = new Map<string, string>();
  if (labelIds.length) {
    const { data: opts } = await admin.from("platform_category_options").select("external_id, name_th, name_en").eq("platform_id", a.platformId).in("external_id", labelIds);
    for (const o of (opts ?? []) as Row[]) labels.set(str(o.external_id), `${str(o.external_id)} · ${str(o.name_th) || str(o.name_en)}`);
  }
  recIds.forEach((id, i) => cands.push({ id, label: labels.get(id) ?? id, kind: "recommend", src: i === 0 ? "Shopee แนะนำจากชื่อสินค้า" : `Shopee แนะนำจากชื่อสินค้า (อันดับ ${i + 1})` }));
  same.forEach((s) => cands.push({ id: s.id, label: labels.get(s.id) ?? s.id, kind: "same_type", src: `สินค้าประเภท "${a.productCategoryName ?? "เดียวกัน"}" บนร้านใช้หมวดนี้ ${s.n.toLocaleString()} ตัว` }));
  return shopeeUniqueCategories(cands);
}

export async function loadShopeeCreate(admin: SupabaseClient, parentId: string, userId: string | null): Promise<ShopeeCreateLoad> {
  const platformId = await getPlatformId(admin, "shopee");
  if (!platformId) return { ok: false, status: 400, error: "ยังไม่มีแพลตฟอร์ม Shopee" };
  const [items, { data: skus }, { data: onShop }] = await Promise.all([
    loadListingContexts(admin, [parentId], platformId),
    admin.from("skus_v2").select("id, code, color_th, color, list_price, fake_price, cover_image_r2_key, attribute_values, is_active, sale_ok").eq("parent_sku_id", parentId).order("code"),
    // 🛡️ กันซ้ำ: มีรายการบน Shopee ที่จับคู่สินค้านี้อยู่แล้ว (ไม่นับตัวที่ร้านลบไปแล้ว)
    admin.from("platform_catalog_listings").select("external_product_id").eq("platform_id", platformId).eq("matched_parent_sku_id", parentId).or(LIVE_LISTING_OR).limit(1),
  ]);
  const it = items[0];
  if (!it) return { ok: false, status: 400, error: "ไม่พบสินค้า" };
  const { data: pRow } = await admin.from("parent_skus_v2").select("brand_id, description, platform_description, weight_g").eq("id", parentId).maybeSingle();
  const pr = (pRow ?? {}) as Row;
  const brandId = str(pr.brand_id) || null;
  const d = it.draft as Row | null;
  const draft = d ? {
    title: d.title == null ? null : String(d.title), description: d.description == null ? null : String(d.description),
    category_path: d.category_path == null ? null : String(d.category_path),
    image_keys: Array.isArray(d.image_keys) ? (d.image_keys as string[]) : null,
    extra: (d.extra && typeof d.extra === "object" ? d.extra : {}) as Record<string, unknown>,
    platform_product_id: d.platform_product_id == null ? null : String(d.platform_product_id),
  } : null;
  const p = it.parent;
  const name = (str(draft?.title) || str(p.name_platform) || str(p.name_th)).replace(/\s+/g, " ");

  // กุญแจร้าน (ผูกกับแบรนด์)
  const blockers: string[] = [];
  let token: { accessToken: string; shopId: string } | null = null;
  if (!brandId) blockers.push("สินค้ายังไม่มีแบรนด์ (กุญแจ Shopee ผูกกับแบรนด์)");
  else {
    const tok = await shopeeTokenOrReason(admin, brandId, platformId, userId);
    if (!tok.ok) blockers.push(`แบรนด์นี้ยังเชื่อม Shopee ไม่ได้: ${tok.reason}`);
    else token = { accessToken: tok.accessToken, shopId: tok.shopId };
  }

  // ---------- หมวด: ร่าง → หมวดกลาง → Shopee แนะนำจากชื่อ → สินค้าประเภทเดียวกันบนร้าน (ตัวเดียวกับตารางยืนยันหมวดทีละหลายตัว) ----------
  const candidates = await shopeeCategoryCandidates(admin, {
    platformId, token, name, draftPath: str(draft?.category_path) || null, mappedCategory: it.platformCategory || null,
    productCategoryId: p.category_id, productCategoryName: p.category_name,
  });
  const category = shopeePickCategory(candidates);

  // ---------- ช่วงตามหมวด + ช่องของหมวด + สินค้าแบบ (ต้องมีกุญแจ) ----------
  let limitsRaw: Record<string, unknown> | null = null;
  let attrFields: TtsAttrField[] | null = null;
  let template: ShopeeTemplate | null = null;
  if (token) {
    const t = token;
    const catId = category?.id ?? null;
    const brandName = p.brand_name ? String(p.brand_name) : "";
    const tplQuery = (withCat: boolean) => {
      let q = admin.from("platform_catalog_listings").select("external_product_id").eq("platform_id", platformId).eq("status", "normal").not("external_product_id", "is", null);
      if (brandId) q = q.eq("brand_id", brandId);
      if (brandName) q = q.ilike("raw->shopee->>brand", `${brandName.replace(/[%_]/g, "")}%`);
      if (withCat && catId) q = q.eq("raw->shopee->>category_id", catId);
      return q.order("last_imported_at", { ascending: false, nullsFirst: false }).limit(1);
    };
    const [lim, tree, tplId] = await Promise.all([
      catId ? shopeeGetCategoryLimit(t.accessToken, t.shopId, catId) : Promise.resolve(null),
      catId ? cached(`tree:${t.shopId}:${catId}`, () => shopeeGetAttributeTree(t.accessToken, t.shopId, catId)).catch((e) => { console.warn(`[shopee create] ช่องของหมวดไม่ได้: ${shopeeErrorText(e)}`); return null; }) : Promise.resolve(null),
      (async () => {
        const a = catId ? ((await tplQuery(true)).data ?? []) as Row[] : [];
        if (a[0]) return str(a[0].external_product_id);
        const b = ((await tplQuery(false)).data ?? []) as Row[];
        return b[0] ? str(b[0].external_product_id) : null;
      })(),
    ]);
    limitsRaw = lim;
    attrFields = tree ? shopeeAttrFieldsOf(tree) : null;
    if (tplId) {
      try {
        const base = await cached(`tpl:${t.shopId}:${tplId}`, async () => (await shopeeGetItemBaseInfo(t.accessToken, t.shopId, [tplId]))[0] ?? null);
        template = base ? shopeeTemplateOf(base) : null;
      } catch (e) { console.warn(`[shopee create] อ่านสินค้าแบบ #${tplId} ไม่ได้: ${shopeeErrorText(e)}`); }
    }
  }

  const exOnShop = ((onShop ?? []) as Row[])[0];
  const { preview, payload } = planShopeeCreate({
    parent: {
      id: parentId, code: str(p.code), name_th: str(p.name_th) || null, name_platform: str(p.name_platform) || null,
      description: pr.description == null ? null : String(pr.description), platform_description: pr.platform_description == null ? null : String(pr.platform_description),
      weight_g: pr.weight_g == null ? null : Number(pr.weight_g), box: { l: p.box_length, w: p.box_width, h: p.box_height }, brand_name: p.brand_name,
    },
    skus: ((skus ?? []) as Row[]).map((s): ShopeeCreateSku => ({
      id: str(s.id), code: str(s.code), color_th: (s.color_th as string) ?? null, color: (s.color as string) ?? null,
      list_price: s.list_price == null ? null : Number(s.list_price), fake_price: s.fake_price == null ? null : Number(s.fake_price),
      cover_image_r2_key: (s.cover_image_r2_key as string) ?? null, attribute_values: (s.attribute_values as Record<string, unknown>) ?? null,
      is_active: s.is_active !== false, sale_ok: s.sale_ok == null ? null : s.sale_ok !== false,
    })),
    draft, category, candidates, galleryKeys: it.images.map((x) => x.key), attrFields, limits: shopeeCreateLimitsOf(limitsRaw), template,
    onShop: exOnShop ? str(exOnShop.external_product_id) : null,
  });
  if (preview.on_shop) blockers.push(`มีบน Shopee แล้ว (#${preview.on_shop}) — ไม่สร้างซ้ำ`);
  const lastAttempt: ShopeeLastAttempt | null = d && (d.last_sync_status || d.platform_product_id)
    ? { status: str(d.last_sync_status) || null, at: str(d.last_synced_at) || null, error: str(d.last_error) || null, product_id: str(d.platform_product_id) || null }
    : null;
  return { ok: true, preview, payload, blockers, lastAttempt, platformId, brandId, token };
}
