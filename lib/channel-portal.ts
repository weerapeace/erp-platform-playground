/**
 * ศูนย์ร้านออนไลน์ (/master/channel-portal) — กติกาล้วน ๆ (ใช้ทั้ง server/client/เทสต์ · เทสต์ lib/__tests__/channel-portal.test.ts)
 * เจ้าของเลือก 2026-11-24 (widget รอบ 2): หน้าทางเข้าเดียวแทน BigSeller + ข้อ 1 หน้าแรกแอป "ช่องทางขาย" · 2 เพิ่มหน้าที่หลุดเมนู
 *   · 3 ปุ่มดึงออเดอร์บนการ์ดร้าน · 4 ปักหมุด = การ์ด "เมนูของฉัน" แถวบน · 6 ซ่อนทางลัดตามสิทธิ์ แบบ B (สิทธิ์ + "ใครเห็นเมนูไหน" ของแอป)
 *
 * - ทางลัดทุกหน้า (PORTAL_GROUPS) = หน้าเดิมที่มีอยู่แล้วทั้งหมด (ไม่สร้างหน้าใหม่ซ้ำ) · เพิ่มหน้าใหม่ → เพิ่มที่นี่ที่เดียว
 * - ใครเห็นทางลัด (portalLinkVisible) = กฎเดียวกับแถบเมนูของแอป (lib/menu-visibility) ถ้าหน้านั้นเป็นเมนูในแอป "ช่องทางขาย"
 *   ไม่เป็นเมนู = ดูสิทธิ์ของหน้าอย่างเดียว · ซ่อน ≠ ห้ามเข้า (กันจริงที่ API ของแต่ละหน้า)
 * - สถานะการ์ดร้าน (portalConnState) · งานที่ต้องทำ (buildPortalTodos) · หมุดของฉัน (parsePins/togglePin/movePin)
 * ตัวนับฝั่ง server = lib/channel-portal-server · หน้าตา = components/channel-portal
 */
import { menuVisibilityFor, type MenuViewer } from "@/lib/menu-visibility";

export const PORTAL_APP_KEY = "marketplace";
export const PORTAL_PATH = "/master/channel-portal";
/** ที่เก็บหมุดของฉัน (user_ui_prefs ผ่าน useUserPref) */
export const PORTAL_PINS_KEY = "channel_portal_pins";
export const PORTAL_PINS_MAX = 12;

export type PortalLink = { key: string; label: string; hint: string; href: string; icon: string; perm: string | null };
export type PortalGroup = { key: string; label: string; icon: string; links: PortalLink[] };

