/**
 * ตัวโหลดของ "สร้างฉบับร่างบน TikTok" (ไม่ใช่ route · import ได้) — สินค้า + SKU + ร่าง TikTok + ช่องของหมวด/แบรนด์ (ดึงสด · แคช 10 นาที) → แผน
 * กฎประกอบ = lib/tiktok-create-plan (pure + เทสต์) · ใช้ทั้ง GET (ดูก่อนส่ง) และ POST (สร้างจริง) — ต้องเหมือนกันเสมอ (แบบเดียวกับ Lazada)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadListingContexts } from "@/lib/product-listing-context";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import { ttsErrorText, ttsGetBrands, ttsGetCategoryAttributes, ttsShopWarehouseId } from "@/lib/tiktok-shop";
import { planTiktokCreate, ttsAttrDefsOf, ttsCategoryIdOf, type TtsAttrDef, type TtsCreatePreview, type TtsCreateSku } from "@/lib/tiktok-create-plan";
import { getPlatformId, ttsTokenOrReason } from "../shared";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

// แคชในเครื่อง 10 นาที (ช่องของหมวด/แบรนด์เปลี่ยนไม่บ่อย · กันยิง TikTok ทุกครั้งที่เปิดหน้าดูก่อนส่ง)
const TTL = 10 * 60 * 1000;
const cache = new Map<string, { at: number; val: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.val as T;
  const val = await fn();
  cache.set(key, { at: Date.now(), val });
  return val;
}

export type TtsCreateLoad =
  | { ok: false; status: number; error: string }
  | {
      ok: true; preview: TtsCreatePreview; payload: Record<string, unknown>; blockers: string[];
      platformId: string; brandId: string | null; token: { accessToken: string; cipher: string } | null;
    };

export async function loadTiktokCreate(admin: SupabaseClient, parentId: string, userId: string | null): Promise<TtsCreateLoad> {
  const platformId = await getPlatformId(admin, "tiktok");
  if (!platformId) return { ok: false, status: 400, error: "ยังไม่มีแพลตฟอร์ม TikTok" };
  const [items, { data: skus }, { data: onShop }] = await Promise.all([
    loadListingContexts(admin, [parentId], platformId),
    admin.from("skus_v2").select("id, code, color_th, color, list_price, fake_price, cover_image_r2_key, attribute_values, is_active, sale_ok").eq("parent_sku_id", parentId).order("code"),
    // 🛡️ กันซ้ำ: มีรายการบน TikTok ที่จับคู่สินค้านี้อยู่แล้ว (ไม่นับตัวที่ร้านลบไปแล้ว)
    admin.from("platform_catalog_listings").select("external_product_id").eq("platform_id", platformId).eq("matched_parent_sku_id", parentId).or(LIVE_LISTING_OR).limit(1),
  ]);
  const it = items[0];
  if (!it) return { ok: false, status: 400, error: "ไม่พบสินค้า" };
  const { data: pRow } = await admin.from("parent_skus_v2").select("brand_id, description, platform_description, weight_g").eq("id", parentId).maybeSingle();
  const pr = (pRow ?? {}) as Row;
  const brandId = str(pr.brand_id) || null;
  const { data: bRow } = brandId ? await admin.from("brands").select("name").eq("id", brandId).maybeSingle() : { data: null };
  const brandName = str((bRow as Row | null)?.name) || null;
  const d = it.draft as Row | null;
  const draft = d ? {
    title: d.title == null ? null : String(d.title), description: d.description == null ? null : String(d.description),
    category_path: d.category_path == null ? null : String(d.category_path),
    image_keys: Array.isArray(d.image_keys) ? (d.image_keys as string[]) : null,
    extra: (d.extra && typeof d.extra === "object" ? d.extra : {}) as Record<string, unknown>,
    platform_product_id: d.platform_product_id == null ? null : String(d.platform_product_id),
  } : null;
  const categoryId = ttsCategoryIdOf(str(draft?.category_path) || it.platformCategory);

  // กุญแจร้าน (ผูกกับแบรนด์) → ช่องของหมวด + แบรนด์บน TikTok
  const blockers: string[] = [];
  let token: { accessToken: string; cipher: string } | null = null;
  let attrDefs: TtsAttrDef[] | null = null;
  let brand: { id: string; name: string } | null = null;
  let brandNote: string | null = null;
  let warehouseId: string | null | undefined = undefined;
  if (!brandId) blockers.push("สินค้ายังไม่มีแบรนด์ (กุญแจ TikTok ผูกกับแบรนด์)");
  else {
    const tok = await ttsTokenOrReason(admin, brandId, platformId, userId);
    if (!tok.ok) blockers.push(`แบรนด์นี้ยังเชื่อม TikTok ไม่ได้: ${tok.reason}`);
    else if (!tok.meta.shops?.[0]?.cipher) blockers.push("ยังไม่รู้รหัสร้าน TikTok — กด ตรวจการเชื่อมต่อ ที่บัญชีแพลตฟอร์มก่อน");
    else {
      token = { accessToken: tok.accessToken, cipher: tok.meta.shops[0].cipher };
      const t = token;
      // คลังของร้าน (TikTok บังคับ inventory แม้เป็นร่าง) — อ่านจากสินค้าที่มีอยู่ · แคช 10 นาที
      try { warehouseId = await cached(`wh:${t.cipher}`, () => ttsShopWarehouseId(t.accessToken, t.cipher)); }
      catch (e) { warehouseId = null; console.warn(`[tiktok create] หาคลังของร้านไม่ได้: ${ttsErrorText(e)}`); }
      if (categoryId) {
        try { attrDefs = ttsAttrDefsOf(await cached(`attrs:${categoryId}`, () => ttsGetCategoryAttributes(t.accessToken, t.cipher, categoryId))); }
        catch (e) { attrDefs = null; console.warn(`[tiktok create] ดึงช่องของหมวด ${categoryId} ไม่ได้: ${ttsErrorText(e)}`); }
      }
      if (brandName) {
        try {
          const list = await cached(`brands:${brandName}:${categoryId ?? ""}`, () => ttsGetBrands(t.accessToken, t.cipher, { brandName, categoryId }));
          const same = list.find((b) => b.name.toLowerCase() === brandName.toLowerCase());
          if (same && same.authorized !== "UNAUTHORIZED" && same.available !== "UNAVAILABLE") brand = { id: same.id, name: same.name };
          else if (same) brandNote = `แบรนด์ "${same.name}" บน TikTok ร้านยังใช้ในหมวดนี้ไม่ได้ — ไม่ใส่แบรนด์ (ตั้งใน Seller Center ได้)`;
          else brandNote = `ไม่พบแบรนด์ "${brandName}" ในรายชื่อแบรนด์ของร้านบน TikTok — ไม่ใส่แบรนด์`;
        } catch (e) { brandNote = `หาแบรนด์บน TikTok ไม่ได้ (${ttsErrorText(e)}) — ไม่ใส่แบรนด์`; }
      }
    }
  }
  const p = it.parent;
  const exOnShop = ((onShop ?? []) as Row[])[0];
  const { preview, payload } = planTiktokCreate({
    parent: {
      id: parentId, code: str(p.code), name_th: str(p.name_th) || null, name_platform: str(p.name_platform) || null,
      description: pr.description == null ? null : String(pr.description), platform_description: pr.platform_description == null ? null : String(pr.platform_description),
      weight_g: pr.weight_g == null ? null : Number(pr.weight_g), box: { l: p.box_length, w: p.box_width, h: p.box_height },
    },
    skus: ((skus ?? []) as Row[]).map((s): TtsCreateSku => ({
      id: str(s.id), code: str(s.code), color_th: (s.color_th as string) ?? null, color: (s.color as string) ?? null,
      list_price: s.list_price == null ? null : Number(s.list_price), fake_price: s.fake_price == null ? null : Number(s.fake_price),
      cover_image_r2_key: (s.cover_image_r2_key as string) ?? null, attribute_values: (s.attribute_values as Record<string, unknown>) ?? null,
      is_active: s.is_active !== false, sale_ok: s.sale_ok == null ? null : s.sale_ok !== false,
    })),
    draft, mappedCategory: it.platformCategory || null,
    galleryKeys: it.images.map((x) => x.key), attrDefs, brand, brandNote, warehouseId,
    onShop: exOnShop ? str(exOnShop.external_product_id) : null,
  });
  if (preview.on_shop) blockers.push(`มีบน TikTok แล้ว (#${preview.on_shop}) — ไม่สร้างซ้ำ`);
  return { ok: true, preview, payload, blockers, platformId, brandId, token };
}
