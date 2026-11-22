/**
 * Shopee Open Platform API v2 (ร้านของเราเอง · แอปแบบ Seller In House System) — ฝั่งเซิร์ฟเวอร์เท่านั้น
 *
 * อ้างอิงเอกสารทางการ open.shopee.com (อ่าน 2026-10-28 · สรุปใน docs/shopee-connector.md):
 *  - เซ็นคำขอ: HMAC-SHA256(partner_key, partner_id + path + timestamp [+ access_token + shop_id]) → hex ตัวเล็ก
 *    timestamp = วินาที (อายุ 5 นาที) · ต่างจาก Lazada (hex ตัวใหญ่ + ms) และ TikTok (ห่อ secret หัวท้าย)
 *  - ลิงก์ให้ร้านอนุญาต: {host}/api/v2/shop/auth_partner?partner_id&timestamp&sign&redirect
 *    → Shopee พากลับมาที่ redirect พร้อม ?code=&shop_id= (code ใช้ได้ครั้งเดียว · หมดใน 10 นาที)
 *    โดเมนของ redirect ต้องตรงกับ "Redirect URL Domain" ที่ตั้งในแอป (Test / Live แยกกัน)
 *  - กุญแจ: POST /api/v2/auth/token/get · ต่ออายุ: POST /api/v2/auth/access_token/get
 *    access_token อยู่ได้ 4 ชม. (expire_in วินาที) · refresh_token อยู่ได้ 30 วัน และ **ใช้ได้ครั้งเดียว** (ต่อแล้วต้องเก็บตัวใหม่ทุกครั้ง)
 *    สิทธิ์ที่ร้านให้ ≤ 365 วัน (ร้านเลือกตอนกดอนุญาต · ดูวันหมดจาก get_shop_info.expire_time)
 *  - ไม่มีตัวเลขจำกัดความถี่ที่ประกาศ — เกินแล้วได้ HTTP 429
 * env (ตั้งใน Vercel): SHOPEE_PARTNER_ID · SHOPEE_PARTNER_KEY · SHOPEE_ENV (live | sandbox — ไม่ตั้ง = live)
 * กติกาที่ไม่แตะเครือข่าย (เซ็น/ลิงก์/เวลา/แปลงคำตอบ/ข้อความ error) ทดสอบใน lib/__tests__/shopee.test.ts
 */

import type { CatalogSyncItem } from "@/lib/platform-catalog-sync";

export const SHOPEE_HOSTS = {
  live: "https://partner.shopeemobile.com",
  sandbox: "https://openplatform.sandbox.test-stable.shopee.sg",
} as const;
export type ShopeeEnv = keyof typeof SHOPEE_HOSTS;

/** refresh_token อยู่ได้ 30 วัน (Shopee ไม่ส่งวันหมดมาให้ → นับเองจากตอนได้ตัวใหม่) */
export const SHOPEE_REFRESH_TTL_MS = 30 * 86_400_000;

const PARTNER_ID = () => (process.env.SHOPEE_PARTNER_ID ?? "").trim();
const PARTNER_KEY = () => (process.env.SHOPEE_PARTNER_KEY ?? "").trim();

/** live / sandbox จาก SHOPEE_ENV — ไม่ตั้งหรือสะกดอื่น = live (เจ้าของใส่กุญแจ Live เป็นหลัก) */
export function shopeeEnv(raw: string | undefined = process.env.SHOPEE_ENV): ShopeeEnv {
  return String(raw ?? "").trim().toLowerCase() === "sandbox" ? "sandbox" : "live";
}
export function shopeeHost(env: ShopeeEnv = shopeeEnv()): string { return SHOPEE_HOSTS[env]; }

/** ตั้งกุญแจใน Vercel ครบแล้วหรือยัง (Partner ID ต้องเป็นตัวเลข) */
export function shopeeConfigured(): boolean { return /^\d+$/.test(PARTNER_ID()) && !!PARTNER_KEY(); }

// ───────── เซ็นคำขอ ─────────
/** ข้อความที่นำไปเซ็น — คำขอระดับแอป (ลิงก์อนุญาต/กุญแจ) ไม่มี access_token+shop_id · คำขอระดับร้านมีครบ */
export function shopeeSignBase(partnerId: string | number, path: string, timestamp: number, accessToken?: string, shopId?: string | number): string {
  return `${partnerId}${path}${timestamp}${accessToken ?? ""}${shopId ?? ""}`;
}

const enc = new TextEncoder();
function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
/** sign = HMAC-SHA256(key = partner_key, base) เป็น hex ตัวเล็ก */
export async function shopeeSign(base: string, partnerKey: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(partnerKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(base)));
}

const nowSec = () => Math.floor(Date.now() / 1000);

/** ลิงก์ให้ร้านกดอนุญาต — redirect ต้องอยู่ใต้โดเมนที่ตั้งในแอป (Shopee ต่อ ?code=&shop_id= ท้าย redirect ให้) */
export async function shopeeAuthUrl(redirect: string, opts: { timestamp?: number; env?: ShopeeEnv; partnerId?: string; partnerKey?: string } = {}): Promise<string> {
  const path = "/api/v2/shop/auth_partner";
  const pid = opts.partnerId ?? PARTNER_ID();
  const ts = opts.timestamp ?? nowSec();
  const sign = await shopeeSign(shopeeSignBase(pid, path, ts), opts.partnerKey ?? PARTNER_KEY());
  const q = new URLSearchParams({ partner_id: pid, timestamp: String(ts), sign, redirect });
  return `${shopeeHost(opts.env)}${path}?${q.toString()}`;
}

/**
 * อ่าน code / shop_id / state จากคำขอที่ Shopee พากลับมา
 * กันไว้: ถ้า Shopee ต่อ "?code=" ท้าย redirect ที่มี "?state=" อยู่แล้ว (ได้ ?state=X?code=Y&shop_id=Z) → แยกให้ถูก
 */
