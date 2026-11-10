/**
 * มุมมองหน้าร้าน (Seller Center) ฝั่ง server — อ่าน DB แล้วสรุปด้วยกฎกลาง lib/platform-listing-health
 * ใช้: GET /api/platform-catalog?view=shop (หน้าสินค้าบนแพลตฟอร์ม → มุมมองหน้าร้าน · เมนูในแอปจัดการงาน)
 * อ่านอย่างเดียว ไม่แก้อะไรในระบบหรือบนร้าน
 *
 * ความเร็ว: ข้อมูลดิบจากร้านมีคำอธิบายยาว ๆ → อ่านผ่านฟังก์ชัน DB platform_listings_slim (แกะ raw ครั้งเดียว/แถว ส่งเฉพาะช่องที่ใช้)
 *   เดิม select raw->line->x หลายช่องผ่าน PostgREST = แกะ raw ซ้ำทุกช่อง + ทุกหน้า → LINE LM 931 รายการ ~3 วิ · ใหม่ ~0.1 วิ (2026-11-10)
 *   (LINE ทั้งร้าน ~920 รายการ ≈ ตัวเลือก 2.5MB ฝั่ง server · ส่งให้หน้าเว็บเฉพาะสรุป)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllPages } from "@/lib/fetch-all";
import { duplicateCounts, isGoneStatus, LIVE_LISTING_OR, summarizeListing, type NotListedMaybe, type ListingCardSummary, type ShopBrandSummary, type ShopCategory, type ShopItem, type ShopParent } from "@/lib/platform-listing-health";
import { expectedLinePrice, linePriceDiff, matchShopVariants, shopVariantsOf, variantLookupCodes, type ListingVariantsResponse, type SkuLite } from "@/lib/platform-variant-match";
import { lineEditStateFromRaw, listingHistoryText, type ListingDetailResponse } from "@/lib/line-listing-edit";
import { lineOptionStructure } from "@/lib/line-variant-structure";
import { giftFromLine } from "@/lib/line-gift";
import { computeMatchSuggestions } from "@/lib/platform-match-server";

type Admin = ReturnType<typeof supabaseAdmin>;
const CHUNK = 200;   // .in() ยาวเกินจะโดนตัด/ช้า → ถามเป็นชุด

type ListingRow = {
  id: string; external_product_id: string | null; title: string | null; sku_code: string | null;
  matched_parent_sku_id: string | null; price: number | null; match_ignored: boolean | null; last_imported_at: string | null;
  /** "removed" = ไม่อยู่บนร้านแล้ว (lib/platform-catalog-sync ติดป้ายตอนดึงครบทั้งร้าน) */
  status: string | null;
  /** ข้อมูลดิบ LINE เฉพาะช่องที่ใช้ { id, isDisplay, variants, imageUrls, category, giftOption } · ไม่มี = null */
  line: { id?: unknown; isDisplay?: unknown; variants?: unknown; imageUrls?: unknown; category?: unknown; giftOption?: unknown } | null;
  lazada: unknown;
};
type LegacyListingRow = Omit<ListingRow, "line"> & { line_id: unknown; line_display: unknown; line_variants: unknown; line_images: unknown; line_cat: unknown; line_gift: unknown };

function chunks<T>(xs: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += CHUNK) out.push(xs.slice(i, i + CHUNK));
  return out;
}

const PAGE = 1000;   // เพดาน PostgREST — หน้าละเต็มเพดาน = รอบน้อยสุด

/**
 * รายการบนร้าน (ร้าน + แบรนด์) + ช่องจากข้อมูลดิบเฉพาะที่ใช้สรุป · เรียงใหม่สุดก่อน
 * อ่านผ่านฟังก์ชัน DB platform_listings_slim (migration 202611280100) · ฟังก์ชันใช้ไม่ได้ (เช่น ยังไม่ได้ลง) → ถอยไปวิธีเดิม (ช้าแต่ได้ข้อมูลครบ)
 */
