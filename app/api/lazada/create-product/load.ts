/**
 * ตัวโหลดของ "สร้างสินค้าใหม่บน Lazada" (ไม่ใช่ route · import ได้) — สินค้า + SKU + ร่าง Lazada + ช่องของหมวด (ดึงสด) → แผน
 * กฎประกอบ = lib/lazada-create-plan (pure + เทสต์) · ใช้ทั้ง GET (ดูก่อนส่ง) และ POST (ลงจริง) — ต้องเหมือนกันเสมอ
 * ค่าเริ่มต้นช่องคุณลักษณะของร้าน = ui_config listingAttrDefaultsKey("lazada", แบรนด์) (lib/listing-attr-defaults · ป๊อป "ค่าเริ่มต้นของร้าน")
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadListingContexts } from "@/lib/product-listing-context";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import { lazErrorText, type LazGateway } from "@/lib/lazada";
import { lazAttrDefsWithExtras } from "@/lib/lazada-listing-edit";
import { planLazadaCreate, lazCategoryIdOf, type LazCreatePreview, type LazCreateSku } from "@/lib/lazada-create-plan";
import { loadSkuGalleryKeys } from "@/lib/sku-gallery-images";
import { attrRulesOf, listingAttrDefaultsKey } from "@/lib/listing-attr-defaults";
import { loadParentComputedTexts } from "@/lib/spec-export-server";
import { loadDescriptionImageKeys } from "@/lib/description-images";
import { loadFieldHistoryValues } from "@/lib/field-history";
import { getPlatformId, lazCategoryAttrsCached, lazTokenOrReason } from "../shared";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

export type LazCreateLoad =
  | { ok: false; status: number; error: string }
  | {
      ok: true; preview: LazCreatePreview; payload: Record<string, unknown>; blockers: string[];
      platformId: string; brandId: string | null; token: { accessToken: string; gateway: LazGateway } | null; draftExists: boolean;
    };

export async function loadLazadaCreate(admin: SupabaseClient, parentId: string, userId: string | null): Promise<LazCreateLoad> {
  const platformId = await getPlatformId(admin, "lazada");
  if (!platformId) return { ok: false, status: 400, error: "ยังไม่มีแพลตฟอร์ม Lazada" };
  const [items, { data: skus }, { data: onShop }] = await Promise.all([
    loadListingContexts(admin, [parentId], platformId),
    admin.from("skus_v2").select("id, code, color_th, color, color_platform_th, list_price, fake_price, cover_image_r2_key, attribute_values, is_active, sale_ok").eq("parent_sku_id", parentId).order("code"),
    // 🛡️ กันซ้ำ: มีรายการบน Lazada ที่จับคู่สินค้านี้อยู่แล้ว (ไม่นับตัวที่ร้านลบไปแล้ว)
    admin.from("platform_catalog_listings").select("external_product_id").eq("platform_id", platformId).eq("matched_parent_sku_id", parentId).or(LIVE_LISTING_OR).limit(1),
  ]);
  const it = items[0];
  if (!it) return { ok: false, status: 400, error: "ไม่พบสินค้า" };
  // รูปแกลเลอรีของ SKU ทุกตัว (รูปตัวเลือกบน Lazada ได้ ≤ 8 รูป/ตัว) · โหลดไม่ได้ = ใช้แค่ปก (ไม่ล้มทั้งหน้า)
  const skuRows = (skus ?? []) as Row[];
  const [{ data: pRow }, gallery] = await Promise.all([
    admin.from("parent_skus_v2").select("brand_id, description, platform_description, weight_g, warranty, size_length_cm, size_thickness_cm, size_height_cm").eq("id", parentId).maybeSingle(),
    loadSkuGalleryKeys(admin, skuRows.map((s) => str(s.id))).catch((e) => { console.warn("[lazada create] sku gallery", (e as Error).message); return {} as Record<string, string[]>; }),
  ]);
  const pr = (pRow ?? {}) as Row;
  const brandId = str(pr.brand_id) || null;
  // ค่าเริ่มต้นช่องคุณลักษณะของร้าน (ไม่เคยตั้ง = ค่าเริ่มต้นของระบบ) — ดึงคู่กับกุญแจร้าน
  const rulesP = brandId
    ? Promise.resolve(admin.from("ui_config").select("value").eq("key", listingAttrDefaultsKey("lazada", brandId)).maybeSingle()).then((r) => attrRulesOf((r.data as Row | null)?.value), () => null)
    : Promise.resolve(null);
  const numOr = (v: unknown) => (v == null || v === "" ? null : Number(v) || null);
  // Platform Description ที่ Parent SKU โชว์ (คำนวณสด — คอลัมน์เป็นค่าเก่า) + รูป Description · พลาด = ใช้ค่าเดิม (ไม่ล้มทั้งหน้า)
  const liveDescP = loadParentComputedTexts(admin, [parentId], "platform_description").then((m) => m[parentId]?.th ?? null, (e) => { console.warn("[lazada create] platform description", (e as Error).message); return null; });
  const descImgsP = loadDescriptionImageKeys(admin, [parentId]).then((m) => m[parentId] ?? [], (e) => { console.warn("[lazada create] desc images", (e as Error).message); return [] as string[]; });
  const descHistP = loadFieldHistoryValues(admin, "parent_skus_v2", parentId, "platform_description");   // ร่างที่ตรงค่าเก่า = สำเนา (lib/listing-description)
  const nameHistP = Promise.all([loadFieldHistoryValues(admin, "parent_skus_v2", parentId, "name_th"), loadFieldHistoryValues(admin, "parent_skus_v2", parentId, "name_platform")]).then(([a, b]) => [...a, ...b]);   // ชื่อเก่า = สำเนา (lib/listing-title)
  const d = it.draft as Row | null;
  const draft = d ? {
    title: d.title == null ? null : String(d.title), description: d.description == null ? null : String(d.description),
    category_path: d.category_path == null ? null : String(d.category_path),
    image_keys: Array.isArray(d.image_keys) ? (d.image_keys as string[]) : null,
    extra: (d.extra && typeof d.extra === "object" ? d.extra : {}) as Record<string, unknown>,
    platform_product_id: d.platform_product_id == null ? null : String(d.platform_product_id),
  } : null;
  const categoryId = lazCategoryIdOf(str(draft?.category_path) || it.platformCategory);

  // ช่องของหมวด — ดึงสดจาก Lazada (ต้องมีกุญแจของแบรนด์)
  const blockers: string[] = [];
  let token: { accessToken: string; gateway: LazGateway } | null = null;
  let attrDefs = null as ReturnType<typeof lazAttrDefsWithExtras> | null;
  if (!brandId) blockers.push("สินค้ายังไม่มีแบรนด์ (กุญแจ Lazada ผูกกับแบรนด์)");
  else {
    const tok = await lazTokenOrReason(admin, brandId, platformId, userId);
    if (!tok.ok) blockers.push(`แบรนด์นี้ยังเชื่อม Lazada ไม่ได้: ${tok.reason}`);
    else {
      token = { accessToken: tok.accessToken, gateway: tok.gateway };
      if (categoryId) {
        // แคช 10 นาที + ลองซ้ำเมื่อโดนจำกัดความถี่ (ของใช้ร่วมกับลิ้นชัก Lazada)
        try { attrDefs = lazAttrDefsWithExtras(await lazCategoryAttrsCached(tok.gateway, tok.accessToken, categoryId)); }
        catch (e) { blockers.push(`ดึงช่องของหมวดจาก Lazada ไม่ได้: ${lazErrorText(e)}`); }
      }
    }
  }
  const p = it.parent;
  const exOnShop = ((onShop ?? []) as Row[])[0];
  const [attrRules, liveDesc, descImgs, descHist, nameHist] = await Promise.all([rulesP, liveDescP, descImgsP, descHistP, nameHistP]);
  const { preview, payload } = planLazadaCreate({
    parent: {
      id: parentId, code: str(p.code), name_th: str(p.name_th) || null, name_platform: str(p.name_platform) || null,
      description: pr.description == null ? null : String(pr.description), platform_description: pr.platform_description == null ? null : String(pr.platform_description),
      weight_g: pr.weight_g == null ? null : Number(pr.weight_g), box: { l: p.box_length, w: p.box_width, h: p.box_height },
      warranty: pr.warranty == null ? null : String(pr.warranty), size: { l: numOr(pr.size_length_cm), w: numOr(pr.size_thickness_cm), h: numOr(pr.size_height_cm) },
      platform_description_live: liveDesc, platform_description_history: descHist, name_history: nameHist, desc_image_keys: descImgs,
    },
    skus: skuRows.map((s): LazCreateSku => ({
      id: str(s.id), code: str(s.code), color_th: (s.color_th as string) ?? null, color: (s.color as string) ?? null, color_platform_th: (s.color_platform_th as string) ?? null,
      list_price: s.list_price == null ? null : Number(s.list_price), fake_price: s.fake_price == null ? null : Number(s.fake_price),
      cover_image_r2_key: (s.cover_image_r2_key as string) ?? null, attribute_values: (s.attribute_values as Record<string, unknown>) ?? null,
      is_active: s.is_active !== false, sale_ok: s.sale_ok == null ? null : s.sale_ok !== false,
      gallery_keys: gallery[str(s.id)] ?? [],
    })),
    draft, mappedCategory: it.platformCategory || null,
    galleryKeys: it.images.map((x) => x.key), attrDefs,
    onShop: exOnShop ? str(exOnShop.external_product_id) : null, attrRules,
  });
  if (preview.on_shop) blockers.push(`มีบน Lazada แล้ว (#${preview.on_shop}) — ไม่สร้างซ้ำ`);
  return { ok: true, preview, payload, blockers, platformId, brandId, token, draftExists: !!d };
}