export function shopeeCallbackParams(search: URLSearchParams): { code: string; shopId: string; mainAccountId: string; state: string } {
  const get = (k: string) => (search.get(k) ?? "").trim();
  let state = get("state"), code = get("code"), shopId = get("shop_id");
  const mainAccountId = get("main_account_id");
  const q = state.indexOf("?");
  if (q >= 0) {
    const tail = new URLSearchParams(state.slice(q + 1));
    state = state.slice(0, q);
    code ||= (tail.get("code") ?? "").trim();
    shopId ||= (tail.get("shop_id") ?? "").trim();
  }
  return { code, shopId, mainAccountId, state };
}

// ───────── error ─────────
export class ShopeeApiError extends Error {
  code: string; requestId: string | null; httpStatus: number;
  constructor(message: string, code: string, requestId: string | null = null, httpStatus = 0) {
    super(message); this.name = "ShopeeApiError"; this.code = code; this.requestId = requestId; this.httpStatus = httpStatus;
  }
}

export function shopeeIsRateLimit(e: unknown): boolean {
  const s = (e as { httpStatus?: number })?.httpStatus;
  return s === 429 || /too_many|too many|rate.?limit|frequen/i.test(`${(e as { code?: string })?.code ?? ""} ${(e as Error)?.message ?? ""}`);
}

/** ข้อความภาษาคนจาก error ของ Shopee (ค่า error เป็นคำ เช่น error_sign / error_auth / invalid_acceess_token — Shopee สะกดผิดเองในบางตัว) */
export function shopeeErrorText(e: unknown): string {
  const code = String((e as { code?: unknown })?.code ?? "");
  const msg = String((e as Error)?.message ?? e ?? "");
  const both = `${code} ${msg}`;
  if (shopeeIsRateLimit(e)) return `Shopee ให้รอสักครู่ (เรียกถี่เกินไป) — ลองใหม่อีกครั้งใน 1 นาที (${msg})`;
  if (/error_sign|wrong sign|invalid sign/i.test(both)) return `ลายเซ็นคำขอไม่ผ่าน — ตรวจว่า SHOPEE_PARTNER_KEY ใน Vercel ตรงกับ Key ในหน้าแอป Shopee (Live กับ Test เป็นคนละชุด) (${msg})`;
  if (/invalid_acc?ee?ss_token|invalid.?access.?token|access.?token.*(expire|invalid)|token.*expired/i.test(both)) return `กุญแจของร้านหมดอายุหรือใช้ไม่ได้ — กดเชื่อมต่อ Shopee ใหม่ (${msg})`;
  if (/refresh.?token/i.test(both)) return `ต่ออายุกุญแจไม่ได้ (ตัวต่ออายุหมดหรือถูกใช้ไปแล้ว) — กดเชื่อมต่อ Shopee ใหม่ (${msg})`;
  if (/invalid.?code|code.*(expire|used|invalid)/i.test(both)) return `รหัสจากหน้าอนุญาตหมดอายุหรือถูกใช้แล้ว — กดเชื่อมต่อ Shopee ใหม่อีกครั้ง (${msg})`;
  if (/partner.?id|invalid.?partner/i.test(both)) return `Partner ID ไม่ถูกต้อง — ตรวจ SHOPEE_PARTNER_ID ใน Vercel และ SHOPEE_ENV (live/sandbox) ให้ตรงชุดกุญแจ (${msg})`;
  if (/redirect/i.test(both)) return `โดเมนที่พากลับไม่ตรงกับ Redirect URL Domain ในหน้าแอป Shopee (${msg})`;
  if (/error_permission|no permission|not authori[sz]ed|shop.*(not|un)authori/i.test(both)) return `ร้านยังไม่ได้ให้สิทธิ์แอปนี้ หรือสิทธิ์หมดอายุแล้ว — กดเชื่อมต่อ Shopee ใหม่ (${msg})`;
  if (/error_auth/i.test(both)) return `Shopee ไม่ยอมรับการยืนยันตัวตน — ตรวจกุญแจใน Vercel / ลองเชื่อมต่อใหม่ (${msg})`;
  if (/error_param/i.test(both)) return `ข้อมูลที่ส่งไป Shopee ไม่ครบหรือรูปแบบผิด (${msg})`;
  if (/error_server|error_inner|error_network|internal/i.test(both)) return `ระบบ Shopee ขัดข้องชั่วคราว — ลองใหม่อีกครั้ง (${msg})`;
  return msg || "Shopee ตอบกลับผิดปกติ";
}

// ───────── เรียก API ─────────
/** form = multipart (ฝากรูป media_space) — ส่งแทน body · ไม่ตั้ง Content-Type เอง (ให้ fetch ใส่ boundary) */
type ShopeeCall = { method?: "GET" | "POST"; query?: Record<string, string | number>; body?: Record<string, unknown>; form?: FormData; accessToken?: string; shopId?: string | number };

/** เรียก Shopee 1 ครั้ง (เซ็นให้เอง) · คำตอบมี error ไม่ว่าง หรือ HTTP ไม่ 2xx = โยน ShopeeApiError */
export async function shopeeFetch(path: string, opts: ShopeeCall = {}): Promise<Record<string, unknown>> {
  if (!shopeeConfigured()) throw new ShopeeApiError("ยังไม่ได้ตั้ง SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY ในระบบ (Vercel)", "not_configured");
  const pid = PARTNER_ID();
  const ts = nowSec();
  const shopLevel = !!(opts.accessToken && opts.shopId != null);
  const sign = await shopeeSign(shopeeSignBase(pid, path, ts, shopLevel ? opts.accessToken : undefined, shopLevel ? opts.shopId : undefined), PARTNER_KEY());
  const q = new URLSearchParams({ partner_id: pid, timestamp: String(ts), sign });
  if (shopLevel) { q.set("access_token", opts.accessToken!); q.set("shop_id", String(opts.shopId)); }
  for (const [k, v] of Object.entries(opts.query ?? {})) q.set(k, String(v));
  const method = opts.method ?? (opts.body || opts.form ? "POST" : "GET");
  const res = await fetch(`${shopeeHost()}${path}?${q.toString()}`, {
    method, cache: "no-store",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try { j = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { /* ไม่ใช่ JSON */ }
  const err = String(j.error ?? "").trim();
  const reqId = typeof j.request_id === "string" ? j.request_id : null;
  if (err || !res.ok) throw new ShopeeApiError(String(j.message ?? "").trim() || err || `HTTP ${res.status}${text ? `: ${text.slice(0, 160)}` : ""}`, err || `http_${res.status}`, reqId, res.status);
  return j;
}

// ───────── กุญแจ ─────────
export type ShopeeToken = { access_token: string; refresh_token: string; expire_in: number; shop_id_list: number[]; merchant_id_list: number[] };

const numList = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n) && n > 0) : []);
/** อ่านคำตอบกุญแจ (token/get · access_token/get) — ไม่มีกุญแจ = โยน */
export function shopeeTokenOf(j: Record<string, unknown>): ShopeeToken {
  const access_token = String(j.access_token ?? "").trim();
  const refresh_token = String(j.refresh_token ?? "").trim();
  if (!access_token || !refresh_token) throw new ShopeeApiError("Shopee ไม่ส่งกุญแจกลับมา", "no_token", typeof j.request_id === "string" ? j.request_id : null);
  return { access_token, refresh_token, expire_in: Number(j.expire_in) || 0, shop_id_list: numList(j.shop_id_list), merchant_id_list: numList(j.merchant_id_list) };
}

