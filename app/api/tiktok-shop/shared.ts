// ของใช้ร่วมของ TikTok Shop API (แยกจาก route.ts — route ต้อง export แค่ handler)
// ใช้ state / baseUrl / getPlatformId ตัวเดียวกับ Lazada (ไม่สร้างชุดที่ 3)
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/secret-box";
import { lazConnHealth } from "@/lib/lazada";
import { ttsRefreshToken, ttsExpiryMs, ttsErrorText, type TtsShop, type TtsToken } from "@/lib/tiktok-shop";
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
