/**
 * 🔐 จำ "โปรไฟล์ + สิทธิ์" ของคนที่ล็อกอินไว้สั้น ๆ — ใช้ร่วมทุกแท็บ/ทุกกรอบ (iframe) ของเว็บเดียวกัน
 *
 * ปัญหาที่แก้ (เจอ 2026-11-07): หลัง deploy ทุกครั้ง หน้าที่เปิดค้างโหลดใหม่พร้อมกัน → แต่ละหน้าถาม
 *   erp_current_user + erp_my_permissions "2 รอบ" (getSession + INITIAL_SESSION) + ทุกครั้งที่ต่ออายุล็อกอิน
 *   → หลายร้อยครั้ง/นาทีจากเครื่องเดียว → ฐานข้อมูลช้าทั้งระบบ ~2 นาที (เคยเฉลี่ย 4.8–11.9 วิ/คำขอ)
 * ทางแก้: แท็บแรกถามแล้วจดไว้ใน localStorage 60 วิ (เท่าแคชสิทธิ์ฝั่งเซิร์ฟเวอร์ lib/api-auth) → แท็บ/กรอบอื่นหยิบไปใช้
 *   ความปลอดภัย: เป็นแค่ข้อมูลโชว์หน้าจอ (role/รายชื่อสิทธิ์) — เซิร์ฟเวอร์ยังตรวจสิทธิ์ทุก API เหมือนเดิม · ผูกกับ user id · ออกจากระบบ = ล้าง
 * ใช้ที่: components/auth (AuthProvider) · เทสต์: lib/__tests__/auth-profile-cache.test.ts
 */
export type CachedProfile = {
  id: string; email: string; display_name: string | null; role: string | null; active: boolean | null; avatar_url: string | null;
};
export type ProfileCacheEntry = { uid: string; at: number; profile: CachedProfile; perms: string[] | null };

export const PROFILE_CACHE_KEY = "erp_auth_profile_v1";
export const PROFILE_CACHE_TTL = 60000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const store = (): Store | null => {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
};

/** อ่านค่าที่จำไว้ของคนนี้ (เก่ากว่า TTL / คนละคน / ผิดรูป = null) */
export function readProfileCache(uid: string, now = Date.now(), s: Store | null = store()): ProfileCacheEntry | null {
  if (!uid || !s) return null;
  try {
    const raw = s.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const e = JSON.parse(raw) as ProfileCacheEntry;
    if (!e || e.uid !== uid || typeof e.at !== "number" || now - e.at > PROFILE_CACHE_TTL || now < e.at - 5000) return null;
    if (!e.profile || e.profile.id !== uid) return null;
    return { ...e, perms: Array.isArray(e.perms) ? e.perms.filter((x) => typeof x === "string") : null };
  } catch { return null; }
}

/** จดโปรไฟล์ (perms = null = ยังไม่ได้สิทธิ์ · ส่งมาทีหลังด้วย writeProfilePerms) */
export function writeProfileCache(profile: CachedProfile, perms: string[] | null, now = Date.now(), s: Store | null = store()): void {
  if (!s || !profile?.id) return;
  try { s.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid: profile.id, at: now, profile, perms } satisfies ProfileCacheEntry)); } catch { /* เต็ม/ปิดไว้ = ไม่จำ */ }
}

/** เติมสิทธิ์ให้รายการที่จดไว้ (คนเดียวกันเท่านั้น · ไม่ต่ออายุเวลา) */
export function writeProfilePerms(uid: string, perms: string[], s: Store | null = store()): void {
  if (!s || !uid) return;
  try {
    const raw = s.getItem(PROFILE_CACHE_KEY);
    if (!raw) return;
    const e = JSON.parse(raw) as ProfileCacheEntry;
    if (e?.uid !== uid) return;
    s.setItem(PROFILE_CACHE_KEY, JSON.stringify({ ...e, perms }));
  } catch { /* ignore */ }
}

export function clearProfileCache(s: Store | null = store()): void {
  try { s?.removeItem(PROFILE_CACHE_KEY); } catch { /* ignore */ }
}

/**
 * เหตุการณ์ล็อกอินแบบไหน "ต้องถามโปรไฟล์ใหม่" (ฝั่ง AuthProvider)
 *   - คนอื่นมาล็อกอินแทน / ยังไม่เคยโหลดในหน้านี้ = ถาม (หรือหยิบจากที่จดไว้)
 *   - USER_UPDATED (แก้ชื่อ/รูป/อีเมล) = ถามใหม่เสมอ
 *   - คนเดิม + TOKEN_REFRESHED / INITIAL_SESSION / SIGNED_IN ซ้ำ = ไม่ต้องถาม เว้นแต่โหลดไว้นานเกิน staleMs (เช่น 15 นาที — ให้สิทธิ์ที่แอดมินเปลี่ยนมีผลในแท็บที่เปิดค้าง)
 */
export function shouldReloadProfile(event: string, uid: string, loaded: { uid: string; at: number } | null, now = Date.now(), staleMs = 15 * 60000): boolean {
  if (event === "USER_UPDATED") return true;
  if (!loaded || loaded.uid !== uid) return true;
  return now - loaded.at > staleMs;
}