/** ทางลัดทุกหน้า แบ่งตามงาน · perm = สิทธิ์ที่หน้านั้น/API ของหน้านั้นใช้จริง (ตรงกับ permission_key ของเมนู) */
export const PORTAL_GROUPS: PortalGroup[] = [
  {
    key: "listing", label: "ลงสินค้า", icon: "upload", links: [
      { key: "catalog_shop", label: "สินค้าบนร้าน", hint: "ดูของบนร้านแบบหลังร้าน", href: "/master/platform-catalog?view=shop", icon: "store", perm: "products.platforms.view" },
      { key: "listing", label: "ลงสินค้าขึ้นร้าน", hint: "เตรียม + ส่งสินค้าขึ้นร้าน", href: "/master/platform-listing", icon: "upload", perm: "products.platforms.view" },
      { key: "shop_cats", label: "หมวดในร้าน", hint: "จัดหมวดในหน้าร้าน", href: "/master/platform-catalog?view=cats", icon: "folder", perm: "products.platforms.view" },
      { key: "central_cats", label: "หมวดกลาง + จับคู่หมวด", hint: "หมวดกลาง ↔ หมวดแต่ละร้าน", href: "/master/platform-categories", icon: "folders", perm: "products.platforms.view" },
      { key: "lazada_cats", label: "หมวด Lazada", hint: "รายการหมวดของ Lazada", href: "/admin/lazada-categories", icon: "list", perm: "products.platforms.view" },
      { key: "sku_where", label: "สินค้าเราขายที่ไหน", hint: "รุ่นเรา × ทุกร้าน", href: "/master/platform-sku", icon: "map", perm: "products.platforms.view" },
    ],
  },
  {
    key: "orders", label: "ออเดอร์ · แพ็ก · ส่ง", icon: "truck", links: [
      { key: "orders", label: "ศูนย์ออเดอร์", hint: "ออเดอร์ทุกร้าน + ใบปะหน้า", href: "/master/platform-orders", icon: "receipt", perm: "platform_orders.view" },
      { key: "pull_status", label: "สถานะดึงออเดอร์", hint: "ร้านไหนดึงล่าสุดเมื่อไหร่", href: "/master/platform-orders/pull-status", icon: "refresh", perm: "platform_orders.view" },
      { key: "packing", label: "แพ็คสินค้า", hint: "สแกน + อัดคลิปตอนแพ็ก", href: "/packing", icon: "package", perm: "packing.pack" },
      { key: "chat", label: "แชทลูกค้า", hint: "รวมแชททุกช่องทาง", href: "/chat", icon: "chat", perm: "chat.view" },
    ],
  },
  {
    key: "sales", label: "ยอดขาย · ราคา · โปร", icon: "tag", links: [
      { key: "dashboard", label: "แดชบอร์ดช่องทางขาย", hint: "ยอดขาย เป้า ร้านไหนขายดี", href: "/master/platform-dashboard", icon: "chart", perm: "products.platforms.view" },
      { key: "sales", label: "สินค้าที่ขายได้", hint: "ขายตัวไหนได้เท่าไร", href: "/master/platform-sales", icon: "trend-up", perm: "platform_orders.view" },
      { key: "promo_covers", label: "เปลี่ยนปกโปรทุกร้าน", hint: "ตั้งปกโปร + ส่งขึ้นร้าน", href: "/master/promo-covers", icon: "image", perm: "products.platforms.view" },
      { key: "stock_sync", label: "ซิงค์สต๊อก (เทียบยอด)", hint: "เทียบสต๊อกระบบกับร้าน", href: "/master/stock-sync", icon: "exchange", perm: "products.platforms.view" },
    ],
  },
  {
    key: "check", label: "ตรวจความถูกต้อง", icon: "inspect", links: [
      { key: "cross", label: "เช็กข้ามร้าน", hint: "ลงครบทุกร้านไหม ราคาตรงไหม", href: "/master/platform-catalog?view=cross", icon: "table-view", perm: "products.platforms.view" },
      { key: "dupes", label: "สินค้าซ้ำ", hint: "1 รุ่นลงซ้ำหลายรายการ", href: "/master/platform-catalog?view=dupes", icon: "documents", perm: "products.platforms.view" },
      { key: "match", label: "จับคู่สินค้า", hint: "ของบนร้าน ↔ สินค้าในระบบ", href: "/master/platform-catalog", icon: "link", perm: "products.platforms.view" },
      { key: "brand_hub", label: "หน้าแบรนด์", hint: "ทุกอย่างของ 1 แบรนด์", href: "/brand-hub", icon: "company", perm: "products.platforms.view" },
    ],
  },
  {
    key: "settings", label: "ตั้งค่า", icon: "settings", links: [
      { key: "accounts", label: "บัญชีร้าน + เชื่อมต่อ", hint: "เชื่อมร้าน / ต่ออายุ", href: "/admin/platform-accounts", icon: "plugin", perm: "products.platforms.manage_accounts" },
      { key: "email_orders", label: "ดึงออเดอร์จากเมล", hint: "ร้านที่ยังไม่มี API", href: "/admin/platform-email", icon: "mail", perm: "platform_orders.manage" },
      { key: "email_reports", label: "ส่งอีเมลรายงาน", hint: "รายงานยอดขายทางเมล", href: "/admin/email-reports", icon: "notify", perm: "admin.email_reports" },
      { key: "website", label: "สินค้าบนเว็บ", hint: "เว็บร้านของเราเอง", href: "/website", icon: "web", perm: "website.access" },
    ],
  },
];

export const PORTAL_LINKS: PortalLink[] = PORTAL_GROUPS.flatMap((g) => g.links);
export const portalLinkByKey = (key: string): PortalLink | undefined => PORTAL_LINKS.find((l) => l.key === key);

/** แถวเมนูของแอปที่ใช้ตัดสินว่าเห็นไหม (ไม่มีกุญแจอะไร — ส่งไปหน้าเว็บได้) */
export type PortalMenuRow = { id: string; href: string; permission_key: string | null; parent_id: string | null; audience: unknown; app_overrides: unknown };

const basePath = (h: string) => h.split("?")[0].replace(/\/+$/, "") || "/";

/** เมนูของแอปที่ตรงกับทางลัด: ลิงก์ตรงกันทุกตัวอักษรก่อน → ไม่มีค่อยดูหน้าเดียวกัน (ไม่สน ?view=) */
export function menuRowFor(link: Pick<PortalLink, "href">, rows: readonly PortalMenuRow[]): PortalMenuRow | null {
  return rows.find((r) => r.href === link.href)
    ?? rows.find((r) => basePath(r.href) === basePath(link.href) && !r.href.includes("?"))
    ?? rows.find((r) => basePath(r.href) === basePath(link.href))
    ?? null;
}

