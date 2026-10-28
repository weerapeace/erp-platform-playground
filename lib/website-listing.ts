/**
 * 🖼 รูปแทรกในหน้ารายการสินค้า (theme.listing) — ไฟล์ pure ใช้ได้ทั้ง API และหน้าจอ
 * storefront มิเรอร์ใน src/lib/site-config.ts (ListingConfig) + components/shop/ListingInsertTile.tsx
 *
 * แต่ละรูป: แทรกหลังสินค้าชิ้นที่ N (0 = ก่อนชิ้นแรก) · ขนาด 1 ช่อง / กว้าง 2 / ใหญ่ 2×2 / เต็มแถว
 *           ใช้กับทุกหน้า / เฉพาะหน้า "ทั้งหมด" / เลือกหมวด · ลิงก์ · ข้อความทับรูป · รูปมือถือแยกได้
 * กฎบนเว็บ: โชว์เฉพาะตอนเรียงแบบ "แนะนำ" และไม่ได้ค้นหา · หมวดที่มีสินค้าน้อยกว่า N ชิ้น = ไม่โชว์รูปนั้น
 *           มือถือ: รูปที่ใหญ่กว่า 1 ช่อง = เต็มแถว (ใช้สัดส่วนมือถือ)
 * 📌 ผูกกับสินค้า (placeBy "product"): วางก่อน/หลังการ์ดของสินค้า (Parent) หรือ SKU ที่เลือก — เจอตัวแรกในหน้า · ไม่เจอ = ไม่โชว์/ใช้ลำดับ
 *           ตามสินค้าไปด้วยตอนลูกค้าเรียง/กรองได้ (anchorFollow) · ตำแหน่งคิดที่ resolveInsertAt (ใช้ร่วมเว็บร้าน)
 * 🎬 วิดีโอ (videoKey / mobileVideoKey) เล่นแทนรูปได้ · รูป = ภาพปกระหว่างโหลด
 */
export type ListingInsertSize = "1x1" | "2x1" | "2x2" | "full";
export type ListingInsertScope = "all" | "shop" | "categories";
export type ListingTextPos = "bottom-left" | "bottom-center" | "center" | "top-left";

export interface ListingInsert {
  id: string;
  enabled: boolean;
  /** รูปบนคอม/แท็บเล็ต (r2 key) */
  imageKey: string | null;
  /** รูปบนมือถือ (ว่าง = ใช้รูปคอม) */
  mobileImageKey: string | null;
  /** แทรกหลังสินค้าชิ้นที่ (0 = ก่อนชิ้นแรก) */
  after: number;
  size: ListingInsertSize;
  scope: ListingInsertScope;
  /** key หมวดเว็บ (scope = categories) */
  categories: string[];
  /** ลิงก์เมื่อกด ('' = ไม่มี) เช่น /c/backpack · /product/bbp10 · https://… */
  link: string;
  title: string;
  text: string;
  /** 🌐 ภาษาอังกฤษ (หน้า /en) + สถานะแปล (LangInput) — ไม่มี = ใช้ไทย */
  title_en?: string;
  text_en?: string;
  _i18n?: Record<string, unknown>;
  textPos: ListingTextPos;
  textColor: "light" | "dark";
  /** สัดส่วนเมื่อรูปอยู่เต็มแถว (คอม) */
  ratio: "3:1" | "21:9" | "2:1" | "16:9";
  /** สัดส่วนบนมือถือ (รูปที่ใหญ่กว่า 1 ช่อง) */
  ratioMobile: "4:5" | "1:1" | "3:4" | "16:9";
  /** 🎬 วิดีโอ (r2 key · ไม่บังคับ) — มี = เล่นแทนรูป (เงียบ วนซ้ำ) · รูป = ภาพปกระหว่างโหลด · มือถือว่าง = ใช้ของคอม */
  videoKey: string | null;
  mobileVideoKey: string | null;
  /** 📌 วางตาม: "pos" = หลังสินค้าชิ้นที่ after (เดิม) · "product" = ผูกกับสินค้าที่เลือก (anchors) */
  placeBy: ListingPlaceBy;
  /** ผูกกับ "parent" (ทุกสีของรุ่น) หรือ "sku" (สีเดียว) */
  anchorKind: "parent" | "sku";
  /** รหัสที่ผูก — parent = "CODE" · sku = "CODE:sku-xxxxxxxx" (รูปแบบเดียวกับการ์ดแบบ SKU) · หลายตัว = ตัวแรกที่เจอในหน้า */
  anchors: string[];
  /** วางก่อน / หลังการ์ดสินค้านั้น */
  anchorSide: "before" | "after";
  /** หน้านั้นไม่มีสินค้าที่ผูก: hide = ไม่โชว์ · pos = ใช้ตำแหน่ง after แทน */
  anchorFallback: "hide" | "pos";
  /** ตามสินค้าไปด้วยตอนลูกค้าเรียง/กรอง (ค้นหาด้วยคำ = ไม่โชว์เหมือนเดิม) */
  anchorFollow: boolean;
}
export type ListingPlaceBy = "pos" | "product";

