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