/**
 * คนนี้เห็นทางลัดนี้ไหม (แบบ B)
 * - หน้าเป็นเมนูในแอป "ช่องทางขาย" → กฎแถบเมนูจริง: ซ่อนในแอป · ใครเห็นเมนู (ตำแหน่ง/รายคน) · สิทธิ์ของเมนู
 * - ไม่เป็นเมนู → สิทธิ์ของหน้าอย่างเดียว
 * - ทุกกรณีต้องมีสิทธิ์ของหน้าเอง (perm ของทางลัด) ด้วย — เมนูไม่มี permission_key ก็ยังกันได้
 * - can = ตัวเช็กสิทธิ์ฝั่งหน้าเว็บ (แอดมินผ่านเสมอ) · ยังไม่รู้ผู้ใช้ = เห็น (กันจอว่างตอนโหลด)
 */
export function portalLinkVisible(
  link: PortalLink,
  rows: readonly PortalMenuRow[],
  user: { id: string | null; role: string | null } | null,
  can: (perm: string) => boolean,
): boolean {
  if (!user) return true;
  if (link.perm && user.role !== "admin" && !can(link.perm)) return false;
  const row = menuRowFor(link, rows);
  if (!row) return true;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const perms = new Set<string>();
  if (row.permission_key && can(row.permission_key)) perms.add(row.permission_key);
  const viewer: MenuViewer = { id: user.id, role: user.role, perms };
  return menuVisibilityFor(row, PORTAL_APP_KEY, viewer, { byId }).visible;
}

// ───────── หมุดของฉัน ─────────

/** ค่าที่อ่านมา → รายการ key ทางลัดที่ยังมีจริง (ไม่ซ้ำ · ไม่เกินเพดาน) · ผิดรูป = null */
export function parsePins(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const v of raw) if (typeof v === "string" && portalLinkByKey(v) && !out.includes(v)) out.push(v);
  return out.slice(0, PORTAL_PINS_MAX);
}

export function togglePin(pins: readonly string[], key: string): string[] {
  if (pins.includes(key)) return pins.filter((k) => k !== key);
  if (!portalLinkByKey(key) || pins.length >= PORTAL_PINS_MAX) return [...pins];
  return [...pins, key];
}