async function loadListings(admin: Admin, platformId: string, brandId: string): Promise<ListingRow[]> {
  const out: ListingRow[] = [];
  for (let from = 0; from < 100_000; from += PAGE) {
    const { data, error } = await admin.rpc("platform_listings_slim", { p_platform_id: platformId, p_brand_id: brandId || null, p_limit: PAGE, p_offset: from });
    if (error) {
      if (from === 0) { console.warn("[platform-shop-view] platform_listings_slim ใช้ไม่ได้ → ใช้วิธีเดิม:", error.message); return loadListingsLegacy(admin, platformId, brandId); }
      break;   // พังกลางทาง → คืนเท่าที่ได้ (เหมือน fetchAllPages)
    }
    const rows = (data ?? []) as ListingRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** วิธีเดิม (select raw->line->x ผ่าน PostgREST) — สำรองไว้กรณีฟังก์ชัน DB ใช้ไม่ได้ */
async function loadListingsLegacy(admin: Admin, platformId: string, brandId: string): Promise<ListingRow[]> {
  const rows = await fetchAllPages<LegacyListingRow>((from, to) => {
    let q = admin.from("platform_catalog_listings")
      .select("id, external_product_id, title, sku_code, matched_parent_sku_id, price, match_ignored, last_imported_at, status, line_id:raw->line->id, line_display:raw->line->isDisplay, line_variants:raw->line->variants, line_images:raw->line->imageUrls, line_cat:raw->line->category, line_gift:raw->line->giftOption, lazada:raw->lazada")
      .eq("platform_id", platformId);
    if (brandId) q = q.eq("brand_id", brandId);
    return q.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: LegacyListingRow[] | null; error: unknown }>;
  }, { page: PAGE });
  return rows.map(({ line_id, line_display, line_variants, line_images, line_cat, line_gift, ...r }) => ({
    ...r,
    line: line_id != null || line_variants != null ? { id: line_id, isDisplay: line_display, variants: line_variants, imageUrls: line_images, category: line_cat, giftOption: line_gift } : null,
  }));
}

/** ประกอบ raw กลับเป็นรูปเดิม (เฉพาะช่องที่เลือกมา) ให้กฎกลางอ่านได้เหมือนข้อมูลเต็ม */
function rawSlice(r: ListingRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (r.line && (r.line.id != null || r.line.variants != null)) out.line = r.line;
  if (r.lazada != null) out.lazada = r.lazada;
  return out;
}

/** สถานะงานที่ "ปิดแล้ว" อ่านจากตารางสถานะงาน (is_terminal) — ไม่ hardcode */
async function terminalStatuses(admin: Admin): Promise<Set<string>> {
  const { data } = await admin.from("erp_creative_statuses").select("key").eq("is_terminal", true);
  const keys = ((data ?? []) as { key: string }[]).map((s) => s.key);
  return new Set(keys.length ? keys : ["done", "cancelled", "published"]);
}

/** จำนวนงาน (แอปจัดการงาน) ที่ยังไม่ปิด ต่อ Parent SKU — นับทั้งงานที่ผูกหลายสินค้า และช่องสินค้าหลักของงาน */
async function openTaskCounts(admin: Admin, parentIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!parentIds.length) return out;
  const terminal = await terminalStatuses(admin);
  const pairs: { task_id: string; parent_sku_id: string }[] = [];
  await Promise.all(chunks(parentIds).map(async (ids) => {
    const [{ data: links }, { data: direct }] = await Promise.all([
      admin.from("erp_creative_task_parent_skus").select("task_id, parent_sku_id").in("parent_sku_id", ids),
      admin.from("erp_creative_tasks").select("id, parent_sku_id").in("parent_sku_id", ids).eq("is_active", true),
    ]);
    for (const l of (links ?? []) as { task_id: string; parent_sku_id: string }[]) pairs.push(l);
    for (const t of (direct ?? []) as { id: string; parent_sku_id: string }[]) pairs.push({ task_id: t.id, parent_sku_id: t.parent_sku_id });
  }));
  const taskIds = [...new Set(pairs.map((p) => p.task_id))];
  const open = new Set<string>();
  await Promise.all(chunks(taskIds).map(async (ids) => {
    const { data } = await admin.from("erp_creative_tasks").select("id, status").in("id", ids).eq("is_active", true);
    for (const t of (data ?? []) as { id: string; status: string | null }[]) if (!terminal.has(t.status ?? "")) open.add(t.id);
  }));
  const seen = new Set<string>();
  for (const p of pairs) {
    const k = `${p.parent_sku_id}|${p.task_id}`;
    if (!open.has(p.task_id) || seen.has(k)) continue;
    seen.add(k);
    out.set(p.parent_sku_id, (out.get(p.parent_sku_id) ?? 0) + 1);
  }
  return out;
}

type ParentRow = { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null; platform_category_id: string | null };
const PARENT_COLS = "id, code, name_th, cover_image_r2_key, platform_category_id";

