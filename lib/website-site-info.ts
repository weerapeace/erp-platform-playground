/**
 * ของกลาง — "ข้อมูลร้าน" ของเว็บร้านออนไลน์ (คำโปรย · ช่องทางติดต่อ · กติกาการสั่งซื้อ)
 *
 * เก็บที่ตาราง `store_settings` (shop_id, key, value) — ร้านละชุด ไม่ต้องเพิ่มคอลัมน์ใหม่
 * ใช้ร่วมกัน 3 ที่:
 *   - /api/website/settings          (แท็บ "🏪 ข้อมูลร้าน" ใน ERP อ่าน/บันทึก)
 *   - /api/public/storefront/site    (ส่งให้เว็บร้านไปวาด footer / หน้าติดต่อ / เงื่อนไขส่ง)
 *   - /api/public/storefront/orders  (ใช้คิดค่าส่ง + ตรวจช่องทางชำระเงินตอนลูกค้ากดสั่ง)
 *
 * กฎ: ฟิลด์ที่ `isPublic: false` (เช่น prefix เลขออเดอร์) ห้ามหลุดไป API สาธารณะ — ดู publicSiteInfo()
 */

export type SiteInfoType = "text" | "textarea" | "number" | "bool";

export interface SiteInfoField {
  key: string;
  label: string;
  hint?: string;
  group: "shop" | "contact" | "order";
  type: SiteInfoType;
  /** ส่งให้เว็บร้าน (API สาธารณะ) ได้ไหม */
  isPublic: boolean;
  placeholder?: string;
}

export const SITE_INFO_GROUPS: { key: SiteInfoField["group"]; label: string; hint: string }[] = [
  { key: "shop", label: "🏪 ร้าน", hint: "ข้อความแนะนำร้านที่โชว์ท้ายเว็บและใน Google" },
  { key: "contact", label: "📞 ช่องทางติดต่อ", hint: "ขึ้นที่ท้ายเว็บและหน้า /contact — เว้นว่างช่องไหน เว็บจะไม่โชว์ช่องนั้น" },
  { key: "order", label: "🧾 การสั่งซื้อ", hint: "ค่าส่ง ช่องทางชำระเงิน และเลขที่ออเดอร์ — มีผลทันทีตอนลูกค้ากดสั่ง" },
];

export const SITE_INFO_FIELDS: SiteInfoField[] = [
  // ─── ร้าน ───
  { key: "site_tagline", label: "คำโปรยร้าน", hint: "สั้น ๆ 1 บรรทัด เช่น กระเป๋าหนังแท้ งานไทย ตั้งแต่ปี 1996", group: "shop", type: "text", isPublic: true },
  { key: "site_description", label: "คำอธิบายร้าน (SEO)", hint: "2-3 ประโยค โชว์ใต้ชื่อเว็บใน Google และท้ายเว็บ", group: "shop", type: "textarea", isPublic: true },
  { key: "footer_note", label: "ข้อความท้ายเว็บ", hint: "เช่น เลขทะเบียนพาณิชย์ หรือ 'จัดส่งทั่วไทย'", group: "shop", type: "text", isPublic: true },

  // ─── ติดต่อ ───
  { key: "contact_phone", label: "เบอร์โทร", group: "contact", type: "text", isPublic: true, placeholder: "08X-XXX-XXXX" },
  { key: "contact_line", label: "LINE ID", group: "contact", type: "text", isPublic: true, placeholder: "@louismontini" },
  { key: "contact_line_url", label: "ลิงก์ LINE", hint: "เช่น https://lin.ee/xxxx (ถ้ามี ปุ่ม LINE จะกดเปิดแชทได้เลย)", group: "contact", type: "text", isPublic: true },
  { key: "contact_email", label: "อีเมล", group: "contact", type: "text", isPublic: true },
  { key: "contact_address", label: "ที่อยู่ร้าน", group: "contact", type: "textarea", isPublic: true },
  { key: "contact_hours", label: "เวลาทำการ", group: "contact", type: "text", isPublic: true, placeholder: "จันทร์–เสาร์ 9:00–18:00" },
  { key: "social_facebook", label: "Facebook (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_instagram", label: "Instagram (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_tiktok", label: "TikTok (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_shopee", label: "Shopee (ลิงก์)", group: "contact", type: "text", isPublic: true },
  { key: "social_lazada", label: "Lazada (ลิงก์)", group: "contact", type: "text", isPublic: true },

  // ─── การสั่งซื้อ ───
  { key: "shipping_flat", label: "ค่าส่งเหมา (บาท)", hint: "0 = ส่งฟรีทุกออเดอร์", group: "order", type: "number", isPublic: true },
  { key: "free_shipping_min", label: "ส่งฟรีเมื่อยอดถึง (บาท)", hint: "0 = ไม่มีเงื่อนไขส่งฟรี", group: "order", type: "number", isPublic: true },
  { key: "pay_cod", label: "รับเก็บเงินปลายทาง (COD)", group: "order", type: "bool", isPublic: true },
  { key: "pay_promptpay", label: "รับโอนพร้อมเพย์", group: "order", type: "bool", isPublic: true },
  { key: "promptpay_number", label: "เลขพร้อมเพย์", hint: "เบอร์โทรหรือเลขบัตรประชาชน/นิติบุคคล — ลูกค้าเห็นตอนสั่งซื้อ", group: "order", type: "text", isPublic: true },
  { key: "promptpay_name", label: "ชื่อบัญชีพร้อมเพย์", group: "order", type: "text", isPublic: true },
  { key: "order_note", label: "ข้อความแจ้งลูกค้าตอนสั่งซื้อ", hint: "เช่น จัดส่งภายใน 1-2 วันทำการหลังยืนยันยอด", group: "order", type: "text", isPublic: true },
  { key: "order_prefix", label: "ตัวย่อเลขที่ออเดอร์", hint: "A-Z 0-9 ไม่เกิน 6 ตัว · เว้นว่าง = ใช้ตัวอักษรจากชื่อร้าน · เลขจะเป็น XX-256910-00001", group: "order", type: "text", isPublic: false },
];

