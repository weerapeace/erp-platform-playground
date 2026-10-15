/**
 * 🖼 รูปแทรกในหน้ารายการสินค้า (theme.listing) — ไฟล์ pure ใช้ได้ทั้ง API และหน้าจอ
 * storefront มิเรอร์ใน src/lib/site-config.ts (ListingConfig) + components/shop/ListingInsertTile.tsx
 *
 * แต่ละรูป: แทรกหลังสินค้าชิ้นที่ N (0 = ก่อนชิ้นแรก) · ขนาด 1 ช่อง / กว้าง 2 / ใหญ่ 2×2 / เต็มแถว
 *           ใช้กับทุกหน้า / เฉพาะหน้า "ทั้งหมด" / เลือกหมวด · ลิงก์ · ข้อความทับรูป · รูปมือถือแยกได้
 * กฎบนเว็บ: โชว์เฉพาะตอนเรียงแบบ "แนะนำ" และไม่ได้ค้นหา · หมวดที่มีสินค้าน้อยกว่า N ชิ้น = ไม่โชว์รูปนั้น
 *           มือถือ: รูปที่ใหญ่กว่า 1 ช่อง = เต็มแถว (ใช้สัดส่วนมือถือ)
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
  textPos: ListingTextPos;
  textColor: "light" | "dark";
  /** สัดส่วนเมื่อรูปอยู่เต็มแถว (คอม) */
  ratio: "3:1" | "21:9" | "2:1" | "16:9";
  /** สัดส่วนบนมือถือ (รูปที่ใหญ่กว่า 1 ช่อง) */
  ratioMobile: "4:5" | "1:1" | "3:4" | "16:9";
}

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
}

/* ── 🧭 ตัวกรองหน้ารายการสินค้า (theme.listing.filters) — ตั้งใน ERP แท็บดีไซน์ → หน้ารายการสินค้า ──
 * ชนิด: หมวด · สี (โทนสีกลาง) · ช่วงราคา · ขนาด (จากด้านยาวสุด ซม.) · คอลเลกชัน · ใส่อะไรได้ · สถานะ (พร้อมส่ง/ลดราคา/ใหม่)
 *       · ฟิลด์สินค้า (attrs) — ค่าตรงตัว หรือ "กลุ่มคำ" (เช่น วัสดุ: ไนล่อน = มีคำว่า ไนล่อน/nylon)
 * เว็บร้านคำนวณตัวเลือก + จำนวนเอง (src/lib/shop-filters.ts) · กลุ่มที่ไม่มีตัวเลือกจะซ่อนเอง */
export type ShopFilterKind = "category" | "color" | "price" | "size" | "collection" | "fits" | "status" | "field";
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
  const KINDS: ShopFilterKind[] = ["category", "color", "price", "size", "collection", "fits", "status", "field"];
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
export const DEFAULT_LISTING: ListingConfig = { inserts: [], colorFilter: true, filterLayout: "side", filterSidebar: "open", filters: DEFAULT_SHOP_FILTERS, priceBreaks: DEFAULT_PRICE_BREAKS, sizeBreaks: DEFAULT_SIZE_BREAKS, newDays: 30 };

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
});

export function normalizeListing(raw: unknown): ListingConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const one = <T extends string>(v: unknown, allowed: readonly T[], fb: T): T => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fb);
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const key = (v: unknown) => (typeof v === "string" && KEY_RE.test(v) ? v : null);
  const seen = new Set<string>();
  const inserts: ListingInsert[] = [];
  for (const x of Array.isArray(r.inserts) ? r.inserts : []) {
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
      textPos: one(o.textPos, ["bottom-left", "bottom-center", "center", "top-left"] as const, "bottom-left"),
      textColor: one(o.textColor, ["light", "dark"] as const, "light"),
      ratio: one(o.ratio, LISTING_RATIOS, "21:9"),
      ratioMobile: one(o.ratioMobile, LISTING_RATIOS_MOBILE, "4:5"),
    });
    if (inserts.length >= MAX_LISTING_INSERTS) break;
  }
  return { inserts, colorFilter: r.colorFilter !== false, filterLayout: r.filterLayout === "top" ? "top" : "side", filterSidebar: r.filterSidebar === "collapsed" ? "collapsed" : "open", filters: normalizeShopFilters(r.filters, r.colorFilter === false), priceBreaks: normalizePriceBreaks(r.priceBreaks), sizeBreaks: normalizeSizeBreaks(r.sizeBreaks), newDays: Number.isFinite(Number(r.newDays)) && Number(r.newDays) >= 1 ? Math.min(365, Math.round(Number(r.newDays))) : 30 };
}