/** Parent SKU ที่ไม่มีรูปปก → ดูว่ามีรูปที่อื่นไหม (แกลเลอรี/รูป SKU) */
async function imageStates(admin: Admin, noCover: string[]): Promise<Map<string, "sku_only" | "none">> {
  const hasGallery = new Set<string>();
  const hasSku = new Set<string>();
  await Promise.all(chunks(noCover).map(async (ids) => {
    // ไล่ทีละหน้า — รุ่นละหลายรูป/หลาย SKU ชุดละ 200 รุ่นเกิน 1,000 แถวได้ (PostgREST ตัดเงียบ ๆ)
    const [slots, skus] = await Promise.all([
      fetchAllPages<{ owner_id: string }>((from, to) => admin.from("product_image_slots").select("owner_id").in("owner_id", ids).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: { owner_id: string }[] | null; error: unknown }>),
      fetchAllPages<{ parent_sku_id: string }>((from, to) => admin.from("skus_v2").select("parent_sku_id").in("parent_sku_id", ids).not("cover_image_r2_key", "is", null).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: { parent_sku_id: string }[] | null; error: unknown }>),
    ]);
    for (const s of slots) hasGallery.add(s.owner_id);
    for (const s of skus) hasSku.add(s.parent_sku_id);
  }));
  const out = new Map<string, "sku_only" | "none">();
  // มีรูปในแกลเลอรีแต่ไม่ตั้งปก = ยังมีรูปให้ใช้ → นับรวมกับ "มีรูปที่ SKU" (ตั้งปกได้เลย ไม่ต้องถ่ายใหม่)
  for (const id of noCover) out.set(id, hasGallery.has(id) || hasSku.has(id) ? "sku_only" : "none");
  return out;
}

/**
 * SKU ในระบบตามรหัส (รหัสตัวเลือก + รหัสสี) — รุ่น/ชื่อ/ราคาเต็ม/ราคาขาย
 * รหัสเดียวกันมีทั้งตัวใช้งาน + ตัวที่ปิดแล้ว (เช่น JEAN08-01 ใต้ Parent ซ้ำที่ปิดไป) → ใช้ตัวที่ใช้งานอยู่
 */
async function loadSkuLookup(admin: Admin, codes: string[]): Promise<{ byCode: Map<string, SkuLite>; fakeOf: Map<string, number>; saleOf: Map<string, number> }> {
  type Row = { code: string; parent_sku_id: string | null; name_th: string | null; color: string | null; color_th: string | null; is_active: boolean | null; fake_price: number | null; list_price: number | null };
  const byCode = new Map<string, SkuLite>(); const fakeOf = new Map<string, number>(); const saleOf = new Map<string, number>();
  const activeCodes = new Set<string>();
  const parts = await Promise.all(chunks(codes).map(async (ids) => {
    const { data } = await admin.from("skus_v2").select("code, parent_sku_id, name_th, color, color_th, is_active, fake_price, list_price").in("code", ids);
    return (data ?? []) as Row[];
  }));
  for (const s of parts.flat()) {
    const active = s.is_active !== false;
    if (byCode.has(s.code) && (activeCodes.has(s.code) || !active)) continue;
    byCode.set(s.code, { code: s.code, parent_sku_id: s.parent_sku_id, name: s.color_th || s.color || s.name_th || null });
    const f = Number(s.fake_price); if (Number.isFinite(f) && f > 0) fakeOf.set(s.code, f); else fakeOf.delete(s.code);
    const l = Number(s.list_price); if (Number.isFinite(l) && l > 0) saleOf.set(s.code, l); else saleOf.delete(s.code);
    if (active) activeCodes.add(s.code);
  }
  return { byCode, fakeOf, saleOf };
}

/**
 * สรุปรูป/สต๊อก/สถานะ/ราคาบนร้าน ต่อรายการ (หน้าจับคู่ — การ์ด/ตาราง/กล่องตัวซ้ำ)
 * กฎสรุปตัวเดียวกับมุมมองหน้าร้าน (summarizeListing) · ส่งกลับแค่ตัวเลขสั้น ๆ ไม่ส่งข้อมูลดิบทั้งก้อน
 * LINE ที่จับคู่แล้ว: นับตัวเลือกที่ราคาจ่ายไม่ตรง (erpPriceDiff) / แค่ราคาเต็มไม่ตรง (erpFullDiff) กับที่ระบบจะส่ง — กฎเดียวกับปุ่มส่งราคา
 */
