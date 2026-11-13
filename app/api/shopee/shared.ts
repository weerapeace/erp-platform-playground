// ของใช้ร่วมของ Shopee Open Platform (แยกจาก route.ts — route ต้อง export แค่ handler)
// ใช้ state / baseUrl / getPlatformId ตัวเดียวกับ Lazada + TikTok (ไม่สร้างชุดใหม่) · สุขภาพกุญแจใช้กติกาเดียวกับ Lazada
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/secret-box";
import { lazConnHealth } from "@/lib/lazada";
import { shopeeConfigured, shopeeEnv, shopeeErrorText, shopeeRefreshToken, shopeeReconnectBy, shopeeTokenTimes, type ShopeeEnv, type ShopeeToken } from "@/lib/shopee";
import { baseUrl } from "../lazada/shared";
export { baseUrl, buildState, parseState, getPlatformId } from "../lazada/shared";

/** ที่ Shopee พากลับหลังร้านกดอนุญาต — โดเมนต้องตรงกับ Redirect URL Domain ในหน้าแอป · state พา brand_id (เข้ารหัส) */
export function shopeeRedirectUri(state: string): string { return `${baseUrl()}/api/shopee/callback?state=${encodeURIComponent(state)}`; }

export type ShopeeConnMeta = {
  stage?: string;                  // connected | disconnected
  env?: ShopeeEnv;                 // ชุดกุญแจตอนเชื่อม (live / sandbox) — เปลี่ยนชุดใน Vercel แล้วต้องเชื่อมใหม่
  shop_id?: string; shop_name?: string | null; region?: string | null; shop_status?: string | null;
  refresh_token?: string;          // เข้ารหัส (enc:v1:) — ใช้ได้ครั้งเดียว
  expires_at?: number;             // access_token หมด (4 ชม.)
  rt_expires_at?: number;          // ตัวต่ออายุหมด (30 วัน — ต่อเองทุกวัน)
  auth_expires_at?: number | null; // สิทธิ์ที่ร้านให้หมด (≤365 วัน) — ต้องกดเชื่อมใหม่
  refresh_expires_at?: number;     // = ตัวที่หมดก่อนในสองตัวบน (ใช้กับ lazConnHealth + ศูนย์แบรนด์)
  connected_at?: string; refreshed_at?: string;
};

/** เติม refresh_expires_at ให้ตรงกับวันที่ต้องเชื่อมใหม่จริง */
export function withReconnectBy(meta: ShopeeConnMeta): ShopeeConnMeta {
  return { ...meta, refresh_expires_at: shopeeReconnectBy(meta) };
}

export type ShopeeConn = { meta: ShopeeConnMeta; accessToken: string | null; refreshToken: string | null; refreshEnc: string | null };

// อ่าน connection (แบรนด์ × shopee) → meta + กุญแจ (ถอดรหัส) + ตัวต่ออายุแบบเข้ารหัส (ใช้กันต่ออายุชนกัน)
export async function loadShopeeConn(admin: SupabaseClient, brandId: string, platformId: string): Promise<ShopeeConn | null> {
  const { data } = await admin.from("platform_credentials").select("api_key, meta").eq("brand_id", brandId).eq("platform_id", platformId).maybeSingle();
  if (!data) return null;
  const row = data as { api_key: string | null; meta: ShopeeConnMeta | null };
  const meta = row.meta ?? {};
  const accessToken = row.api_key ? await decryptSecret(row.api_key).catch(() => null) : null;
  const refreshToken = meta.refresh_token ? await decryptSecret(meta.refresh_token).catch(() => null) : null;
  return { meta, accessToken, refreshToken, refreshEnc: meta.refresh_token ?? null };
}

// เก็บ connection (กุญแจเข้ารหัสทั้งคู่) — ทับทั้งแถว ใช้ตอนเชื่อม/ตัดการเชื่อม/อัปเดตข้อมูลร้าน
export async function saveShopeeConn(admin: SupabaseClient, brandId: string, platformId: string, accessToken: string | null, refreshToken: string | null, meta: ShopeeConnMeta, userId: string | null): Promise<void> {
  const api_key = accessToken ? await encryptSecret(accessToken) : null;
  const metaOut: ShopeeConnMeta = withReconnectBy({ ...meta });
  metaOut.refresh_token = refreshToken ? await encryptSecret(refreshToken) : undefined;
  const { error } = await admin.from("platform_credentials").upsert(
    { brand_id: brandId, platform_id: platformId, api_key, meta: metaOut, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "brand_id,platform_id" },
  );
  if (error) throw new Error(`บันทึกการเชื่อมต่อไม่สำเร็จ: ${error.message}`);
}

