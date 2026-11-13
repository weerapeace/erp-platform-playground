// ของใช้ร่วมของ TikTok Shop API (แยกจาก route.ts — route ต้อง export แค่ handler)
// ใช้ state / baseUrl / getPlatformId ตัวเดียวกับ Lazada (ไม่สร้างชุดที่ 3)
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/secret-box";
import { lazConnHealth } from "@/lib/lazada";
import { ttsRefreshToken, ttsExpiryMs, ttsErrorText, ttsGetProduct, ttsIsRateLimit, ttsProductToCatalogItem, ttsDetailExtras, ttsUploadImage, ttsGetCategoryAttributes, ttsGetCategoryRules, ttsSearchSizeCharts, ttsSearchPromotions, ttsGetPromotion, type TtsShop, type TtsToken } from "@/lib/tiktok-shop";
import { ttsSizeTemplatesOf, type TtsSizeTemplate } from "@/lib/tiktok-size-chart";
import { ttsPromosOf, ttsPromoWithDetail, type TtsPromo } from "@/lib/tiktok-promotions";
import { publicImageUrl } from "@/lib/line-shopping-server";
import { ttsAttrFieldsOf, ttsCategoryRulesOf, type TtsAttrField, type TtsCategoryRules } from "@/lib/tiktok-attrs";
import { keepSkuStatus, tiktokListingView, type TiktokListingView } from "@/lib/tiktok-listing-edit";
import { isGoneStatus } from "@/lib/platform-listing-health";
export { baseUrl, buildState, parseState, getPlatformId } from "../lazada/shared";

export type TtsConnMeta = {
  stage?: string;                 // connected | disconnected
  open_id?: string; seller_name?: string; seller_base_region?: string;
  shops?: TtsShop[];              // ร้านที่อนุญาต (มี cipher สำหรับคำสั่งระดับร้าน)
  granted_scopes?: string[];
  refresh_token?: string;         // เข้ารหัส (enc:v1:)
  expires_at?: number; refresh_expires_at?: number; connected_at?: string;
};

/** ช่องเวลาหมดอายุจากคำตอบกุญแจของ TikTok → meta */
export function ttsTokenTimes(t: TtsToken, now = Date.now()): Pick<TtsConnMeta, "expires_at" | "refresh_expires_at"> {
  return { expires_at: ttsExpiryMs(t.access_token_expire_in, now), refresh_expires_at: ttsExpiryMs(t.refresh_token_expire_in, now) };
}

// อ่าน connection (แบรนด์ × tiktok) → meta + access token + refresh token (ถอดรหัสแล้ว)
export async function loadTtsConn(admin: SupabaseClient, brandId: string, platformId: string): Promise<{ meta: TtsConnMeta; accessToken: string | null; refreshToken: string | null } | null> {
  const { data } = await admin.from("platform_credentials").select("api_key, meta").eq("brand_id", brandId).eq("platform_id", platformId).maybeSingle();
  if (!data) return null;
  const row = data as { api_key: string | null; meta: TtsConnMeta | null };
  const meta = row.meta ?? {};
  const accessToken = row.api_key ? await decryptSecret(row.api_key).catch(() => null) : null;
  const refreshToken = meta.refresh_token ? await decryptSecret(meta.refresh_token).catch(() => null) : null;
  return { meta, accessToken, refreshToken };
}

// เก็บ connection (กุญแจเข้ารหัสทั้งคู่)
export async function saveTtsConn(admin: SupabaseClient, brandId: string, platformId: string, accessToken: string | null, refreshToken: string | null, meta: TtsConnMeta, userId: string | null): Promise<void> {
  const api_key = accessToken ? await encryptSecret(accessToken) : null;
  const metaOut: TtsConnMeta = { ...meta };
  metaOut.refresh_token = refreshToken ? await encryptSecret(refreshToken) : undefined;
  const { error } = await admin.from("platform_credentials").upsert(
    { brand_id: brandId, platform_id: platformId, api_key, meta: metaOut, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "brand_id,platform_id" },
  );
  if (error) throw new Error(`บันทึกการเชื่อมต่อไม่สำเร็จ: ${error.message}`);
}

/** แบรนด์ที่เชื่อม TikTok อยู่ (stage connected) — ปุ่มดึงที่ไม่เลือกแบรนด์ + ตัวดึงอัตโนมัติ */
export async function ttsConnectedBrandIds(admin: SupabaseClient, platformId: string): Promise<string[]> {
  const { data } = await admin.from("platform_credentials").select("brand_id, meta").eq("platform_id", platformId);
  return ((data ?? []) as { brand_id: string; meta: TtsConnMeta | null }[]).filter((r) => r.meta?.stage === "connected").map((r) => r.brand_id);
}

