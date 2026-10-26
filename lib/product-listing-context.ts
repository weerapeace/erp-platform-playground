/**
 * ข้อมูลสินค้าสำหรับ "ลงสินค้าบนแพลตฟอร์ม" (ของกลาง · ฝั่งเซิร์ฟเวอร์)
 *
 * ย้ายมาจาก GET /api/product-platforms เพื่อให้ตัวจัดการรายสินค้า (ProductPlatformManager)
 * กับหน้า 📤 ลงสินค้าบนแพลตฟอร์ม (หลายสินค้า) ใช้ตรรกะชุดเดียวกัน:
 *  - โครง 3 ชั้น parent → ตัวสี (master) → ตัวขาย (variant) · ตัวขายสืบทอดรูป/ราคาจากตัวสี
 *  - รวมรูปที่ส่งได้ (ปก → แกลเลอรี → ปกตัวสี → รูปตัวขาย) ไม่ซ้ำ
 *  - น้ำหนัก (กรัม → กก.) + ขนาดกล่อง (parcel_sizes)
 *  - หมวดกลาง → หมวดของแต่ละร้าน (platform_category_mappings)
 * loadListingContext = สินค้าเดียวครบทุกอย่าง · loadListingContexts = หลายสินค้า (ไม่รวมรูปรายละเอียด/สินค้าบนร้านที่จับคู่)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";

type Admin = ReturnType<typeof supabaseAdmin>;
type Row = Record<string, unknown>;

export type ListingImage = { key: string; source: string };
export type ListingVariant = {
  id: string; code: string; name: string; color: string | null;
  fake_price: number | null; sale_price: number | null; discount: number;
  image_key: string | null; is_active: boolean; sale_ok: boolean;
  has_price: boolean; has_image: boolean; inherited_image: boolean;
  option_name: string | null; option_value: string | null;
};
export type ListingPlatform = { id: string; code: string; name_th: string; icon_key: string | null; theme_color: string | null; capabilities: Record<string, unknown> };
export type ListingAccount = { label: string | null; is_active: boolean; external_shop_id: string | null };
export type ListingParent = {
  id: string; code: unknown; name_th: unknown; name_platform: unknown; description: unknown;
  category_id: string | null; category_name: string | null;
  platform_category_id: string | null; platform_category_name: string | null;
  brand_name: string | null; weight_kg: number | null;
  box_width: number | null; box_length: number | null; box_height: number | null;
};
export type ListingContext = {
  parent: ListingParent | null;
  platforms: ListingPlatform[];
  drafts: Record<string, unknown>;
  variants: ListingVariant[];
  mappings: Record<string, string>;
  images: ListingImage[];
  descImages: ListingImage[];
  accounts: Record<string, ListingAccount>;
  matchedListings: Record<string, { id: string; title: string | null; external_id: string | null; sku_code: string | null }>;
};

const PARENT_COLS = "id, code, name_th, name_en, name_platform, introduction, description, platform_description, english_description, cover_image_r2_key, category_id, platform_category_id, brand_id, weight_g, parcel_size_id";
const SKU_COLS = "id, parent_sku_id, code, name_th, color, color_th, list_price, fake_price, cover_image_r2_key, is_active, sale_ok, attribute_values";
const DRAFT_COLS = "platform_id, title, description, category_path, status, image_keys, description_image_keys, extra, platform_product_id, review_link, last_sync_status, last_synced_at, last_error, validation";

// ---------- ตรรกะกลาง (pure) ----------

/** "ฐาน" ของรหัสตัวขาย = ตัดตัวอักษรท้ายที่ตามหลังตัวเลข (WK42-01D → WK42-01) */
export const baseOfCode = (code: string): string | null => { const m = code.match(/^(.*\d)[A-Za-z]+$/); return m ? m[1] : null; };

