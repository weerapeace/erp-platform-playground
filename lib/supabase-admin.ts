import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase service-role client — มีสิทธิ์เต็ม bypass RLS
 *
 * ⚠️ ใช้ได้ใน Server-side เท่านั้น (API route, server action)
 * ⚠️ ห้าม import จาก client component หรือ public bundle
 *
 * ใช้สำหรับ operation ที่ต้อง admin-level เท่านั้น เช่น
 *   - auth.admin.inviteUserByEmail
 *   - auth.admin.deleteUser
 *
 * Operation ปกติให้ใช้ supabaseFromRequest (forward JWT ผู้ใช้) แทน
 */

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("ตั้งค่า SUPABASE_SERVICE_ROLE_KEY ใน .env.local ก่อน");
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
