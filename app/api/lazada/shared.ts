// ของใช้ร่วมของ Lazada API (แยกจาก route.ts — route ต้อง export แค่ handler)
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/secret-box";
import { lazRefreshToken, lazGateway } from "@/lib/lazada";

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

// โหลด access token ที่ใช้งานได้ (ต่ออายุอัตโนมัติถ้าใกล้หมด) + gateway ของร้าน · null = ยังไม่เชื่อมต่อ
export async function ensureLazToken(admin: SupabaseClient, brandId: string, platformId: string, userId: string | null): Promise<{ accessToken: string; gateway: string } | null> {
  const conn = await loadLazConn(admin, brandId, platformId);
  if (!conn?.accessToken || conn.meta.stage !== "connected") return null;
  let accessToken = conn.accessToken;
  const gateway = conn.meta.gateway || lazGateway(conn.meta.country);
  if ((conn.meta.expires_at ?? 0) < Date.now() + 60000 && conn.refreshToken) {
    const t = await lazRefreshToken(conn.refreshToken);
    accessToken = t.access_token;
    await saveLazConn(admin, brandId, platformId, t.access_token, t.refresh_token, {
      ...conn.meta, expires_at: Date.now() + (Number(t.expires_in) || 0) * 1000, refresh_expires_at: Date.now() + (Number(t.refresh_expires_in) || 0) * 1000,
    }, userId);
  }
  return { accessToken, gateway };
}
