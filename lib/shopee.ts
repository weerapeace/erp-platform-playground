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
type ShopeeCall = { method?: "GET" | "POST"; query?: Record<string, string | number>; body?: Record<string, unknown>; accessToken?: string; shopId?: string | number };

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
  const method = opts.method ?? (opts.body ? "POST" : "GET");
  const res = await fetch(`${shopeeHost()}${path}?${q.toString()}`, {
    method, cache: "no-store",
    headers: opts.body ? { "Content-Type": "application/json" } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
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

export async function shopeeGetItemList(accessToken: string, shopId: string | number, args: { status: string; offset: number; pageSize: number }): Promise<ShopeeItemPage> {
  return shopeeItemListOf(await shopeeFetch("/api/v2/product/get_item_list", {
    accessToken, shopId, query: { offset: args.offset, page_size: Math.min(100, Math.max(1, args.pageSize)), item_status: args.status },
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
export type ShopeeSlimModel = { model_id: string; sku: string | null; label: string | null; price: number | null; original_price: number | null; stock: number | null; image: string | null; status: string | null };
export type ShopeeSlimTier = { name: string; options: string[] };
export type ShopeeSlim = {
  item_id: string; status: string | null; update_time: number | null;
  image: string | null; image_count: number; category_id: string | null; item_sku: string | null; brand: string | null;
  has_model: boolean; price: number | null; original_price: number | null; stock: number | null; weight: number | null;
  tiers: ShopeeSlimTier[]; models: ShopeeSlimModel[];
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
  const tiers: ShopeeSlimTier[] = tierObjs.map((t) => ({ name: str(t.name) ?? "", options: arr(t.option_list).map(obj).map((o) => str(o?.option) ?? "") }));
  const tierImg = (i: number): string | null => str(obj(obj(arr(tierObjs[0]?.option_list)[i])?.image)?.image_url);
  const models = raw.model.map(obj).filter((x): x is Obj => !!x).map((m) => {
    const idx = arr(m.tier_index).map((n) => Number(n));
    const label = idx.map((k, i) => { const t = tiers[i]; const opt = t?.options[k]; return opt ? (t.name ? `${t.name}: ${opt}` : opt) : null; }).filter(Boolean).join(" · ") || null;
    const pr = priceOf(m);
    return {
      model_id: String(m.model_id ?? ""), sku: str(m.model_sku), label, price: pr.price, original_price: pr.original,
      stock: stockOf(m), image: Number.isFinite(idx[0]) ? tierImg(idx[0]) : null, status: str(m.model_status),
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
    tiers: models?.tiers ?? [], models: ms,
  };
  const skus = [...new Set([itemSku, ...ms.map((m) => m.sku)].filter((s): s is string => !!s))];
  const listPrice = hasModel ? minPos(ms.map((m) => m.original_price ?? m.price)) : (pr.original ?? pr.price);
  return { external_product_id: itemId, title: str(base.item_name), skus, price: listPrice, status: shopeeListingStatus(slim.status), raw: { shopee: slim } };
}
