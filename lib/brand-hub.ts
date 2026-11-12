/**
 * หน้าแบรนด์ (/brand-hub) — กติกาล้วน ๆ (ไม่มี "@/..." · ใช้ทั้ง server/client/เทสต์ · เทสต์ lib/__tests__/brand-hub.test.ts)
 *
 * - ช่องทางที่โชว์บนหน้าแบรนด์ + สถานะการเชื่อม (เชื่อมแล้ว / หมดอายุ / นำเข้าไฟล์ / ยังไม่เชื่อม)
 * - "งานที่ต้องทำ" ของแบรนด์ = ตัวเลขจาก lib/brand-hub-server → การ์ดพร้อมลิงก์ไปหน้าที่ทำงานนั้น (ส่งแบรนด์ไปกรองให้)
 * ตัวนับ/อ่านฐานข้อมูลอยู่ที่ lib/brand-hub-server · หน้าตาอยู่ที่ components/brand-hub
 */

/** ช่องทางบนหน้าแบรนด์ (ลำดับ = ลำดับที่โชว์) · เว็บร้านไม่อยู่ที่นี่ (เป็นระบบเราเอง ไม่ต้องเชื่อม — อยู่ในหมวดเครื่องมือ) */
export const HUB_CHANNELS = [
  { code: "line_shopping", label: "LINE SHOPPING", selling: true },
  { code: "tiktok", label: "TikTok Shop", selling: true },
  { code: "lazada", label: "Lazada", selling: true },
  { code: "shopee", label: "Shopee", selling: true },
  { code: "facebook", label: "Facebook + IG", selling: false },
] as const;
export type HubChannelCode = (typeof HUB_CHANNELS)[number]["code"];

/** connected = ใช้ได้ · expired = เคยเชื่อมแต่กุญแจหมดอายุ · file = ไม่มี API แต่นำเข้าไฟล์แล้ว · none = ยังไม่เชื่อม */
export type HubConnState = "connected" | "expired" | "file" | "none";

export const HUB_CONN_LABEL: Record<HubConnState, string> = {
  connected: "เชื่อมแล้ว", expired: "หมดอายุ — เชื่อมใหม่", file: "นำเข้าไฟล์", none: "ยังไม่เชื่อม",
};

/** แถว platform_credentials ที่ตัดกุญแจออกแล้ว (ฝั่ง server แปลงก่อนส่ง — ห้ามส่งกุญแจไปหน้าเว็บ) */
export type HubCredLite = { has_key: boolean; stage: string | null; refresh_expires_at: number | null };

/**
 * สถานะการเชื่อมของช่องทาง 1 ช่อง
 * - ไม่มีแถว / ตัดการเชื่อมแล้ว → Shopee ที่มีสินค้าจากไฟล์ = "file" · อื่น ๆ = "none"
 * - กุญแจต่ออายุหมดแล้ว (refresh_expires_at ผ่านไปแล้ว) → "expired"
 * - มีกุญแจ หรือ stage = connected → "connected"
 */
export function hubConnState(code: string, cred: HubCredLite | null | undefined, listings: number, now = Date.now()): HubConnState {
  const off = !cred || cred.stage === "disconnected" || (!cred.has_key && cred.stage !== "connected");
  if (off) return code === "shopee" && listings > 0 ? "file" : "none";
  if (cred.refresh_expires_at != null && Number.isFinite(cred.refresh_expires_at) && cred.refresh_expires_at < now) return "expired";
  return "connected";
}

export type HubChannel = { code: HubChannelCode; label: string; state: HubConnState; listings: number; selling: boolean };

export type HubCounts = {
  /** ออเดอร์ที่ต้องลงมือ (กฎเดียวกับการ์ด "ต้องจัดส่ง" ของศูนย์ออเดอร์ — lib/platform-order-status needsAction) */
  orders_to_ship: number;
  /** รายการบนร้านที่ยังไม่จับคู่ (ไม่นับที่กดไม่ต้องจับคู่ / ไม่อยู่บนร้านแล้ว) */
  unmatched: number;
  /** สินค้าในระบบ (เปิดใช้) ที่ยังไม่มีรายการบนร้านไหนจับคู่อยู่เลย */
  not_listed: number;
  /** รายการที่ร้านลบไปแล้ว รอกดล้าง */
  gone: number;
  /** สินค้าในระบบที่ไม่มีรูปปก */
  no_cover: number;
  /** สินค้าในระบบที่ยังไม่ตั้งหมวดกลาง (ลงร้านต้องใช้) */
  no_category: number;
  /** สินค้าในระบบที่ยังไม่มีน้ำหนัก (weight_g ว่าง/0) — ลงร้าน/คิดค่าส่งต้องใช้ */
  no_weight: number;
  /** สินค้าในระบบที่ยังไม่เลือกขนาดกล่อง (parcel_size_id ว่าง) — กฎเดียวกับตัวลงสินค้า lib/product-listing-context */
  no_box: number;
  /** ตัวเลือก (SKU เปิดใช้) ที่ไม่มีรูป — ร้านโชว์รูปต่อสี/ตัวเลือก */
  sku_no_image: number;
};