export interface ListingConfig {
  inserts: ListingInsert[];
  /** 🎨 แถบ "กรองตามสี" (โทนสีกลาง erp_color_tones) ในหน้าสินค้าทั้งหมด/หน้าหมวด — ค่าเริ่มต้นเปิด */
  colorFilter: boolean;
  /** ตำแหน่งตัวกรอง (หมวด + สี): side = แถบซ้าย (มือถือเป็นปุ่ม "ตัวกรอง") · top = แถวเหนือรายการแบบเดิม */
  filterLayout: "side" | "top";
  /** แถบซ้าย (จอคอม) ตอนเปิดหน้า: open = โชว์ · collapsed = พับเข้าซ้าย (ลูกค้ากดปุ่ม "ตัวกรอง" เพื่อกาง) */
  filterSidebar: "open" | "collapsed";
  /** 🧭 ตัวกรอง (ลำดับ/เปิดปิด/ชื่อ) — ดู normalizeShopFilters */
  filters: ShopFilter[];
  /** ช่วงราคา (บาท) เช่น [500,1000,2000] → ต่ำกว่า 500 · 500–1,000 · 1,000–2,000 · 2,000 ขึ้นไป */
  priceBreaks: number[];
  /** ขนาด (ซม. ด้านยาวสุด) [เล็ก/กลาง, กลาง/ใหญ่] */
  sizeBreaks: number[];
  /** สถานะ "สินค้าใหม่" = ขึ้นร้านไม่เกิน N วัน */
  newDays: number;
  /** 📐 สินค้าต่อแถวเฉพาะหน้ารายการสินค้า (null = ใช้ค่า "การ์ดสินค้า" ของทั้งเว็บ) */
  columns: ListingColumns | null;
  /** 📄 แบ่งหน้า: all = โชว์ทั้งหมด (เดิม) · more = ปุ่ม "ดูเพิ่ม" · infinite = เลื่อนแล้วโหลดเอง · pages = เลขหน้า */
  paging: ListingPaging;
  /** จำนวนสินค้าต่อครั้ง/ต่อหน้า (ไม่ใช่ all) */
  pageSize: number;
  /** ↕ การเรียงตอนเปิดหน้า */
  defaultSort: ListingSort;
  /** ตัวเลือกการเรียงที่ลูกค้าเห็น (ตามลำดับ) — ว่าง = ซ่อนช่องเรียง */
  sorts: ListingSort[];
  /** หัวหน้า "สินค้าทั้งหมด" (หน้าหมวดใช้ชื่อ/คำอธิบายของหมวด) */
  header: ListingHeader;
  /** 🚫 สินค้าที่ตั้ง "สินค้าหมด": normal = ตามลำดับเดิม · last = ไปท้ายรายการ · hide = ไม่โชว์ในหน้ารายการ */
  soldOut: ListingSoldOut;
  /** 📌 แถบค้นหา/ตัวกรอง/เรียง ติดบนจอตอนเลื่อนลง (อยู่ใต้หัวเว็บถ้าหัวเว็บติดจอ) */
  stickyBar: boolean;
}
export type ListingSoldOut = "normal" | "last" | "hide";
export const LISTING_SOLD_OUT: { value: ListingSoldOut; label: string; hint: string }[] = [
  { value: "last", label: "ไปไว้ท้ายรายการ", hint: "ยังเห็นได้ แต่ไม่บังของที่ซื้อได้" },
  { value: "hide", label: "ซ่อนจากหน้ารายการ", hint: "ลิงก์ตรงเข้าหน้าสินค้ายังได้" },
  { value: "normal", label: "ตามลำดับปกติ", hint: "อยู่ที่เดิม มีป้ายสินค้าหมด" },
];