/** อัปเดตข้อมูลร้านใน meta โดยไม่แตะกุญแจ (ไม่เข้ารหัสใหม่ — กันทับตัวต่ออายุที่อีกงานเพิ่งเก็บ) */
export async function patchShopeeMeta(admin: SupabaseClient, brandId: string, platformId: string, patch: Partial<ShopeeConnMeta>): Promise<void> {
  const cur = await loadShopeeConn(admin, brandId, platformId);
  if (!cur) return;
  const meta = withReconnectBy({ ...cur.meta, ...patch, refresh_token: cur.meta.refresh_token });
  await admin.from("platform_credentials").update({ meta, updated_at: new Date().toISOString() })
    .eq("brand_id", brandId).eq("platform_id", platformId).eq("meta->>refresh_token", cur.refreshEnc ?? "");
}

/** สถานะกุญแจ (none / connected / expiring ≤7 วัน / expired) — กติกาเดียวกับ Lazada/TikTok · วันหมด = refresh_expires_at */
export const shopeeConnHealth = lazConnHealth;

export const SHOPEE_RECONNECT_HINT = "ไปที่ จัดการร้าน/บัญชีแพลตฟอร์ม › Shopee แล้วกด เชื่อมต่อ Shopee ใหม่";

/**
 * ต่ออายุกุญแจ 1 ร้าน แบบกันชน — refresh_token ของ Shopee ใช้ได้ครั้งเดียว
 * ถ้า 2 งานต่ออายุพร้อมกัน (ตัวตั้งเวลา + คนกดปุ่ม) ตัวที่ช้ากว่าจะได้ error → อ่านแถวซ้ำ ถ้าอีกงานเก็บตัวใหม่ไว้แล้วก็ใช้ตัวนั้น
 * เก็บแบบ "อัปเดตเฉพาะถ้าตัวต่ออายุในแถวยังเป็นตัวเดิม" (compare-and-swap) → ไม่ทับตัวที่ใหม่กว่า · ไม่ต้องแก้ฐานข้อมูล
 * คืน access token ที่ใช้ได้ · ไม่ได้ = โยน Error ภาษาคน
 */