export async function loadListingSummaries(admin: Admin, platformId: string, platformCode: string, brandId: string): Promise<Record<string, ListingCardSummary>> {
  const rows = await loadListings(admin, platformId, brandId);
  const out: Record<string, ListingCardSummary> = {};
  for (const r of rows) {
    const s = summarizeListing(platformCode, rawSlice(r), r.price != null ? Number(r.price) : null, r.status);
    out[r.id] = { image: s.image, imageKnown: s.imageKnown, stock: s.stock, display: s.display, price: s.price, salePrice: s.salePrice, variants: s.variants, state: s.state, erpPriceDiff: null, erpFullDiff: null };
  }
  if (platformCode === "line_shopping") {
    // ตัวที่ไม่อยู่บนร้านแล้วไม่ต้องเทียบราคา (ส่งราคาไปไม่ได้อยู่ดี)
    const matched = rows.filter((r) => r.matched_parent_sku_id && r.line?.variants != null && !isGoneStatus(r.status))
      .map((r) => ({ id: r.id, vs: shopVariantsOf("line_shopping", { line: { variants: r.line?.variants } }) }));
    if (matched.length) {
      const { fakeOf, saleOf } = await loadSkuLookup(admin, variantLookupCodes(matched.flatMap((m) => m.vs.map((v) => v.sku))));
      for (const m of matched) {
        const diffs = m.vs.map((v) => linePriceDiff(v, expectedLinePrice(v.sku, fakeOf, saleOf)));
        out[m.id].erpPriceDiff = diffs.filter((d) => d === "pay").length;
        out[m.id].erpFullDiff = diffs.filter((d) => d === "full").length;
      }
    }
  }
  return out;
}

export type ShopViewData = {
  items: ShopItem[];
  not_listed: ShopParent[] | null;
  no_image: ShopParent[] | null;
  last_imported_at: string | null;
  categories: ShopCategory[];
};

/**
 * ข้อมูลทั้งหมดของมุมมองหน้าร้าน
 * brandId ว่าง = ทุกแบรนด์ (ไม่คำนวณ "ยังไม่ลง/ไม่มีรูป" เพราะต้องรู้ว่าสินค้าแบรนด์ไหนควรอยู่ร้านนี้)
 */