/** แลก code (จากหน้าอนุญาต) → กุญแจ · ร้านเดี่ยวส่ง shop_id · บัญชีหลัก (หลายร้าน) ส่ง main_account_id */
export async function shopeeExchangeCode(code: string, who: { shopId?: string; mainAccountId?: string }): Promise<ShopeeToken> {
  const body: Record<string, unknown> = { code, partner_id: Number(PARTNER_ID()) };
  if (who.shopId) body.shop_id = Number(who.shopId); else if (who.mainAccountId) body.main_account_id = Number(who.mainAccountId);
  return shopeeTokenOf(await shopeeFetch("/api/v2/auth/token/get", { body }));
}

/** ต่ออายุกุญแจ — ⚠️ refresh_token เดิมใช้ไม่ได้อีกหลังเรียกสำเร็จ ผู้เรียกต้องเก็บตัวใหม่ทันที */
export async function shopeeRefreshToken(refreshToken: string, shopId: string | number): Promise<ShopeeToken> {
  return shopeeTokenOf(await shopeeFetch("/api/v2/auth/access_token/get", { body: { refresh_token: refreshToken, partner_id: Number(PARTNER_ID()), shop_id: Number(shopId) } }));
}

/** เวลาหมดอายุจากคำตอบกุญแจ → ms (access 4 ชม. ตาม expire_in · ตัวต่ออายุ 30 วันนับจากตอนนี้) */
export function shopeeTokenTimes(t: Pick<ShopeeToken, "expire_in">, now = Date.now()): { expires_at: number; rt_expires_at: number } {
  return { expires_at: now + (t.expire_in > 0 ? t.expire_in : 4 * 3600) * 1000, rt_expires_at: now + SHOPEE_REFRESH_TTL_MS };
}

/**
 * วันที่ "ต้องกดเชื่อมใหม่" จริง = ตัวไหนหมดก่อน ระหว่างตัวต่ออายุ (30 วัน ต่อเองทุกวัน) กับสิทธิ์ที่ร้านให้ (≤365 วัน)
 * เก็บเป็น refresh_expires_at → ใช้กติกาสุขภาพกุญแจตัวเดียวกับ Lazada/TikTok + หน้าศูนย์แบรนด์ได้เลย
 */
export function shopeeReconnectBy(meta: { rt_expires_at?: number | null; auth_expires_at?: number | null }): number | undefined {
  const xs = [Number(meta.rt_expires_at) || 0, Number(meta.auth_expires_at) || 0].filter((x) => x > 0);
  return xs.length ? Math.min(...xs) : undefined;
}

// ───────── ร้าน ─────────
export type ShopeeShopInfo = { shop_name: string | null; region: string | null; status: string | null; auth_expires_at: number | null; is_cb: boolean | null };

const str = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
/** อ่านคำตอบ v2.shop.get_shop_info (ช่องอยู่ชั้นบนสุด · บางเวอร์ชันห่อใน response — รับได้ทั้งคู่) */
export function shopeeShopInfoOf(j: Record<string, unknown>): ShopeeShopInfo {
  const r = (j.response && typeof j.response === "object" ? j.response : j) as Record<string, unknown>;
  const exp = Number(r.expire_time) || 0;
  return {
    shop_name: str(r.shop_name), region: str(r.region), status: str(r.status),
    auth_expires_at: exp > 0 ? (exp > 1e12 ? exp : exp * 1000) : null,
    is_cb: typeof r.is_cb === "boolean" ? r.is_cb : null,
  };
}

export async function shopeeGetShopInfo(accessToken: string, shopId: string | number): Promise<ShopeeShopInfo> {
  return shopeeShopInfoOf(await shopeeFetch("/api/v2/shop/get_shop_info", { accessToken, shopId }));
}

// ───────── สินค้า (อ่านอย่างเดียว) ─────────
// v2.product.get_item_list (≤100/หน้า · ทีละสถานะ) → get_item_base_info (≤50/ครั้ง) → get_model_list (ทีละสินค้า · เฉพาะที่มีตัวเลือก)

/** สถานะที่ดึง — ไม่เอาตัวที่ลบแล้ว (SELLER_DELETE / SHOPEE_DELETE) → รอบที่ดึงครบจะติดป้าย "ไม่อยู่บนร้านแล้ว" ให้เอง */
export const SHOPEE_PULL_STATUSES = ["NORMAL", "UNLIST", "REVIEWING", "BANNED"] as const;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const respOf = (j: Obj): Obj => obj(j.response) ?? j;

export type ShopeeItemRef = { item_id: string; item_status: string | null; update_time: number | null };
export type ShopeeItemPage = { items: ShopeeItemRef[]; total: number; hasNext: boolean; nextOffset: number };

