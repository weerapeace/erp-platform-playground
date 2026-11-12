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
export async function ttsGetAuthorizedShops(accessToken: string): Promise<TtsShop[]> {
  return ttsShopsFromApi(await ttsApi("GET", "/authorization/202309/shops", accessToken, { scope: "Shop Authorized Information (seller.authorization.info)" }));
}