/** ชื่อแบรนด์ (ใช้เทียบกับชื่อร้านจาก TikTok) */
export async function brandNameOf(admin: SupabaseClient, brandId: string): Promise<string | null> {
  const { data } = await admin.from("brands").select("name").eq("id", brandId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}

/** ร้าน TikTok เดียวกัน (open_id) ต่ออยู่กับแบรนด์อื่นแล้วไหม → คืนชื่อแบรนด์นั้น (กันร้านเดียวผูก 2 แบรนด์) */
export async function ttsShopConnectedElsewhere(admin: SupabaseClient, platformId: string, brandId: string, openId: string): Promise<string | null> {
  const { data } = await admin.from("platform_credentials").select("brand_id, meta").eq("platform_id", platformId).neq("brand_id", brandId);
  const hit = ((data ?? []) as { brand_id: string; meta: TtsConnMeta | null }[]).find((r) => r.meta?.stage === "connected" && r.meta?.open_id === openId);
  if (!hit) return null;
  return (await brandNameOf(admin, hit.brand_id)) ?? "อื่น";
}

/** สถานะกุญแจ (none / connected / expiring ≤7 วัน / expired) — ใช้กติกาเดียวกับ Lazada */
export const ttsConnHealth = lazConnHealth;

export const TTS_RECONNECT_HINT = "ไปที่ จัดการร้าน/บัญชีแพลตฟอร์ม › TikTok แล้วกด เชื่อมต่อ TikTok Shop ใหม่";

/**
 * โหลด access token ที่ใช้งานได้ (ต่ออายุเองถ้าเหลือ < 1 ชม.) + ร้านแรกที่อนุญาต
 * ok=false → reason เป็นภาษาคน ตอบผู้ใช้ได้เลย
 */
export async function ttsTokenOrReason(admin: SupabaseClient, brandId: string, platformId: string, userId: string | null): Promise<{ ok: true; accessToken: string; meta: TtsConnMeta } | { ok: false; reason: string }> {
  const conn = await loadTtsConn(admin, brandId, platformId);
  if (!conn?.accessToken || conn.meta.stage !== "connected") return { ok: false, reason: `แบรนด์นี้ยังไม่ได้เชื่อมต่อ TikTok Shop — ${TTS_RECONNECT_HINT}` };
  if ((conn.meta.expires_at ?? 0) > Date.now() + 3_600_000) return { ok: true, accessToken: conn.accessToken, meta: conn.meta };
  if (ttsConnHealth(conn.meta).state === "expired" || !conn.refreshToken) return { ok: false, reason: `การเชื่อมต่อ TikTok Shop หมดอายุแล้ว — ${TTS_RECONNECT_HINT}` };
  try {
    const t = await ttsRefreshToken(conn.refreshToken);
    const meta: TtsConnMeta = { ...conn.meta, ...ttsTokenTimes(t), granted_scopes: t.granted_scopes ?? conn.meta.granted_scopes };
    await saveTtsConn(admin, brandId, platformId, t.access_token, t.refresh_token || conn.refreshToken, meta, userId);
    return { ok: true, accessToken: t.access_token, meta };
  } catch (e) {
    return { ok: false, reason: `ต่ออายุการเชื่อมต่อ TikTok Shop ไม่สำเร็จ (${ttsErrorText(e)}) — ${TTS_RECONNECT_HINT}` };
  }
}

// ───────── สินค้า 1 ตัวในลิ้นชัก (ดึงสด / แก้ชื่อ / เปิดปิดขาย) — ตัวเดียวกันทุก route ─────────
export type TtsListingRow = { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; title: string | null; price: number | null; status: string | null; raw: Record<string, unknown> | null };

/** ดึงสินค้าซ้ำแบบรอแล้วลองใหม่ถ้า TikTok จำกัดความถี่ (0.8 วิ · 2 วิ) */
export async function ttsGetProductRetry(accessToken: string, cipher: string, productId: string, opts: { underReview?: boolean } = {}): Promise<Record<string, unknown>> {
  let last: unknown = null;
  for (const wait of [800, 2000, 0]) {
    try { return await ttsGetProduct(accessToken, cipher, productId, opts); }
    catch (e) { last = e; if (!ttsIsRateLimit(e) || !wait) break; await new Promise((r) => setTimeout(r, wait)); }
  }
  throw last;
}

/**
 * โหลดรายการในระบบ + ดึงสินค้าตัวนี้ "สด" จาก TikTok (Get Product) + กุญแจ/ร้านที่ใช้ได้
 * ok=false → error ภาษาคน + HTTP status ตอบผู้ใช้ได้เลย
 */
export async function loadTtsListingLive(admin: SupabaseClient, listingId: string, userId: string | null): Promise<
  { ok: true; row: TtsListingRow; detail: Record<string, unknown>; productId: string; accessToken: string; cipher: string } | { ok: false; error: string; status: number }
> {
  const { data: l } = await admin.from("platform_catalog_listings")
    .select("id, platform_id, brand_id, external_product_id, title, price, status, raw").eq("id", listingId).maybeSingle();
  const row = l as TtsListingRow | null;
  if (!row) return { ok: false, error: "ไม่พบสินค้านี้ (อาจถูกลบไปแล้ว)", status: 404 };
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  if ((pf as { code?: string } | null)?.code !== "tiktok") return { ok: false, error: "ใช้ได้เฉพาะสินค้าบน TikTok Shop", status: 400 };
  const productId = String(row.external_product_id ?? "").trim();
  if (!productId || !row.brand_id) return { ok: false, error: "รายการนี้ไม่มีรหัสสินค้าบน TikTok", status: 400 };
  const tok = await ttsTokenOrReason(admin, row.brand_id, row.platform_id, userId);
  if (!tok.ok) return { ok: false, error: tok.reason, status: 400 };
  const cipher = tok.meta.shops?.[0]?.cipher;
  if (!cipher) return { ok: false, error: "ยังไม่รู้รหัสร้าน TikTok — กด ตรวจการเชื่อมต่อ ที่บัญชีแพลตฟอร์มก่อน", status: 400 };
  try {
    const detail = await ttsGetProductRetry(tok.accessToken, cipher, productId);
    if (!detail || !detail.id) return { ok: false, error: `ไม่พบสินค้า #${productId} บน TikTok (อาจถูกลบไปแล้ว)`, status: 404 };
    return { ok: true, row, detail, productId, accessToken: tok.accessToken, cipher };
  } catch (e) {
    console.warn(`[tiktok] ดึงสินค้า #${productId} ไม่สำเร็จ: ${(e as Error).message}`);
    return { ok: false, error: ttsErrorText(e), status: 502 };
  }
}

/**
 * อัปเดตสำเนาย่อในระบบจากรายละเอียดที่เพิ่งดึง — ตัวแปลงเดียวกับดึงทั้งร้าน (ttsProductToCatalogItem)
 * เจอบนร้าน = ล้างป้าย "ไม่อยู่บนร้านแล้ว" · ไม่แตะคู่ที่จับไว้ · คืน error หรือ null
 */
export async function saveTtsSlimCopy(admin: SupabaseClient, row: TtsListingRow, detail: Record<string, unknown>): Promise<string | null> {
  const slim = ttsProductToCatalogItem(detail, ttsDetailExtras(detail));
  if (!slim) return "ข้อมูลจาก TikTok ไม่ครบ";
  slim.raw.tiktok.skus = keepSkuStatus(slim.raw.tiktok.skus, row.raw?.tiktok);
  const now = new Date().toISOString();
  const { error } = await admin.from("platform_catalog_listings").update({
    raw: { ...(row.raw ?? {}), ...slim.raw },
    title: slim.title ?? row.title, price: slim.price ?? row.price, status: slim.status ?? (isGoneStatus(row.status) ? null : row.status),
    sku_code: slim.skus[0] ?? null, last_imported_at: now, updated_at: now,
  }).eq("id", row.id);
  return error ? error.message : null;
}

/** มุมมองในลิ้นชัก + ถ้ากำลังตรวจอยู่ ดึงฉบับที่ส่งตรวจมาด้วย (โชว์ "ชื่อใหม่รอ TikTok ตรวจ") — ดึงฉบับตรวจไม่ได้ = โชว์ฉบับขายอยู่ */
export async function ttsViewWithReview(accessToken: string, cipher: string, detail: Record<string, unknown>): Promise<TiktokListingView | null> {
  const v = tiktokListingView(detail);
  if (!v || !(v.auditStatus === "AUDITING" || v.status === "PENDING")) return v;
  try { return tiktokListingView(detail, await ttsGetProduct(accessToken, cipher, v.productId, { underReview: true })); }
  catch { return v; }
}

/**
 * ฝากรูป 1 รูปกับ TikTok → uri (ค่าเริ่ม รูปสินค้า MAIN_IMAGE · ตารางขนาด = SIZE_CHART_IMAGE) — ใช้ร่วม: แก้รูปในลิ้นชัก (listing-edit) + สร้างฉบับร่าง (create-product)
 *   "r2:<key>" = รูปในระบบ → JPG จัตุรัสพื้นขาว 1500px (/api/r2-image &sq=1) · http(s) = โหลดลิงก์นั้น · ≤ 10MB
 * โยน Error ข้อความภาษาคน (ผู้เรียกบันทึกประวัติ/หยุดเอง)
 */
export async function ttsUploadRef(accessToken: string, ref: string, useCase = "MAIN_IMAGE"): Promise<string> {
  const key = ref.startsWith("r2:") ? ref.slice(3) : null;
  const src = key ? `${publicImageUrl(key)}&w=1500&sq=1` : ref;
  if (!/^https?:\/\//i.test(src)) throw new Error("รูปไม่ใช่รูปในระบบหรือลิงก์");
  const res = await fetch(src, { cache: "no-store" });
  const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!res.ok || !ct.startsWith("image/")) throw new Error(`โหลดรูปไม่ได้ (HTTP ${res.status})`);
  const bytes = await res.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 10 * 1024 * 1024) throw new Error(`ขนาดรูป ${(bytes.byteLength / 1048576).toFixed(1)}MB ไม่อยู่ในช่วงที่ TikTok รับ (≤ 10MB)`);
  const base = (key ?? new URL(src).pathname).split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") || "image";
  const name = `${base}.${ct === "image/png" ? "png" : ct === "image/webp" ? "webp" : "jpg"}`;
  try { return (await ttsUploadImage(accessToken, bytes, name, ct, useCase)).uri; }
  catch (e) { throw new Error(ttsErrorText(e)); }
}