/** อ่านคำตอบ get_item_list */
export function shopeeItemListOf(j: Obj): ShopeeItemPage {
  const r = respOf(j);
  const items = arr(r.item).map(obj).filter((x): x is Obj => !!x)
    .map((x) => ({ item_id: String(x.item_id ?? "").trim(), item_status: str(x.item_status), update_time: num(x.update_time) }))
    .filter((x) => x.item_id);
  return { items, total: num(r.total_count) ?? 0, hasNext: r.has_next_page === true, nextOffset: num(r.next_offset) ?? 0 };
}

/** updateTimeFrom/To (unix วินาที) = เฉพาะตัวที่แก้ในช่วงนี้ — ดึง "เฉพาะตัวที่เปลี่ยน" (app/api/platform-catalog/refresh-changed) · ไม่ส่ง = ทั้งหมด */
export async function shopeeGetItemList(accessToken: string, shopId: string | number, args: { status: string; offset: number; pageSize: number; updateTimeFrom?: number; updateTimeTo?: number }): Promise<ShopeeItemPage> {
  return shopeeItemListOf(await shopeeFetch("/api/v2/product/get_item_list", {
    accessToken, shopId, query: {
      offset: args.offset, page_size: Math.min(100, Math.max(1, args.pageSize)), item_status: args.status,
      ...(args.updateTimeFrom ? { update_time_from: args.updateTimeFrom } : {}), ...(args.updateTimeTo ? { update_time_to: args.updateTimeTo } : {}),
    },
  }));
}

/** รายละเอียดสินค้า ≤ 50 ตัวต่อครั้ง (ชื่อ · รูป · หมวด · ราคา/สต๊อกถ้าไม่มีตัวเลือก · รหัสสินค้า) */
export async function shopeeGetItemBaseInfo(accessToken: string, shopId: string | number, itemIds: string[]): Promise<Obj[]> {
  if (!itemIds.length) return [];
  if (itemIds.length > 50) throw new ShopeeApiError("ขอรายละเอียดสินค้าได้ครั้งละไม่เกิน 50 ตัว", "error_param");
  const j = await shopeeFetch("/api/v2/product/get_item_base_info", { accessToken, shopId, query: { item_id_list: itemIds.join(",") } });
  return arr(respOf(j).item_list).map(obj).filter((x): x is Obj => !!x);
}

export type ShopeeModelsRaw = { tier_variation: unknown[]; model: unknown[] };
/** ตัวเลือก (สี/ไซซ์) ของสินค้า 1 ตัว */
export async function shopeeGetModelList(accessToken: string, shopId: string | number, itemId: string): Promise<ShopeeModelsRaw> {
  const r = respOf(await shopeeFetch("/api/v2/product/get_model_list", { accessToken, shopId, query: { item_id: itemId } }));
  return { tier_variation: arr(r.tier_variation), model: arr(r.model) };
}

// ───────── แปลงเป็นสำเนาย่อ (raw.shopee) — เก็บเฉพาะที่ใช้ ไม่เก็บคำอธิบายยาว ─────────
export type ShopeeSlimModel = { model_id: string; sku: string | null; label: string | null; price: number | null; original_price: number | null; stock: number | null; image: string | null; status: string | null; /** อยู่ในโปรโมชัน (has_promotion) — Shopee ไม่ให้แก้ราคาตัวนี้ */ promo?: boolean };
/** images = รูปของแต่ละตัวเลือก (Shopee มีเฉพาะชั้นแรก) — ใช้แก้รูปตัวเลือก (lib/shopee-listing-edit planShopeeOptionImages) */
export type ShopeeSlimTier = { name: string; options: string[]; images?: ({ id: string; url: string | null } | null)[] };
export type ShopeeSlim = {
  item_id: string; status: string | null; update_time: number | null;
  image: string | null; image_count: number; category_id: string | null; item_sku: string | null; brand: string | null;
  has_model: boolean; price: number | null; original_price: number | null; stock: number | null; weight: number | null;
  tiers: ShopeeSlimTier[]; models: ShopeeSlimModel[];
  /** ชนิดรายละเอียด: normal = ข้อความ · extended = มีรูปในรายละเอียด (ร้านต้องได้สิทธิ์จาก Shopee) */
  desc_type?: string | null;
};

/** ราคา: price_info[0].current_price (ราคาที่ลูกค้าจ่าย) / original_price (ราคาตั้ง) */
function priceOf(o: Obj): { price: number | null; original: number | null } {
  const p = obj(arr(o.price_info)[0]);
  return { price: num(p?.current_price), original: num(p?.original_price) };
}
/** สต๊อกพร้อมขาย: stock_info_v2.summary_info.total_available_stock (รุ่นใหม่) · รุ่นเก่า stock_info[].current_stock/normal_stock */
function stockOf(o: Obj): number | null {
  const v2 = num(obj(obj(o.stock_info_v2)?.summary_info)?.total_available_stock);
  if (v2 != null) return v2;
  const old = arr(o.stock_info).map(obj).filter((x): x is Obj => !!x).map((x) => num(x.current_stock) ?? num(x.normal_stock));
  return old.some((n) => n != null) ? old.reduce<number>((s, n) => s + (n ?? 0), 0) : null;
}

/** ตัวเลือกจาก get_model_list → ชื่อ "สี: ดำ · ขนาด: M" + รูปของตัวเลือกชั้นแรก */
export function shopeeModelsToSlim(raw: ShopeeModelsRaw | null): { tiers: ShopeeSlimTier[]; models: ShopeeSlimModel[] } {
  if (!raw) return { tiers: [], models: [] };
  const tierObjs = raw.tier_variation.map(obj).filter((x): x is Obj => !!x);
  const tiers: ShopeeSlimTier[] = tierObjs.map((t) => {
    const opts = arr(t.option_list).map(obj);
    const images = opts.map((o) => { const im = obj(o?.image); const id = str(im?.image_id); return id ? { id, url: str(im?.image_url) } : null; });
    return { name: str(t.name) ?? "", options: opts.map((o) => str(o?.option) ?? ""), ...(images.some(Boolean) ? { images } : {}) };
  });
  const tierImg = (i: number): string | null => str(obj(obj(arr(tierObjs[0]?.option_list)[i])?.image)?.image_url);
  const models = raw.model.map(obj).filter((x): x is Obj => !!x).map((m) => {
    const idx = arr(m.tier_index).map((n) => Number(n));
    const label = idx.map((k, i) => { const t = tiers[i]; const opt = t?.options[k]; return opt ? (t.name ? `${t.name}: ${opt}` : opt) : null; }).filter(Boolean).join(" · ") || null;
    const pr = priceOf(m);
    return {
      model_id: String(m.model_id ?? ""), sku: str(m.model_sku), label, price: pr.price, original_price: pr.original,
      stock: stockOf(m), image: Number.isFinite(idx[0]) ? tierImg(idx[0]) : null, status: str(m.model_status), promo: m.has_promotion === true,
    };
  }).filter((m) => m.model_id);
  return { tiers, models };
}

