/**
 * สุขภาพสินค้าบนร้าน (ของกลาง · pure · มีเทสต์ lib/__tests__/platform-listing-health.test.ts)
 * --------------------------------------------------------------------------
 * อ่าน "ข้อมูลดิบจากร้าน" (platform_catalog_listings.raw) แล้วสรุปเป็นภาษาเดียวกันทุกแพลตฟอร์ม:
 *   รูปแรก · สต๊อกรวม · เปิด/ปิดขาย · ราคา/ราคาลด · จำนวนตัวเลือก · หมวดบนร้าน · สถานะแบบ Seller Center
 * + กติกาแท็บ (ขายอยู่ / หมด / ปิดขาย / รอตรวจ / ยังไม่จับคู่ / ยังไม่ลง / ไม่อยู่บนร้านแล้ว)
 * + กติกากองงาน (หมดแต่ยังเปิดขาย / ใกล้หมด / ปิดขาย / รอตรวจ / ไม่มีรูปบนร้าน / ชื่อ+รหัสซ้ำ / ยังไม่จับคู่ / ไม่อยู่บนร้านแล้ว)
 *
 * ใช้ที่: /api/platform-catalog?view=shop (สรุปฝั่ง server) · components/platform-catalog/shop-view (แท็บ + กองงาน)
 * ห้ามใช้: ตัดสินว่า "จับคู่แล้วหรือยัง / ระบบเดาให้" → ใช้ listingMatchStatus (lib/platform-match-suggest)
 *
 * ข้อมูลที่แต่ละร้านให้มา (ณ 2026-11):
 *   LINE SHOPPING (raw.line จาก API) = ครบ: isDisplay · variants[].availableNumber/price/discountedPrice · imageUrls · category
 *   Lazada (raw.lazada จาก API)      = สถานะ + สต๊อก/ราคาต่อ SKU · ไม่เก็บรูป (กันข้อมูลบวม — lib/lazada)
 *   Shopee (raw.basic_info จากไฟล์ export) = ชื่อ/รหัสเท่านั้น → สถานะ "ไม่รู้" จนกว่าจะเชื่อม API
 * ห้าม import "@/..." ในไฟล์นี้ (ใช้ทั้ง server/client/เทสต์)
 */

/** สถานะแบบหน้า Seller Center · gone = ร้านลบไปแล้ว (ดึงครบทั้งร้านแต่ไม่เจอตัวนี้) */
export type ShopState = "selling" | "low" | "out" | "hidden" | "review" | "nodata" | "gone";

/**
 * ค่าในช่อง platform_catalog_listings.status ของรายการที่ "ไม่อยู่บนร้านแล้ว"
 * ใครใส่: lib/platform-catalog-sync (ตอนดึงผ่าน API ได้ครบทั้งร้าน แล้วไม่เจอรายการนี้) · เจอกลับมาบนร้าน = ล้างป้ายเอง
 * ไม่ลบแถวเอง — คนกด "ล้างรายการที่ไม่อยู่บนร้าน" ในหน้า สินค้าบนแพลตฟอร์ม
 */
export const LISTING_GONE_STATUS = "removed";
export const isGoneStatus = (status: string | null | undefined): boolean => status === LISTING_GONE_STATUS;
/**
 * ตัวกรอง PostgREST "เฉพาะรายการที่ยังอยู่บนร้าน" → ใช้ `.or(LIVE_LISTING_OR)`
 * (`.neq("status","removed")` อย่างเดียวตัดแถว status null ทิ้งด้วย = เกือบทั้งร้าน)
 * ใช้กับงานที่ยิงไปร้าน/นับของบนร้าน: ส่งราคา/รายละเอียด · กันสร้างซ้ำ · นับจำนวน · ตัวเดาคู่
 */
export const LIVE_LISTING_OR = `status.is.null,status.neq.${LISTING_GONE_STATUS}`;