export async function loadShopView(admin: Admin, platformId: string, platformCode: string, brandId: string): Promise<ShopViewData> {
  const [rows, brandParents] = await Promise.all([
    loadListings(admin, platformId, brandId),
    brandId
      ? fetchAllPages<ParentRow>((from, to) => admin.from("parent_skus_v2").select(PARENT_COLS)
          .eq("brand_id", brandId).eq("is_active", true).order("code", { ascending: true }).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: ParentRow[] | null; error: unknown }>)
      : Promise.resolve(null),
  ]);

  // สินค้าในระบบที่จับคู่ไว้ (รหัส/ชื่อ/รูปปก) — ใช้ของแบรนด์ที่โหลดมาแล้วถ้ามี ที่เหลือถามเพิ่ม
  const pMap = new Map<string, ParentRow>((brandParents ?? []).map((p) => [p.id, p]));
  const matchedIds = [...new Set(rows.map((r) => r.matched_parent_sku_id).filter((x): x is string => !!x))];
  const missingIds = matchedIds.filter((id) => !pMap.has(id));
  await Promise.all(chunks(missingIds).map(async (ids) => {
    const { data } = await admin.from("parent_skus_v2").select(PARENT_COLS).in("id", ids);
    for (const p of (data ?? []) as ParentRow[]) pMap.set(p.id, p);
  }));

  // ยังไม่ลง: นับเฉพาะรายการที่ยังอยู่บนร้าน (คู่ของตัวที่ร้านลบไปแล้ว = สินค้านั้นไม่อยู่บนร้านนี้แล้ว)
  const liveRows = rows.filter((r) => !isGoneStatus(r.status));
  const listedIds = new Set(liveRows.map((r) => r.matched_parent_sku_id).filter((x): x is string => !!x));
  const notListedRows = brandParents ? brandParents.filter((p) => !listedIds.has(p.id)) : null;
  const noCoverRows = brandParents ? brandParents.filter((p) => !p.cover_image_r2_key) : null;

  const taskParentIds = [...new Set([...matchedIds, ...(notListedRows ?? []).map((p) => p.id), ...(noCoverRows ?? []).map((p) => p.id)])];
  const [tasks, imgStates] = await Promise.all([
    openTaskCounts(admin, taskParentIds),
    noCoverRows ? imageStates(admin, noCoverRows.map((p) => p.id)) : Promise.resolve(new Map<string, "sku_only" | "none">()),
  ]);

  const dups = duplicateCounts(liveRows);   // ตัวที่ไม่อยู่บนร้านแล้วไม่นับเป็นตัวซ้ำ
  let last: string | null = null;
  const items: ShopItem[] = rows.map((r) => {
    if (r.last_imported_at && (!last || r.last_imported_at > last)) last = r.last_imported_at;
    const p = r.matched_parent_sku_id ? pMap.get(r.matched_parent_sku_id) : undefined;
    return {
      ...summarizeListing(platformCode, rawSlice(r), r.price != null ? Number(r.price) : null, r.status),
      id: r.id, external_product_id: r.external_product_id, title: r.title, sku_code: r.sku_code,
      matched_parent_sku_id: r.matched_parent_sku_id, matched_code: p?.code ?? null, matched_name: p?.name_th ?? null,
      matched_cover_key: p?.cover_image_r2_key ?? null, category_id: p?.platform_category_id ?? null,
      match_ignored: !!r.match_ignored, dup_count: dups.get(r.id) ?? 0,
      open_tasks: r.matched_parent_sku_id ? (tasks.get(r.matched_parent_sku_id) ?? 0) : 0,
      // ของขวัญ (LINE เท่านั้น · ไม่มีข้อมูล = null) — กอง "ยังไม่เปิดของขวัญ"
      gift_on: platformCode === "line_shopping" && r.line?.giftOption != null ? r.line.giftOption !== "NO_GIFT" : null,
    };
  });

  const toParent = (p: ParentRow): ShopParent => ({
    id: p.id, code: p.code ?? "", name: p.name_th, cover_key: p.cover_image_r2_key,
    image_state: p.cover_image_r2_key ? "ok" : (imgStates.get(p.id) ?? "none"),
    open_tasks: tasks.get(p.id) ?? 0, category_id: p.platform_category_id,
  });

  // หมวดกลางที่สินค้าแบรนด์นี้ใช้ (ชิปกรอง) — เรียงตามลำดับที่ตั้งไว้
  const catIds = [...new Set((brandParents ?? []).map((p) => p.platform_category_id).filter((x): x is string => !!x))];
  const categories: ShopCategory[] = [];
  if (catIds.length) {
    const { data } = await admin.from("platform_central_categories").select("id, name, sort_order").in("id", catIds);
    for (const c of (data ?? []) as { id: string; name: string | null; sort_order: number | null }[]) categories.push({ id: c.id, name: c.name ?? "—", sort: c.sort_order ?? 0 });
    categories.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "th"));
  }

  return {
    items,
    not_listed: notListedRows ? notListedRows.map(toParent) : null,
    no_image: noCoverRows ? noCoverRows.map(toParent) : null,
    last_imported_at: last,
    categories,
  };
}

/**
 * การ์ดแบรนด์ (หน้าเลือกแบรนด์ก่อนเข้ามุมมองหน้าร้าน) — นับจากแถวจริง ไม่จดมือ
 * สินค้าในระบบ (Parent SKU เปิดใช้) · ตั้งหมวดกลางแล้ว · รายการบนร้านต่อแพลตฟอร์ม · ร้านที่ตั้งบัญชีไว้
 * ดึงเฉพาะคอลัมน์ id สั้น ๆ (ไม่กี่พันแถว) แล้วนับใน JS — เร็วกว่ายิงนับแยกทีละแบรนด์×ร้าน
 */
