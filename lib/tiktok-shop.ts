/**
 * TikTok Shop Open API (ร้านของเราเอง · แอปแบบ Seller Developer / Custom App) — ฝั่งเซิร์ฟเวอร์เท่านั้น
 *
 * อ้างอิงเอกสารทางการ partner.tiktokshop.com (อ่าน 2026-11-10):
 *  - เซ็นคำขอ: HMAC-SHA256(app_secret, secret + path + เรียง query {key}{value} (ไม่รวม sign/access_token) + body + secret) → hex
 *  - API 202309 ขึ้นไป: ส่ง access token ใน header `x-tts-access-token` (ไม่นำไปเซ็น) · timestamp = วินาที 10 หลัก (อายุ 5 นาที)
 *  - กุญแจ: GET auth.tiktok-shops.com/api/v2/token/get (grant_type=authorized_code — ไม่ใช่ authorization_code)
 *    access_token อยู่ได้ ~7 วัน · refresh_token อยู่ได้เท่าระยะที่ร้านเลือกตอนอนุญาต · ค่า *_expire_in เป็น "เวลาหมดอายุ" (unix วินาที)
 *  - ลิงก์ให้ร้านอนุญาต (ไม่ใช่ US): https://services.tiktokshop.com/open/authorize?service_id=…
 * env (ตั้งใน Vercel): TIKTOK_SHOP_APP_KEY · TIKTOK_SHOP_APP_SECRET · TIKTOK_SHOP_SERVICE_ID
 * กติกาที่ไม่แตะเครือข่าย (เซ็น/แปลงเวลา/อ่านรายชื่อร้าน) ทดสอบใน lib/__tests__/tiktok-shop.test.ts
 */

export const TTS_API_BASE = "https://open-api.tiktokglobalshop.com";
export const TTS_AUTH_BASE = "https://auth.tiktok-shops.com";
export const TTS_AUTHORIZE_URL = "https://services.tiktokshop.com/open/authorize";

const APP_KEY = () => (process.env.TIKTOK_SHOP_APP_KEY ?? "").trim();
const APP_SECRET = () => (process.env.TIKTOK_SHOP_APP_SECRET ?? "").trim();
const SERVICE_ID = () => (process.env.TIKTOK_SHOP_SERVICE_ID ?? "").trim();

/** ตั้งกุญแจครบ 3 ตัวใน Vercel แล้วหรือยัง */
export function ttsConfigured(): boolean { return !!(APP_KEY() && APP_SECRET() && SERVICE_ID()); }

/** ลิงก์ให้ร้านกดอนุญาต — state (เข้ารหัส brand_id) จะถูกส่งกลับมาที่ Redirect URL ที่ตั้งไว้ในแอป */
export function ttsAuthUrl(state: string): string {
  return `${TTS_AUTHORIZE_URL}?service_id=${encodeURIComponent(SERVICE_ID())}&state=${encodeURIComponent(state)}`;
}

// ───────── เซ็นคำขอ ─────────
/** ข้อความที่นำไปเซ็น (ยังไม่ห่อ secret) — แยกออกมาเพื่อทดสอบได้ */
export function ttsSignInput(path: string, query: Record<string, string>, body = ""): string {
  const keys = Object.keys(query).filter((k) => k !== "sign" && k !== "access_token").sort();
  return path + keys.map((k) => `${k}${query[k]}`).join("") + body;
}

const enc = new TextEncoder();
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** sign = HMAC-SHA256(key=app_secret, secret + input + secret) เป็น hex ตัวเล็ก */
export async function ttsSign(path: string, query: Record<string, string>, body: string, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(appSecret + ttsSignInput(path, query, body) + appSecret));
  return toHex(sig);
}

// ───────── เวลาหมดอายุ ─────────
/** แปลงค่าหมดอายุจาก TikTok เป็น ms — รับได้ทั้ง unix วินาที (ตามเอกสาร), unix ms, หรือ "อีกกี่วินาที" (กันเอกสารกับของจริงไม่ตรง) */
export function ttsExpiryMs(v: unknown, now = Date.now()): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n > 1e12) return n;            // ms อยู่แล้ว
  if (n > 1e9) return n * 1000;      // unix วินาที
  return now + n * 1000;             // ระยะเวลาเป็นวินาที
}

// ───────── error ─────────
export class TtsApiError extends Error {
  code: string; requestId: string | null;
  scopeHint: string | null;   // ชื่อสิทธิ์ (API scope) ที่คำสั่งนี้ต้องใช้ — ใช้บอกเจ้าของว่าต้องไปเปิดสิทธิ์ไหน
  constructor(message: string, code: string, requestId: string | null = null, scopeHint: string | null = null) {
    super(message); this.name = "TtsApiError"; this.code = code; this.requestId = requestId; this.scopeHint = scopeHint;
  }
}

/**
 * ข้อความภาษาคนจาก error ของ TikTok (ตาราง common-errors ทางการ)
 * ⚠️ รหัส 36009004 ใช้ซ้ำหลายสาเหตุ (ไม่มี sign / กุญแจผิด / app_key ผิด / เวลาเพี้ยน) → แยกด้วยข้อความ ไม่ใช่รหัส
 */
