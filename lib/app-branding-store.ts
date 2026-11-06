/**
 * 🎨 ที่เก็บไอคอน/ชื่อที่ตั้งเอง (ฝั่งเซิร์ฟเวอร์ · ของกลาง) — china_app_settings skey=app_branding
 *   { <appKey | "page:<path>">: { icon_url, label?, updated_at } }
 * แยกไฟล์ออกมาให้ lib/app-branding-server และ lib/solo-page-server อ่านที่เดียวกันได้ (ไม่ import กันวน)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { APP_BRANDING_KEY } from "@/lib/app-branding";

type Admin = ReturnType<typeof supabaseAdmin>;

export type BrandingEntry = { icon_url?: string | null; label?: string | null; updated_at?: string };
export type BrandingStore = Record<string, BrandingEntry>;

export async function readBrandingStore(admin: Admin): Promise<BrandingStore> {
  const { data } = await admin.from("china_app_settings").select("sval").eq("skey", APP_BRANDING_KEY).maybeSingle();
  const v = (data as { sval?: unknown } | null)?.sval;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as BrandingStore) : {};
}

/** แก้ entry เดียว (อ่านล่าสุดก่อนเขียน — entry อื่นไม่หาย) · คืน entry ก่อนแก้ */
export async function patchBrandingEntry(admin: Admin, key: string, patch: BrandingEntry): Promise<BrandingEntry> {
  const store = await readBrandingStore(admin);
  const before = store[key] ?? {};
  const now = new Date().toISOString();
  store[key] = { ...before, ...patch, updated_at: now };
  const { error } = await admin.from("china_app_settings").upsert({ skey: APP_BRANDING_KEY, sval: store, updated_at: now }, { onConflict: "skey" });
  if (error) throw new Error(error.message);
  return before;
}