// ───────── ช่องคุณลักษณะ + กติกาของหมวด (แคชในเครื่อง 10 นาที · ใช้ร่วม ลิ้นชัก + หน้าลงฉบับร่าง) ─────────
const META_TTL = 10 * 60 * 1000;
const metaCache = new Map<string, { at: number; val: { fields: TtsAttrField[] | null; rules: TtsCategoryRules | null; error: string | null } }>();
/** ช่องคุณลักษณะ (Get Attributes) + กติกา (Get Category Rules) ของหมวด · ดึงไม่ได้ = null + error ภาษาคน (ไม่โยน) */
export async function ttsCategoryMeta(accessToken: string, cipher: string, categoryId: string): Promise<{ fields: TtsAttrField[] | null; rules: TtsCategoryRules | null; error: string | null }> {
  const key = `${cipher}:${categoryId}`;
  const hit = metaCache.get(key);
  if (hit && Date.now() - hit.at < META_TTL) return hit.val;
  const [a, r] = await Promise.allSettled([ttsGetCategoryAttributes(accessToken, cipher, categoryId), ttsGetCategoryRules(accessToken, cipher, categoryId)]);
  const val = {
    fields: a.status === "fulfilled" ? ttsAttrFieldsOf(a.value) : null,
    rules: r.status === "fulfilled" ? ttsCategoryRulesOf(r.value) : null,
    error: a.status === "rejected" ? `ดึงช่องของหมวดจาก TikTok ไม่ได้: ${ttsErrorText(a.reason)}` : null,
  };
  if (val.fields) metaCache.set(key, { at: Date.now(), val });
  return val;
}