/** สถานะสินค้า Shopee → status ในตาราง (ตัวเล็ก เหมือน TikTok): normal / unlist / reviewing / banned */
export const shopeeListingStatus = (s: string | null | undefined): string | null => (s ? s.trim().toLowerCase() : null);

const minPos = (xs: (number | null)[]): number | null => { const ok = xs.filter((n): n is number => n != null && n > 0); return ok.length ? Math.min(...ok) : null; };

/**
 * รายละเอียด (get_item_base_info) + ตัวเลือก (shopeeModelsToSlim · null = ไม่มีตัวเลือก/ยังไม่ได้ดึง) → รายการบนร้าน 1 ตัว
 * skus = รหัสสินค้าหลักก่อน แล้วรหัสตัวเลือก (ใช้จับคู่รหัสตรง) · price = ราคาตั้งต่ำสุด (ราคาลดอยู่ใน raw.shopee)
 */
export function shopeeItemToCatalogItem(base: Obj, models: { tiers: ShopeeSlimTier[]; models: ShopeeSlimModel[] } | null): CatalogSyncItem & { raw: { shopee: ShopeeSlim } } | null {
  const itemId = String(base.item_id ?? "").trim();
  if (!itemId) return null;
  const pr = priceOf(base);
  const imgs = arr(obj(base.image)?.image_url_list).map((u) => str(u)).filter((u): u is string => !!u);
  const ms = models?.models ?? [];
  const hasModel = base.has_model === true || ms.length > 0;
  const itemSku = str(base.item_sku);
  const slim: ShopeeSlim = {
    item_id: itemId, status: str(base.item_status), update_time: num(base.update_time),
    image: imgs[0] ?? null, image_count: imgs.length, category_id: base.category_id != null ? String(base.category_id) : null,
    item_sku: itemSku, brand: str(obj(base.brand)?.original_brand_name),
    has_model: hasModel, price: hasModel ? null : pr.price, original_price: hasModel ? null : pr.original,
    stock: hasModel ? null : stockOf(base), weight: num(base.weight),
    tiers: models?.tiers ?? [], models: ms, desc_type: str(base.description_type),
  };
  const skus = [...new Set([itemSku, ...ms.map((m) => m.sku)].filter((s): s is string => !!s))];
  const listPrice = hasModel ? minPos(ms.map((m) => m.original_price ?? m.price)) : (pr.original ?? pr.price);
  return { external_product_id: itemId, title: str(base.item_name), skus, price: listPrice, status: shopeeListingStatus(slim.status), raw: { shopee: slim } };
}

// ───────── ออเดอร์ (อ่านอย่างเดียว · PII ปิด = ไม่ขอ/ไม่เก็บที่อยู่ผู้รับ) ─────────
// v2.order.get_order_list (ช่วงเวลา ≤ 15 วัน/ครั้ง · ≤100/หน้า · cursor) → v2.order.get_order_detail (≤50/ครั้ง)

/** ช่วงเวลาที่ get_order_list รับได้ต่อครั้ง (15 วัน) */
export const SHOPEE_ORDER_WINDOW_SEC = 15 * 86_400;
/** ช่องเสริมที่ขอจาก get_order_detail — ไม่ขอ recipient_address (ไม่เก็บที่อยู่/เบอร์ผู้รับ) */
export const SHOPEE_ORDER_FIELDS = "buyer_username,item_list,pay_time,package_list,shipping_carrier,payment_method,total_amount,cancel_by,cancel_reason,buyer_cancel_reason";

export type ShopeeOrderRef = { order_sn: string; order_status: string | null };
export type ShopeeOrderPage = { orders: ShopeeOrderRef[]; more: boolean; nextCursor: string };

/** อ่านคำตอบ get_order_list */
export function shopeeOrderListOf(j: Obj): ShopeeOrderPage {
  const r = respOf(j);
  const orders = arr(r.order_list).map(obj).filter((x): x is Obj => !!x)
    .map((x) => ({ order_sn: String(x.order_sn ?? "").trim(), order_status: str(x.order_status) }))
    .filter((x) => x.order_sn);
  return { orders, more: r.more === true, nextCursor: String(r.next_cursor ?? "") };
}

/** ออเดอร์ในช่วงเวลา (field = create_time สร้าง / update_time เปลี่ยนสถานะ) · ช่วง ≤ 15 วัน */
export async function shopeeGetOrderList(accessToken: string, shopId: string | number, args: { field: "create_time" | "update_time"; from: number; to: number; cursor?: string; pageSize?: number }): Promise<ShopeeOrderPage> {
  const from = Math.floor(args.from), to = Math.floor(args.to);
  if (to - from > SHOPEE_ORDER_WINDOW_SEC) throw new ShopeeApiError("ช่วงเวลาออเดอร์ต่อครั้งต้องไม่เกิน 15 วัน", "error_param");
  return shopeeOrderListOf(await shopeeFetch("/api/v2/order/get_order_list", {
    accessToken, shopId,
    query: { time_range_field: args.field, time_from: from, time_to: to, page_size: Math.min(100, Math.max(1, args.pageSize ?? 100)), cursor: args.cursor ?? "", response_optional_fields: "order_status" },
  }));
}