/** เลื่อนหมุดตำแหน่ง i ไป d ช่อง (−1 ซ้าย / +1 ขวา) · ออกนอกขอบ = เหมือนเดิม */
export function movePin(pins: readonly string[], i: number, d: number): string[] {
  const j = i + d;
  if (i < 0 || i >= pins.length || j < 0 || j >= pins.length) return [...pins];
  const out = [...pins];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// ───────── การ์ดร้าน ─────────

export type PortalPlatform = "shopee" | "lazada" | "tiktok" | "line_shopping" | "website";
export const PORTAL_PLATFORM_LABEL: Record<PortalPlatform, string> = {
  shopee: "Shopee", lazada: "Lazada", tiktok: "TikTok Shop", line_shopping: "LINE SHOPPING", website: "เว็บร้าน",
};

/** connected = ใช้ได้ · expiring = ใกล้ต้องเชื่อมใหม่ (≤ RECONNECT_WARN_DAYS) · expired · file = นำเข้าไฟล์ (ไม่มี API) · email = ดึงจากเมล · direct = เว็บเราเอง · none */
export type PortalConn = "connected" | "expiring" | "expired" | "file" | "email" | "direct" | "none";
export const RECONNECT_WARN_DAYS = 30;
export const RECONNECT_DANGER_DAYS = 7;

export const PORTAL_CONN_LABEL: Record<PortalConn, string> = {
  connected: "เชื่อมแล้ว", expiring: "ใกล้หมดอายุ", expired: "หมดอายุ — เชื่อมใหม่", file: "นำเข้าไฟล์", email: "ดึงจากเมล", direct: "ระบบเรา", none: "ยังไม่เชื่อม",
};

/** วันที่เหลือก่อนต้องเชื่อมใหม่ (ปัดขึ้น · ผ่านไปแล้ว = ติดลบ) · ไม่รู้ = null */
export function daysLeft(expiresAtMs: number | null | undefined, now = Date.now()): number | null {
  if (expiresAtMs == null || !Number.isFinite(expiresAtMs)) return null;
  return Math.ceil((expiresAtMs - now) / 86_400_000);
}

export function portalConnState(mode: "api" | "email" | "direct" | "none", tokenDays: number | null, listings: number): PortalConn {
  if (mode === "direct") return "direct";
  if (mode === "api") {
    if (tokenDays != null && tokenDays <= 0) return "expired";
    if (tokenDays != null && tokenDays <= RECONNECT_WARN_DAYS) return "expiring";
    return "connected";
  }
  if (mode === "email") return "email";
  return listings > 0 ? "file" : "none";
}

/** การ์ดร้าน → ต้องไปเชื่อม/ต่ออายุไหม */
export const needsReconnect = (c: PortalConn): boolean => c === "expiring" || c === "expired";

export type PortalShop = {
  key: string;
  platform: PortalPlatform;
  brand_id: string | null;
  brand_name: string | null;
  shop_name: string | null;
  conn: PortalConn;
  token_expires_at: number | null;
  token_days_left: number | null;
  /** สถานะการดึงออเดอร์ (lib/order-pull-health) */
  pull: { state: string; headline: string; at: string | null } | null;
  /** null = ไม่มีสิทธิ์เห็นตัวเลขกลุ่มนี้ */
  listings: number | null;
  unmatched: number | null;
  dupes: number | null;
  listings_updated_at: string | null;
  today_orders: number | null;
  today_sales: number | null;
  to_ship: number | null;
};

export type PortalPriceLow = { listing_id: string; platform: string; brand_id: string | null; title: string | null; price: number };

export type PortalTotals = {
  today_orders: number | null;
  /** มูลค่าสินค้า (ราคาขายหลังส่วนลดร้าน × จำนวน — ตัวเดียวกับแดชบอร์ด) */
  today_sales: number | null;
  /** ลูกค้าจ่ายจริง (หลังคูปอง/เหรียญ) */
  today_paid: number | null;
  to_ship: number | null;
  unmatched: number | null;
  dupes: number | null;
  price_low: number | null;
};

export type PortalResponse = {
  ok: boolean;
  error: string | null;
  now: string;
  can: { listings: boolean; orders: boolean; pack: boolean };
  brands: { id: string; name: string }[];
  shops: PortalShop[];
  totals: PortalTotals;
  price_low: PortalPriceLow[];
  menus: PortalMenuRow[];
};

/** ลิงก์ของการ์ดร้าน: ยังไม่เชื่อม/หมดอายุ = หน้าเชื่อมร้าน · เว็บร้าน = หน้าสินค้าบนเว็บ · อื่น ๆ = หน้าร้านของร้านนั้น */
export function shopHref(s: Pick<PortalShop, "platform" | "brand_id" | "conn">): string {
  if (s.platform === "website") return "/website";
  const b = s.brand_id ? encodeURIComponent(s.brand_id) : "";
  if (s.conn === "none" || s.conn === "expired") return `/admin/platform-accounts${b ? `?brand=${b}` : ""}`;
  return `/master/platform-catalog?${b ? `brand=${b}&` : ""}platform=${encodeURIComponent(s.platform)}&view=shop`;
}

// ───────── งานที่ต้องทำ ─────────

export type PortalTodo = { key: string; label: string; hint: string; count: number; href: string; perm: string | null; tone: "danger" | "warning" | "info" | "neutral" };

/** การ์ดงานที่ต้องทำ — เฉพาะที่มีงานจริง (count > 0) และรู้ตัวเลข · เรียงจากด่วนสุด */
export function buildPortalTodos(t: PortalTotals, shops: readonly PortalShop[]): PortalTodo[] {
  const reconnect = shops.filter((s) => needsReconnect(s.conn)).length;
  const stale = shops.filter((s) => s.conn === "file").length;
  const all: (PortalTodo | null)[] = [
    t.to_ship == null ? null : { key: "to_ship", label: "ออเดอร์รอจัดส่ง", hint: "ลูกค้าจ่ายแล้ว รอแพ็ก/ส่ง", count: t.to_ship, href: "/master/platform-orders", perm: null, tone: "danger" },
    { key: "reconnect", label: "ร้านที่ต้องเชื่อมใหม่", hint: `กุญแจร้านหมดอายุ หรือเหลือไม่เกิน ${RECONNECT_WARN_DAYS} วัน`, count: reconnect, href: "/admin/platform-accounts", perm: "products.platforms.manage_accounts", tone: "warning" },
    t.price_low == null ? null : { key: "price_low", label: "ราคาบนร้าน ฿1 หรือต่ำกว่า", hint: "เปิดขายอยู่ — เช็กว่าตั้งใจไหม", count: t.price_low, href: "#price-low", perm: null, tone: "danger" },
    t.unmatched == null ? null : { key: "unmatched", label: "สินค้าบนร้านยังไม่จับคู่", hint: "ยังไม่รู้ว่าเป็นตัวไหนในระบบ", count: t.unmatched, href: "/master/platform-catalog", perm: "products.platforms.view", tone: "warning" },
    t.dupes == null ? null : { key: "dupes", label: "สินค้าซ้ำบนร้าน", hint: "1 รุ่นลงซ้ำหลายรายการ (กลุ่ม)", count: t.dupes, href: "/master/platform-catalog?view=dupes", perm: "products.platforms.view", tone: "warning" },
    { key: "stale", label: "ร้านที่ข้อมูลเก่า", hint: "ยังไม่มี API — ใช้การนำเข้าไฟล์", count: stale, href: "/admin/platform-accounts", perm: "products.platforms.view", tone: "neutral" },
  ];
  return all.filter((x): x is PortalTodo => !!x && x.count > 0);
}