export function ttsErrorText(e: unknown): string {
  const code = String((e as { code?: unknown })?.code ?? "");
  const msg = String((e as Error)?.message ?? e ?? "");
  const scope = (e as { scopeHint?: string | null })?.scopeHint ?? null;
  if (code === "105005" || /access scope/i.test(msg)) {
    // เจอจริง 2026-11-12: กุญแจได้สิทธิ์ครบ แต่ตัวแอปใน Partner Center ยังไม่ได้เปิดสิทธิ์ → TikTok ปฏิเสธ
    return `แอปใน TikTok Partner Center ยังไม่ได้เปิดสิทธิ์${scope ? ` "${scope}"` : ""} ที่คำสั่งนี้ต้องใช้ — เปิดที่ Partner Center › App & Service › แอปของเรา › จัดการ API แล้วกด "เผยแพร่การเปลี่ยนแปลง" จากนั้นในระบบกด ตัดการเชื่อมต่อ แล้วเชื่อมต่อใหม่ (รหัส ${code || "105005"})`;
  }
  if (code === "106001" || (/\bsign\b/i.test(msg) && /invalid|missing/i.test(msg))) return `ลายเซ็นคำขอไม่ผ่าน — ตรวจว่า TIKTOK_SHOP_APP_SECRET ใน Vercel ตรงกับหน้าแอป (${msg})`;
  if (code === "105002" || /expired/i.test(msg)) return `กุญแจของร้านหมดอายุ — กดเชื่อมต่อ TikTok Shop ใหม่ (${msg})`;
  if (/timestamp/i.test(msg)) return "เวลาในคำขอคลาดเคลื่อน ลองใหม่อีกครั้ง";
  if (/app_key/i.test(msg)) return `App Key ไม่ถูกต้อง — ตรวจ TIKTOK_SHOP_APP_KEY ใน Vercel (${msg})`;
  if (/access.?token/i.test(msg)) return `กุญแจของร้านใช้ไม่ได้ — กดเชื่อมต่อ TikTok Shop ใหม่ (${msg})`;
  return code ? `${msg} (รหัส ${code})` : msg;
}

// ───────── กุญแจ (token) ─────────
export type TtsToken = {
  access_token: string; access_token_expire_in: number;
  refresh_token: string; refresh_token_expire_in: number;
  open_id?: string; seller_name?: string; seller_base_region?: string; user_type?: number; granted_scopes?: string[];
};

async function tokenCall(path: string, extra: Record<string, string>): Promise<TtsToken> {
  const qs = new URLSearchParams({ app_key: APP_KEY(), app_secret: APP_SECRET(), ...extra });
  const res = await fetch(`${TTS_AUTH_BASE}${path}?${qs.toString()}`, { method: "GET", cache: "no-store" });
  const j = await res.json().catch(() => null) as { code?: number; message?: string; request_id?: string; data?: TtsToken } | null;
  if (!j) throw new TtsApiError(`TikTok ตอบกลับไม่ถูกต้อง (HTTP ${res.status})`, String(res.status));
  if (j.code !== 0 || !j.data?.access_token) throw new TtsApiError(j.message || "ขอกุญแจจาก TikTok ไม่สำเร็จ", String(j.code ?? res.status), j.request_id ?? null);
  return j.data;
}
export const ttsExchangeToken = (authCode: string) => tokenCall("/api/v2/token/get", { auth_code: authCode, grant_type: "authorized_code" });
export const ttsRefreshToken = (refreshToken: string) => tokenCall("/api/v2/token/refresh", { refresh_token: refreshToken, grant_type: "refresh_token" });

// ───────── เรียก API ─────────
/** เรียก TikTok Shop API (เซ็นให้เอง) → คืน data · code ≠ 0 = โยน TtsApiError */
export async function ttsApi(method: "GET" | "POST" | "PUT" | "DELETE", path: string, accessToken: string, opts: { query?: Record<string, string>; body?: unknown; scope?: string } = {}): Promise<Record<string, unknown>> {
  const query: Record<string, string> = { ...(opts.query ?? {}), app_key: APP_KEY(), timestamp: String(Math.floor(Date.now() / 1000)) };
  const body = opts.body === undefined ? "" : JSON.stringify(opts.body);
  query.sign = await ttsSign(path, query, body, APP_SECRET());
  const res = await fetch(`${TTS_API_BASE}${path}?${new URLSearchParams(query).toString()}`, {
    method, cache: "no-store",
    headers: { "x-tts-access-token": accessToken, "content-type": "application/json" },
    body: body || undefined,
  });
  const j = await res.json().catch(() => null) as { code?: number; message?: string; request_id?: string; data?: Record<string, unknown> } | null;
  if (!j) throw new TtsApiError(`TikTok ตอบกลับไม่ถูกต้อง (HTTP ${res.status})`, String(res.status));
  if (j.code !== 0) throw new TtsApiError(j.message || "เรียก TikTok ไม่สำเร็จ", String(j.code ?? res.status), j.request_id ?? null, opts.scope ?? null);
  return j.data ?? {};
}

// ───────── กันเชื่อมร้านผิดแบรนด์ ─────────
/**
 * ชื่อร้านจาก TikTok ไม่ตรงชื่อแบรนด์ที่เลือก? (ตัดช่องว่าง/ตัวพิมพ์/สัญลักษณ์ แล้วดูว่าชื่อหนึ่งอยู่ในอีกชื่อไหม)
 * ใช้ "เตือน" เท่านั้น (ชื่อร้านอาจต่างจากชื่อแบรนด์ได้จริง) · ร้านเดียวกันซ้ำแบรนด์ = บล็อกที่ callback ด้วย open_id
 * เจอจริง 2026-11-12: ร้าน Louis Montini ถูกเชื่อมเข้าแบรนด์ IG International เพราะเลือกแบรนด์ค้างไว้
 */