/** แยกตัวสี (master) ออก · ตัวขายสืบทอดรูป/ราคาจากตัวสีเมื่อไม่มีของตัวเอง */
export function buildVariants(skuRows: Row[]): { variants: ListingVariant[]; masterCodes: Set<string> } {
  const byCode = new Map(skuRows.map((s) => [String(s.code ?? ""), s]));
  const masterCodes = new Set<string>();
  for (const s of skuRows) { const b = baseOfCode(String(s.code ?? "")); if (b && byCode.has(b)) masterCodes.add(b); }

  const variants = skuRows
    .filter((s) => !masterCodes.has(String(s.code ?? "")))   // โชว์เฉพาะตัวขาย/เดี่ยว (ซ่อนตัวสี)
    .map((s): ListingVariant => {
      const code = String(s.code ?? "");
      const base = baseOfCode(code);
      const master = base ? byCode.get(base) : null;   // ตัวสีของตัวขายนี้
      // ราคา: fake_price (เต็ม) + list_price (ขาย) · ไม่มีของตัวเอง → ดึงจากตัวสี · ส่วนลด = เต็ม − ขาย
      const ownFake = s.fake_price == null ? null : Number(s.fake_price);
      const ownSale = s.list_price == null ? null : Number(s.list_price);
      const mFake = master && master.fake_price != null ? Number(master.fake_price) : null;
      const mSale = master && master.list_price != null ? Number(master.list_price) : null;
      const fake_price = ownFake != null ? ownFake : mFake;
      const sale_price = ownSale != null ? ownSale : mSale;
      const discount = (fake_price != null && sale_price != null && fake_price > sale_price) ? (fake_price - sale_price) : 0;
      const ownImg = (s.cover_image_r2_key as string) ?? null;
      const masterImg = master ? ((master.cover_image_r2_key as string) ?? null) : null;
      const image_key = ownImg || masterImg;   // ไม่มีรูปตัวเอง → ดึงจากตัวสี
      const av = (s.attribute_values && typeof s.attribute_values === "object") ? s.attribute_values as Row : {};
      const vo = (av.variant_option && typeof av.variant_option === "object") ? av.variant_option as Row : null;
      return {
        id: String(s.id), code, name: (s.name_th as string) ?? "",
        color: (s.color_th as string) ?? (s.color as string) ?? null, fake_price, sale_price, discount, image_key,
        is_active: s.is_active !== false,
        sale_ok: s.sale_ok !== false,
        has_price: fake_price != null && fake_price > 0, has_image: !!image_key,
        inherited_image: !ownImg && !!masterImg,
        option_name: vo ? (String(vo.name ?? "").trim() || null) : null,
        option_value: vo ? (String(vo.value ?? "").trim() || null) : null,
      };
    });
  return { variants, masterCodes };
}

/** รวมรูปที่เลือกส่งได้: ปก parent + แกลเลอรี parent + ปกตัวสี + รูปประจำตัวขาย (ไม่ซ้ำ) */
export function buildImagePool(parent: Row, galleryAtts: Row[], slots: Row[], skuRows: Row[], masterCodes: Set<string>, variants: ListingVariant[]): ListingImage[] {
  const seen = new Set<string>();
  const images: ListingImage[] = [];
  const addImg = (key: string | null | undefined, source: string) => { const k = (key ?? "").trim(); if (k && !seen.has(k)) { seen.add(k); images.push({ key: k, source }); } };
  addImg(parent.cover_image_r2_key as string, "ปก");
  for (const a of galleryAtts) addImg(a.file_path as string, a.is_primary ? "รูปหลัก" : "แกลเลอรี");
  for (const s of slots) addImg(s.r2_key as string, "แกลเลอรี");
  for (const s of skuRows) if (masterCodes.has(String(s.code ?? ""))) addImg((s.cover_image_r2_key as string) ?? null, `สี ${(s.color_th as string) || (s.color as string) || String(s.code)}`);
  for (const v of variants) addImg(v.image_key, `SKU ${v.code}`);
  return images;
}

const weightKgOf = (weightG: unknown): number | null => {
  const g = weightG != null ? Number(weightG) : null;
  return g != null && Number.isFinite(g) ? Number((g / 1000).toFixed(3)) : null;
};
const boxOf = (pc: Row | null | undefined) => ({
  w: pc && pc.width_cm != null ? Number(pc.width_cm) : null,
  l: pc && pc.length_cm != null ? Number(pc.length_cm) : null,
  h: pc && pc.height_cm != null ? Number(pc.height_cm) : null,
});
const toPlatform = (p: Row): ListingPlatform => ({
  id: String(p.id), code: String(p.code ?? ""), name_th: String(p.name_th ?? p.code ?? ""),
  icon_key: (p.icon_key as string) ?? null, theme_color: (p.theme_color as string) ?? null,
  capabilities: (p.capabilities as Record<string, unknown>) ?? {},
});