export interface ListingColumns {
  desktop: number;
  /** คอมตอนแถบตัวกรองซ้ายกางอยู่ (กินที่ 1 ช่อง) */
  desktopRail: number;
  tablet: number;
  mobile: number;
}
export type ListingPaging = "all" | "more" | "infinite" | "pages";
export type ListingSort = "featured" | "newest" | "best" | "price-asc" | "price-desc" | "name";
export interface ListingHeader {
  /** "" = ค่าเดิมของร้าน */
  eyebrow: string;
  title: string;
  subtitle: string;
  showSearch: boolean;
  showCount: boolean;
}
export const LISTING_PAGINGS: { value: ListingPaging; label: string; hint: string }[] = [
  { value: "all", label: "โชว์ทั้งหมด", hint: "เหมือนเดิม — สินค้าทุกชิ้นในหน้าเดียว" },
  { value: "more", label: "ปุ่ม \"ดูเพิ่ม\"", hint: "โชว์ทีละชุด กดปุ่มเพื่อดูชุดถัดไป" },
  { value: "infinite", label: "เลื่อนแล้วโหลดเอง", hint: "เลื่อนถึงท้ายรายการ ชุดถัดไปขึ้นเอง" },
  { value: "pages", label: "เลขหน้า", hint: "‹ 1 2 3 › ทีละหน้า" },
];
export const LISTING_PAGE_SIZES = [12, 16, 20, 24, 30, 32, 36, 40, 48, 60, 72, 96] as const;
export const LISTING_SORTS: { value: ListingSort; label: string; hint?: string }[] = [
  { value: "featured", label: "แนะนำ", hint: "ลำดับที่จัดไว้ (ลากเรียงในหน้าสินค้าบนเว็บ)" },
  { value: "newest", label: "ใหม่ล่าสุด" },
  { value: "best", label: "ขายดี", hint: "โชว์เมื่อมีข้อมูลยอดขาย" },
  { value: "price-asc", label: "ราคาน้อย → มาก" },
  { value: "price-desc", label: "ราคามาก → น้อย" },
  { value: "name", label: "ชื่อ ก–ฮ" },
];
const SORT_KEYS = LISTING_SORTS.map((s) => s.value);
export const DEFAULT_LISTING_HEADER: ListingHeader = { eyebrow: "", title: "", subtitle: "", showSearch: true, showCount: true };
/** ค่าตั้งต้นตอนกด "ตั้งเฉพาะหน้านี้" — เริ่มจากค่าการ์ดสินค้า */
export const listingColumnsFrom = (c: { desktop: number; tablet: number; mobile: number }): ListingColumns => ({
  desktop: c.desktop,
  desktopRail: Math.max(2, c.desktop - 1),
  tablet: c.tablet,
  mobile: c.mobile,
});