export async function refreshShopeeConn(admin: SupabaseClient, brandId: string, platformId: string, conn: ShopeeConn, userId: string | null): Promise<{ accessToken: string; meta: ShopeeConnMeta }> {
  const shopId = conn.meta.shop_id;
  if (!conn.refreshToken || !shopId) throw new Error(`ไม่มีตัวต่ออายุของร้าน — ${SHOPEE_RECONNECT_HINT}`);
  let t: ShopeeToken;
  try {
    t = await shopeeRefreshToken(conn.refreshToken, shopId);
  } catch (e) {
    const fresh = await loadShopeeConn(admin, brandId, platformId);
    if (fresh?.accessToken && fresh.refreshEnc && fresh.refreshEnc !== conn.refreshEnc && (fresh.meta.expires_at ?? 0) > Date.now() + 60_000) {
      return { accessToken: fresh.accessToken, meta: fresh.meta };   // อีกงานต่ออายุไปแล้ว
    }
    throw new Error(shopeeErrorText(e));
  }
  const now = Date.now();
  const meta: ShopeeConnMeta = withReconnectBy({ ...conn.meta, ...shopeeTokenTimes(t, now), refreshed_at: new Date(now).toISOString() });
  const row = { api_key: await encryptSecret(t.access_token), meta: { ...meta, refresh_token: await encryptSecret(t.refresh_token) }, updated_by: userId, updated_at: new Date(now).toISOString() };
  // ได้ตัวต่ออายุใหม่แล้ว ตัวเดิมใช้ไม่ได้อีก → ต้องเก็บให้ได้ (ลองซ้ำ 3 ครั้งถ้าฐานข้อมูลสะดุด)
  for (let i = 0; i < 3; i++) {
    const { data, error } = await admin.from("platform_credentials").update(row)
      .eq("brand_id", brandId).eq("platform_id", platformId).eq("meta->>refresh_token", conn.refreshEnc ?? "").select("brand_id");
    if (!error) {
      if (!(data ?? []).length) console.warn(`[shopee] ต่ออายุร้าน ${shopId} แล้ว แต่แถวถูกอีกงานอัปเดตก่อน — คงตัวในแถวไว้ ใช้กุญแจรอบนี้ต่อ`);
      return { accessToken: t.access_token, meta };
    }
    console.warn(`[shopee] เก็บกุญแจใหม่ไม่สำเร็จ (ครั้งที่ ${i + 1}): ${error.message}`);
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error(`ต่ออายุกับ Shopee ได้แล้ว แต่บันทึกกุญแจใหม่ไม่สำเร็จ — ถ้าใช้ไม่ได้ ${SHOPEE_RECONNECT_HINT}`);
}

/**
 * โหลด access token ที่ใช้งานได้ (ต่ออายุเองถ้าเหลือ < 10 นาที) + shop_id
 * ok=false → reason เป็นภาษาคน ตอบผู้ใช้ได้เลย
 */
export async function shopeeTokenOrReason(admin: SupabaseClient, brandId: string, platformId: string, userId: string | null): Promise<{ ok: true; accessToken: string; shopId: string; meta: ShopeeConnMeta } | { ok: false; reason: string }> {
  if (!shopeeConfigured()) return { ok: false, reason: "ยังไม่ได้ตั้ง SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY ในระบบ (Vercel)" };
  const conn = await loadShopeeConn(admin, brandId, platformId);
  if (!conn?.accessToken || conn.meta.stage !== "connected" || !conn.meta.shop_id) return { ok: false, reason: `แบรนด์นี้ยังไม่ได้เชื่อมต่อ Shopee — ${SHOPEE_RECONNECT_HINT}` };
  if (conn.meta.env && conn.meta.env !== shopeeEnv()) return { ok: false, reason: `ชุดกุญแจใน Vercel (${shopeeEnv()}) ไม่ตรงกับตอนเชื่อมร้าน (${conn.meta.env}) — ${SHOPEE_RECONNECT_HINT}` };
  if ((conn.meta.expires_at ?? 0) > Date.now() + 10 * 60_000) return { ok: true, accessToken: conn.accessToken, shopId: conn.meta.shop_id, meta: conn.meta };
  if (shopeeConnHealth(conn.meta).state === "expired" || !conn.refreshToken) return { ok: false, reason: `การเชื่อมต่อ Shopee หมดอายุแล้ว — ${SHOPEE_RECONNECT_HINT}` };
  try {
    const r = await refreshShopeeConn(admin, brandId, platformId, conn, userId);
    return { ok: true, accessToken: r.accessToken, shopId: conn.meta.shop_id, meta: r.meta };
  } catch (e) {
    return { ok: false, reason: `ต่ออายุการเชื่อมต่อ Shopee ไม่สำเร็จ (${(e as Error).message})` };
  }
}

/** ชื่อแบรนด์ (ใช้เทียบกับชื่อร้านจาก Shopee + ข้อความเตือน) */
export async function brandNameOf(admin: SupabaseClient, brandId: string): Promise<string | null> {
  const { data } = await admin.from("brands").select("name").eq("id", brandId).maybeSingle();
  return (data as { name?: string } | null)?.name ?? null;
}

/** ร้าน Shopee เดียวกัน (shop_id) ต่ออยู่กับแบรนด์อื่นแล้วไหม → คืนชื่อแบรนด์นั้น (1 ร้าน = 1 แบรนด์) */
export async function shopeeShopConnectedElsewhere(admin: SupabaseClient, platformId: string, brandId: string, shopId: string): Promise<string | null> {
  const { data } = await admin.from("platform_credentials").select("brand_id, meta").eq("platform_id", platformId).neq("brand_id", brandId);
  const hit = ((data ?? []) as { brand_id: string; meta: ShopeeConnMeta | null }[]).find((r) => r.meta?.stage === "connected" && String(r.meta?.shop_id ?? "") === shopId);
  if (!hit) return null;
  return (await brandNameOf(admin, hit.brand_id)) ?? "อื่น";
}

// ───────── ตัวต่ออายุรายวัน (เรียกจาก /api/cron/lazada-token — ตัวเดียวกับ Lazada · ออฟฟิศ AI โต๊ะเต็ม 20/20 ไม่เพิ่มคนใหม่) ─────────
export type ShopeeRefreshResult = { brand_id: string; shop_id: string | null; result: "refreshed" | "expired" | "failed" | "skipped"; days_left: number | null; error?: string };

/** ต่ออายุทุกร้าน Shopee ที่เชื่อมอยู่ (กันตัวต่ออายุ 30 วันหมดเงียบ) · dry = ดูสถานะอย่างเดียว */
export async function refreshAllShopee(admin: SupabaseClient, opts: { dry: boolean; platformId: string }): Promise<ShopeeRefreshResult[]> {
  const { data: rows } = await admin.from("platform_credentials").select("brand_id").eq("platform_id", opts.platformId);
  const out: ShopeeRefreshResult[] = [];
  for (const r of (rows ?? []) as { brand_id: string }[]) {
    const conn = await loadShopeeConn(admin, r.brand_id, opts.platformId);
    if (!conn || conn.meta.stage !== "connected") continue;
    const shop = conn.meta.shop_id ?? null;
    const h = shopeeConnHealth(conn.meta);
    if (h.state === "expired" || !conn.refreshToken) { out.push({ brand_id: r.brand_id, shop_id: shop, result: "expired", days_left: 0 }); continue; }
    if (opts.dry) { out.push({ brand_id: r.brand_id, shop_id: shop, result: "skipped", days_left: h.days_left }); continue; }
    try {
      const res = await refreshShopeeConn(admin, r.brand_id, opts.platformId, conn, null);
      out.push({ brand_id: r.brand_id, shop_id: shop, result: "refreshed", days_left: shopeeConnHealth(res.meta).days_left });
    } catch (e) {
      out.push({ brand_id: r.brand_id, shop_id: shop, result: "failed", days_left: h.days_left, error: (e as Error).message });
    }
  }
  return out;
}