/** รายละเอียดออเดอร์ ≤ 50 ใบต่อครั้ง (รายการสินค้า · ยอด · กำหนดส่ง · ขนส่ง) */
export async function shopeeGetOrderDetail(accessToken: string, shopId: string | number, orderSns: string[]): Promise<Obj[]> {
  if (!orderSns.length) return [];
  if (orderSns.length > 50) throw new ShopeeApiError("ขอรายละเอียดออเดอร์ได้ครั้งละไม่เกิน 50 ใบ", "error_param");
  const j = await shopeeFetch("/api/v2/order/get_order_detail", { accessToken, shopId, query: { order_sn_list: orderSns.join(","), response_optional_fields: SHOPEE_ORDER_FIELDS } });
  return arr(respOf(j).order_list).map(obj).filter((x): x is Obj => !!x);
}

export type ShopeeOrderItem = { sku_code: string | null; name: string | null; variant: string | null; qty: number; price: number | null; item_id: string | null; model_id: string | null };
export type ShopeeOrderMapped = {
  external_order_id: string;
  head: {
    order_no: string; customer_name: string | null; status: string; platform_status: string | null;
    total: number | null; currency: string; ordered_at: string | null; ship_by_at: string | null;
    carrier: string | null; package_no: string | null; cod_amount: number;
    raw: { shopee: Record<string, unknown> };
  };
  items: ShopeeOrderItem[];
};
const isoFromSec = (v: unknown): string | null => { const n = num(v); return n && n > 0 ? new Date(n * 1000).toISOString() : null; };

/**
 * ออเดอร์ Shopee 1 ใบ (get_order_detail) → หัวออเดอร์ + รายการ (platform_orders / platform_order_items)
 * สถานะในระบบ = toInternal (lib/platform-order-status shopeeToInternal · ไม่รู้จัก = "new" ให้คนดู)
 * ราคา/ชิ้น = model_discounted_price (หลังส่วนลดร้าน) ไม่มีก็ราคาตั้ง · รหัส = model_sku (ไม่มีก็ item_sku) · ไม่เก็บที่อยู่ผู้รับ
 */
export function shopeeOrderToPlatformOrder(o: Obj, toInternal: (code: string | null) => string | null): ShopeeOrderMapped | null {
  const sn = str(o.order_sn);
  if (!sn) return null;
  const status = str(o.order_status);
  const total = num(o.total_amount);
  const cod = o.cod === true;
  const pkgs = arr(o.package_list).map(obj).filter((x): x is Obj => !!x);
  const byKey = new Map<string, ShopeeOrderItem>();
  for (const li of arr(o.item_list).map(obj).filter((x): x is Obj => !!x)) {
    const code = str(li.model_sku) ?? str(li.item_sku);
    const key = `${li.item_id ?? ""}:${li.model_id ?? ""}:${code ?? str(li.item_name) ?? "?"}`;
    const qty = Math.max(0, num(li.model_quantity_purchased) ?? 1);
    const prev = byKey.get(key);
    if (prev) { prev.qty += qty; continue; }
    byKey.set(key, {
      sku_code: code, name: str(li.item_name), variant: str(li.model_name), qty,
      price: num(li.model_discounted_price) ?? num(li.model_original_price),
      item_id: li.item_id != null ? String(li.item_id) : null, model_id: li.model_id != null && String(li.model_id) !== "0" ? String(li.model_id) : null,
    });
  }
  return {
    external_order_id: sn,
    head: {
      order_no: sn,
      customer_name: str(o.buyer_username),
      status: toInternal(status) ?? "new",
      platform_status: status,
      total, currency: str(o.currency) ?? "THB",
      ordered_at: isoFromSec(o.create_time),
      ship_by_at: isoFromSec(o.ship_by_date),
      carrier: str(o.shipping_carrier) ?? str(pkgs[0]?.shipping_carrier),
      package_no: str(pkgs[0]?.package_number),
      cod_amount: cod ? (total ?? 0) : 0,   // ช่องนี้ห้ามว่าง (ค่าเริ่ม 0)
      raw: {
        shopee: {
          status, update_time: num(o.update_time), pay_time: num(o.pay_time), ship_by_date: num(o.ship_by_date), days_to_ship: num(o.days_to_ship),
          cod, payment_method: str(o.payment_method), shipping_carrier: str(o.shipping_carrier),
          cancel_by: str(o.cancel_by), cancel_reason: str(o.cancel_reason), buyer_cancel_reason: str(o.buyer_cancel_reason),
          message_to_seller: str(o.message_to_seller),   // ข้อความลูกค้าถึงร้าน (ช่องปกติของ get_order_detail ไม่ต้องขอเพิ่ม) — โชว์ที่สถานีแพ็ค
          packages: pkgs.map((p) => ({ package_number: str(p.package_number), logistics_status: str(p.logistics_status) })).filter((p) => p.package_number),
        },
      },
    },
    items: [...byKey.values()],
  };
}

// ───────── เลขพัสดุ (อ่านอย่างเดียว · สถานีแพ็คยิงใบปะหน้า) ─────────
/** สถานะร้านที่ น่าจะมีเลขพัสดุแล้ว — จัดส่งแล้ว (PROCESSED) มาก่อน · READY_TO_SHIP = อาจยังไม่ได้กดจัดส่ง (ยังไม่มีเลข) */
export const SHOPEE_TRACKING_STATUSES = ["PROCESSED", "RETRY_SHIP", "READY_TO_SHIP", "SHIPPED"] as const;

/** อ่านคำตอบ get_tracking_number → เลขพัสดุ (ว่าง = ยังไม่ได้กดจัดส่ง/ยังไม่ออกเลข) */
export function shopeeTrackingOf(j: Obj): string | null {
  const r = respOf(j);
  return str(r.tracking_number) ?? str(r.last_mile_tracking_number) ?? null;
}

/** v2.logistics.get_tracking_number — ทีละ 1 ออเดอร์ (ส่ง package_number ถ้ามี · ออเดอร์แยกกล่อง) · ⚠️ อ่านอย่างเดียว */
export async function shopeeGetTrackingNumber(accessToken: string, shopId: string | number, orderSn: string, packageNumber?: string | null): Promise<string | null> {
  return shopeeTrackingOf(await shopeeFetch("/api/v2/logistics/get_tracking_number", {
    accessToken, shopId,
    query: { order_sn: orderSn, ...(packageNumber ? { package_number: packageNumber } : {}), response_optional_fields: "last_mile_tracking_number" },
  }));
}