/** ลิงก์ตาราง Parent SKU กรองแบรนด์ (ตารางกลางรับ ?flt= — รูปแบบตัวกรองคอลัมน์ {type:"text"} = เท่ากับ ถ้าเป็นรหัส) */
export const parentSkusOfBrandHref = (brandId: string): string =>
  `/master/parent-skus?flt=${encodeURIComponent(JSON.stringify({ brand_id: { type: "text", value: brandId } }))}`;

export type HubTodo = { key: keyof HubCounts; label: string; hint: string; count: number; href: string; perm: string | null; tone: "danger" | "warning" | "info" | "neutral" };

/** การ์ด "งานที่ต้องทำ" — เฉพาะที่มีงานจริง (count > 0) · เรียงจากด่วนสุด */
export function buildHubTodos(brandId: string, c: HubCounts): HubTodo[] {
  const b = encodeURIComponent(brandId);
  const parents = parentSkusOfBrandHref(brandId);
  const all: HubTodo[] = [
    { key: "orders_to_ship", label: "ออเดอร์รอจัดส่ง", hint: "ลูกค้าจ่ายแล้ว รอแพ็ก/ส่ง", count: c.orders_to_ship, href: `/master/platform-orders?brand=${b}`, perm: "platform_orders.view", tone: "danger" },
    { key: "unmatched", label: "ยังไม่จับคู่", hint: "สินค้าบนร้านที่ยังไม่รู้ว่าเป็นตัวไหนในระบบ", count: c.unmatched, href: `/master/platform-catalog?brand=${b}`, perm: "products.platforms.view", tone: "warning" },
    { key: "not_listed", label: "ยังไม่ลงร้านไหนเลย", hint: "สินค้าในระบบที่ยังไม่มีบนร้าน", count: c.not_listed, href: `/master/platform-catalog?brand=${b}&view=shop`, perm: "products.platforms.view", tone: "info" },
    { key: "no_cover", label: "ไม่มีรูปปก", hint: "ลงร้านไม่ได้จนกว่าจะมีรูป", count: c.no_cover, href: `/master/platform-catalog?brand=${b}&view=shop`, perm: "products.platforms.view", tone: "warning" },
    { key: "no_category", label: "ยังไม่ตั้งหมวดกลาง", hint: "ลงร้านต้องรู้หมวด", count: c.no_category, href: "/master/platform-categories", perm: "products.platforms.view", tone: "info" },
    { key: "no_weight", label: "ขาดน้ำหนัก", hint: "ลงร้าน/คิดค่าส่งต้องใช้", count: c.no_weight, href: parents, perm: null, tone: "warning" },
    { key: "no_box", label: "ขาดขนาดกล่อง", hint: "เลือกขนาดกล่องพัสดุในหน้าสินค้า", count: c.no_box, href: parents, perm: null, tone: "warning" },
    { key: "sku_no_image", label: "ตัวเลือกไม่มีรูป", hint: "สี/ตัวเลือก (SKU) ที่ยังไม่มีรูป", count: c.sku_no_image, href: "/master/skus", perm: null, tone: "info" },
    { key: "gone", label: "ไม่อยู่บนร้านแล้ว", hint: "ร้านลบไปแล้ว — กดล้างได้", count: c.gone, href: `/master/platform-catalog?brand=${b}`, perm: "products.platforms.view", tone: "neutral" },
  ];
  return all.filter((t) => t.count > 0);
}

/** การ์ดแบรนด์ในหน้าเลือก (carousel) */
export type HubBrandCard = {
  id: string; name: string; logo_key: string | null; color: string | null;
  parents: number; listings: number;
  /** ช่องทางที่เชื่อมแล้ว (code) */
  connected: string[];
};
export type HubBrandsResponse = { brands: HubBrandCard[]; error: string | null };

export type HubDetail = HubBrandCard & {
  central_set: number;
  channels: HubChannel[];
  counts: HubCounts;
  todos: HubTodo[];
};
export type HubDetailResponse = { brand: HubDetail | null; error: string | null };

/** จำแบรนด์ล่าสุด (เปิดหน้าแบรนด์ครั้งหน้าเข้าแบรนด์นี้เลย) */
export const HUB_LAST_BRAND_KEY = "brand-hub:last";