export async function loadActivePlatforms(admin: Admin): Promise<ListingPlatform[]> {
  const { data } = await admin.from("erp_platforms").select("id, code, name_th, name_en, icon_key, theme_color, capabilities, sort_order").eq("is_active", true).order("sort_order", { ascending: true });
  return ((data ?? []) as Row[]).map(toPlatform);
}

// ---------- สินค้าเดียว (ตัวจัดการรายสินค้า) ----------

export async function loadListingContext(admin: Admin, parentId: string): Promise<ListingContext> {
  const [{ data: parent }, platforms, { data: drafts }, { data: skus }, { data: slots }, { data: descU }, { data: galleryAtts }, { data: matchedL }] = await Promise.all([
    admin.from("parent_skus_v2").select(PARENT_COLS).eq("id", parentId).maybeSingle(),
    loadActivePlatforms(admin),
    admin.from("platform_listing_drafts").select(DRAFT_COLS).eq("parent_sku_id", parentId),
    admin.from("skus_v2").select(SKU_COLS).eq("parent_sku_id", parentId).order("code", { ascending: true }),
    admin.from("product_image_slots").select("r2_key").eq("owner_id", parentId),
    admin.from("asset_usages").select("asset_id, sort_order").eq("module", "parent_sku_description").eq("record_id", parentId).order("sort_order", { ascending: true }),
    // แกลเลอรีจริงของ Parent SKU ("รูปภาพเพิ่มเติม") — เก็บใน erp_playground_attachments (ไม่ใช่ product_image_slots)
    admin.from("erp_playground_attachments").select("file_path, is_primary, sort_order").eq("entity_type", "parent_skus_v2").eq("entity_id", parentId).order("is_primary", { ascending: false }).order("sort_order", { ascending: true }),
    // สินค้าบนร้าน (platform_catalog_listings) ที่จับคู่กับสินค้านี้อยู่ — ต่อแพลตฟอร์ม
    admin.from("platform_catalog_listings").select("platform_id, id, title, external_product_id, sku_code").eq("matched_parent_sku_id", parentId),
  ]);
  // matchedListings: platform_id → listing ที่จับคู่ (ตัวแรกต่อร้าน)
  const matchedListings: ListingContext["matchedListings"] = {};
  for (const l of ((matchedL ?? []) as Row[])) {
    const pid = String(l.platform_id);
    if (!matchedListings[pid]) matchedListings[pid] = { id: String(l.id), title: (l.title as string) ?? null, external_id: (l.external_product_id as string) ?? null, sku_code: (l.sku_code as string) ?? null };
  }
  const pRow = (parent ?? {}) as Row;
  const categoryId = (pRow.category_id as string) ?? null;
  const platformCategoryId = (pRow.platform_category_id as string) ?? null;   // "หมวดกลางสำหรับลงขาย" → key ของ mapping ต่อแพลตฟอร์ม
  const brandId = (pRow.brand_id as string) ?? null;

  const weightKg = weightKgOf(pRow.weight_g);
  let box = boxOf(null);
  const parcelId = (pRow.parcel_size_id as string) ?? null;
  if (parcelId) {
    const { data: pc } = await admin.from("parcel_sizes").select("width_cm, length_cm, height_cm").eq("id", parcelId).maybeSingle();
    box = boxOf(pc as Row | null);
  }

  // ร้านตามแบรนด์ (แบรนด์ × แพลตฟอร์ม)
  const accounts: Record<string, ListingAccount> = {};
  let brandName: string | null = null;
  if (brandId) {
    const [{ data: accts }, { data: br }] = await Promise.all([
      admin.from("platform_accounts").select("platform_id, label, is_active, external_shop_id").eq("brand_id", brandId),
      admin.from("brands").select("name").eq("id", brandId).maybeSingle(),
    ]);
    for (const a of ((accts ?? []) as Row[])) accounts[String(a.platform_id)] = { label: (a.label as string) ?? null, is_active: a.is_active !== false, external_shop_id: (a.external_shop_id as string) ?? null };
    brandName = (br as { name?: string } | null)?.name ?? null;
  }

  // ชื่อหมวดสินค้าทั่วไป (แสดงเฉย ๆ)
  let categoryName: string | null = null;
  if (categoryId) {
    const { data: cat } = await admin.from("product_categories").select("display_name, name").eq("id", categoryId).maybeSingle();
    categoryName = ((cat as { display_name?: string; name?: string } | null)?.display_name) ?? ((cat as { name?: string } | null)?.name) ?? null;
  }

  // "หมวดกลางสำหรับลงขาย" (platform_central_categories) + mapping ต่อแพลตฟอร์ม
  let platformCategoryName: string | null = null;
  const mappings: Record<string, string> = {};
  if (platformCategoryId) {
    const [{ data: pcat }, { data: maps }] = await Promise.all([
      admin.from("platform_central_categories").select("name").eq("id", platformCategoryId).maybeSingle(),
      admin.from("platform_category_mappings").select("platform_id, platform_category_path").eq("central_category_id", platformCategoryId),
    ]);
    platformCategoryName = (pcat as { name?: string } | null)?.name ?? null;
    for (const m of ((maps ?? []) as Row[])) mappings[String(m.platform_id)] = (m.platform_category_path as string) ?? "";
  }

  const draftMap: Record<string, unknown> = {};
  for (const d of ((drafts ?? []) as Row[])) draftMap[String(d.platform_id)] = d;
  const skuRows = (skus ?? []) as Row[];
  const { variants, masterCodes } = buildVariants(skuRows);
  const images = buildImagePool(pRow, (galleryAtts ?? []) as Row[], (slots ?? []) as Row[], skuRows, masterCodes, variants);

  // รูป "รายละเอียด (Description)" — แยกชุด (asset_usages module=parent_sku_description → assets.r2_key)
  const descImages: ListingImage[] = [];
  const descSeen = new Set<string>();
  const descIds = ((descU ?? []) as Row[]).map((x) => String(x.asset_id)).filter(Boolean);
  if (descIds.length) {
    const { data: descAssets } = await admin.from("assets").select("id, r2_key").in("id", descIds).eq("status", "active");
    const keyById = new Map(((descAssets ?? []) as Row[]).map((a) => [String(a.id), (a.r2_key as string) ?? null]));
    let dn = 1;
    for (const id of descIds) { const k = (keyById.get(id) ?? "").trim(); if (k && !descSeen.has(k)) { descSeen.add(k); descImages.push({ key: k, source: `Description ${dn}` }); } dn++; }
  }

  return {
    parent: parent ? { id: String(pRow.id), code: pRow.code ?? "", name_th: pRow.name_th ?? "", name_platform: pRow.name_platform ?? "", description: (pRow.platform_description || pRow.description) ?? "", category_id: categoryId, category_name: categoryName, platform_category_id: platformCategoryId, platform_category_name: platformCategoryName, brand_name: brandName, weight_kg: weightKg, box_width: box.w, box_length: box.l, box_height: box.h } : null,
    platforms, drafts: draftMap, variants, mappings, images, descImages, accounts, matchedListings,
  };
}

