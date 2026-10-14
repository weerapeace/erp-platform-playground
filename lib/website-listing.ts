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
  /** ลิงก์เมื่อกด ('' = ไม่มี) เช่น /shop?cat=backpack · /product/bbp10 · https://… */
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
}

export const MAX_LISTING_INSERTS = 20;
export const DEFAULT_LISTING: ListingConfig = { inserts: [], colorFilter: true };

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
  return { inserts, colorFilter: r.colorFilter !== false };
}