/** เหลือรวมทุกตัวเลือกไม่เกินนี้ = ใกล้หมด */
export const LOW_STOCK_MAX = 3;

export const SHOP_STATE_LABEL: Record<ShopState, string> = {
  selling: "ขายอยู่", low: "ใกล้หมด", out: "หมด", hidden: "ปิดขาย", review: "รอตรวจ", nodata: "ไม่รู้สถานะ", gone: "ไม่อยู่บนร้านแล้ว",
};

export type ListingShopSummary = {
  /** รูปแรกบนร้าน (null = ร้านไม่มีรูป หรือร้านนี้ไม่ส่งรูปมา — ดู imageKnown) */
  image: string | null;
  /** ร้านนี้ส่งข้อมูลรูปมาให้ไหม (false = ตัดสินว่า "ไม่มีรูป" ไม่ได้) */
  imageKnown: boolean;
  /** สต๊อกพร้อมขายรวมทุกตัวเลือก (null = ไม่รู้) */
  stock: number | null;
  /** เปิดขายอยู่ไหม (null = ไม่รู้) */
  display: boolean | null;
  /** ราคาปกติต่ำสุด */
  price: number | null;
  /** ราคาลดต่ำสุด (null = ไม่มีส่วนลด) */
  salePrice: number | null;
  /** จำนวนตัวเลือก (สี/ไซซ์) บนร้าน */
  variants: number;
  /** หมวดบนร้าน */
  category: string | null;
  state: ShopState;
};

/** สรุปต่อรายการ สำหรับหน้าจับคู่ (การ์ด/ตาราง/กล่องตัวซ้ำ) — GET /api/platform-catalog?view=summary */
export type ListingCardSummary = Omit<ListingShopSummary, "category"> & {
  /** LINE ที่จับคู่แล้ว: จำนวนตัวเลือกที่ "ราคาที่ลูกค้าจ่าย" ไม่ตรงกับที่ระบบจะส่ง (null = ไม่ได้เทียบ) */
  erpPriceDiff?: number | null;
  /** จำนวนตัวเลือกที่จ่ายตรง แต่ราคาเต็ม (ตัวขีดฆ่า) ไม่ตรง — ไม่นับเป็นราคาผิดปกติ */
  erpFullDiff?: number | null;
};
export type ListingSummariesResponse = { summaries: Record<string, ListingCardSummary>; error: string | null };

/** ราคาที่ลูกค้าจ่ายจริง = ราคาลด (ถ้ามี) ไม่งั้นราคาปกติ */
export const effectivePrice = (s: Pick<ListingShopSummary, "price" | "salePrice"> | null | undefined): number | null =>
  s ? (s.salePrice ?? s.price) : null;
/** ลดกี่ % (0 = ไม่ลด/ไม่รู้) — ปัดเป็นจำนวนเต็ม */
export function discountPct(s: Pick<ListingShopSummary, "price" | "salePrice"> | null | undefined): number {
  if (!s || s.price == null || s.price <= 0 || s.salePrice == null || s.salePrice >= s.price) return 0;
  return Math.round((1 - s.salePrice / s.price) * 100);
}

