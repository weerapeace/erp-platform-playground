// ============================================================
// ตัวเชื่อม Lazada Open Platform API — ฝั่งเซิร์ฟเวอร์เท่านั้น
// เอกสาร: https://open.lazada.com/doc/doc.htm · auth: https://auth.lazada.com
// ต้องมี env: LAZADA_APP_KEY + LAZADA_APP_SECRET (ตั้งใน Vercel) · token เก็บเข้ารหัส (secret-box)
//
// การเซ็นคำขอ (sha256): sign = HMAC-SHA256( apiPath + concat(sortedParams key+value), app_secret ) → hex ตัวใหญ่
// ============================================================

export const LAZADA_AUTH_BASE = "https://auth.lazada.com/rest";

const APP_KEY = () => (process.env.LAZADA_APP_KEY ?? "").trim();
const APP_SECRET = () => (process.env.LAZADA_APP_SECRET ?? "").trim();
export function lazConfigured(): boolean { return !!(APP_KEY() && APP_SECRET()); }

// gateway ตามประเทศ (ไทยเป็นค่าเริ่มต้น)
export function lazGateway(country?: string): string {
  const tld: Record<string, string> = { TH: "co.th", MY: "com.my", SG: "sg", PH: "com.ph", VN: "vn", ID: "co.id" };
  return `https://api.lazada.${tld[(country || "TH").toUpperCase()] ?? "co.th"}/rest`;
}

const enc = new TextEncoder();
function toHex(buf: ArrayBuffer): string {
  let s = ""; for (const b of new Uint8Array(buf)) s += b.toString(16).padStart(2, "0"); return s;
}
// เซ็นคำขอตามสูตร Lazada/TOP (sha256)
async function sign(apiPath: string, params: Record<string, string>, appSecret: string): Promise<string> {
  let base = apiPath;
  for (const k of Object.keys(params).sort()) base += k + params[k];
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(base));
  return toHex(sig).toUpperCase();
}

// URL หน้าอนุญาต (ให้ร้าน Lazada กดยอมรับ)
export function lazAuthUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({ response_type: "code", force_auth: "true", redirect_uri: redirectUri, client_id: APP_KEY(), state });
  return `https://auth.lazada.com/oauth/authorize?${q.toString()}`;
}

export type LazToken = {
  access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number;
  account?: string; country_user_info?: { country: string; user_id: string; seller_id: string; short_code: string }[];
};