export function ttsBrandMismatch(sellerName: string | null | undefined, brandName: string | null | undefined): boolean {
  const norm = (s: string | null | undefined) => String(s ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]/gu, "");
  const a = norm(sellerName), b = norm(brandName);
  if (!a || !b) return false;
  return !(a.includes(b) || b.includes(a));
}

// ───────── ร้านที่อนุญาต ─────────
/** ร้านที่ผูกกับกุญแจ — cipher ต้องใช้กับคำสั่งระดับร้าน (สินค้า/ออเดอร์) */
export type TtsShop = { id: string; name: string; region: string | null; code: string | null; cipher: string; seller_type: string | null };

const str = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
/** อ่านรายชื่อร้านจากคำตอบ GET /authorization/202309/shops (ทนชื่อช่องต่างกันเล็กน้อย) */
export function ttsShopsFromApi(data: Record<string, unknown> | null | undefined): TtsShop[] {
  const list = (data?.shops ?? data?.shop_list ?? []) as unknown;
  if (!Array.isArray(list)) return [];
  const out: TtsShop[] = [];
  for (const raw of list as Record<string, unknown>[]) {
    const cipher = str(raw?.cipher ?? raw?.shop_cipher);
    const id = str(raw?.id ?? raw?.shop_id);
    if (!cipher || !id) continue;
    out.push({ id, cipher, name: str(raw.name ?? raw.shop_name) ?? id, region: str(raw.region), code: str(raw.code ?? raw.shop_code), seller_type: str(raw.seller_type) });
  }
  return out;
}
// ───────── สินค้า (อ่านอย่างเดียว) ─────────
// รูปคำตอบจากเอกสารทางการ (api_meta ของ search-products-202502 / get-product-202309 · อ่าน 2026-11-12):
//  ค้นหา: data.{ total_count, next_page_token, products[{ id, title, status, skus[{ id, seller_sku, price{ tax_exclusive_price, sale_price, currency },
//          inventory[{ warehouse_id, quantity }], status_info{ status } }], update_time, … }] } — ไม่มีรูป/หมวด
//  รายตัว: data.{ main_images[{ urls[], thumb_urls[] }], category_chains[{ id, local_name, is_leaf, parent_id }], skus[{ id, sales_attributes[{ name, value_name }] }], description(HTML — ไม่เก็บ) }
const PRODUCT_SCOPE = "Product Basic (seller.product.basic)";

export type TtsProductPage = { products: Record<string, unknown>[]; total: number; nextPageToken: string | null };
/** ค้นหาสินค้าทั้งร้าน (status=ALL) ทีละหน้า · page_size ≤ 100 */
export async function ttsSearchProducts(accessToken: string, shopCipher: string, opts: { pageToken?: string | null; pageSize?: number; updateTimeGe?: number } = {}): Promise<TtsProductPage> {
  const query: Record<string, string> = { shop_cipher: shopCipher, page_size: String(Math.max(1, Math.min(100, opts.pageSize ?? 50))) };
  if (opts.pageToken) query.page_token = opts.pageToken;
  // updateTimeGe = เฉพาะตัวที่แก้หลังเวลานี้ (unix วินาที) — ใช้ดึงอัตโนมัติเป็นรอบ (products-sync)
  const d = await ttsApi("POST", "/product/202502/products/search", accessToken, { query, body: { status: "ALL", ...(opts.updateTimeGe ? { update_time_ge: opts.updateTimeGe } : {}) }, scope: PRODUCT_SCOPE });
  const products = Array.isArray(d.products) ? d.products as Record<string, unknown>[] : [];
  return { products, total: Number(d.total_count) || 0, nextPageToken: str(d.next_page_token) };
}
/** รายละเอียดสินค้า 1 ตัว · underReview = ฉบับที่ส่งให้ TikTok ตรวจอยู่ (หลังแก้ชื่อ — ค่าเริ่มต้นได้ฉบับที่ขายอยู่) */
export async function ttsGetProduct(accessToken: string, shopCipher: string, productId: string, opts: { underReview?: boolean } = {}): Promise<Record<string, unknown>> {
  const query: Record<string, string> = { shop_cipher: shopCipher };
  if (opts.underReview) query.return_under_review_version = "true";
  return ttsApi("GET", `/product/202309/products/${encodeURIComponent(productId)}`, accessToken, { query, scope: PRODUCT_SCOPE });
}

// ───────── แก้สินค้าบนร้านจริง (เฟส A: ชื่อ + เปิด/ปิดขาย) — route ต้องถามผู้ใช้ก่อน + เขียนประวัติทุกครั้ง ─────────
const PRODUCT_WRITE_SCOPE = "Product Write (seller.product.write)";
/**
 * แก้บางช่องของสินค้า (Partial Edit 202509) · ส่งเฉพาะช่องบนสุดที่ต้องการแก้ (ช่องที่ไม่ส่ง = คงเดิม)
 * ⚠️ แก้แล้ว TikTok ส่งไปตรวจใหม่ (ฉบับเดิมขายต่อจนผ่าน) · ราคา/สต๊อก = มีผลทันที (ยังไม่เปิดให้แก้)
 * category_version: เอกสารบอก "ร้าน SEA ต้องส่ง v2 เมื่อใช้ API นี้" (ไทย = SEA)
 */