// ───────── ราคาผิดปกติ ─────────
/** ราคาที่ลูกค้าจ่ายต่ำกว่านี้ = น่าสงสัย (เช่น GIFT03 ลดเหลือ 1฿) */
export const PRICE_TINY_UNDER = 10;
/** ลดเกินกี่ % = น่าสงสัย */
export const PRICE_DEEP_PCT = 80;
export type PriceFlag = "tiny" | "deep" | "erp";
export const PRICE_FLAG_LABEL: Record<PriceFlag, string> = {
  tiny: `ราคาต่ำกว่า ${PRICE_TINY_UNDER}฿`, deep: `ลดเกิน ${PRICE_DEEP_PCT}%`, erp: "ราคาขายไม่ตรงระบบ",
};
/** ธงราคาผิดปกติของรายการ 1 ตัว (ว่าง = ปกติ) */
export function priceFlags(s: Pick<ListingCardSummary, "price" | "salePrice" | "erpPriceDiff" | "erpFullDiff"> | null | undefined): PriceFlag[] {
  if (!s) return [];
  const out: PriceFlag[] = [];
  const pay = effectivePrice(s);
  if (pay != null && pay > 0 && pay < PRICE_TINY_UNDER) out.push("tiny");
  if (discountPct(s) > PRICE_DEEP_PCT) out.push("deep");
  if ((s.erpPriceDiff ?? 0) > 0) out.push("erp");
  return out;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const minPositive = (xs: (number | null)[]): number | null => {
  const ok = xs.filter((n): n is number => n != null && n > 0);
  return ok.length ? Math.min(...ok) : null;
};

/** เปิด/ปิดขาย + สต๊อก → สถานะ (hasData=false = ร้านไม่ส่งสถานะมาเลย เช่น ไฟล์ export ของ Shopee) */
export function shopStateOf(display: boolean | null, stock: number | null, hasData: boolean): ShopState {
  if (!hasData) return "nodata";
  if (display === false) return "hidden";
  if (display == null) return "review";
  if (stock == null) return "selling";
  if (stock <= 0) return "out";
  if (stock <= LOW_STOCK_MAX) return "low";
  return "selling";
}

/** LINE SHOPPING: raw.line (ไม่มี = สร้างจากระบบเรา ยังไม่ได้ดึงกลับมา → รอตรวจ) */
function summarizeLine(raw: Obj, fallbackPrice: number | null): ListingShopSummary {
  const line = obj(raw.line);
  if (!line) {
    return { image: null, imageKnown: false, stock: null, display: null, price: fallbackPrice, salePrice: null, variants: 0, category: null, state: "review" };
  }
  const vars = arr(line.variants).map(obj).filter((v): v is Obj => !!v);
  const stock = vars.length ? vars.reduce((s, v) => s + Math.max(0, num(v.availableNumber) ?? 0), 0) : null;
  const display = typeof line.isDisplay === "boolean" ? line.isDisplay : null;
  const price = minPositive(vars.map((v) => num(v.price))) ?? fallbackPrice;
  const sale = minPositive(vars.map((v) => num(v.discountedPrice)));
  const image = str(arr(line.imageUrls)[0]) ?? str(vars.map((v) => v.imageUrl).find((u) => str(u)));
  const cat = obj(line.category);
  return {
    image, imageKnown: true, stock, display, price,
    salePrice: sale != null && (price == null || sale < price) ? sale : null,
    variants: vars.length, category: str(cat?.nameTh) ?? str(cat?.nameEn),
    state: shopStateOf(display, stock, true),
  };
}

/** Lazada: raw.lazada (สถานะร้าน active/inactive/… + สต๊อกต่อ SKU) · ไม่มีรูป */
function summarizeLazada(raw: Obj, fallbackPrice: number | null): ListingShopSummary {
  const laz = obj(raw.lazada) ?? {};
  const skus = arr(laz.skus).map(obj).filter((v): v is Obj => !!v);
  const st = (str(laz.status) ?? "").toLowerCase();
  const display = st === "active" ? true : (st === "inactive" || st === "deleted") ? false : null;
  const stock = skus.length ? skus.reduce((s, v) => s + Math.max(0, num(v.available) ?? num(v.quantity) ?? 0), 0) : null;
  const price = minPositive(skus.map((v) => num(v.price))) ?? fallbackPrice;
  const sale = minPositive(skus.map((v) => num(v.special_price)));
  return {
    image: null, imageKnown: false, stock, display, price,
    salePrice: sale != null && (price == null || sale < price) ? sale : null,
    variants: skus.length, category: null,
    state: shopStateOf(display, stock, true),
  };
}

/**
 * สรุปสินค้า 1 รายการบนร้าน
 * @param platformCode code ใน erp_platforms (line_shopping / lazada / shopee / …)
 * @param raw          platform_catalog_listings.raw (หรือชิ้นส่วนที่ select มาเฉพาะช่องที่ใช้)
 * @param fallbackPrice platform_catalog_listings.price (ใช้เมื่อ raw ไม่มีราคา)
 * @param status       platform_catalog_listings.status — "removed" = ไม่อยู่บนร้านแล้ว (ชนะทุกสถานะ · รูป/ราคาเดิมยังโชว์ไว้ดูอ้างอิง)
 */
export function summarizeListing(platformCode: string, raw: unknown, fallbackPrice: number | null = null, status: string | null = null): ListingShopSummary {
  const s = summarizeRaw(platformCode, obj(raw) ?? {}, fallbackPrice);
  return isGoneStatus(status) ? { ...s, state: "gone" } : s;
}
function summarizeRaw(platformCode: string, r: Obj, fallbackPrice: number | null): ListingShopSummary {
  if (platformCode === "line_shopping") return summarizeLine(r, fallbackPrice);
  if (platformCode === "lazada" && obj(r.lazada)) return summarizeLazada(r, fallbackPrice);
  return { image: null, imageKnown: false, stock: null, display: null, price: fallbackPrice, salePrice: null, variants: 0, category: null, state: "nodata" };
}

// ───────── ชื่อ + รหัสซ้ำบนร้าน ─────────

/** กุญแจเทียบซ้ำ = ชื่อ + รหัสเหมือนกันทุกตัว (รหัสเหมือนแต่ชื่อต่าง = ลงแยกคนละขนาด ไม่นับว่าซ้ำ) */
export function duplicateKey(title: string | null | undefined, sku: string | null | undefined): string | null {
  const t = (title ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  if (!t) return null;
  return `${t}|${(sku ?? "").trim().toLowerCase()}`;
}

/** id → จำนวนรายการในกลุ่มที่ชื่อ+รหัสเหมือนกัน (เฉพาะกลุ่มที่มี ≥2) */
export function duplicateCounts<T extends { id: string; title: string | null; sku_code: string | null }>(rows: T[]): Map<string, number> {
  const groups = new Map<string, string[]>();
  for (const r of rows) {
    const k = duplicateKey(r.title, r.sku_code);
    if (!k) continue;
    const g = groups.get(k);
    if (g) g.push(r.id); else groups.set(k, [r.id]);
  }
  const out = new Map<string, number>();
  for (const ids of groups.values()) if (ids.length > 1) for (const id of ids) out.set(id, ids.length);
  return out;
}

// ───────── รายการที่ API มุมมองหน้าร้านส่งมา ─────────

export type ShopItem = ListingShopSummary & {
  id: string;
  external_product_id: string | null;
  title: string | null;
  sku_code: string | null;
  matched_parent_sku_id: string | null;
  matched_code: string | null;
  matched_name: string | null;
  /** คีย์รูปปกของสินค้าในระบบที่จับคู่ไว้ (ใช้แทนเมื่อร้านไม่มีรูป) */
  matched_cover_key: string | null;
  /** หมวดกลางของสินค้าในระบบที่จับคู่ไว้ (platform_central_categories) — ใช้ชิปกรองหมวด */
  category_id: string | null;
  match_ignored: boolean;
  /** จำนวนรายการบนร้านนี้ที่ชื่อ+รหัสเหมือนกัน (0 = ไม่ซ้ำ) */
  dup_count: number;
  /** งาน (แอปจัดการงาน) ที่ยังไม่ปิดของสินค้าที่จับคู่ไว้ */
  open_tasks: number;
};

/** สินค้าของเรา (Parent SKU) — ใช้ในแท็บ "ยังไม่ลง" และกอง "ไม่มีรูป" */
export type ShopParent = {
  id: string;
  code: string;
  name: string | null;
  cover_key: string | null;
  /** ok = มีรูปปก · sku_only = ไม่มีรูปปกแต่มีรูปที่ SKU · none = ไม่มีรูปเลย */
  image_state: "ok" | "sku_only" | "none";
  open_tasks: number;
  /** หมวดกลาง (platform_central_categories) */
  category_id: string | null;
};

/** หมวดกลางที่ใช้ในแบรนด์นี้ (ชิปกรอง) */
export type ShopCategory = { id: string; name: string; sort: number };

/** การ์ดแบรนด์ในหน้าเลือกแบรนด์ (GET /api/platform-catalog?view=brands) */
export type ShopBrandSummary = {
  id: string;
  name: string;
  logo_key: string | null;
  color: string | null;
  /** Parent SKU ที่เปิดใช้ */
  parents: number;
  /** ตั้งหมวดกลางแล้วกี่ตัว */
  central_set: number;
  /** รายการบนร้าน ต่อ platform code */
  listings: Record<string, number>;
  /** ร้านที่ตั้งบัญชีไว้ (platform_accounts เปิดใช้) — platform code */
  shops: string[];
};
export type ShopBrandsResponse = { brands: ShopBrandSummary[]; platforms: { code: string; name_th: string }[]; error: null | string };

export type ShopViewResponse = {
  platform_code: string;
  items: ShopItem[];
  /** สินค้าของแบรนด์ที่ยังไม่มีรายการบนร้านนี้ (null = ยังไม่ได้เลือกแบรนด์) */
  not_listed: ShopParent[] | null;
  /** สินค้าของแบรนด์ที่ไม่มีรูปปก (none + sku_only) (null = ยังไม่ได้เลือกแบรนด์) */
  no_image: ShopParent[] | null;
  /** ดึง/นำเข้าข้อมูลจากร้านล่าสุด */
  last_imported_at: string | null;
  /** หมวดกลางของสินค้าแบรนด์นี้ (ว่าง = ยังไม่ได้เลือกแบรนด์) */
  categories: ShopCategory[];
  platform_counts?: Record<string, number>;
  error: null | string;
};

// ───────── แท็บ (แบบ A) ─────────

export type ShopTab = "all" | "selling" | "out" | "hidden" | "review" | "unmatched" | "notlisted" | "gone";

export const SHOP_TABS: { key: ShopTab; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "selling", label: "ขายอยู่" },
  { key: "out", label: "หมด" },
  { key: "hidden", label: "ปิดขาย" },
  { key: "review", label: "รอตรวจ" },
  { key: "unmatched", label: "ยังไม่จับคู่" },
  { key: "notlisted", label: "ยังไม่ลง" },
  { key: "gone", label: "ไม่อยู่บนร้านแล้ว" },
];

/** ยังไม่จับคู่ = ไม่มีคู่ในระบบ · ไม่ได้กด "ไม่ต้องจับคู่" · ยังอยู่บนร้าน (ตัวที่ร้านลบแล้วไม่ใช่งานจับคู่) */
export const isUnmatched = (it: Pick<ShopItem, "matched_parent_sku_id" | "match_ignored"> & { state?: ShopState }): boolean =>
  !it.matched_parent_sku_id && !it.match_ignored && it.state !== "gone";

/** รายการนี้อยู่แท็บนี้ไหม (แท็บ notlisted เป็นสินค้าของเรา ไม่ใช่รายการบนร้าน → false เสมอ)
 *  ตัวที่ไม่อยู่บนร้านแล้ว อยู่แท็บ gone แท็บเดียว (ไม่ปนในทั้งหมด/ขายอยู่/…) */
export function inShopTab(it: ShopItem, tab: ShopTab): boolean {
  if (it.state === "gone") return tab === "gone";
  switch (tab) {
    case "all": return true;
    case "selling": return it.state === "selling" || it.state === "low";
    case "out": return it.state === "out";
    case "hidden": return it.state === "hidden";
    case "review": return it.state === "review";
    case "unmatched": return isUnmatched(it);
    default: return false;
  }
}

// ───────── กองงาน (แบบ D) ─────────

export type ShopQueue = "out" | "low" | "hidden" | "review" | "noimg_shop" | "dup" | "unmatched" | "gone";

export const SHOP_QUEUES: { key: ShopQueue; label: string; why: string; tone: "danger" | "warning" | "info" | "neutral" }[] = [
  { key: "out", label: "หมดแต่ยังเปิดขาย", why: "ลูกค้าเห็นสินค้าแต่กดซื้อไม่ได้ — เติมสต๊อกหรือปิดขาย", tone: "danger" },
  { key: "low", label: `ใกล้หมด (≤${LOW_STOCK_MAX} ชิ้น)`, why: "ขายดีอาจหมดใน 1-2 วัน", tone: "warning" },
  { key: "hidden", label: "ปิดขายอยู่", why: "ตรวจว่าตั้งใจปิดไหม — บางตัวยังมีของ", tone: "neutral" },
  { key: "review", label: "รอตรวจ", why: "ระบบสร้างขึ้นร้านแล้วแต่ยังไม่ได้ดึงสถานะกลับมา — กดดึงสินค้าจากร้านใหม่", tone: "info" },
  { key: "noimg_shop", label: "ไม่มีรูปบนร้าน", why: "สินค้าบนร้านไม่มีรูป — ทำรูปแล้วอัปขึ้นร้าน", tone: "warning" },
  { key: "dup", label: "ชื่อ+รหัสซ้ำ", why: "รายการบนร้านที่ชื่อและรหัสเหมือนกันทุกตัว — ตรวจว่าซ้ำจริงไหม", tone: "danger" },
  { key: "unmatched", label: "ยังไม่จับคู่", why: "ยังไม่รู้ว่าตรงกับสินค้าไหนในระบบ — ไปหน้าจับคู่ (ระบบเดาให้แล้ว)", tone: "neutral" },
  { key: "gone", label: "ไม่อยู่บนร้านแล้ว", why: "ดึงสินค้าครบทั้งร้านแล้วไม่เจอ (ร้านลบไปแล้ว) — ล้างออกได้ที่หน้าจับคู่", tone: "neutral" },
];

/** รายการนี้อยู่กองงานนี้ไหม (ตัวที่ไม่อยู่บนร้านแล้ว อยู่กอง gone กองเดียว) */
export function inShopQueue(it: ShopItem, q: ShopQueue): boolean {
  if (it.state === "gone") return q === "gone";
  switch (q) {
    case "out": return it.state === "out";
    case "low": return it.state === "low";
    case "hidden": return it.state === "hidden";
    case "review": return it.state === "review";
    case "noimg_shop": return it.imageKnown && !it.image;
    case "dup": return it.dup_count > 1;
    case "unmatched": return isUnmatched(it);
    default: return false;
  }
}

/** สัดส่วนที่ยังไม่จับคู่เกินนี้ → "ยังไม่ลง" เชื่อไม่ได้ (สินค้าที่ลงแล้วแต่ยังไม่จับคู่จะถูกนับว่ายังไม่ลง) */
export const NOT_LISTED_TRUST_MAX_UNMATCHED = 0.2;

/** แท็บ "ยังไม่ลง" เชื่อได้ไหม (จับคู่ไปแล้วพอสมควร) · ไม่นับตัวที่ไม่อยู่บนร้านแล้ว */
export function notListedTrustworthy(items: (Pick<ShopItem, "matched_parent_sku_id" | "match_ignored"> & { state?: ShopState })[]): boolean {
  const need = items.filter((it) => !it.match_ignored && it.state !== "gone").length;
  if (!need) return true;
  const un = items.filter(isUnmatched).length;
  return un / need <= NOT_LISTED_TRUST_MAX_UNMATCHED;
}