// ───────── ร้านของรายการ/แบรนด์ (route อ่านอย่างเดียวที่ไม่ต้องดึงสินค้า เช่น แม่แบบตารางขนาด / โปรโมชัน) ─────────
/** กุญแจ + ร้าน จาก listing_id (ลิ้นชัก) หรือ brand_id (หน้าลงฉบับร่าง) · ok=false → error ภาษาคน + HTTP status */
export async function ttsShopFor(admin: SupabaseClient, by: { listingId?: string | null; brandId?: string | null }, userId: string | null): Promise<
  { ok: true; accessToken: string; cipher: string; brandId: string; platformId: string } | { ok: false; error: string; status: number }
> {
  let brandId = (by.brandId ?? "").trim() || null;
  let platformId: string | null = null;
  if (by.listingId) {
    const { data: l } = await admin.from("platform_catalog_listings").select("platform_id, brand_id").eq("id", by.listingId).maybeSingle();
    const row = l as { platform_id: string; brand_id: string | null } | null;
    if (!row?.brand_id) return { ok: false, error: "ไม่พบสินค้านี้", status: 404 };
    brandId = row.brand_id; platformId = row.platform_id;
  }
  if (!brandId) return { ok: false, error: "ต้องระบุ listing_id หรือ brand_id", status: 400 };
  if (!platformId) {
    const { data: pf } = await admin.from("erp_platforms").select("id").eq("code", "tiktok").maybeSingle();
    platformId = (pf as { id?: string } | null)?.id ?? null;
    if (!platformId) return { ok: false, error: "ไม่พบแพลตฟอร์ม TikTok ในระบบ", status: 500 };
  }
  const tok = await ttsTokenOrReason(admin, brandId, platformId, userId);
  if (!tok.ok) return { ok: false, error: tok.reason, status: 400 };
  const cipher = tok.meta.shops?.[0]?.cipher;
  if (!cipher) return { ok: false, error: "ยังไม่รู้รหัสร้าน TikTok — กด ตรวจการเชื่อมต่อ ที่บัญชีแพลตฟอร์มก่อน", status: 400 };
  return { ok: true, accessToken: tok.accessToken, cipher, brandId, platformId };
}