export async function ttsPartialEdit(accessToken: string, shopCipher: string, productId: string, fields: { title?: string; description?: string; main_images?: { uri: string }[]; package_weight?: unknown; package_dimensions?: unknown; product_attributes?: unknown[]; is_cod_allowed?: boolean; size_chart?: unknown; skus?: unknown[] }, opts: { saveMode?: "AS_DRAFT" | "LISTING" } = {}): Promise<Record<string, unknown>> {
  // save_mode ค่าเริ่มของ TikTok = LISTING (ส่งตรวจ/เผยแพร่) — สินค้าที่เป็นฉบับร่างต้องส่ง AS_DRAFT ไม่งั้นร่างถูกส่งตรวจ (เจอจริง 2026-11-13 BBM02 กลายเป็น PENDING)
  return ttsApi("POST", `/product/202509/products/${encodeURIComponent(productId)}/partial_edit`, accessToken, {
    query: { shop_cipher: shopCipher }, body: { ...fields, category_version: "v2", ...(opts.saveMode ? { save_mode: opts.saveMode } : {}) }, scope: PRODUCT_WRITE_SCOPE,
  });
}
/**
 * ฝากรูปกับ TikTok (Upload Product Image 202309 · multipart/form-data · ไม่ต้องมี shop_cipher) → { uri, url, width, height }
 * เฟส C: use_case=MAIN_IMAGE (300–4000 px · ≤ 10MB · jpg/png/webp) · เซ็นคำขอแบบไม่รวม body (กติกาของ multipart)
 */
export async function ttsUploadImage(accessToken: string, bytes: ArrayBuffer, fileName: string, contentType: string, useCase = "MAIN_IMAGE"): Promise<{ uri: string; url: string | null; width: number | null; height: number | null }> {
  const path = "/product/202309/images/upload";
  const query: Record<string, string> = { app_key: APP_KEY(), timestamp: String(Math.floor(Date.now() / 1000)) };
  query.sign = await ttsSign(path, query, "", APP_SECRET());
  const fd = new FormData();
  fd.append("data", new Blob([bytes], { type: contentType }), fileName);
  fd.append("use_case", useCase);
  const res = await fetch(`${TTS_API_BASE}${path}?${new URLSearchParams(query).toString()}`, {
    method: "POST", cache: "no-store", headers: { "x-tts-access-token": accessToken }, body: fd,   // content-type + boundary ให้ fetch ใส่เอง
  });
  const j = await res.json().catch(() => null) as { code?: number; message?: string; request_id?: string; data?: Record<string, unknown> } | null;
  if (!j) throw new TtsApiError(`TikTok ตอบกลับไม่ถูกต้อง (HTTP ${res.status})`, String(res.status));
  if (j.code !== 0) throw new TtsApiError(j.message || "ฝากรูปกับ TikTok ไม่สำเร็จ", String(j.code ?? res.status), j.request_id ?? null, PRODUCT_WRITE_SCOPE);
  const uri = str(j.data?.uri);
  if (!uri) throw new TtsApiError("TikTok ไม่ส่งรหัสรูป (uri) กลับมา", "no_uri", j.request_id ?? null);
  return { uri, url: str(j.data?.url), width: numOrNull(j.data?.width), height: numOrNull(j.data?.height) };
}

/**
 * สร้างสินค้าใหม่ (Create Product 202309) — เฟส D ใช้ save_mode=AS_DRAFT เสมอ (ไปอยู่ฉบับร่างใน Seller Center ยังไม่ขึ้นขาย)
 * body ประกอบที่ lib/tiktok-create-plan (รูปต้องเป็น uri ที่ฝากแล้ว) → { product_id, skus[{ id, seller_sku }], warnings[] }
 */
export async function ttsCreateProduct(accessToken: string, shopCipher: string, body: Record<string, unknown>): Promise<{ productId: string; skus: { id: string | null; seller_sku: string | null }[]; warnings: string[] }> {
  const d = await ttsApi("POST", "/product/202309/products", accessToken, { query: { shop_cipher: shopCipher }, body, scope: PRODUCT_WRITE_SCOPE });
  const productId = str(d.product_id);
  if (!productId) throw new TtsApiError("TikTok ไม่ส่งรหัสสินค้ากลับมา", "no_product_id");
  const skus = (Array.isArray(d.skus) ? d.skus as Record<string, unknown>[] : []).map((s) => ({ id: str(s.id), seller_sku: str(s.seller_sku) }));
  const warnings = (Array.isArray(d.warnings) ? d.warnings as Record<string, unknown>[] : []).map((w) => str(w.message)).filter((x): x is string => !!x);
  return { productId, skus, warnings };
}
/** ช่องของหมวด (Get Attributes 202309) — ช่องขาย (SALES_PROPERTY) + ช่องสินค้า (PRODUCT_PROPERTY · is_requried สะกดตามเอกสาร) */
export async function ttsGetCategoryAttributes(accessToken: string, shopCipher: string, categoryId: string): Promise<Record<string, unknown>[]> {
  const d = await ttsApi("GET", `/product/202309/categories/${encodeURIComponent(categoryId)}/attributes`, accessToken, {
    query: { shop_cipher: shopCipher, category_version: "v2", locale: "th-TH" }, scope: PRODUCT_SCOPE,
  });
  return Array.isArray(d.attributes) ? d.attributes as Record<string, unknown>[] : [];
}
/**
 * คลังสินค้าของร้าน (warehouse_id) สำหรับช่อง inventory ตอนสร้างสินค้า — TikTok บังคับแม้เป็นฉบับร่าง (เจอจริง 2026-11-13
 * "Inventory of Skus[0] is a required field") · อ่านจากสินค้าที่มีอยู่ในร้าน (ค้นหา 1 ตัว · skus[].inventory[].warehouse_id)
 * ใช้สิทธิ์ Product Basic ที่มีอยู่แล้ว (ไม่ต้องขอสิทธิ์ Logistics) · ไม่เจอ = null
 */