// ───────── แก้สินค้าบนร้าน (เฟส 4 · ผู้เรียกต้องถามเจ้าของก่อน + ลงประวัติ) ─────────
/**
 * v2.product.update_item — แก้เฉพาะช่องที่ส่ง (ช่องที่ไม่ส่งคงเดิม · เอกสาร 2026-11-14) · เฟส 4A ส่งแค่ item_name / description
 * ⚠️ ห้ามส่ง weight/dimension เฉย ๆ — Shopee เขียนทับทุกตัวเลือก
 */
export async function shopeeUpdateItem(accessToken: string, shopId: string | number, itemId: string, patch: { item_name?: string; description?: string; image?: { image_id_list: string[]; image_ratio?: string } }): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { item_id: Number(itemId) };
  if (patch.item_name != null) body.item_name = patch.item_name;
  if (patch.description != null) body.description = patch.description;
  // เฟส 4C: รูปสินค้า = ส่งทั้งชุด (แทนของเดิมทั้งหมด · เรียงตามที่ส่ง · รูปแรก = ปก)
  if (patch.image) {
    if (!patch.image.image_id_list.length) throw new ShopeeApiError("ต้องมีรูปสินค้าอย่างน้อย 1 รูป", "error_param");
    body.image = { image_id_list: patch.image.image_id_list, ...(patch.image.image_ratio ? { image_ratio: patch.image.image_ratio } : {}) };
  }
  if (Object.keys(body).length < 2) throw new ShopeeApiError("ไม่มีอะไรให้แก้", "error_param");
  return shopeeFetch("/api/v2/product/update_item", { accessToken, shopId, body });
}

/** v2.product.unlist_item — unlist=true ปิดขาย · false เปิดขาย · คืนคำตอบดิบ (ผลรายตัวอยู่ใน response.failure_list / success_list) */
export async function shopeeUnlistItems(accessToken: string, shopId: string | number, items: { itemId: string; unlist: boolean }[]): Promise<Record<string, unknown>> {
  if (!items.length || items.length > 50) throw new ShopeeApiError("เปิด/ปิดขายได้ครั้งละ 1–50 สินค้า", "error_param");
  return shopeeFetch("/api/v2/product/unlist_item", { accessToken, shopId, body: { item_list: items.map((i) => ({ item_id: Number(i.itemId), unlist: i.unlist })) } });
}

/** v2.product.get_item_limit — ช่วงความยาวชื่อ/รายละเอียด/จำนวนรูปของร้าน (แคช 6 ชม.ต่อร้าน · ดึงไม่ได้ = null) */
const limitCache = new Map<string, { at: number; val: Record<string, unknown> | null }>();
export async function shopeeGetItemLimit(accessToken: string, shopId: string | number): Promise<Record<string, unknown> | null> {
  const key = String(shopId);
  const hit = limitCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.val;
  let val: Record<string, unknown> | null = null;
  try { val = await shopeeFetch("/api/v2/product/get_item_limit", { accessToken, shopId }); } catch { val = null; }
  limitCache.set(key, { at: Date.now(), val });
  return val;
}

// ───────── ลงสินค้าใหม่ (เฟส 5 · ดูก่อนส่ง/สร้าง — กติกาประกอบ lib/shopee-create-plan) ─────────
// เอกสาร (อ่าน 2026-11-15): GET ทั้งหมด · รายการส่งเป็นค่าคั่นจุลภาค (แบบ get_item_base_info)

/** v2.product.get_item_limit แบบระบุหมวด — ช่วงชื่อ/ตัวเลือก/วันส่ง/กล่องบังคับไหม (shopeeCreateLimitsOf) · แคช 6 ชม. ต่อร้าน×หมวด · ไม่ได้ = null */
const catLimitCache = new Map<string, { at: number; val: Record<string, unknown> | null }>();
export async function shopeeGetCategoryLimit(accessToken: string, shopId: string | number, categoryId: string): Promise<Record<string, unknown> | null> {
  const key = `${shopId}:${categoryId}`;
  const hit = catLimitCache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600_000) return hit.val;
  let val: Record<string, unknown> | null = null;
  try { val = await shopeeFetch("/api/v2/product/get_item_limit", { accessToken, shopId, query: { category_id: categoryId } }); } catch { val = null; }
  if (val) catLimitCache.set(key, { at: Date.now(), val });
  return val;
}

/** v2.product.get_attribute_tree (ภาษาไทย) → ช่องคุณลักษณะของหมวด (ดิบ · แปลงด้วย shopeeAttrFieldsOf) */
export async function shopeeGetAttributeTree(accessToken: string, shopId: string | number, categoryId: string): Promise<Obj[]> {
  const r = respOf(await shopeeFetch("/api/v2/product/get_attribute_tree", { accessToken, shopId, query: { category_id_list: categoryId, language: "th" } }));
  const one = arr(r.list).map(obj).find((x) => String(x?.category_id ?? "") === String(categoryId)) ?? obj(arr(r.list)[0]);
  return arr(one?.attribute_tree).map(obj).filter((x): x is Obj => !!x);
}

/** v2.logistics.get_channel_list — ขนส่งทั้งหมดของร้าน (ดิบ · แปลงด้วย shopeeChannelsOf) */
export async function shopeeGetChannelList(accessToken: string, shopId: string | number): Promise<Record<string, unknown>> {
  return shopeeFetch("/api/v2/logistics/get_channel_list", { accessToken, shopId });
}

/** v2.product.category_recommend → รหัสหมวดที่ Shopee แนะนำจากชื่อสินค้า (เรียงตามที่ Shopee ส่ง) */
export async function shopeeCategoryRecommend(accessToken: string, shopId: string | number, itemName: string): Promise<string[]> {
  const r = respOf(await shopeeFetch("/api/v2/product/category_recommend", { accessToken, shopId, query: { item_name: itemName.slice(0, 255) } }));
  return arr(r.category_id).map((n) => String(n ?? "").trim()).filter(Boolean);
}