export const SITE_INFO_KEYS = SITE_INFO_FIELDS.map((f) => f.key);

/** ค่าที่อ่านออกมาแล้ว (ครบทุก key เสมอ) */
export interface SiteInfo {
  site_tagline: string;
  site_description: string;
  footer_note: string;
  contact_phone: string;
  contact_line: string;
  contact_line_url: string;
  contact_email: string;
  contact_address: string;
  contact_hours: string;
  social_facebook: string;
  social_instagram: string;
  social_tiktok: string;
  social_shopee: string;
  social_lazada: string;
  shipping_flat: number;
  free_shipping_min: number;
  pay_cod: boolean;
  pay_promptpay: boolean;
  promptpay_number: string;
  promptpay_name: string;
  order_note: string;
  order_prefix: string;
}

export const DEFAULT_SITE_INFO: SiteInfo = {
  site_tagline: "",
  site_description: "",
  footer_note: "",
  contact_phone: "",
  contact_line: "",
  contact_line_url: "",
  contact_email: "",
  contact_address: "",
  contact_hours: "",
  social_facebook: "",
  social_instagram: "",
  social_tiktok: "",
  social_shopee: "",
  social_lazada: "",
  shipping_flat: 50,
  free_shipping_min: 0,
  pay_cod: true,
  pay_promptpay: true,
  promptpay_number: "",
  promptpay_name: "",
  order_note: "",
  order_prefix: "",
};

const URL_KEYS = new Set([
  "contact_line_url",
  "social_facebook",
  "social_instagram",
  "social_tiktok",
  "social_shopee",
  "social_lazada",
]);

/** รับเฉพาะลิงก์ http(s) — กัน javascript: หรือข้อความมั่ว ๆ ไปอยู่ใน href บนเว็บร้าน */
export function cleanUrl(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString().slice(0, 300) : "";
  } catch {
    return "";
  }
}

const toBool = (v: unknown, fb: boolean): boolean => {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return fb;
  return s === "1" || s === "true" || s === "yes" || s === "on";
};

const toNum = (v: unknown, fb: number): number => {
  const s = String(v ?? "").trim();
  if (!s) return fb;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fb;
};

/** ตัวย่อเลขออเดอร์: A-Z 0-9 ไม่เกิน 6 ตัว */
export const cleanOrderPrefix = (v: unknown): string =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