export async function loadBrandSummaries(admin: Admin, sellingCodes: readonly string[]): Promise<{ brands: ShopBrandSummary[]; platforms: { code: string; name_th: string }[] }> {
  const [{ data: brands }, { data: pfs }, parents, listings, { data: accounts }] = await Promise.all([
    admin.from("brands").select("id, name, logo_url, color").eq("is_active", true).not("is_customer_job", "is", true).order("name", { ascending: true }),   // แบรนด์งานลูกค้าไม่ขายบนร้านเรา (เหมือน /api/platform-accounts)
    admin.from("erp_platforms").select("id, code, name_th, sort_order").in("code", [...sellingCodes]).order("sort_order", { ascending: true }),
    fetchAllPages<{ id: string; brand_id: string | null; platform_category_id: string | null }>((from, to) =>
      admin.from("parent_skus_v2").select("id, brand_id, platform_category_id").eq("is_active", true).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: { id: string; brand_id: string | null; platform_category_id: string | null }[] | null; error: unknown }>),
    fetchAllPages<{ id: string; brand_id: string | null; platform_id: string }>((from, to) =>
      admin.from("platform_catalog_listings").select("id, brand_id, platform_id").or(LIVE_LISTING_OR).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: { id: string; brand_id: string | null; platform_id: string }[] | null; error: unknown }>),
    admin.from("platform_accounts").select("brand_id, platform_id").eq("is_active", true),
  ]);
  const pfRows = (pfs ?? []) as { id: string; code: string; name_th: string }[];
  const codeOf = new Map(pfRows.map((p) => [p.id, p.code]));
  const out = new Map<string, ShopBrandSummary>();
  for (const b of (brands ?? []) as { id: string; name: string | null; logo_url: string | null; color: string | null }[]) {
    out.set(b.id, { id: b.id, name: b.name ?? "—", logo_key: b.logo_url, color: b.color, parents: 0, central_set: 0, listings: {}, shops: [] });
  }
  for (const p of parents) {
    const b = p.brand_id ? out.get(p.brand_id) : undefined;
    if (!b) continue;
    b.parents++;
    if (p.platform_category_id) b.central_set++;
  }
  for (const l of listings) {
    const b = l.brand_id ? out.get(l.brand_id) : undefined;
    const code = codeOf.get(l.platform_id);
    if (!b || !code) continue;
    b.listings[code] = (b.listings[code] ?? 0) + 1;
  }
  for (const a of (accounts ?? []) as { brand_id: string | null; platform_id: string }[]) {
    const b = a.brand_id ? out.get(a.brand_id) : undefined;
    const code = codeOf.get(a.platform_id);
    if (b && code && !b.shops.includes(code)) b.shops.push(code);
  }
  // แบรนด์ที่มีของบนร้าน/สินค้าเยอะขึ้นก่อน
  const list = [...out.values()].sort((a, b) => {
    const la = Object.values(a.listings).reduce((s, n) => s + n, 0), lb = Object.values(b.listings).reduce((s, n) => s + n, 0);
    return (lb > 0 ? 1 : 0) - (la > 0 ? 1 : 0) || b.parents - a.parents || a.name.localeCompare(b.name, "th");
  });
  return { brands: list, platforms: pfRows.map((p) => ({ code: p.code, name_th: p.name_th })) };
}

/**
 * ตัวเลือกบนร้าน ↔ SKU ในระบบ ของสินค้า 1 รายการบนร้าน (ป๊อปรายละเอียดหน้าจับคู่)
 * อ่านอย่างเดียว — ไม่บันทึกคู่ (ระบบจับด้วยรหัสทุกครั้งที่ส่งราคา/สต๊อก) · กฎจับ = lib/platform-variant-match
 */
export async function loadListingVariants(admin: Admin, listingId: string): Promise<ListingVariantsResponse> {
  const counts = { total: 0, exact: 0, base: 0, none: 0, nosku: 0, other_parent: 0, price_diff: 0, full_diff: 0 };
  const fail = (error: string): ListingVariantsResponse => ({ platform_code: "", matched_parent_code: null, supported: false, fetched: false, rows: [], counts, error });
  const { data: l, error } = await admin.from("platform_catalog_listings")
    .select("id, platform_id, matched_parent_sku_id, line_variants:raw->line->variants, lazada_skus:raw->lazada->skus")
    .eq("id", listingId).maybeSingle();
  if (error) return fail("โหลดสินค้าบนร้านไม่สำเร็จ ลองใหม่อีกครั้ง");
  if (!l) return fail("ไม่พบสินค้านี้ (อาจถูกลบไปแล้ว)");
  const row = l as { platform_id: string; matched_parent_sku_id: string | null; line_variants: unknown; lazada_skus: unknown };
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  const platformCode = String((pf as { code?: string } | null)?.code ?? "");
  const supported = platformCode === "line_shopping" || platformCode === "lazada";
  const fetched = platformCode === "line_shopping" ? row.line_variants != null : platformCode === "lazada" ? row.lazada_skus != null : false;
  const raw = { line: row.line_variants != null ? { variants: row.line_variants } : undefined, lazada: row.lazada_skus != null ? { skus: row.lazada_skus } : undefined };
  const variants = shopVariantsOf(platformCode, raw);

  // SKU ในระบบ (รหัสเอง + รหัสสี) → รุ่น + ราคาที่ระบบจะส่ง (ใช้ตัวที่เปิดใช้งาน ไม่งั้นเตือน "อยู่คนละรุ่น" ผิด)
  const { byCode, fakeOf, saleOf } = await loadSkuLookup(admin, variantLookupCodes(variants.map((v) => v.sku)));
  const parentIds = [...new Set([...[...byCode.values()].map((s) => s.parent_sku_id), row.matched_parent_sku_id].filter(Boolean) as string[])];
  const parentCode = new Map<string, string>();
  for (let i = 0; i < parentIds.length; i += CHUNK) {
    const { data: ps } = await admin.from("parent_skus_v2").select("id, code").in("id", parentIds.slice(i, i + CHUNK));
    for (const p of ((ps ?? []) as { id: string; code: string | null }[])) if (p.code) parentCode.set(p.id, p.code);
  }
  const { rows, counts: c } = matchShopVariants(variants, byCode, row.matched_parent_sku_id, (id) => parentCode.get(id) ?? null,
    platformCode === "line_shopping" ? (sku) => expectedLinePrice(sku, fakeOf, saleOf) : undefined);
  return {
    platform_code: platformCode,
    matched_parent_code: row.matched_parent_sku_id ? parentCode.get(row.matched_parent_sku_id) ?? null : null,
    supported, fetched, rows, counts: c, error: null,
  };
}

