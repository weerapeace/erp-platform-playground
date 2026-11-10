// ของใช้ร่วมของ Lazada API (แยกจาก route.ts — route ต้อง export แค่ handler)
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/secret-box";
import { lazRefreshToken, lazGateway, lazConnHealth, lazErrorText, lazGetCategoryAttributes, lazGetItem, lazProductToCatalogItem, type LazAttribute } from "@/lib/lazada";
import { isGoneStatus } from "@/lib/platform-listing-health";

export function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");
}
export function lazRedirectUri(): string { return `${baseUrl()}/api/lazada/callback`; }

// state (กัน CSRF + พา brand_id ข้าม OAuth) — เข้ารหัสด้วยกุญแจหลัก ปลอมไม่ได้
export async function buildState(brandId: string): Promise<string> {
  return encryptSecret(JSON.stringify({ b: brandId, t: Date.now() }));
}
export async function parseState(state: string): Promise<string | null> {
  try {
    const j = JSON.parse(await decryptSecret(state)) as { b?: string; t?: number };
    if (!j.b || !j.t || Date.now() - j.t > 30 * 60 * 1000) return null;
    return j.b;
  } catch { return null; }
}

export async function getPlatformId(admin: SupabaseClient, code: string): Promise<string | null> {
  const { data } = await admin.from("erp_platforms").select("id").eq("code", code).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export type LazConnMeta = {
  stage?: string; seller_id?: string; short_code?: string; account?: string; country?: string; gateway?: string;
  refresh_token?: string;   // เข้ารหัส (enc:v1:)
  expires_at?: number; refresh_expires_at?: number; connected_at?: string;
};

// อ่าน connection (แบรนด์ × lazada) → meta + access token (ถอดรหัส) + refresh token (ถอดรหัส)
export async function loadLazConn(admin: SupabaseClient, brandId: string, platformId: string): Promise<{ meta: LazConnMeta; accessToken: string | null; refreshToken: string | null } | null> {
  const { data } = await admin.from("platform_credentials").select("api_key, meta").eq("brand_id", brandId).eq("platform_id", platformId).maybeSingle();
  if (!data) return null;
  const row = data as { api_key: string | null; meta: LazConnMeta | null };
  const meta = row.meta ?? {};
  const accessToken = row.api_key ? await decryptSecret(row.api_key).catch(() => null) : null;
  const refreshToken = meta.refresh_token ? await decryptSecret(meta.refresh_token).catch(() => null) : null;
  return { meta, accessToken, refreshToken };
}

// เก็บ connection (token เข้ารหัสทั้งคู่)
export async function saveLazConn(admin: SupabaseClient, brandId: string, platformId: string, accessToken: string | null, refreshToken: string | null, meta: LazConnMeta, userId: string | null): Promise<void> {
  const api_key = accessToken ? await encryptSecret(accessToken) : null;
  const metaOut: LazConnMeta = { ...meta };
  metaOut.refresh_token = refreshToken ? await encryptSecret(refreshToken) : undefined;
  await admin.from("platform_credentials").upsert(
    { brand_id: brandId, platform_id: platformId, api_key, meta: metaOut, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "brand_id,platform_id" },
  );
}

// ต่ออายุกุญแจ 1 ร้าน แล้วเก็บ (ใช้ทั้งตอนเรียก API และตัวต่ออายุอัตโนมัติรายวัน)
export async function refreshLazConn(admin: SupabaseClient, brandId: string, platformId: string, conn: { meta: LazConnMeta; refreshToken: string }, userId: string | null): Promise<string> {
  const t = await lazRefreshToken(conn.refreshToken);
  await saveLazConn(admin, brandId, platformId, t.access_token, t.refresh_token, {
    ...conn.meta, expires_at: Date.now() + (Number(t.expires_in) || 0) * 1000, refresh_expires_at: Date.now() + (Number(t.refresh_expires_in) || 0) * 1000,
  }, userId);
  return t.access_token;
}

export const LAZ_RECONNECT_HINT = "ไปที่ 🏪 จัดการร้าน/บัญชีแพลตฟอร์ม แล้วกด เชื่อมต่อ Lazada ใหม่";

/**
 * โหลด access token ที่ใช้งานได้ (ต่ออายุอัตโนมัติถ้าใกล้หมด) + gateway ของร้าน
 * ok=false → reason เป็นภาษาคน (ยังไม่เชื่อม / หมดอายุ / ต่ออายุไม่สำเร็จ) ใช้ตอบผู้ใช้ได้เลย
 */
export async function lazTokenOrReason(admin: SupabaseClient, brandId: string, platformId: string, userId: string | null): Promise<{ ok: true; accessToken: string; gateway: string } | { ok: false; reason: string }> {
  const conn = await loadLazConn(admin, brandId, platformId);
  if (!conn?.accessToken || conn.meta.stage !== "connected") return { ok: false, reason: `แบรนด์นี้ยังไม่ได้เชื่อมต่อ Lazada — ${LAZ_RECONNECT_HINT}` };
  const gateway = conn.meta.gateway || lazGateway(conn.meta.country);
  if ((conn.meta.expires_at ?? 0) > Date.now() + 60000) return { ok: true, accessToken: conn.accessToken, gateway };
  if (lazConnHealth(conn.meta).state === "expired" || !conn.refreshToken) return { ok: false, reason: `การเชื่อมต่อ Lazada หมดอายุแล้ว — ${LAZ_RECONNECT_HINT}` };
  try {
    const accessToken = await refreshLazConn(admin, brandId, platformId, { meta: conn.meta, refreshToken: conn.refreshToken }, userId);
    return { ok: true, accessToken, gateway };
  } catch (e) {
    return { ok: false, reason: `ต่ออายุการเชื่อมต่อ Lazada ไม่สำเร็จ (${(e as Error).message}) — ${LAZ_RECONNECT_HINT}` };
  }
}

// ───────── เรียก Lazada ติดกันหลายครั้ง: ลองซ้ำเมื่อโดนจำกัดความถี่ ─────────
// เจอจริง 2026-11-10: ดึงสินค้าแล้วดึงช่องของหมวดทันที → "Api access frequency exceeds the limit (ban 1 seconds)" → บันทึกไม่ผ่าน
const isRateLimit = (e: unknown) => /ApiCallLimit|AppApiCallLimit|E1002|\b901\b|frequency exceeds/i.test(`${(e as { code?: string })?.code ?? ""} ${(e as Error)?.message ?? ""}`);
/** เรียก fn · โดนจำกัดความถี่ = รอ 1.2 / 2.4 วิ แล้วลองใหม่ (สูงสุด 3 ครั้ง) · error อื่นโยนต่อทันที */
export async function lazWithRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (e) {
      if (i >= 2 || !isRateLimit(e)) throw e;
      console.warn(`[lazada] ${label}: Lazada ให้รอ (เรียกถี่) — ลองใหม่ครั้งที่ ${i + 2}`);
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
}

/** ช่องคุณสมบัติของหมวด (แคช 10 นาทีต่อเครื่อง — ตัวเลือกของหมวดไม่ค่อยเปลี่ยน · ลดการเรียกซ้ำตอนเปิดแท็บ+บันทึก) */
const catAttrCache = new Map<string, { at: number; defs: LazAttribute[] }>();
export async function lazCategoryAttrsCached(gateway: string, accessToken: string, categoryId: string): Promise<LazAttribute[]> {
  const hit = catAttrCache.get(categoryId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.defs;
  const defs = await lazWithRetry(() => lazGetCategoryAttributes(gateway, accessToken, categoryId), `ช่องของหมวด ${categoryId}`);
  if (catAttrCache.size > 200) catAttrCache.clear();
  catAttrCache.set(categoryId, { at: Date.now(), defs });
  return defs;
}

// ───────── สินค้า 1 รายการบน Lazada (ลิ้นชักสินค้าบนร้าน: ดู / แก้ / เปิดปิดขาย) ─────────
export type LazListingRow = { id: string; platform_id: string; brand_id: string | null; external_product_id: string | null; title: string | null; price: number | null; status: string | null; raw: Record<string, unknown> | null };

/**
 * โหลดรายการในระบบ + ดึงสินค้าตัวนี้ "สด" จาก Lazada (/product/item/get) + กุญแจที่ใช้ได้
 * ใช้ก่อนแก้ทุกครั้ง → เทียบกับของจริงล่าสุด (ไม่เชื่อสำเนาในระบบ) · ไม่ผ่าน = error ภาษาคน + HTTP status
 */
export async function loadLazListingLive(admin: SupabaseClient, listingId: string, userId: string | null): Promise<
  { ok: true; row: LazListingRow; item: Record<string, unknown>; itemId: string; gateway: string; accessToken: string } | { ok: false; error: string; status: number }
> {
  const { data: l } = await admin.from("platform_catalog_listings")
    .select("id, platform_id, brand_id, external_product_id, title, price, status, raw").eq("id", listingId).maybeSingle();
  const row = l as LazListingRow | null;
  if (!row) return { ok: false, error: "ไม่พบสินค้านี้ (อาจถูกลบไปแล้ว)", status: 404 };
  const { data: pf } = await admin.from("erp_platforms").select("code").eq("id", row.platform_id).maybeSingle();
  if ((pf as { code?: string } | null)?.code !== "lazada") return { ok: false, error: "ใช้ได้เฉพาะสินค้าบน Lazada", status: 400 };
  const itemId = String(row.external_product_id ?? "").trim();
  if (!itemId || !row.brand_id) return { ok: false, error: "รายการนี้ไม่มีรหัสสินค้าบน Lazada", status: 400 };
  const tok = await lazTokenOrReason(admin, row.brand_id, row.platform_id, userId);
  if (!tok.ok) return { ok: false, error: tok.reason, status: 400 };
  try {
    const item = await lazWithRetry(() => lazGetItem(tok.gateway, tok.accessToken, itemId), `ดึงสินค้า #${itemId}`);
    if (!item) return { ok: false, error: `ไม่พบสินค้า #${itemId} บน Lazada (อาจถูกลบไปแล้ว)`, status: 404 };
    return { ok: true, row, item, itemId, gateway: tok.gateway, accessToken: tok.accessToken };
  } catch (e) {
    console.warn(`[lazada] ดึงสินค้า #${itemId} ไม่สำเร็จ: ${(e as Error).message}`);
    return { ok: false, error: lazErrorText(e), status: 502 };
  }
}

/**
 * อัปเดตสำเนาย่อในระบบจากข้อมูลเต็มที่เพิ่งดึง — กติกาเดียวกับ upsertCatalogListings (lib/platform-catalog-sync):
 * ตัวแปลงเดียวกับดึงทั้งร้าน (lazProductToCatalogItem) · เจอบนร้าน = ล้างป้าย "ไม่อยู่บนร้านแล้ว" · ไม่แตะคู่ที่จับไว้
 */
export async function saveLazSlimCopy(admin: SupabaseClient, row: LazListingRow, item: Record<string, unknown>): Promise<string | null> {
  const slim = lazProductToCatalogItem(item);
  if (!slim) return "ข้อมูลจาก Lazada ไม่ครบ";
  const now = new Date().toISOString();
  const { error } = await admin.from("platform_catalog_listings").update({
    raw: { ...(row.raw ?? {}), ...slim.raw },
    title: slim.title ?? row.title, price: slim.price ?? row.price, status: slim.status ?? (isGoneStatus(row.status) ? null : row.status),
    sku_code: slim.skus[0] ?? null, last_imported_at: now, updated_at: now,
  }).eq("id", row.id);
  return error ? error.message : null;
}

/**
 * ดึงสินค้ากลับมาเช็กหลังส่งขึ้นร้าน — Lazada มักจำกัดความถี่ถ้าเรียกติดกัน (เจอจริง 2026-11-10: ปิด→เปิดห่างกัน 5 วิ แล้วดึงกลับไม่ได้)
 * → รอแล้วลองซ้ำ (0.8 วิ · 2 วิ) · ไม่ได้ทั้งหมด = null (route ต้องเตือนให้กด "ดึงตัวนี้จาก Lazada" ยืนยันเอง)
 */
export async function refetchLazItem(gateway: string, accessToken: string, itemId: string): Promise<Record<string, unknown> | null> {
  for (const wait of [800, 2000, 0]) {
    try { const it = await lazGetItem(gateway, accessToken, itemId); if (it) return it; }
    catch (e) { console.warn(`[lazada] ดึงสินค้า #${itemId} กลับมาเช็กไม่ได้: ${lazErrorText(e)} (${(e as Error).message})`); }
    if (wait) await new Promise((r) => setTimeout(r, wait));
  }
  return null;
}

// แบบเดิม (คืน null แทนเหตุผล) — route เก่าใช้อยู่
export async function ensureLazToken(admin: SupabaseClient, brandId: string, platformId: string, userId: string | null): Promise<{ accessToken: string; gateway: string } | null> {
  const r = await lazTokenOrReason(admin, brandId, platformId, userId);
  return r.ok ? { accessToken: r.accessToken, gateway: r.gateway } : null;
}
