// ============================================================
// ตัวเชื่อม Lazada Open Platform API — ฝั่งเซิร์ฟเวอร์เท่านั้น
// เอกสาร: https://open.lazada.com/doc/doc.htm · auth: https://auth.lazada.com
// ต้องมี env: LAZADA_APP_KEY + LAZADA_APP_SECRET (ตั้งใน Vercel) · token เก็บเข้ารหัส (secret-box)
//
// การเซ็นคำขอ (sha256): sign = HMAC-SHA256( apiPath + concat(sortedParams key+value), app_secret ) → hex ตัวใหญ่
// ============================================================

import { lazSkuLabel, type LazadaAttrDef } from "@/lib/lazada-listing-edit";

export const LAZADA_AUTH_BASE = "https://auth.lazada.com/rest";

// ---- แอป Lazada (App Key + App Secret) ----
// แอปกลาง = env LAZADA_APP_KEY/SECRET (แอป "IG International ERP") · แบรนด์ที่สมัครแอปของตัวเองได้ (เช่น Louis Montini)
// เก็บแยกต่อแบรนด์ใน platform_credentials.app_key / app_secret (เข้ารหัส) → ทุกคำขอของแบรนด์นั้นเซ็นด้วยแอปของแบรนด์
export type LazApp = { key: string; secret: string };
const envApp = (): LazApp => ({ key: (process.env.LAZADA_APP_KEY ?? "").trim(), secret: (process.env.LAZADA_APP_SECRET ?? "").trim() });
/** มีแอปพร้อมใช้ไหม — ส่ง app ของแบรนด์มา = เช็กแอปนั้น · ไม่ส่ง/null = เช็กแอปกลาง */
export function lazConfigured(app?: LazApp | null): boolean { const a = app ?? envApp(); return !!(a.key && a.secret); }

/**
 * ปลายทางเรียก API ของร้าน 1 ร้าน = gateway ของประเทศ + แอปที่ใช้เซ็น
 * เก็บแอปไว้ใน private field + toJSON/toString คืนแค่ URL → เผลอส่งออกทาง JSON / ต่อสตริง ก็ไม่หลุด App Secret
 */