/**
 * รายละเอียดสินค้าบนร้าน 1 รายการ (ลิ้นชักสินค้าบนร้าน) — ข้อมูล LINE ที่ดึงมา + คู่ในระบบ + ประวัติ
 * อ่านอย่างเดียว · ตัวเลือก↔SKU/ราคาในระบบ ใช้ loadListingVariants (view=variants)
 */
export async function loadListingDetail(admin: Admin, listingId: string): Promise<ListingDetailResponse> {
  const { data: l, error } = await admin.from("platform_catalog_listings")
    .select("id, platform_id, brand_id, external_product_id, title, sku_code, status, matched_parent_sku_id, last_imported_at, line_raw:raw->line")
    .eq("id", listingId).maybeSingle();
  if (error) return { detail: null, error: "โหลดสินค้าบนร้านไม่สำเร็จ ลองใหม่อีกครั้ง" };
  if (!l) return { detail: null, error: "ไม่พบสินค้านี้ (อาจถูกลบไปแล้ว)" };
  const r = l as { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; title: string | null; sku_code: string | null; status: string | null; matched_parent_sku_id: string | null; last_imported_at: string | null; line_raw: unknown };
  const [{ data: pf }, parentRes, { data: logs }] = await Promise.all([
    admin.from("erp_platforms").select("code").eq("id", r.platform_id).maybeSingle(),
    r.matched_parent_sku_id ? admin.from("parent_skus_v2").select("code, name_th").eq("id", r.matched_parent_sku_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from("audit_logs").select("created_at, metadata").eq("entity_type", "platform_catalog").eq("entity_id", r.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const platformCode = String((pf as { code?: string } | null)?.code ?? "");
  const parent = (parentRes as { data: { code: string | null; name_th: string | null } | null }).data;
  const edit = platformCode === "line_shopping" ? lineEditStateFromRaw(r.line_raw) : null;
  const lineObj = (r.line_raw && typeof r.line_raw === "object") ? r.line_raw as Record<string, unknown> : null;
  return {
    detail: {
      id: r.id, platform_id: r.platform_id, platform_code: platformCode, brand_id: r.brand_id,
      external_product_id: r.external_product_id, title: r.title, sku_code: r.sku_code, status: r.status,
      matched_parent_sku_id: r.matched_parent_sku_id, matched_code: parent?.code ?? null, matched_name: parent?.name_th ?? null,
      last_imported_at: r.last_imported_at,
      line: edit && lineObj ? {
        images: (Array.isArray(lineObj.imageUrls) ? lineObj.imageUrls : []).map((u) => String(u ?? "")).filter(Boolean),
        display: typeof lineObj.isDisplay === "boolean" ? lineObj.isDisplay : null,
        structure: lineOptionStructure(lineObj),
        edit,
        gift: giftFromLine(lineObj),
      } : null,
      history: ((logs ?? []) as { created_at: string; metadata: Record<string, unknown> | null }[]).map((a) => ({
        at: a.created_at, actor: a.metadata && typeof a.metadata.actor === "string" ? a.metadata.actor : null, text: listingHistoryText(a.metadata),
      })),
    },
    error: null,
  };
}

/**
 * สินค้าของแบรนด์ที่ยังไม่ได้ลงร้านนี้ (ปุ่ม "เพิ่มสินค้าขึ้นร้าน") — Parent SKU ที่เปิดใช้ ลบตัวที่จับคู่กับรายการที่ยังอยู่บนร้าน
 * กฎเดียวกับแท็บ "ยังไม่ลง" ของมุมมองหน้าร้าน (นับเฉพาะรายการที่ยังอยู่บนร้าน) — แล้วแยก 3 กอง (NotListedResponse):
 *   พร้อมลง · อาจมีบนร้านแล้ว (ตัวเดาของหน้าจับคู่ชี้มาที่ตัวนี้ — กันลงซ้ำแบบ JEAN08) · ไม่มี SKU เปิดขาย
 */
export async function loadNotListedGroups(admin: Admin, platformId: string, brandId: string): Promise<{ parents: ShopParent[]; maybe: NotListedMaybe[]; no_sku: ShopParent[] }> {
  const [all, sugg] = await Promise.all([loadNotListed(admin, platformId, brandId), computeMatchSuggestions(admin, { platformId, brandId })]);
  const ids = all.map((p) => p.id);
  const withSku = new Set<string>();
  // ⚠️ PostgREST ตัดที่ 1,000 แถว — รุ่นละหลาย SKU (IG ~10+) ชุดละ 200 รุ่นเกินพันแน่ → ไล่ทีละหน้า (เคยพลาด: BCN25 มี 15 SKU ถูกนับว่า "ไม่มี SKU")
  await Promise.all(chunks(ids).map(async (part) => {
    const rows = await fetchAllPages<{ parent_sku_id: string }>((from, to) => admin.from("skus_v2").select("parent_sku_id")
      .in("parent_sku_id", part).eq("is_active", true).not("sale_ok", "is", false).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: { parent_sku_id: string }[] | null; error: unknown }>);
    for (const s of rows) withSku.add(s.parent_sku_id);
  }));
  // รายการบนร้านที่ยังไม่จับคู่ → ตัวเดาอันดับ 1 ชี้ Parent ไหน (เก็บคะแนนสูงสุดต่อ Parent)
  const idSet = new Set(ids);
  const hint = new Map<string, { listing_id: string; external_product_id: string | null; listing_title: string | null; score: number }>();
  for (const l of sugg.listings) {
    const top = sugg.suggestions[l.id]?.[0];
    if (!top || !idSet.has(top.parent_sku_id)) continue;
    const prev = hint.get(top.parent_sku_id);
    if (!prev || top.score > prev.score) hint.set(top.parent_sku_id, { listing_id: l.id, external_product_id: l.external_product_id ?? null, listing_title: l.title ?? null, score: top.score });
  }
  const parents: ShopParent[] = []; const maybe: NotListedMaybe[] = []; const noSku: ShopParent[] = [];
  for (const p of all) {
    const h = hint.get(p.id);
    if (h) maybe.push({ ...p, ...h });
    else if (!withSku.has(p.id)) noSku.push(p);
    else parents.push(p);
  }
  maybe.sort((a, b) => b.score - a.score);
  return { parents, maybe, no_sku: noSku };
}

/** สินค้าของแบรนด์ที่ยังไม่จับคู่กับรายการบนร้านนี้ (ทั้งหมด ยังไม่แยกกอง) */
export async function loadNotListed(admin: Admin, platformId: string, brandId: string): Promise<ShopParent[]> {
  type P = { id: string; code: string | null; name_th: string | null; cover_image_r2_key: string | null; platform_category_id: string | null };
  const [parents, listed] = await Promise.all([
    fetchAllPages<P>((from, to) => admin.from("parent_skus_v2").select("id, code, name_th, cover_image_r2_key, platform_category_id")
      .eq("brand_id", brandId).eq("is_active", true).order("code", { ascending: true }).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: P[] | null; error: unknown }>),
    fetchAllPages<{ matched_parent_sku_id: string | null }>((from, to) => admin.from("platform_catalog_listings").select("matched_parent_sku_id")
      .eq("platform_id", platformId).not("matched_parent_sku_id", "is", null).or(LIVE_LISTING_OR).order("id", { ascending: true }).range(from, to) as unknown as PromiseLike<{ data: { matched_parent_sku_id: string | null }[] | null; error: unknown }>),
  ]);
  const listedIds = new Set(listed.map((x) => x.matched_parent_sku_id).filter(Boolean) as string[]);
  return parents.filter((p) => !listedIds.has(p.id)).map((p) => ({
    id: p.id, code: p.code ?? "", name: p.name_th, cover_key: p.cover_image_r2_key,
    image_state: p.cover_image_r2_key ? "ok" as const : "none" as const, open_tasks: 0, category_id: p.platform_category_id,
  }));
}