/**
 * v2.product.add_item — สร้างสินค้าใหม่ 1 ตัว (เฟส 5B · ผู้เรียกต้องถามเจ้าของก่อน + ลงประวัติ) → item_id
 * ไม่ลองซ้ำอัตโนมัติ (กันสร้างซ้ำ) · body จาก lib/shopee-create-plan (shopeeCreateResolve แทนรูปเป็น image_id แล้ว)
 */
export async function shopeeAddItem(accessToken: string, shopId: string | number, body: Record<string, unknown>): Promise<{ itemId: string; raw: Record<string, unknown> }> {
  const j = await shopeeFetch("/api/v2/product/add_item", { accessToken, shopId, body });
  const itemId = String(respOf(j).item_id ?? "").trim();
  if (!itemId || itemId === "0") throw new ShopeeApiError("Shopee ไม่ส่งรหัสสินค้ากลับมา — ดูใน Seller Centre ว่าสร้างแล้วหรือยัง ก่อนลองใหม่", "error_data");
  return { itemId, raw: j };
}

/**
 * v2.product.update_tier_variation — แก้ "รายการตัวเลือก" ของสินค้าที่มีตัวเลือกแล้ว (เจ้าของสั่ง 2026-11-22: เปลี่ยนรูปของแต่ละสี)
 * ส่ง tier_variation ครบทุกชั้น · ชื่อชั้น/ชื่อตัวเลือก/ลำดับเหมือนเดิม เปลี่ยนแค่ image.image_id ของชั้นแรก · ไม่ส่ง model_list (ไม่เปลี่ยนโครงตัวเลือก)
 * ⚠️ ยังไม่ยืนยันจากเอกสารว่าไม่กระทบตัวเลือกเดิม → route ดึงกลับเช็กจำนวนตัวเลือก/ราคา/สต๊อกทุกครั้ง · ลองครั้งแรกกับสินค้าขายน้อย 1 ตัว
 */
export async function shopeeUpdateTierVariation(accessToken: string, shopId: string | number, itemId: string, tierVariation: Record<string, unknown>[]): Promise<Record<string, unknown>> {
  return shopeeFetch("/api/v2/product/update_tier_variation", { accessToken, shopId, body: { item_id: Number(itemId), tier_variation: tierVariation } });
}

/** v2.product.init_tier_variation — ตั้งชั้นตัวเลือก + ตัวเลือก (หลัง add_item ≥5 วิ · standardise_tier_variation) · คืนคำตอบดิบ */
export async function shopeeInitTierVariation(accessToken: string, shopId: string | number, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return shopeeFetch("/api/v2/product/init_tier_variation", { accessToken, shopId, body });
}

/**
 * v2.media_space.upload_image — ฝากรูป 1 รูปกับ Shopee → image_id (ใส่ใน update_item image.image_id_list)
 * เอกสาร (อ่าน 2026-11-15): Public API = เซ็นแค่ partner_id+path+timestamp (ไม่ใช้กุญแจร้าน) · multipart ช่อง image · JPG/JPEG/PNG ≤10MB
 *   scene "normal" = Shopee ทำเป็นจัตุรัสให้ (รูปสินค้า) · ratio "3:4" เฉพาะร้านที่ Shopee เปิดให้ (ไม่ส่ง = 1:1)
 * ฝากแล้วยังไม่แก้สินค้า (รูปค้างในคลังของ Shopee จนกว่าจะส่ง update_item)
 * ✅ ลองจริง 2026-11-15 (BPU02-01): ได้ image_id "sg-11134201-…" · update_item เก็บรหัสนี้ตามเดิม (ดึงกลับเห็นรหัสเดียวกัน)
 */
/** scene: "normal" = รูปสินค้า (Shopee ปรับเป็นจัตุรัส) · "desc" = รูปในรายละเอียดแบบ extended (ไม่ปรับรูป) */
export async function shopeeUploadImage(bytes: ArrayBuffer, name: string, contentType: string, ratio: "1:1" | "3:4" = "1:1", scene: "normal" | "desc" = "normal"): Promise<{ imageId: string; url: string | null }> {
  const fd = new FormData();
  fd.append("image", new Blob([bytes], { type: contentType }), name);
  fd.append("scene", scene);
  if (ratio === "3:4") fd.append("ratio", "3:4");
  return shopeeUploadImageOf(await shopeeFetch("/api/v2/media_space/upload_image", { form: fd }));
}

/** คำตอบ upload_image → รหัสรูป + ลิงก์ (ภูมิภาค TH ก่อน) · รุ่นใหม่มี image_info_list (error รายรูป) · ไม่มีรหัส = โยน */
export function shopeeUploadImageOf(j: Obj): { imageId: string; url: string | null } {
  const r = obj(j.response) ?? {};
  const first = obj(arr(r.image_info_list)[0]);
  const fe = str(first?.error);
  if (fe) throw new ShopeeApiError(str(first?.message) ?? fe, fe);
  const info = obj(r.image_info) ?? obj(first?.image_info);
  const imageId = str(info?.image_id);
  if (!imageId) throw new ShopeeApiError("Shopee ไม่ส่งรหัสรูปกลับมา — ลองใหม่อีกครั้ง", "error_data");
  const urls = arr(info?.image_url_list).map(obj).filter((x): x is Obj => !!x);
  const th = urls.find((u) => (str(u.image_url_region) ?? "").toUpperCase() === "TH");
  return { imageId, url: str(th?.image_url) ?? str(urls[0]?.image_url) };
}

/** v2.product.update_price — ราคาตั้ง (original_price) ต่อตัวเลือก ≤50 ต่อครั้ง · คืนคำตอบดิบ (ผลรายตัว failure_list / success_list) · ร้านไทยใช้จำนวนเต็ม */
export async function shopeeUpdatePrice(accessToken: string, shopId: string | number, body: { item_id: number; price_list: { model_id: number; original_price: number }[] }): Promise<Record<string, unknown>> {
  if (!body.price_list.length || body.price_list.length > 50) throw new ShopeeApiError("แก้ราคาได้ครั้งละ 1–50 ตัวเลือก", "error_param");
  return shopeeFetch("/api/v2/product/update_price", { accessToken, shopId, body });
}