export class LazTarget {
  readonly url: string;
  readonly #app: LazApp;
  constructor(url: string, app: LazApp) { this.url = url; this.#app = app; }
  get app(): LazApp { return this.#app; }
  toJSON(): string { return this.url; }
  toString(): string { return this.url; }
}
/** ที่ฟังก์ชันเรียก Lazada รับ: URL เฉย ๆ (ใช้แอปกลาง) หรือ LazTarget (แอปของแบรนด์) */
export type LazGateway = string | LazTarget;
/** สร้างปลายทาง — แบรนด์ไม่มีแอปของตัวเอง (app = null) = URL เฉย ๆ เหมือนเดิมทุกอย่าง */
export function lazTarget(url: string, app: LazApp | null | undefined): LazGateway { return app ? new LazTarget(url, app) : url; }
function resolveTarget(g: LazGateway): { url: string; app: LazApp } {
  return typeof g === "string" ? { url: g, app: envApp() } : { url: g.url, app: g.app };
}

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
export function lazAuthUrl(redirectUri: string, state: string, app?: LazApp | null): string {
  const q = new URLSearchParams({ response_type: "code", force_auth: "true", redirect_uri: redirectUri, client_id: (app ?? envApp()).key, state });
  return `https://auth.lazada.com/oauth/authorize?${q.toString()}`;
}

export type LazToken = {
  access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number;
  account?: string; country_user_info?: { country: string; user_id: string; seller_id: string; short_code: string }[];
};

// เรียก auth endpoint (token/create, token/refresh) — เซ็นด้วย app_secret
async function authCall(apiPath: string, extra: Record<string, string>, appIn?: LazApp | null): Promise<LazToken> {
  const app = appIn ?? envApp();
  const params: Record<string, string> = { app_key: app.key, sign_method: "sha256", timestamp: String(Date.now()), ...extra };
  params.sign = await sign(apiPath, params, app.secret);
  const r = await fetch(`${LAZADA_AUTH_BASE}${apiPath}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params) });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (String(j.code ?? "0") !== "0") throw new Error(String(j.message || j.code || `HTTP ${r.status}`));
  return j as unknown as LazToken;
}
/** แลก code → token · app = แอปของแบรนด์ (ต้องเป็นแอปเดียวกับที่ใช้เปิดหน้าอนุญาต) · ไม่ส่ง = แอปกลาง */
export const lazExchangeToken = (code: string, app?: LazApp | null) => authCall("/auth/token/create", { code }, app);
/** ต่ออายุ — ต้องใช้แอปเดียวกับตอนเชื่อม (token ผูกกับแอป) */
export const lazRefreshToken = (refreshToken: string, app?: LazApp | null) => authCall("/auth/token/refresh", { refresh_token: refreshToken }, app);

/** Lazada ตอบ error — message เหมือนเดิม (ผู้เรียกเก่าใช้ได้) + code ไว้แปลเป็นภาษาคน (lazErrorText) */
export class LazApiError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.name = "LazApiError"; this.code = code; }
}

// เรียก API ทั่วไป (GET, เซ็นคำขอ + แนบ access_token)
export async function lazApiGet(gateway: LazGateway, apiPath: string, accessToken: string, biz: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const { url, app } = resolveTarget(gateway);
  const params: Record<string, string> = { app_key: app.key, access_token: accessToken, sign_method: "sha256", timestamp: String(Date.now()), ...biz };
  params.sign = await sign(apiPath, params, app.secret);
  const r = await fetch(`${url}${apiPath}?${new URLSearchParams(params).toString()}`);
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  const code = String(j.code ?? "0");
  if (code !== "0") throw new LazApiError(String(j.message || j.code || `HTTP ${r.status}`), code);
  return j;
}

/**
 * เรียก API แบบเขียน (POST) — แบบเดียวกับ SDK ทางการ: พารามิเตอร์ระบบ + sign อยู่ใน URL · พารามิเตอร์งาน (payload ฯลฯ) อยู่ในเนื้อคำขอ
 * ลายเซ็นคิดจากทุกพารามิเตอร์ (ระบบ + งาน) · error = LazApiError (รวมรายละเอียดรายช่องจาก detail[] ถ้ามี)
 * ⚠️ แก้ของบนร้านจริง — เรียกจาก route ที่ผ่านสิทธิ์ products.platforms.publish + มี audit เท่านั้น
 */
export async function lazApiPost(gateway: LazGateway, apiPath: string, accessToken: string, biz: Record<string, string>): Promise<Record<string, unknown>> {
  const { url, app } = resolveTarget(gateway);
  const sys: Record<string, string> = { app_key: app.key, access_token: accessToken, sign_method: "sha256", timestamp: String(Date.now()) };
  const s = await sign(apiPath, { ...sys, ...biz }, app.secret);
  const r = await fetch(`${url}${apiPath}?${new URLSearchParams({ ...sys, sign: s }).toString()}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body: new URLSearchParams(biz),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  // ไม่มี code = ตอบผิดรูปแบบ → ถือว่าไม่สำเร็จ (กันรายงานว่าแก้ร้านแล้วทั้งที่ไม่รู้ผล) · ยกเว้นตอบ 200 พร้อม data
  const code = j.code != null ? String(j.code) : (r.ok && "data" in j ? "0" : `HTTP ${r.status}`);
  if (code !== "0") {
    const detail = Array.isArray(j.detail) ? (j.detail as Record<string, unknown>[]).map((d) => [d.field, d.message].filter(Boolean).join(": ")).filter(Boolean).join(" · ") : "";
    throw new LazApiError([String(j.message || j.code || `HTTP ${r.status}`), detail].filter(Boolean).join(" — "), code);
  }
  return j;
}

/**
 * error จาก Lazada → ภาษาคน (pure · มี test) — ใช้ตอบผู้ใช้ทุกจุดที่คุยกับ Lazada
 * รหัส/ข้อความจากคู่มือ open.lazada.com (สำรวจ 2026-11-10) · ไม่รู้จัก = ข้อความเดิมของ Lazada
 */
export function lazErrorText(e: unknown): string {
  const code = e instanceof LazApiError ? e.code : "";
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const all = `${code} ${msg}`;
  if (/ApiCallLimit|AppApiCallLimit|E1002|\b901\b/i.test(all)) return "Lazada ให้เรียกถี่เกินไป — รอสักครู่แล้วลองใหม่";
  if (/\b998\b|service is disabled/i.test(all)) return "Lazada ปิดระบบนี้ชั่วคราว (มักเป็นช่วงแคมเปญใหญ่ เช่น 11.11 / 12.12) — ลองใหม่หลังช่วงที่ Lazada ประกาศ";
  if (/IC_ABILITY_PG|campaign participation/i.test(all)) return "สินค้า/ตัวเลือกนี้ร่วมแคมเปญอยู่ — Lazada ไม่ให้แก้จนกว่าแคมเปญจบ";
  if (/\b4119\b|SPECIAL_PRICE_RATE/i.test(all)) return "ส่วนลด (ราคาลด เทียบราคาปกติ) เกินช่วงที่ Lazada อนุญาต — ลดน้อยลง";
  if (/\b4117\b/.test(all)) return "วันเริ่มราคาลดอยู่หลังวันสิ้นสุด — แก้ช่วงวัน";
  if (/IllegalAccessToken|InvalidAccessToken|access.?token/i.test(all)) return "การเชื่อมต่อ Lazada ใช้ไม่ได้แล้ว — ไปที่ 🏪 จัดการร้าน/บัญชีแพลตฟอร์ม แล้วกด เชื่อมต่อ Lazada ใหม่";
  if (/IncompleteSignature|InvalidSignature/i.test(all)) return "ลายเซ็นคำขอไม่ผ่าน (เวลาเครื่องเพี้ยนหรือกุญแจแอปผิด) — แจ้งผู้ดูแลระบบ";
  if (/E0501|SELLER_NOT_PERMITTED|SellerNotActive/i.test(all)) return "ร้านถูก Lazada จำกัดสิทธิ์ — ตรวจสถานะร้านใน Lazada Seller Center";
  if (/\b4137\b|not.{0,20}(exist|found)/i.test(all)) return "ไม่พบสินค้านี้ในร้าน Lazada (อาจถูกลบไปแล้ว)";
  return msg ? `Lazada ตอบว่า: ${msg}` : "Lazada ไม่ตอบ — ลองใหม่อีกครั้ง";
}

// ดึงออเดอร์ (สร้างหลังเวลา createdAfter — ISO8601 มี timezone เช่น 2026-06-01T00:00:00+07:00)
export async function lazGetOrders(gateway: LazGateway, accessToken: string, opts: { createdAfter: string; limit?: number; offset?: number }): Promise<{ orders: Record<string, unknown>[]; total: number }> {
  const j = await lazApiGet(gateway, "/orders/get", accessToken, {
    created_after: opts.createdAfter, sort_by: "created_at", sort_direction: "DESC",
    limit: String(opts.limit ?? 50), offset: String(opts.offset ?? 0),
  });
  const data = j.data as { orders?: Record<string, unknown>[]; count?: number } | undefined;
  return { orders: data?.orders ?? [], total: Number(data?.count ?? 0) };
}

// ดึงรายการสินค้าของหลายออเดอร์ทีเดียว → map order_id → items[]
export async function lazGetOrderItems(gateway: LazGateway, accessToken: string, orderIds: (string | number)[]): Promise<Record<string, Record<string, unknown>[]>> {
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
export async function lazGetCategoryTree(gateway: LazGateway, accessToken: string): Promise<LazCategoryNode[]> {
  const j = await lazApiGet(gateway, "/category/tree/get", accessToken, {});
  return (j.data as LazCategoryNode[]) ?? [];
}

/** 1 ช่องคุณสมบัติของหมวด — รูปเดียวกับ LazadaAttrDef (lib/lazada-listing-edit · ลิ้นชักใช้) · options = ชื่อภาษาร้าน (หน้า /admin/lazada-categories ใช้) */
export type LazAttribute = LazadaAttrDef;
const truthy = (v: unknown) => v === 1 || v === true || String(v) === "1" || String(v) === "true";
/** แปลง 1 แถวจาก /category/attributes/get (pure · มี test) — ค่าที่ต้องส่งกลับคือ en_name (คู่มือ) */
export function lazAttributeFromApi(a: Record<string, unknown>): LazAttribute {
  const opts = Array.isArray(a.options) ? (a.options as Record<string, unknown>[]) : [];
  const choices = opts.map((o) => ({ name: String(o.name ?? o.en_name ?? "").trim(), en: String(o.en_name ?? o.name ?? "").trim() })).filter((c) => c.en);
  const adv = a.advanced && typeof a.advanced === "object" ? a.advanced as Record<string, unknown> : {};
  return {
    name: String(a.name ?? ""),
    label: String(a.label ?? a.name ?? ""),
    required: truthy(a.is_mandatory),
    input_type: String(a.input_type ?? ""),
    is_sale_prop: truthy(a.is_sale_prop),
    attribute_type: String(a.attribute_type ?? "normal"),
    is_key_prop: truthy(adv.is_key_prop ?? a.is_key_prop),
    options: choices.map((c) => c.name).filter(Boolean),
    choices,
  };
}
// คุณสมบัติที่หมวดนี้ต้องการ (name/label/บังคับ/ชนิด input/ตัวเลือก + en_name/KEY/ระดับ)
export async function lazGetCategoryAttributes(gateway: LazGateway, accessToken: string, categoryId: string): Promise<LazAttribute[]> {
  const j = await lazApiGet(gateway, "/category/attributes/get", accessToken, { primary_category_id: String(categoryId) });
  const rows = (j.data as Record<string, unknown>[]) ?? [];
  return rows.map(lazAttributeFromApi);
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

// ---- ด่านกันร้านผิดแบรนด์ตอนเชื่อมต่อ (1 ร้าน = 1 แบรนด์) ----
// เหตุ: callback เดิมบันทึกทับเงียบ ๆ → ถ้าล็อกอินบัญชี IG ตอนเลือกแบรนด์ Louis Montini ร้าน IG จะไปอยู่ใต้ LM
// (สินค้าโผล่ซ้ำ + แก้สินค้าในชื่อ LM = แก้ร้าน IG จริง) · TikTok เจอจริงแล้ว 2026-11-12 จึงทำด่านเดียวกัน
export type LazShopRef = { seller_id?: string | number | null; short_code?: string | null };
export type LazCredRow = { brand_id: string; meta: ({ stage?: string } & LazShopRef) | null };
export type LazShopConflict =
  | { kind: "other_brand"; brand_id: string }                          // ร้านนี้เชื่อมอยู่กับแบรนด์อื่นแล้ว
  | { kind: "brand_has_other_shop"; current_short_code: string | null } // แบรนด์นี้เชื่อมกับอีกร้านอยู่ (ล็อกอินผิดบัญชีตอนเชื่อมใหม่)
  | null;

function lazSameShop(a: LazShopRef, b: LazShopRef): boolean {
  const sa = String(a.seller_id ?? "").trim(), sb = String(b.seller_id ?? "").trim();
  if (sa && sb) return sa === sb;
  const ca = String(a.short_code ?? "").trim().toUpperCase(), cb = String(b.short_code ?? "").trim().toUpperCase();
  return !!ca && ca === cb;
}
const lazHasShopId = (s: LazShopRef) => !!(String(s.seller_id ?? "").trim() || String(s.short_code ?? "").trim());

/**
 * ร้านที่เพิ่งล็อกอิน (shop) ชนกับการเชื่อมที่มีอยู่ไหม — rows = platform_credentials ของ lazada ทุกแบรนด์
 * ดูเฉพาะแถวที่ stage = connected (กดตัดการเชื่อมต่อแล้ว = ว่าง ย้ายร้านได้) · Lazada ไม่ส่งรหัสร้านมา = ตัดสินไม่ได้ → ปล่อยผ่านแบบเดิม
 */
export function lazShopConflict(rows: LazCredRow[], brandId: string, shop: LazShopRef): LazShopConflict {
  if (!lazHasShopId(shop)) return null;
  const live = rows.filter((r) => r.meta?.stage === "connected" && lazHasShopId(r.meta));
  const other = live.find((r) => r.brand_id !== brandId && lazSameShop(r.meta!, shop));
  if (other) return { kind: "other_brand", brand_id: other.brand_id };
  const mine = live.find((r) => r.brand_id === brandId);
  if (mine && !lazSameShop(mine.meta!, shop)) return { kind: "brand_has_other_shop", current_short_code: mine.meta?.short_code ?? null };
  return null;
}

// ---- ตั้ง/ล้าง "แอป Lazada ของแบรนด์" (กติกา pure · มี test · route /api/lazada/app ใช้) ----
/** เชื่อมร้านค้างอยู่ (stage = connected แม้หมดอายุ) → ห้ามเปลี่ยน/ล้างแอป เพราะ token ผูกกับแอปเดิม (ต่ออายุจะพัง) */
export function lazAppLocked(meta: { stage?: string } | null | undefined): boolean { return meta?.stage === "connected"; }

const LOCKED_MSG = "แบรนด์นี้เชื่อมร้าน Lazada อยู่ — กด ตัดการเชื่อมต่อ ก่อน แล้วค่อยเปลี่ยนแอป (กุญแจร้านผูกกับแอปเดิม)";
export type LazAppCurrent = { app_key: string; has_secret: boolean } | null;
export type LazAppSavePlan =
  | { ok: true; app_key: string; app_secret: string | null; unchanged: boolean }   // app_secret null = ใช้ secret เดิม
  | { ok: false; error: string };

/**
 * ตรวจค่าที่กรอก (App Key + App Secret) ก่อนบันทึก
 * - เชื่อมร้านอยู่: แก้ได้แค่ App Secret ของแอปเดิม (กรณีกุญแจอ่านไม่ได้) — เปลี่ยน App Key ไม่ได้
 * - App Secret ว่าง = ใช้ของเดิม (เฉพาะ App Key เดิมที่มี secret อยู่แล้ว)
 */
export function planLazAppSave(input: { app_key?: unknown; app_secret?: unknown }, current: LazAppCurrent, locked: boolean): LazAppSavePlan {
  const key = String(input.app_key ?? "").trim();
  const secret = String(input.app_secret ?? "").trim();
  if (!key) return { ok: false, error: "กรอก App Key ก่อน (ตัวเลขในหน้า App Management ของ Lazada)" };
  if (!/^[0-9A-Za-z_-]{3,64}$/.test(key)) return { ok: false, error: "App Key ไม่ถูกต้อง — คัดลอกจากช่อง App Key ในหน้า App Management (ไม่มีเว้นวรรค)" };
  const sameKey = !!current && current.app_key === key;
  if (locked && !sameKey) return { ok: false, error: LOCKED_MSG };
  if (secret) {
    if (/\s/.test(secret) || secret.length < 8 || secret.length > 256) return { ok: false, error: "App Secret ไม่ถูกต้อง — คัดลอกจากหน้า App Management ทั้งช่อง (ไม่มีเว้นวรรค)" };
    return { ok: true, app_key: key, app_secret: secret, unchanged: false };
  }
  if (sameKey && current!.has_secret) return { ok: true, app_key: key, app_secret: null, unchanged: true };
  return { ok: false, error: "กรอก App Secret ด้วย (กดดูในหน้า App Management ของ Lazada)" };
}

/** ล้างแอปของแบรนด์ (กลับไปใช้แอปกลาง) */
export function planLazAppClear(current: LazAppCurrent, locked: boolean): { ok: true } | { ok: false; error: string } {
  if (!current) return { ok: false, error: "แบรนด์นี้ใช้แอปกลางอยู่แล้ว" };
  if (locked) return { ok: false, error: LOCKED_MSG };
  return { ok: true };
}

// ---- สินค้าบนร้าน (อ่านอย่างเดียว · ดึงเข้าหน้า "สินค้าบนแพลตฟอร์ม") ----
// GET /products/get · filter=all (ไม่รวมที่ลบแล้ว) · ได้ครั้งละไม่เกิน 50 ตัว
export async function lazGetProducts(gateway: LazGateway, accessToken: string, opts: { offset?: number; limit?: number; filter?: string } = {}): Promise<{ products: Record<string, unknown>[]; total: number }> {
  const j = await lazApiGet(gateway, "/products/get", accessToken, {
    filter: opts.filter ?? "all", offset: String(opts.offset ?? 0), limit: String(Math.min(50, opts.limit ?? 50)),
  });
  const data = j.data as { products?: Record<string, unknown>[]; total_products?: number | string } | undefined;
  return { products: data?.products ?? [], total: Number(data?.total_products ?? 0) || 0 };
}

/** สินค้า 1 ตัวแบบเต็ม (รูป · รายละเอียด HTML · ชื่อตัวเลือก · ราคาลด+วัน · ขนาดกล่อง) — GET /product/item/get · อ่านอย่างเดียว */
export async function lazGetItem(gateway: LazGateway, accessToken: string, itemId: string): Promise<Record<string, unknown> | null> {
  const j = await lazApiGet(gateway, "/product/item/get", accessToken, { item_id: String(itemId) });
  const d = j.data;
  return d && typeof d === "object" && !Array.isArray(d) ? d as Record<string, unknown> : null;
}

/** แก้สินค้า (ชื่อ/รายละเอียด/จุดเด่น/สถานะ SKU) — payload จาก lazUpdateProductXml (lib/lazada-listing-edit) · แก้ร้านจริง */
export async function lazUpdateProduct(gateway: LazGateway, accessToken: string, payloadXml: string): Promise<Record<string, unknown>> {
  return lazApiPost(gateway, "/product/update", accessToken, { payload: payloadXml });
}
/** ราคา/ราคาลด ≤ 50 SKU ต่อครั้ง (แนะนำ 20) — payload จาก lazPriceQuantityXml (ไม่มี Quantity) · แก้ร้านจริง */
export async function lazUpdatePriceQuantity(gateway: LazGateway, accessToken: string, payloadXml: string): Promise<Record<string, unknown>> {
  return lazApiPost(gateway, "/product/price_quantity/update", accessToken, { payload: payloadXml });
}
/**
 * ฝากรูปจากลิงก์ภายนอกให้ Lazada (/image/migrate) → ลิงก์ของ Lazada (slatic.net) · payload จาก lazMigrateImageXml
 * กติกา: jpg/png · ≤ 3MB · ด้านละ 330–5000px · Lazada ดาวน์โหลดภายใน 5 วิ · ไม่ได้ = LazApiError (เช่น 303 รูปเกินขนาด)
 */
export async function lazMigrateImage(gateway: LazGateway, accessToken: string, payloadXml: string): Promise<string> {
  const j = await lazApiPost(gateway, "/image/migrate", accessToken, { payload: payloadXml });
  const d = (j.data && typeof j.data === "object" ? j.data : {}) as Record<string, unknown>;
  const img = (d.image && typeof d.image === "object" ? d.image : {}) as Record<string, unknown>;
  const url = s0(img.url) ?? s0(d.url);
  if (!url) throw new LazApiError("Lazada ฝากรูปแล้วไม่ส่งลิงก์กลับ", "NO_URL");
  return url;
}
/** ปิดขาย ทั้งสินค้า/บาง SKU — body จาก lazDeactivateXml · แก้ร้านจริง */
export async function lazDeactivateProduct(gateway: LazGateway, accessToken: string, bodyXml: string): Promise<Record<string, unknown>> {
  return lazApiPost(gateway, "/product/deactivate", accessToken, { apiRequestBody: bodyXml });
}
/**
 * สร้างสินค้าใหม่ (/product/create) — payload JSON จาก lib/lazada-create-plan (planLazadaCreate · รูปฝากเข้า Lazada แล้ว) · สร้างบนร้านจริง
 * คืน { item_id, sku_list[{ seller_sku, sku_id, shop_sku }] }
 */
export async function lazCreateProduct(gateway: LazGateway, accessToken: string, payloadJson: string): Promise<{ itemId: string; skus: { seller_sku: string; sku_id: string }[]; raw: Record<string, unknown> }> {
  const j = await lazApiPost(gateway, "/product/create", accessToken, { payload: payloadJson });
  const d = (j.data && typeof j.data === "object" ? j.data : {}) as Record<string, unknown>;
  const itemId = s0(d.item_id);
  if (!itemId) throw new LazApiError("Lazada สร้างสินค้าแล้วไม่ส่งรหัสสินค้ากลับ — กดดึงสินค้าจาก Lazada เพื่อตรวจก่อนลองใหม่", "NO_ITEM_ID");
  const list = Array.isArray(d.sku_list) ? d.sku_list as Record<string, unknown>[] : [];
  return { itemId, skus: list.map((s) => ({ seller_sku: s0(s.seller_sku) ?? "", sku_id: s0(s.sku_id) ?? "" })), raw: d };
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
    // ชื่อตัวเลือก (สี/ไซซ์) — สั้น ๆ ไม่บวม · ไม่มี saleProp = ไม่เก็บช่องนี้
    ...(() => { const label = lazSkuLabel(s, p.variation); return label ? { label } : {}; })(),
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
