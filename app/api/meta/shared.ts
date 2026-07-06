// ของใช้ร่วมของ Meta API (แยกจาก route.ts — route ต้อง export แค่ handler)
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/secret-box";

// URL เว็บจริง (ใช้ทำ redirect_uri ให้ตรงกับที่ลงทะเบียนใน Meta + ทำ URL รูป public ให้ Facebook ดึง)
export function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || "https://erp-platform-playground.vercel.app").replace(/\/$/, "");
}
export function metaRedirectUri(): string { return `${baseUrl()}/api/meta/oauth/callback`; }

// state (กัน CSRF + พา brand_id ข้ามไป-กลับ OAuth) — เข้ารหัสด้วยกุญแจหลักของเรา ปลอมไม่ได้
export async function buildState(brandId: string): Promise<string> {
  return encryptSecret(JSON.stringify({ b: brandId, t: Date.now() }));
}
export async function parseState(state: string): Promise<string | null> {
  try {
    const j = JSON.parse(await decryptSecret(state)) as { b?: string; t?: number };
    if (!j.b || !j.t || Date.now() - j.t > 30 * 60 * 1000) return null;   // หมดอายุ 30 นาที
    return j.b;
  } catch { return null; }
}

// id ของ platform ตาม code (facebook/instagram) จาก erp_platforms
export async function getPlatformId(admin: SupabaseClient, code: string): Promise<string | null> {
  const { data } = await admin.from("erp_platforms").select("id").eq("code", code).maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

export type FbConnMeta = { stage?: string; page_id?: string; page_name?: string; ig_user_id?: string | null; has_ig?: boolean; pages?: { id: string; name: string; ig: boolean }[]; connected_at?: string };

// อ่าน connection (แบรนด์ × แพลตฟอร์ม) → { meta, token(ถอดรหัสแล้ว) }
export async function loadConn(admin: SupabaseClient, brandId: string, platformId: string): Promise<{ meta: FbConnMeta; token: string | null } | null> {
  const { data } = await admin.from("platform_credentials").select("api_key, meta").eq("brand_id", brandId).eq("platform_id", platformId).maybeSingle();
  if (!data) return null;
  const row = data as { api_key: string | null; meta: FbConnMeta | null };
  const token = row.api_key ? await decryptSecret(row.api_key).catch(() => null) : null;
  return { meta: row.meta ?? {}, token };
}

// เก็บ connection (token เข้ารหัสก่อนเสมอ)
export async function saveConn(admin: SupabaseClient, brandId: string, platformId: string, token: string | null, meta: FbConnMeta, userId: string | null): Promise<void> {
  const api_key = token ? await encryptSecret(token) : null;
  await admin.from("platform_credentials").upsert(
    { brand_id: brandId, platform_id: platformId, api_key, meta, updated_by: userId, updated_at: new Date().toISOString() },
    { onConflict: "brand_id,platform_id" },
  );
}