export async function ttsShopWarehouseId(accessToken: string, shopCipher: string): Promise<string | null> {
  const page = await ttsSearchProducts(accessToken, shopCipher, { pageSize: 20 });
  for (const p of page.products) {
    for (const s of (Array.isArray(p.skus) ? p.skus as Record<string, unknown>[] : [])) {
      for (const inv of (Array.isArray(s.inventory) ? s.inventory as Record<string, unknown>[] : [])) {
        const id = str(inv.warehouse_id);
        if (id) return id;
      }
    }
  }
  return null;
}
/** กติกาของหมวด (Get Category Rules 202309) — COD รองรับไหม · ตารางขนาด รองรับ/บังคับไหม · ข้อมูลดิบ (ttsCategoryRulesOf ใน lib/tiktok-attrs แปลง) */
export async function ttsGetCategoryRules(accessToken: string, shopCipher: string, categoryId: string): Promise<Record<string, unknown>> {
  return ttsApi("GET", `/product/202309/categories/${encodeURIComponent(categoryId)}/rules`, accessToken, {
    query: { shop_cipher: shopCipher, category_version: "v2", locale: "th-TH" }, scope: PRODUCT_SCOPE,
  });
}
/** แบรนด์ที่ร้านใช้ได้ (Get Brands 202309) ค้นด้วยชื่อขึ้นต้น · ระบุหมวด = บอกว่าใช้ในหมวดนั้นได้ไหม */
export async function ttsGetBrands(accessToken: string, shopCipher: string, opts: { brandName?: string; categoryId?: string | null }): Promise<{ id: string; name: string; authorized: string | null; available: string | null }[]> {
  const query: Record<string, string> = { shop_cipher: shopCipher, page_size: "100", category_version: "v2" };
  if (opts.brandName) query.brand_name = opts.brandName;
  if (opts.categoryId) query.category_id = opts.categoryId;
  const d = await ttsApi("GET", "/product/202309/brands", accessToken, { query, scope: PRODUCT_SCOPE });
  return (Array.isArray(d.brands) ? d.brands as Record<string, unknown>[] : [])
    .map((b) => ({ id: str(b.id) ?? "", name: str(b.name) ?? "", authorized: str(b.authorized_status), available: str(b.brand_status) }))
    .filter((b) => b.id && b.name);
}

/**
 * ตั้งสต๊อกต่อตัวเลือก (Update Inventory 202309) — สินค้าต้องเป็น DRAFT / PENDING / FAILED / ACTIVATE / SELLER_DEACTIVATED · จำนวน 1–99,999 (เอกสาร)
 * ⚠️ ใช้เฉพาะตอน "เผยแพร่ฉบับร่าง" (เจ้าของใส่สต๊อกตั้งต้นเองครั้งเดียว · อนุมัติ 2026-11-13) — ห้ามใช้ซิงค์สต๊อกตราบใดที่ BigSeller ยังซิงค์ร้านนี้
 */
export async function ttsUpdateInventory(accessToken: string, shopCipher: string, productId: string, skus: { id: string; warehouseId: string; quantity: number }[]): Promise<Record<string, unknown>> {
  return ttsApi("POST", `/product/202309/products/${encodeURIComponent(productId)}/inventory/update`, accessToken, {
    query: { shop_cipher: shopCipher },
    body: { skus: skus.map((s) => ({ id: s.id, inventory: [{ warehouse_id: s.warehouseId, quantity: Math.round(s.quantity) }] })) },
    scope: PRODUCT_WRITE_SCOPE,
  });
}
/**
 * แก้ราคาต่อตัวเลือก (Update Price 202309) — มีผลทันที ไม่ต้องรอตรวจ · ทุก SKU ต้องอยู่สินค้าเดียวกัน · สินค้าต้อง ACTIVATE และไม่อยู่ในโปรโมชัน
 * price.amount = ราคาแสดงก่อนส่วนลด (ร้านไทย) · ไทย 30–260,000 ทศนิยม 2 (planTiktokPrices ตรวจก่อนแล้ว) · data ตอบว่างเสมอ
 */
export async function ttsUpdatePrices(accessToken: string, shopCipher: string, productId: string, skus: { id: string; amount: number }[], currency = "THB"): Promise<Record<string, unknown>> {
  return ttsApi("POST", `/product/202309/products/${encodeURIComponent(productId)}/prices/update`, accessToken, {
    query: { shop_cipher: shopCipher },
    body: { skus: skus.map((s) => ({ id: s.id, price: { amount: s.amount.toFixed(2), currency } })) },
    scope: PRODUCT_WRITE_SCOPE,
  });
}
/**
 * เปิดขาย (activate — TikTok ส่งตรวจก่อน สถานะเป็น PENDING) / ปิดขาย (deactivate — ซ่อนทันที) · สูงสุด 20 ตัวต่อครั้ง
 * คืน data ดิบ — ต้องเช็ก data.errors[] แม้ code = 0 (tiktokDisplayErrors ใน lib/tiktok-listing-edit)
 */
export async function ttsSetProductsActive(accessToken: string, shopCipher: string, productIds: string[], open: boolean): Promise<Record<string, unknown>> {
  return ttsApi("POST", `/product/202309/products/${open ? "activate" : "deactivate"}`, accessToken, {
    query: { shop_cipher: shopCipher }, body: { product_ids: productIds.slice(0, 20) }, scope: PRODUCT_WRITE_SCOPE,
  });
}