/**
 * แปลงค่าดิบ (จาก DB เป็น key/value string หรือจากฟอร์มเป็น object) ให้เป็น SiteInfo ครบทุกช่อง
 * รับได้ทั้ง `{key,value}[]` และ `Record<string, unknown>`
 */
export function normalizeSiteInfo(raw: unknown): SiteInfo {
  const m = new Map<string, unknown>();
  if (Array.isArray(raw)) {
    for (const r of raw as { key?: unknown; value?: unknown }[]) {
      if (r && typeof r.key === "string") m.set(r.key, r.value);
    }
  } else if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) m.set(k, v);
  }

  const d = DEFAULT_SITE_INFO;
  const out: Record<string, unknown> = {};
  for (const f of SITE_INFO_FIELDS) {
    const v = m.get(f.key);
    const fb = d[f.key as keyof SiteInfo];
    if (f.type === "bool") out[f.key] = toBool(v, fb as boolean);
    else if (f.type === "number") out[f.key] = toNum(v, fb as number);
    else if (f.key === "order_prefix") out[f.key] = cleanOrderPrefix(v);
    else if (URL_KEYS.has(f.key)) out[f.key] = cleanUrl(v);
    else out[f.key] = String(v ?? "").trim().slice(0, f.type === "textarea" ? 1000 : 200);
  }
  return out as unknown as SiteInfo;
}

/** แถวสำหรับ upsert ลง store_settings (เก็บทุกค่าเป็น string) */
export function siteInfoToRows(shopId: string, info: SiteInfo): { shop_id: string; key: string; value: string; updated_at: string }[] {
  const now = new Date().toISOString();
  return SITE_INFO_FIELDS.map((f) => {
    const v = info[f.key as keyof SiteInfo];
    const value = typeof v === "boolean" ? (v ? "1" : "0") : String(v ?? "");
    return { shop_id: shopId, key: f.key, value, updated_at: now };
  });
}

/** ชุดที่ปล่อยออก API สาธารณะ — ตัดฟิลด์ภายในออก */
export function publicSiteInfo(info: SiteInfo): Omit<SiteInfo, "order_prefix"> {
  const out: Record<string, unknown> = {};
  for (const f of SITE_INFO_FIELDS) {
    if (f.isPublic) out[f.key] = info[f.key as keyof SiteInfo];
  }
  return out as Omit<SiteInfo, "order_prefix">;
}

/** ค่าส่ง: ฟรีเมื่อถึงยอดขั้นต่ำ (ถ้าตั้ง) ไม่งั้นเหมาตามที่ตั้ง */
export function calcShippingFee(subtotal: number, info: Pick<SiteInfo, "shipping_flat" | "free_shipping_min">): number {
  if (info.free_shipping_min > 0 && subtotal >= info.free_shipping_min) return 0;
  return Math.max(0, info.shipping_flat);
}

/**
 * ตัวย่อเลขออเดอร์ที่ใช้จริง — ตั้งไว้ใช้ตามนั้น ไม่ตั้ง = ตัวอักษร/ตัวเลขจาก slug ร้าน 2-3 ตัวแรก
 * เช่น louismontini → "LO", pixiedustie → "PI" (ร้าน Pixiedustie ของเดิมใช้ "PX" ตั้งไว้ใน store_settings)
 */
export function orderPrefixFor(info: Pick<SiteInfo, "order_prefix">, shopSlug: string): string {
  if (info.order_prefix) return info.order_prefix;
  const fromSlug = cleanOrderPrefix(shopSlug).slice(0, 2);
  return fromSlug || "WEB";
}

// ใช้ชนิดของ client จริง (type-only import — ไม่ดึงโค้ดฝั่งเซิร์ฟเวอร์เข้ามาตอนรัน)
// ⚠️ เคยประกาศเป็น structural type เองแล้ว TS ไล่ชนิด generic ของ supabase ลึกเกิน (TS2589)
type Admin = ReturnType<typeof import("@/lib/supabase-admin").supabaseAdmin>;

/** อ่านข้อมูลร้านจาก DB (ใช้ supabaseAdmin — ตาราง store_* ปิด RLS สำหรับ anon) */
export async function readSiteInfo(sb: Admin, shopId: string): Promise<SiteInfo> {
  const { data } = await sb.from("store_settings").select("key, value").eq("shop_id", shopId);
  return normalizeSiteInfo(Array.isArray(data) ? data : []);
}