/* ── 🧭 ตัวกรองหน้ารายการสินค้า (theme.listing.filters) — ตั้งใน ERP แท็บดีไซน์ → หน้ารายการสินค้า ──
 * ชนิด: หมวด · สี (โทนสีกลาง) · ช่วงราคา · ขนาด (จากด้านยาวสุด ซม.) · 📐 ไซส์ (ปุ่มไซส์ S/M/L = ตัวเลือกชุดที่ 2) · คอลเลกชัน · ใส่อะไรได้ · สถานะ (พร้อมส่ง/ลดราคา/ใหม่)
 *       · ฟิลด์สินค้า (attrs) — ค่าตรงตัว หรือ "กลุ่มคำ" (เช่น วัสดุ: ไนล่อน = มีคำว่า ไนล่อน/nylon)
 * เว็บร้านคำนวณตัวเลือก + จำนวนเอง (src/lib/shop-filters.ts) · กลุ่มที่ไม่มีตัวเลือกจะซ่อนเอง */
export type ShopFilterKind = "category" | "color" | "price" | "size" | "option2" | "collection" | "fits" | "status" | "field";
export interface ShopFilterKeyword {
  label: string;
  words: string[];
}
export interface ShopFilter {
  /** คงที่สำหรับชนิดในตัว (category/color/…) · ฟิลด์ = "f-<key>" */
  id: string;
  kind: ShopFilterKind;
  label: string;
  enabled: boolean;
  /** กางไว้ตอนเปิดหน้า */
  open: boolean;
  /** kind field: key ใน attrs ของสินค้า (ฟิลด์ Parent SKU ที่ส่งออกเว็บ) */
  field?: string;
  /** kind field: exact = ค่าตรงตัว · keywords = จัดกลุ่มด้วยคำ */
  mode?: "exact" | "keywords";
  keywords?: ShopFilterKeyword[];
}
export const SHOP_FILTER_KIND_LABEL: Record<ShopFilterKind, string> = {
  category: "หมวดหมู่",
  color: "สี (โทน)",
  price: "ช่วงราคา",
  size: "ขนาด",
  option2: "ไซส์ (ปุ่มไซส์)",
  collection: "คอลเลกชัน",
  fits: "ใส่อะไรได้",
  status: "สถานะ",
  field: "ฟิลด์สินค้า",
};
const BUILTIN_FILTERS: ShopFilter[] = [
  { id: "category", kind: "category", label: "หมวดหมู่", enabled: true, open: true },
  { id: "color", kind: "color", label: "สี", enabled: true, open: true },
  { id: "price", kind: "price", label: "ช่วงราคา", enabled: true, open: true },
  { id: "size", kind: "size", label: "ขนาด", enabled: true, open: false },
  // 📐 ไซส์จากปุ่มไซส์ของสินค้า (S/M/L) — ไม่มีสินค้าที่มีไซส์ = ซ่อนเอง · ร้านที่บันทึกตัวกรองไว้แล้ว = ต่อท้ายแบบปิด (ต้องเปิดเองในแท็บนี้)
  { id: "option2", kind: "option2", label: "ไซส์", enabled: true, open: false },
  {
    id: "f-materials",
    kind: "field",
    field: "materials",
    mode: "keywords",
    label: "วัสดุ",
    enabled: true,
    open: false,
    keywords: [
      { label: "ไนล่อน", words: ["ไนล่อน", "nylon"] },
      { label: "หนัง", words: ["หนัง", "leather"] },
      { label: "แคนวาส", words: ["แคนวาส", "canvas"] },
      { label: "ยีนส์ / เดนิม", words: ["ยีนส์", "เดนิม", "denim", "jeans"] },
      { label: "PVC", words: ["pvc"] },
    ],
  },
  { id: "collection", kind: "collection", label: "คอลเลกชัน", enabled: true, open: false },
  { id: "fits", kind: "fits", label: "ใส่อะไรได้", enabled: true, open: false },
  { id: "status", kind: "status", label: "สถานะ", enabled: true, open: false },
];
export const DEFAULT_SHOP_FILTERS: ShopFilter[] = BUILTIN_FILTERS.map((f) => ({ ...f, keywords: f.keywords?.map((k) => ({ ...k, words: [...k.words] })) }));
export const DEFAULT_PRICE_BREAKS = [500, 1000, 2000];
export const DEFAULT_SIZE_BREAKS = [25, 40];