// ───────── ตารางขนาดแบบแม่แบบ (lib/tiktok-size-chart แปลงคำตอบ) ─────────
/** แม่แบบตารางขนาดของร้าน (Search Size Charts 202407 · REUSABLE_TEMPLATE) → data ดิบ */
export async function ttsSearchSizeCharts(accessToken: string, shopCipher: string, opts: { pageToken?: string | null; pageSize?: number; keyword?: string; ids?: string[] } = {}): Promise<Record<string, unknown>> {
  const query: Record<string, string> = { shop_cipher: shopCipher, page_size: String(Math.min(100, Math.max(1, opts.pageSize ?? 100))), locales: "th-TH" };
  if (opts.pageToken) query.page_token = opts.pageToken;
  return ttsApi("POST", "/product/202407/sizecharts/search", accessToken, {
    query, body: { size_chart_mode: "REUSABLE_TEMPLATE", ...(opts.keyword ? { keyword: opts.keyword } : {}), ...(opts.ids?.length ? { ids: opts.ids.slice(0, 50) } : {}) }, scope: PRODUCT_SCOPE,
  });
}
/** สร้างแม่แบบตารางขนาด (Create Size Chart V2 202610 · body จาก planTiktokSizeTable) → id แม่แบบ (ใช้เป็น size_chart.template.id) */
export async function ttsCreateSizeChart(accessToken: string, shopCipher: string, body: Record<string, unknown>): Promise<string> {
  const d = await ttsApi("POST", "/product/202610/size_charts", accessToken, { query: { shop_cipher: shopCipher }, body, scope: PRODUCT_SCOPE });
  const id = str(d.size_chart_id);
  if (!id) throw new TtsApiError("TikTok ไม่ส่งรหัสแม่แบบตารางขนาดกลับมา", "no_size_chart_id");
  return id;
}

// ───────── โปรโมชัน (อ่านอย่างเดียว · lib/tiktok-promotions แปลงคำตอบ) ─────────
const PROMO_SCOPE = "Promotion Information (seller.promotion.info)";
/** ค้นโปรของร้าน (Search Promotion Activities 202309) → data ดิบ { activities[], next_page_token, total_count } */
export async function ttsSearchPromotions(accessToken: string, shopCipher: string, opts: { status?: string; pageToken?: string | null; pageSize?: number } = {}): Promise<Record<string, unknown>> {
  return ttsApi("POST", "/promotion/202309/activities/search", accessToken, {
    query: { shop_cipher: shopCipher },
    body: { page_size: Math.min(100, Math.max(1, opts.pageSize ?? 100)), page_token: opts.pageToken ?? "", ...(opts.status ? { status: opts.status } : {}) },
    scope: PROMO_SCOPE,
  });
}
/** รายละเอียดโปร 1 รายการ + สินค้าในโปร (Get Activity 202309) → data ดิบ */
export async function ttsGetPromotion(accessToken: string, shopCipher: string, activityId: string): Promise<Record<string, unknown>> {
  return ttsApi("GET", `/promotion/202309/activities/${encodeURIComponent(activityId)}`, accessToken, { query: { shop_cipher: shopCipher }, scope: PROMO_SCOPE });
}

/** โดน TikTok จำกัดความถี่ไหม (ลองใหม่ได้) */
export const ttsIsRateLimit = (e: unknown): boolean => String((e as { code?: unknown })?.code ?? "") === "36009002" || String((e as { code?: unknown })?.code ?? "") === "429" || /too many requests/i.test(String((e as Error)?.message ?? ""));

export type TtsSkuSlim = { id: string | null; seller_sku: string | null; price: number | null; stock: number | null; status: string | null; label?: string };
export type TtsSlim = { id: string; title: string | null; status: string | null; skus: TtsSkuSlim[]; image: string | null; category: string | null; update_time: number | null };
export type TtsCatalogItem = { external_product_id: string; title: string | null; skus: string[]; price: number | null; status: string | null; raw: { tiktok: TtsSlim } };

const numOrNull = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const arrOf = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Record<string, unknown>[] : []);

/** รูปแรก + หมวด (ปลายสุด) + ชื่อตัวเลือกต่อ SKU จากรายละเอียดสินค้า */
export function ttsDetailExtras(detail: Record<string, unknown> | null | undefined): { image: string | null; category: string | null; labels: Map<string, string> } {
  const img = arrOf(detail?.main_images)[0];
  const first = (v: unknown): string | null => (Array.isArray(v) ? str(v[0]) : null);
  const image = img ? (first(img.urls) ?? first(img.thumb_urls)) : null;
  const chain = arrOf(detail?.category_chains);
  const leaf = chain.find((c) => c.is_leaf === true) ?? chain[chain.length - 1];
  const labels = new Map<string, string>();
  for (const s of arrOf(detail?.skus)) {
    const id = str(s.id); if (!id) continue;
    const label = arrOf(s.sales_attributes).map((a) => [str(a.name), str(a.value_name)].filter(Boolean).join(": ")).filter(Boolean).join(" · ");
    if (label) labels.set(id, label);
  }
  return { image, category: str(leaf?.local_name), labels };
}