// ───────── แม่แบบตารางขนาดของร้าน (แคช 10 นาที · สร้างใหม่แล้วล้างแคช) ─────────
const sizeTplCache = new Map<string, { at: number; list: TtsSizeTemplate[] }>();
/** แม่แบบตารางขนาดทั้งร้าน (สูงสุด 3 หน้า × 100) · fresh = ข้ามแคช */
export async function ttsSizeTemplates(accessToken: string, cipher: string, fresh = false): Promise<{ list: TtsSizeTemplate[]; truncated: boolean }> {
  const hit = sizeTplCache.get(cipher);
  if (!fresh && hit && Date.now() - hit.at < META_TTL) return { list: hit.list, truncated: false };
  const list: TtsSizeTemplate[] = [];
  let token: string | null = null; let truncated = false;
  for (let page = 0; page < 3; page++) {
    const d = await ttsSearchSizeCharts(accessToken, cipher, { pageToken: token, pageSize: 100 });
    list.push(...ttsSizeTemplatesOf(d));
    token = typeof d.next_page_token === "string" && d.next_page_token ? d.next_page_token : null;
    if (!token) break;
    if (page === 2) truncated = true;
  }
  sizeTplCache.set(cipher, { at: Date.now(), list });
  return { list, truncated };
}
export const forgetSizeTemplates = (cipher: string) => { sizeTplCache.delete(cipher); };

// ───────── โปรโมชันของร้าน (อ่านอย่างเดียว · แคช 10 นาที) ─────────
const promoCache = new Map<string, { at: number; val: { promos: TtsPromo[]; truncated: boolean } }>();
const PROMO_DETAIL_MAX = 40;
/**
 * โปรที่กำลังใช้ + ยังไม่เริ่ม ของทั้งร้าน พร้อมสินค้าในโปร (Get Activity ทีละตัว · สูงสุด 40 รายการ)
 * ไม่มีสิทธิ์ Promotion = โยน error (ttsErrorText บอกให้เปิดสิทธิ์)
 */
export async function ttsShopPromotions(accessToken: string, cipher: string, fresh = false): Promise<{ promos: TtsPromo[]; truncated: boolean; cachedAt: number }> {
  const hit = promoCache.get(cipher);
  if (!fresh && hit && Date.now() - hit.at < META_TTL) return { ...hit.val, cachedAt: hit.at };
  const list: TtsPromo[] = [];
  let truncated = false;
  for (const status of ["ONGOING", "NOT_START"]) {
    let token: string | null = null;
    for (let page = 0; page < 3; page++) {
      const d = await ttsSearchPromotions(accessToken, cipher, { status, pageToken: token, pageSize: 100 });
      list.push(...ttsPromosOf(d));
      token = typeof d.next_page_token === "string" && d.next_page_token ? d.next_page_token : null;
      if (!token) break;
      if (page === 2) truncated = true;
    }
  }
  const out: TtsPromo[] = [];
  const need = list.filter((p) => p.productLevel !== "SHOP");
  if (need.length > PROMO_DETAIL_MAX) truncated = true;
  const detailOf = new Map<string, TtsPromo>();
  const todo = need.slice(0, PROMO_DETAIL_MAX);
  for (let i = 0; i < todo.length; i += 4) {
    await Promise.all(todo.slice(i, i + 4).map(async (p) => {
      try { detailOf.set(p.id, ttsPromoWithDetail(p, await ttsGetPromotion(accessToken, cipher, p.id))); } catch { /* ใช้ตัวที่ไม่มีสินค้า */ }
    }));
  }
  for (const p of list) out.push(detailOf.get(p.id) ?? p);
  const val = { promos: out, truncated };
  const at = Date.now();
  promoCache.set(cipher, { at, val });
  return { ...val, cachedAt: at };
}