/** เกลาค่าตัวกรอง — ไม่มีมาเลย = ชุดตั้งต้น · ชนิดในตัวที่หายไป = ต่อท้ายแบบปิดไว้ (เพิ่มชนิดใหม่ในอนาคตไม่ไปโผล่เอง) */
export function normalizeShopFilters(raw: unknown, legacyColorOff = false): ShopFilter[] {
  const KINDS: ShopFilterKind[] = ["category", "color", "price", "size", "option2", "collection", "fits", "status", "field"];
  const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  if (!Array.isArray(raw)) return DEFAULT_SHOP_FILTERS.map((f) => (f.kind === "color" && legacyColorOff ? { ...f, enabled: false } : { ...f, keywords: f.keywords?.map((k) => ({ ...k, words: [...k.words] })) }));
  const out: ShopFilter[] = [];
  const seen = new Set<string>();
  for (const x of raw.slice(0, 30)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const kind = KINDS.includes(o.kind as ShopFilterKind) ? (o.kind as ShopFilterKind) : null;
    if (!kind) continue;
    const field = kind === "field" ? txt(o.field, 60).replace(/[^\w.-]/g, "") : undefined;
    if (kind === "field" && !field) continue;
    const id = kind === "field" ? `f-${field}` : kind;
    if (seen.has(id)) continue;
    seen.add(id);
    const keywords =
      kind === "field" && Array.isArray(o.keywords)
        ? (o.keywords as unknown[])
            .map((k) => {
              const r = (k ?? {}) as Record<string, unknown>;
              const words = (Array.isArray(r.words) ? r.words : []).map((w) => txt(w, 40).toLowerCase()).filter(Boolean).slice(0, 12);
              return { label: txt(r.label, 40), words };
            })
            .filter((k) => k.label && k.words.length)
            .slice(0, 20)
        : undefined;
    out.push({
      id,
      kind,
      label: txt(o.label, 40) || (BUILTIN_FILTERS.find((b) => b.kind === kind)?.label ?? SHOP_FILTER_KIND_LABEL[kind]),
      enabled: o.enabled !== false,
      open: o.open === true,
      ...(kind === "field" ? { field, mode: o.mode === "keywords" ? ("keywords" as const) : ("exact" as const), keywords: keywords ?? [] } : {}),
    });
  }
  for (const b of BUILTIN_FILTERS) if (b.kind !== "field" && !seen.has(b.id)) out.push({ ...b, enabled: false });
  return out;
}
const numList = (v: unknown, fb: number[], max: number, lo: number, hi: number) => {
  const arr = Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isFinite(n) && n >= lo && n <= hi).map((n) => Math.round(n)))].sort((a, b) => a - b).slice(0, max) : [];
  return arr.length ? arr : [...fb];
};
export const normalizePriceBreaks = (v: unknown) => numList(v, DEFAULT_PRICE_BREAKS, 6, 1, 1_000_000);
export const normalizeSizeBreaks = (v: unknown) => {
  const a = numList(v, DEFAULT_SIZE_BREAKS, 2, 1, 500);
  return a.length === 2 ? a : [...DEFAULT_SIZE_BREAKS];
};