/** สินค้า 1 ตัวจากผลค้นหา (+ รายละเอียดถ้ามี) → แถวสินค้าบนแพลตฟอร์ม · เก็บเฉพาะช่องที่ใช้ (ไม่เก็บคำบรรยาย) */
export function ttsProductToCatalogItem(p: Record<string, unknown>, extras?: { image: string | null; category: string | null; labels?: Map<string, string> } | null): TtsCatalogItem | null {
  const id = str(p.id);
  if (!id) return null;
  const skus: TtsSkuSlim[] = arrOf(p.skus).map((s) => {
    const price = (s.price && typeof s.price === "object") ? s.price as Record<string, unknown> : {};
    const inv = arrOf(s.inventory);
    const skuId = str(s.id);
    const label = skuId ? extras?.labels?.get(skuId) : undefined;
    return {
      id: skuId, seller_sku: str(s.seller_sku),
      // ร้านไทย (local) ใช้ tax_exclusive_price = ราคาแสดงก่อนส่วนลด · ร้านข้ามแดนใช้ sale_price
      price: numOrNull(price.tax_exclusive_price) ?? numOrNull(price.sale_price),
      stock: inv.length ? inv.reduce((a, w) => a + Math.max(0, numOrNull(w.quantity) ?? 0), 0) : null,
      status: str((s.status_info as Record<string, unknown> | undefined)?.status),
      ...(label ? { label } : {}),
    };
  });
  const prices = skus.map((s) => s.price).filter((n): n is number => n != null && n > 0);
  const status = str(p.status);
  return {
    external_product_id: id,
    title: str(p.title),
    skus: [...new Set(skus.map((s) => s.seller_sku).filter((x): x is string => !!x))],
    price: prices.length ? Math.min(...prices) : null,
    status: status ? status.toLowerCase() : null,
    raw: { tiktok: { id, title: str(p.title), status, skus, image: extras?.image ?? null, category: extras?.category ?? null, update_time: numOrNull(p.update_time) } },
  };
}

// ───────── ออเดอร์ (อ่านอย่างเดียว) ─────────
// รูปคำตอบจากเอกสารทางการ (api_meta ของ get-order-list-202309 · อ่าน 2026-11-12):
//  data.{ total_count, next_page_token, orders[{ id, status, create_time, paid_time, update_time, rts_sla_time, tracking_number, shipping_provider,
//         payment{ currency, total_amount, sub_total, shipping_fee, seller_discount, platform_discount }, is_cod, payment_method_name,
//         delivery_option_name, packages[{ id }], cancel_reason, buyer_message, recipient_address{ name, … } (ไม่มีตอน UNPAID/ON_HOLD),
//         line_items[{ id, sku_id, seller_sku, product_name, sku_name, sale_price, original_price, product_id, package_id, display_status }] }] }
//  1 line_item = 1 ชิ้น (ไม่มีช่องจำนวน) → รวมตาม sku_id
const ORDER_SCOPE = "Order Information (seller.order.info)";

export type TtsOrderPage = { orders: Record<string, unknown>[]; total: number; nextPageToken: string | null };
/**
 * ค้นหาออเดอร์ทีละหน้า (unix วินาที) · page_size ≤ 100
 *  createTimeGe = สร้างตั้งแต่ (ปุ่มดึง 30 วัน · เรียงใหม่สุดก่อน) · updateTimeGe = เปลี่ยนสถานะตั้งแต่ (ตัวดึงอัตโนมัติ · ได้เฉพาะใบที่ขยับ)
 */
export async function ttsSearchOrders(accessToken: string, shopCipher: string, opts: { createTimeGe?: number; updateTimeGe?: number; pageToken?: string | null; pageSize?: number }): Promise<TtsOrderPage> {
  const byUpdate = opts.updateTimeGe != null;
  const query: Record<string, string> = { shop_cipher: shopCipher, page_size: String(Math.max(1, Math.min(100, opts.pageSize ?? 50))), sort_field: byUpdate ? "update_time" : "create_time", sort_order: "DESC" };
  if (opts.pageToken) query.page_token = opts.pageToken;
  const body: Record<string, number> = {};
  if (opts.createTimeGe != null) body.create_time_ge = Math.floor(opts.createTimeGe);
  if (byUpdate) body.update_time_ge = Math.floor(opts.updateTimeGe as number);
  const d = await ttsApi("POST", "/order/202309/orders/search", accessToken, { query, body, scope: ORDER_SCOPE });
  const orders = Array.isArray(d.orders) ? d.orders as Record<string, unknown>[] : [];
  return { orders, total: Number(d.total_count) || 0, nextPageToken: str(d.next_page_token) };
}

export type TtsOrderItem = { sku_id: string | null; sku_code: string | null; name: string | null; variant: string | null; qty: number; price: number | null };
export type TtsOrderMapped = {
  external_order_id: string;
  head: {
    order_no: string; customer_name: string | null; status: string; platform_status: string | null;
    total: number | null; currency: string; ordered_at: string | null; ship_by_at: string | null;
    tracking_no: string | null; carrier: string | null; package_no: string | null; cod_amount: number;
    raw: { tiktok: Record<string, unknown> };
  };
  items: TtsOrderItem[];
};
const isoFromUnix = (v: unknown): string | null => { const n = numOrNull(v); return n && n > 0 ? new Date(n * 1000).toISOString() : null; };

/**
 * ออเดอร์ TikTok 1 ใบ → หัวออเดอร์ + รายการ (สำหรับ platform_orders / platform_order_items)
 * สถานะในระบบ = tiktokToInternal (ไม่รู้จัก = "new" ให้คนดู) · ไม่เก็บที่อยู่/เบอร์ผู้รับ (ระบบยังไม่ได้ใช้ — จัดส่งบนร้าน)
 */