// เรียก auth endpoint (token/create, token/refresh) — เซ็นด้วย app_secret
async function authCall(apiPath: string, extra: Record<string, string>): Promise<LazToken> {
  const params: Record<string, string> = { app_key: APP_KEY(), sign_method: "sha256", timestamp: String(Date.now()), ...extra };
  params.sign = await sign(apiPath, params, APP_SECRET());
  const r = await fetch(`${LAZADA_AUTH_BASE}${apiPath}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (String(j.code ?? "0") !== "0") throw new Error(String(j.message || j.code || `HTTP ${r.status}`));
  return j as unknown as LazToken;
}
export const lazExchangeToken = (code: string) => authCall("/auth/token/create", { code });
export const lazRefreshToken = (refreshToken: string) => authCall("/auth/token/refresh", { refresh_token: refreshToken });

// เรียก API ทั่วไป (GET, เซ็นคำขอ + แนบ access_token)
export async function lazApiGet(gateway: string, apiPath: string, accessToken: string, biz: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const params: Record<string, string> = { app_key: APP_KEY(), access_token: accessToken, sign_method: "sha256", timestamp: String(Date.now()), ...biz };
  params.sign = await sign(apiPath, params, APP_SECRET());
  const r = await fetch(`${gateway}${apiPath}?${new URLSearchParams(params).toString()}`);
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (String(j.code ?? "0") !== "0") throw new Error(String(j.message || j.code || `HTTP ${r.status}`));
  return j;
}

// ดึงออเดอร์ (สร้างหลังเวลา createdAfter — ISO8601 มี timezone เช่น 2026-06-01T00:00:00+07:00)
export async function lazGetOrders(gateway: string, accessToken: string, opts: { createdAfter: string; limit?: number; offset?: number }): Promise<{ orders: Record<string, unknown>[]; total: number }> {
  const j = await lazApiGet(gateway, "/orders/get", accessToken, {
    created_after: opts.createdAfter, sort_by: "created_at", sort_direction: "DESC",
    limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0),
  });
  const data = j.data as { orders?: Record<string, unknown>[]; count?: number } | undefined;
  return { orders: data?.orders ?? [], total: Number(data?.count ?? 0) };
}

// ดึงรายการสินค้าของหลายออเดอร์ทีเดียว → map order_id → items[]
export async function lazGetOrderItems(gateway: string, accessToken: string, orderIds: (string | number)[]): Promise<Record<string, Record<string, unknown>[]>> {
  if (orderIds.length === 0) return {};
  const j = await lazApiGet(gateway, "/orders/items/get", accessToken, { order_ids: JSON.stringify(orderIds.map((x) => Number(x))) });
  const rows = (j.data as { order_id: string | number; order_items?: Record<string, unknown>[] }[]) ?? [];
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const o of rows) out[String(o.order_id)] = o.order_items ?? [];
  return out;
}

// ---- หมวดหมู่ + คุณสมบัติสินค้า (ใช้ทำระบบลงสินค้า) ----
export type LazCategoryNode = { category_id: number | string; name: string; leaf: boolean; children?: LazCategoryNode[] };
// ต้นไม้หมวดหมู่ทั้งหมด (คำเดียวได้ทั้งต้น)
export async function lazGetCategoryTree(gateway: string, accessToken: string): Promise<LazCategoryNode[]> {
  const j = await lazApiGet(gateway, "/category/tree/get", accessToken, {});
  return (j.data as LazCategoryNode[]) ?? [];
}

export type LazAttribute = { name: string; label: string; required: boolean; input_type: string; is_sale_prop: boolean; options: string[] };
const truthy = (v: unknown) => v === 1 || v === true || String(v) === "1" || String(v) === "true";
// คุณสมบัติที่หมวดนี้ต้องการ (name/label/บังคับ/ชนิด input/ตัวเลือก)
export async function lazGetCategoryAttributes(gateway: string, accessToken: string, categoryId: string): Promise<LazAttribute[]> {
  const j = await lazApiGet(gateway, "/category/attributes/get", accessToken, { primary_category_id: String(categoryId) });
  const rows = (j.data as Record<string, unknown>[]) ?? [];
  return rows.map((a) => ({
    name: String(a.name ?? ""),
    label: String(a.label ?? a.name ?? ""),
    required: truthy(a.is_mandatory),
    input_type: String(a.input_type ?? ""),
    is_sale_prop: truthy(a.is_sale_prop),
    options: Array.isArray(a.options) ? (a.options as Record<string, unknown>[]).map((o) => String(o.name ?? "")).filter(Boolean) : [],
  }));
}

// ---- สถานะกุญแจ (pure · มี test) ----
// Lazada ไทย: access_token อยู่ได้ ~7 วัน · refresh_token ~30 วัน → ไม่มีใครต่ออายุ = หลุดเงียบ (เคยหลุด 5 ส.ค. 2026)
// ตัวต่ออายุอัตโนมัติ: /api/cron/lazada-token (วันละครั้ง)
export type LazHealthState = "none" | "connected" | "expiring" | "expired";
export type LazHealth = { state: LazHealthState; refresh_expires_at: number | null; days_left: number | null };
const EXPIRING_DAYS = 7;

/** expired = ตัวต่ออายุหมดแล้ว ต้องกดเชื่อมใหม่ · expiring = เหลือ ≤ 7 วัน (เตือนให้เชื่อมใหม่ก่อนหลุด) */
export function lazConnHealth(meta: { stage?: string; refresh_expires_at?: number; expires_at?: number } | null | undefined, now = Date.now()): LazHealth {
  if (!meta || meta.stage !== "connected") return { state: "none", refresh_expires_at: null, days_left: null };
  const rx = Number(meta.refresh_expires_at) || 0;
  if (!rx) return { state: (Number(meta.expires_at) || 0) > now ? "connected" : "expired", refresh_expires_at: null, days_left: null };
  const daysLeft = Math.floor((rx - now) / 86_400_000);
  if (rx <= now) return { state: "expired", refresh_expires_at: rx, days_left: 0 };
  return { state: daysLeft <= EXPIRING_DAYS ? "expiring" : "connected", refresh_expires_at: rx, days_left: daysLeft };
}

// ---- สินค้าบนร้าน (อ่านอย่างเดียว · ดึงเข้าหน้า "สินค้าบนแพลตฟอร์ม") ----
// GET /products/get · filter=all (ไม่รวมที่ลบแล้ว) · ได้ครั้งละไม่เกิน 50 ตัว
export async function lazGetProducts(gateway: string, accessToken: string, opts: { offset?: number; limit?: number; filter?: string } = {}): Promise<{ products: Record<string, unknown>[]; total: number }> {
  const j = await lazApiGet(gateway, "/products/get", accessToken, {
    filter: opts.filter ?? "all", offset: String(opts.offset ?? 0), limit: String(Math.min(50, opts.limit ?? 50)),
  });
  const data = j.data as { products?: Record<string, unknown>[]; total_products?: number | string } | undefined;
  return { products: data?.products ?? [], total: Number(data?.total_products ?? 0) || 0 };
}

export type LazCatalogItem = { external_product_id: string; title: string | null; skus: string[]; price: number | null; status: string | null; raw: Record<string, unknown> };
const s0 = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const n0 = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/**
 * แปลงสินค้า 1 ตัวจาก /products/get → รายการมาตรฐานของหน้า "สินค้าบนแพลตฟอร์ม" (pure · มี test)
 * เก็บเฉพาะที่ใช้ (รหัส/ชื่อ/สถานะ/ราคา/สต๊อกต่อ SKU) — ไม่เก็บ HTML รายละเอียด/รูป กันข้อมูลบวม
 * ราคาที่โชว์ = ราคาปกติต่ำสุด (ราคาลดเก็บใน raw)
 */
export function lazProductToCatalogItem(p: Record<string, unknown>): LazCatalogItem | null {
  const id = s0(p.item_id);
  if (!id) return null;
  const attrs = (p.attributes && typeof p.attributes === "object") ? p.attributes as Record<string, unknown> : {};
  const skus = (Array.isArray(p.skus) ? p.skus as Record<string, unknown>[] : []).map((s) => ({
    seller_sku: s0(s.SellerSku ?? s.seller_sku), sku_id: s0(s.SkuId ?? s.sku_id), shop_sku: s0(s.ShopSku ?? s.shop_sku),
    price: n0(s.price), special_price: n0(s.special_price), quantity: n0(s.quantity), available: n0(s.Available ?? s.available), status: s0(s.Status ?? s.status),
  }));
  const prices = skus.map((s) => s.price).filter((n): n is number => n != null && n > 0);
  const status = s0(p.status);
  return {
    external_product_id: id,
    title: s0(attrs.name),
    skus: [...new Set(skus.map((s) => s.seller_sku).filter((x): x is string => !!x))],
    price: prices.length ? Math.min(...prices) : null,
    status: status ? status.toLowerCase() : null,
    raw: { lazada: { item_id: id, primary_category: s0(p.primary_category), status, brand: s0(attrs.brand), created_time: s0(p.created_time), updated_time: s0(p.updated_time), skus } },
  };
}