export const MAX_LISTING_INSERTS = 20;
export const DEFAULT_LISTING: ListingConfig = { inserts: [], colorFilter: true, filterLayout: "side", filterSidebar: "open", filters: DEFAULT_SHOP_FILTERS, priceBreaks: DEFAULT_PRICE_BREAKS, sizeBreaks: DEFAULT_SIZE_BREAKS, newDays: 30, columns: null, paging: "all", pageSize: 24, defaultSort: "featured", sorts: LISTING_SORTS.map((s) => s.value), header: { ...DEFAULT_LISTING_HEADER }, soldOut: "last", stickyBar: false };

export const LISTING_SIZES: { value: ListingInsertSize; label: string; hint: string }[] = [
  { value: "1x1", label: "1 ช่อง (เท่าการ์ดสินค้า)", hint: "มือถือ: 1 ช่อง" },
  { value: "2x1", label: "กว้าง 2 ช่อง", hint: "มือถือ: เต็มแถว" },
  { value: "2x2", label: "ใหญ่ 2×2 ช่อง", hint: "มือถือ: เต็มแถว" },
  { value: "full", label: "เต็มแถว", hint: "สัดส่วนตามที่ตั้งด้านล่าง" },
];
export const LISTING_SCOPES: { value: ListingInsertScope; label: string }[] = [
  { value: "all", label: "ทุกหน้า (ทั้งหมด + ทุกหมวด)" },
  { value: "shop", label: "เฉพาะหน้า \"ทั้งหมด\"" },
  { value: "categories", label: "เลือกหมวด…" },
];
export const LISTING_TEXT_POS: { value: ListingTextPos; label: string }[] = [
  { value: "bottom-left", label: "ล่างซ้าย" },
  { value: "bottom-center", label: "ล่างกลาง" },
  { value: "center", label: "กลางรูป" },
  { value: "top-left", label: "บนซ้าย" },
];
export const LISTING_RATIOS = ["3:1", "21:9", "2:1", "16:9"] as const;
export const LISTING_RATIOS_MOBILE = ["4:5", "1:1", "3:4", "16:9"] as const;

const KEY_RE = /^[\w\-./%()]+$/;

