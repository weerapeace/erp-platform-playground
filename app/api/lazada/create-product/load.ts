/**
 * ตัวโหลดของ "สร้างสินค้าใหม่บน Lazada" (ไม่ใช่ route · import ได้) — สินค้า + SKU + ร่าง Lazada + ช่องของหมวด (ดึงสด) → แผน
 * กฎประกอบ = lib/lazada-create-plan (pure + เทสต์) · ใช้ทั้ง GET (ดูก่อนส่ง) และ POST (ลงจริง) — ต้องเหมือนกันเสมอ
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadListingContexts } from "@/lib/product-listing-context";
import { LIVE_LISTING_OR } from "@/lib/platform-listing-health";
import { lazErrorText } from "@/lib/lazada";
import { lazAttrDefsWithExtras } from "@/lib/lazada-listing-edit";
import { planLazadaCreate, lazCategoryIdOf, type LazCreatePreview, type LazCreateSku } from "@/lib/lazada-create-plan";
import { getPlatformId, lazCategoryAttrsCached, lazTokenOrReason } from "../shared";

type Row = Record<string, unknown>;
const str = (v: unknown) => (v == null ? "" : String(v)).trim();

export type LazCreateLoad =
  | { ok: false; status: number; error: string }
  | {
      ok: true; preview: LazCreatePreview; payload: Record<string, unknown>; blockers: string[];
      platformId: string; brandId: string | null; token: { accessToken: string; gateway: string } | null; draftExists: boolean;
    };

export async function loadLazadaCreate(admin: SupabaseClient, parentId: string, userId: string | null): Promise<LazCreateLoad> {
  const platformId = await getPlatformId(admin, "lazada");
  if (!platformId) return { ok: false, status: 400, error: "ยังไม่มีแพลตฟอร์ม Lazada" };
  const [items, { data: skus }, { data: onShop }] = await Promise.all([
    loadListingContexts(admin, [parentId], platformId),
    admin.from("skus_v2").select("id, code, color_th, color, list_price, fake_price, cover_image_r2_key, attribute_values, is_active, sale_ok").eq("parent_sku_id", parentId).order("code"),
    // 🛡️ กันซ้ำ: มีรายการบน Lazada ที่จับคู่สินค้านี้อยู่แล้ว (ไม่นับตัวที่ร้านลบไปแล้ว)
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
  const categoryId = lazCategoryIdOf(str(draft?.category_path) || it.platformCategory);

  // ช่องของหมวด — ดึงสดจาก Lazada (ต้องมีกุญแจของแบรนด์)
  const blockers: string[] = [];
  let token: { accessToken: string; gateway: string } | null = null;
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
  const { preview, payload } = planLazadaCreate({
    parent: {
      id: parentId, code: str(p.code), name_th: str(p.name_th) || null, name_platform: str(p.name_platform) || null,
      description: pr.description == null ? null : String(pr.description), platform_description: pr.platform_description == null ? null : String(pr.platform_description),
      weight_g: pr.weight_g == null ? null : Number(pr.weight_g), box: { l: p.box_length, w: p.box_width, h: p.box_height },
    },
    skus: ((skus ?? []) as Row[]).map((s): LazCreateSku => ({
      id: str(s.id), code: str(s.code), color_th: (s.color_th as string) ?? null, color: (s.color as string) ?? null,
      list_price: s.list_price == null ? null : Number(s.list_price), fake_price: s.fake_price == null ? null : Number(s.fake_price),
      cover_image_r2_key: (s.cover_image_r2_key as string) ?? null, attribute_values: (s.attribute_values as Record<string, unknown>) ?? null,
      is_active: s.is_active !== false, sale_ok: s.sale_ok == null ? null : s.sale_ok !== false,
    })),
    draft, mappedCategory: it.platformCategory || null,
    galleryKeys: it.images.map((x) => x.key), attrDefs,
    onShop: exOnShop ? str(exOnShop.external_product_id) : null,
  });
  if (preview.on_shop) blockers.push(`มีบน Lazada แล้ว (#${preview.on_shop}) — ไม่สร้างซ้ำ`);
  return { ok: true, preview, payload, blockers, platformId, brandId, token, draftExists: !!d };
}