// ---------- หลายสินค้า (หน้า 📤 ลงสินค้าบนแพลตฟอร์ม) ----------

export type BulkListingItem = {
  parent: ListingParent & { central_category_name: string | null };
  variants: ListingVariant[];
  images: ListingImage[];
  /** หมวดของร้านปลายทาง (จากหมวดกลาง) — "" = ยังไม่จับคู่ */
  platformCategory: string;
  draft: Row | null;
};

const chunks = <T,>(arr: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

/**
 * โหลดข้อมูลหลายสินค้า สำหรับร้านเดียว (platformId) — query เป็นชุด ไม่ยิงทีละสินค้า
 * ใช้ตรรกะเดียวกับ loadListingContext (buildVariants / buildImagePool)
 */
export async function loadListingContexts(admin: Admin, parentIds: string[], platformId: string): Promise<BulkListingItem[]> {
  const ids = [...new Set(parentIds.filter(Boolean))];
  if (!ids.length) return [];
  const parents: Row[] = [], skuRows: Row[] = [], gallery: Row[] = [], slots: Row[] = [], drafts: Row[] = [];
  // ทุกชุดยิงพร้อมกัน (แบรนด์ใหญ่ ~1,000 สินค้า = 5 ชุด) — ไม่ต่อคิวทีละชุด
  await Promise.all(chunks(ids, 200).map(async (part) => {
    const [p, s, g, sl, d] = await Promise.all([
      admin.from("parent_skus_v2").select(PARENT_COLS).in("id", part),
      fetchAllPages<Row>((from, to) => admin.from("skus_v2").select(SKU_COLS).in("parent_sku_id", part).order("code", { ascending: true }).order("id", { ascending: true }).range(from, to)),
      fetchAllPages<Row>((from, to) => admin.from("erp_playground_attachments").select("entity_id, file_path, is_primary, sort_order").eq("entity_type", "parent_skus_v2").in("entity_id", part).order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).order("id", { ascending: true }).range(from, to)),
      admin.from("product_image_slots").select("owner_id, r2_key").in("owner_id", part),
      admin.from("platform_listing_drafts").select("parent_sku_id, " + DRAFT_COLS).eq("platform_id", platformId).in("parent_sku_id", part),
    ]);
    parents.push(...((p.data ?? []) as Row[])); skuRows.push(...s); gallery.push(...g);
    slots.push(...((sl.data ?? []) as Row[])); drafts.push(...((d.data ?? []) as unknown as Row[]));
  }));

  const brandIds = [...new Set(parents.map((p) => p.brand_id as string).filter(Boolean))];
  const parcelIds = [...new Set(parents.map((p) => p.parcel_size_id as string).filter(Boolean))];
  const centralIds = [...new Set(parents.map((p) => p.platform_category_id as string).filter(Boolean))];
  const [{ data: brands }, { data: parcels }, { data: centrals }, { data: maps }] = await Promise.all([
    brandIds.length ? admin.from("brands").select("id, name").in("id", brandIds) : Promise.resolve({ data: [] }),
    parcelIds.length ? admin.from("parcel_sizes").select("id, width_cm, length_cm, height_cm").in("id", parcelIds) : Promise.resolve({ data: [] }),
    centralIds.length ? admin.from("platform_central_categories").select("id, name").in("id", centralIds) : Promise.resolve({ data: [] }),
    centralIds.length ? admin.from("platform_category_mappings").select("central_category_id, platform_category_path").eq("platform_id", platformId).in("central_category_id", centralIds) : Promise.resolve({ data: [] }),
  ]);
  const brandName = new Map(((brands ?? []) as Row[]).map((b) => [String(b.id), String(b.name ?? "")]));
  const parcelById = new Map(((parcels ?? []) as Row[]).map((p) => [String(p.id), p]));
  const centralName = new Map(((centrals ?? []) as Row[]).map((c) => [String(c.id), String(c.name ?? "")]));
  const mapByCentral = new Map(((maps ?? []) as Row[]).map((m) => [String(m.central_category_id), String(m.platform_category_path ?? "")]));

  const group = <T extends Row>(rows: T[], key: string) => {
    const m = new Map<string, T[]>();
    for (const r of rows) { const k = String(r[key] ?? ""); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return m;
  };
  const skusBy = group(skuRows, "parent_sku_id");
  const galleryBy = group(gallery, "entity_id");
  const slotsBy = group(slots, "owner_id");
  const draftBy = new Map(drafts.map((d) => [String(d.parent_sku_id), d]));

  return parents.map((pRow) => {
    const id = String(pRow.id);
    const rows = skusBy.get(id) ?? [];
    const { variants, masterCodes } = buildVariants(rows);
    const images = buildImagePool(pRow, galleryBy.get(id) ?? [], slotsBy.get(id) ?? [], rows, masterCodes, variants);
    const box = boxOf(parcelById.get(String(pRow.parcel_size_id ?? "")));
    const central = (pRow.platform_category_id as string) ?? null;
    return {
      parent: {
        id, code: pRow.code ?? "", name_th: pRow.name_th ?? "", name_platform: pRow.name_platform ?? "",
        description: (pRow.platform_description || pRow.description) ?? "",
        category_id: (pRow.category_id as string) ?? null, category_name: null,
        platform_category_id: central, platform_category_name: central ? centralName.get(central) ?? null : null,
        central_category_name: central ? centralName.get(central) ?? null : null,
        brand_name: brandName.get(String(pRow.brand_id ?? "")) ?? null,
        weight_kg: weightKgOf(pRow.weight_g), box_width: box.w, box_length: box.l, box_height: box.h,
      },
      variants, images,
      platformCategory: central ? (mapByCentral.get(central) ?? "").trim() : "",
      draft: draftBy.get(id) ?? null,
    };
  });
}