export function ttsOrderToPlatformOrder(o: Record<string, unknown>, toInternal: (code: string | null) => string | null): TtsOrderMapped | null {
  const id = str(o.id);
  if (!id) return null;
  const pay = (o.payment && typeof o.payment === "object") ? o.payment as Record<string, unknown> : {};
  const addr = (o.recipient_address && typeof o.recipient_address === "object") ? o.recipient_address as Record<string, unknown> : {};
  const status = str(o.status);
  const total = numOrNull(pay.total_amount);
  const isCod = o.is_cod === true;
  const pkgs = arrOf(o.packages);
  // รวมรายการตาม sku_id (1 แถว = 1 ชิ้น) · ของแถม (is_gift) แยกแถว ราคา 0
  const byKey = new Map<string, TtsOrderItem>();
  for (const li of arrOf(o.line_items)) {
    const gift = li.is_gift === true;
    const key = `${str(li.sku_id) ?? str(li.seller_sku) ?? str(li.product_name) ?? "?"}${gift ? ":gift" : ""}`;
    const prev = byKey.get(key);
    if (prev) { prev.qty += 1; continue; }
    byKey.set(key, {
      sku_id: str(li.sku_id), sku_code: str(li.seller_sku), name: str(li.product_name) ?? str(li.sku_name),
      variant: str(li.sku_name), qty: 1, price: gift ? 0 : numOrNull(li.sale_price) ?? numOrNull(li.original_price),
    });
  }
  return {
    external_order_id: id,
    head: {
      order_no: id,
      customer_name: str(addr.name) ?? ([str(addr.first_name), str(addr.last_name)].filter(Boolean).join(" ") || null),
      status: toInternal(status) ?? "new",
      platform_status: status,
      total, currency: str(pay.currency) ?? "THB",
      ordered_at: isoFromUnix(o.create_time),
      ship_by_at: isoFromUnix(o.rts_sla_time),
      tracking_no: str(o.tracking_number),
      carrier: str(o.shipping_provider),
      package_no: pkgs.length ? str(pkgs[0].id) : null,
      // ช่องนี้ในฐานข้อมูลห้ามว่าง (ค่าเริ่ม 0) — ไม่ใช่เก็บเงินปลายทาง = 0 (เจอจริง 2026-11-12: ส่ง null แล้วบันทึกไม่ผ่านทั้งหน้า)
      cod_amount: isCod ? (total ?? 0) : 0,
      raw: {
        tiktok: {
          status, update_time: numOrNull(o.update_time), paid_time: numOrNull(o.paid_time), rts_sla_time: numOrNull(o.rts_sla_time),
          payment: { currency: str(pay.currency), total_amount: total, sub_total: numOrNull(pay.sub_total), shipping_fee: numOrNull(pay.shipping_fee), seller_discount: numOrNull(pay.seller_discount), platform_discount: numOrNull(pay.platform_discount) },
          is_cod: isCod, payment_method_name: str(o.payment_method_name), delivery_option_name: str(o.delivery_option_name), shipping_type: str(o.shipping_type),
          cancel_reason: str(o.cancel_reason), buyer_message: str(o.buyer_message), packages: pkgs.map((p) => str(p.id)).filter(Boolean),
        },
      },
    },
    items: [...byKey.values()],
  };
}

// ───────── หมวดหมู่ (อ่านอย่างเดียว) ─────────
// GET /product/202309/categories?shop_cipher&locale → data.categories[{ id, parent_id ("0" = ราก), local_name, is_leaf, permission_statuses[] }]
// ไม่ส่ง category_version = ใช้ต้นไม้ค่าเริ่มของร้าน (ตรงกับ category_chains ของสินค้าที่ดึงมา)
export async function ttsGetCategories(accessToken: string, shopCipher: string, locale: string): Promise<Record<string, unknown>[]> {
  const d = await ttsApi("GET", "/product/202309/categories", accessToken, { query: { shop_cipher: shopCipher, locale }, scope: PRODUCT_SCOPE });
  return Array.isArray(d.categories) ? d.categories as Record<string, unknown>[] : [];
}

export type TtsCategoryLeaf = { id: string; path: string; permission: string | null };
/** หมวดใบสุด + ชื่อเต็ม "ราก > … > ใบ" (คั่น " > " แบบเดียวกับ Shopee/Lazada ในระบบ) · permission = สถานะสิทธิ์ของร้าน (AVAILABLE = ลงได้) */
export function ttsCategoryLeafPaths(cats: Record<string, unknown>[]): TtsCategoryLeaf[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const c of cats) { const id = str(c.id); if (id) byId.set(id, c); }
  const nameOf = (id: string): string => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cur: string | null = id;
    while (cur && cur !== "0" && !seen.has(cur)) {
      seen.add(cur);
      const n = byId.get(cur);
      if (!n) break;
      parts.unshift(str(n.local_name) ?? cur);
      cur = str(n.parent_id);
    }
    return parts.join(" > ");
  };
  const out: TtsCategoryLeaf[] = [];
  for (const [id, c] of byId) {
    if (c.is_leaf !== true) continue;
    const perms = Array.isArray(c.permission_statuses) ? (c.permission_statuses as unknown[]).map((x) => String(x)) : [];
    out.push({ id, path: nameOf(id), permission: perms.length ? perms.join(",") : null });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, "th"));
}

export async function ttsGetAuthorizedShops(accessToken: string): Promise<TtsShop[]> {
  return ttsShopsFromApi(await ttsApi("GET", "/authorization/202309/shops", accessToken, { scope: "Shop Authorized Information (seller.authorization.info)" }));
}