export const newListingInsert = (after = 4): ListingInsert => ({
  id: `li${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
  enabled: true,
  imageKey: null,
  mobileImageKey: null,
  after,
  size: "2x1",
  scope: "all",
  categories: [],
  link: "",
  title: "",
  text: "",
  textPos: "bottom-left",
  textColor: "light",
  ratio: "21:9",
  ratioMobile: "4:5",
  videoKey: null,
  mobileVideoKey: null,
  placeBy: "pos",
  anchorKind: "parent",
  anchors: [],
  anchorSide: "after",
  anchorFallback: "hide",
  anchorFollow: true,
});

/** 🖼 รูปแทรกในกริดสินค้า (ของกลาง — หน้ารายการสินค้า + ชุดมาใหม่รายชุด) → รายการที่ใช้ได้ · ค่าเพี้ยน = ค่าเริ่ม · id ซ้ำ/ไม่มี = ทิ้ง · สูงสุด MAX_LISTING_INSERTS */
export function normalizeListingInserts(v: unknown): ListingInsert[] {
  const one = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb);
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const key = (v: unknown) => (typeof v === "string" && KEY_RE.test(v) ? v : null);
  const seen = new Set<string>();
  const inserts: ListingInsert[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const id = typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const after = Number(o.after);
    const link = str(o.link, 500);
    inserts.push({
      id,
      enabled: o.enabled !== false,
      imageKey: key(o.imageKey),
      mobileImageKey: key(o.mobileImageKey),
      after: Number.isFinite(after) ? Math.min(500, Math.max(0, Math.round(after))) : 4,
      size: one(o.size, ["1x1", "2x1", "2x2", "full"] as const, "2x1"),
      scope: one(o.scope, ["all", "shop", "categories"] as const, "all"),
      categories: (Array.isArray(o.categories) ? o.categories : []).filter((c): c is string => typeof c === "string" && /^[\w-]{1,40}$/.test(c)).slice(0, 30),
      // ลิงก์ภายใน (/...) หรือ http(s) เท่านั้น — กัน javascript:
      link: /^(\/|https?:\/\/)/i.test(link) ? link : "",
      title: str(o.title, 120),
      text: str(o.text, 300),
      // 🌐 2 ภาษา: เก็บไว้ ไม่งั้นข้อความอังกฤษหายตอนบันทึก
      ...(str(o.title_en, 120) ? { title_en: str(o.title_en, 120) } : {}),
      ...(str(o.text_en, 300) ? { text_en: str(o.text_en, 300) } : {}),
      ...(o._i18n && typeof o._i18n === "object" && !Array.isArray(o._i18n) ? { _i18n: o._i18n as Record<string, unknown> } : {}),
      textPos: one(o.textPos, ["bottom-left", "bottom-center", "center", "top-left"] as const, "bottom-left"),
      textColor: one(o.textColor, ["light", "dark"] as const, "light"),
      ratio: one(o.ratio, LISTING_RATIOS, "21:9"),
      ratioMobile: one(o.ratioMobile, LISTING_RATIOS_MOBILE, "4:5"),
      videoKey: key(o.videoKey),
      mobileVideoKey: key(o.mobileVideoKey),
      placeBy: o.placeBy === "product" ? "product" : "pos",
      anchorKind: o.anchorKind === "sku" ? "sku" : "parent",
      anchors: cleanAnchors(o.anchors),
      anchorSide: o.anchorSide === "before" ? "before" : "after",
      anchorFallback: o.anchorFallback === "pos" ? "pos" : "hide",
      anchorFollow: o.anchorFollow !== false,
    });
    if (inserts.length >= MAX_LISTING_INSERTS) break;
  }
  return inserts;
}

/** รหัสที่ผูก: "CODE" หรือ "CODE:sku-xxxxxxxx" · ตัวพิมพ์ใหญ่ที่รหัส · ไม่ซ้ำ · ≤ 30 */
const cleanAnchors = (v: unknown): string[] =>
  [
    ...new Set(
      (Array.isArray(v) ? v : [])
        .map((x) => String(x ?? "").trim())
        .filter((x) => /^[^\s:]{1,60}(:[\w-]{1,40})?$/.test(x))
        .map((x) => {
          const [code, opt] = x.split(":");
          return opt ? `${code.toUpperCase()}:${opt}` : code.toUpperCase();
        }),
    ),
  ].slice(0, 30);

/** การ์ดในกริด (เท่าที่ต้องใช้) — สินค้าของเว็บร้าน / การ์ดแบบ SKU (cardKey "id:sku-x" + cardMain = สีนั้น) */
export interface InsertCardLike {
  code?: string | null;
  slug?: string | null;
  cardKey?: string | null;
  cardMain?: string | null;
}

/** การ์ดตรงกับรหัสที่ผูกไหม — "CODE" = ทุกการ์ดของรุ่นนั้น · "CODE:sku-x" = การ์ดสีนั้น (หน้าที่เป็นการ์ดแบบรุ่น = การ์ดรุ่นของสีนั้น) */
export function cardMatchesAnchor(card: InsertCardLike, ref: string): boolean {
  const [code, opt] = ref.split(":");
  const own = String(card.code ?? card.slug ?? "").toUpperCase();
  if (!own || own !== code.toUpperCase()) return false;
  if (!opt) return true;
  const isSkuCard = !!card.cardKey && card.cardKey.includes(":");
  return isSkuCard ? card.cardMain === opt : true;
}

/**
 * 📌 ตำแหน่งของรูปแทรก = ก่อนการ์ดลำดับที่ at (0 = ก่อนการ์ดแรก) — ใช้ร่วมหน้ารายการสินค้า + ชุดมาใหม่ (เว็บร้าน)
 *   pos = after ตามที่ตั้ง · product = การ์ดแรกที่ตรงกับรหัสที่ผูก → ก่อน/หลังการ์ดนั้น · ไม่เจอ = fallback (ตำแหน่ง after / ไม่โชว์)
 *   via บอกว่าได้ตำแหน่งจากสินค้าที่ผูก หรือจากลำดับ (หน้ารายการ: ตำแหน่งตามลำดับใช้เฉพาะตอนเรียงแบบเริ่มต้น)
 */
export function resolveInsertAt(ins: Pick<ListingInsert, "after" | "placeBy" | "anchors" | "anchorSide" | "anchorFallback">, cards: InsertCardLike[]): { at: number; via: "anchor" | "pos" } | null {
  if (ins.placeBy !== "product") return { at: ins.after, via: "pos" };
  const idx = cards.findIndex((c) => ins.anchors.some((a) => cardMatchesAnchor(c, a)));
  if (idx >= 0) return { at: ins.anchorSide === "before" ? idx : idx + 1, via: "anchor" };
  return ins.anchorFallback === "pos" ? { at: ins.after, via: "pos" } : null;
}

export function normalizeListing(raw: unknown): ListingConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const inserts = normalizeListingInserts(r.inserts);
  return { inserts, colorFilter: r.colorFilter !== false, filterLayout: r.filterLayout === "top" ? "top" : "side", filterSidebar: r.filterSidebar === "collapsed" ? "collapsed" : "open", filters: normalizeShopFilters(r.filters, r.colorFilter === false), priceBreaks: normalizePriceBreaks(r.priceBreaks), sizeBreaks: normalizeSizeBreaks(r.sizeBreaks), newDays: Number.isFinite(Number(r.newDays)) && Number(r.newDays) >= 1 ? Math.min(365, Math.round(Number(r.newDays))) : 30, ...normalizeListingLayout(r) };
}

/** 📐 ต่อแถว · 📄 แบ่งหน้า · ↕ การเรียง · หัวหน้า (ส่วนที่เพิ่มรอบ 2026-10-17) */
function normalizeListingLayout(r: Record<string, unknown>): Pick<ListingConfig, "columns" | "paging" | "pageSize" | "defaultSort" | "sorts" | "header" | "soldOut" | "stickyBar"> {
  const int = (v: unknown, fb: number, lo: number, hi: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fb;
  };
  const c = r.columns && typeof r.columns === "object" ? (r.columns as Record<string, unknown>) : null;
  const columns: ListingColumns | null = c
    ? (() => {
        const desktop = int(c.desktop, 4, 2, 6);
        return { desktop, desktopRail: int(c.desktopRail, Math.max(2, desktop - 1), 1, 6), tablet: int(c.tablet, 3, 1, 4), mobile: int(c.mobile, 2, 1, 3) };
      })()
    : null;
  const paging = (["all", "more", "infinite", "pages"] as const).includes(r.paging as ListingPaging) ? (r.paging as ListingPaging) : "all";
  const sorts = Array.isArray(r.sorts) ? [...new Set(r.sorts.filter((x): x is ListingSort => SORT_KEYS.includes(x as ListingSort)))] : [...SORT_KEYS];
  const defaultSort = SORT_KEYS.includes(r.defaultSort as ListingSort) ? (r.defaultSort as ListingSort) : "featured";
  const h = r.header && typeof r.header === "object" ? (r.header as Record<string, unknown>) : {};
  const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  return {
    columns,
    paging,
    pageSize: int(r.pageSize, 24, 4, 120),
    defaultSort,
    sorts,
    header: { eyebrow: txt(h.eyebrow, 60), title: txt(h.title, 80), subtitle: txt(h.subtitle, 240), showSearch: h.showSearch !== false, showCount: h.showCount !== false },
    soldOut: r.soldOut === "normal" || r.soldOut === "hide" ? r.soldOut : "last",
    stickyBar: r.stickyBar === true,
  };
}

