import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// ⚡ จำผล auth.getUser() ต่อ token สั้น ๆ (30 วิ) ใน isolate — เจอ 2026-11-07: หลัง deploy ฝั่งเซิร์ฟเวอร์ยิง /auth/v1/user
//   174 ครั้ง/นาที (API กว่า 590 จุดเรียก supabaseFromRequest(req).auth.getUser() ทุกคำขอ) ซ้ำกับคนเดิม token เดิม
//   คำขอที่กำลังวิ่งใช้ร่วมกัน · ผลที่ error/ไม่มี user ไม่จำ · token หมดอายุเองตามปกติ (JWT ใช้กับ RLS ได้จนหมดอายุอยู่แล้ว)
type GetUserResult = Awaited<ReturnType<SupabaseClient["auth"]["getUser"]>>;
const userCache = new Map<string, { at: number; p: Promise<GetUserResult> }>();
const USER_TTL = 30000;
function cachedGetUser(token: string, load: () => Promise<GetUserResult>): Promise<GetUserResult> {
  const now = Date.now();
  const hit = userCache.get(token);
  if (hit && now - hit.at < USER_TTL) return hit.p;
  const p = load().then((res) => {
    if (res.error || !res.data?.user) userCache.delete(token);   // ไม่จำผลที่ไม่ผ่าน
    return res;
  }, (e) => { userCache.delete(token); throw e; });
  if (userCache.size > 500) { for (const [k, v] of userCache) if (now - v.at > USER_TTL) userCache.delete(k); }   // กันบวม
  userCache.set(token, { at: now, p });
  return p;
}

/**
 * สร้าง Supabase client ฝั่ง server ที่ "ส่งต่อ" token ของ user จาก request
 * → auth.uid() ใน SQL function จะรู้ว่าเป็น user คนไหน → erp_can() ทำงาน
 *
 * ใช้กับ API route ที่ต้อง mutation (create/update/delete)
 * read ทั่วไปยังใช้ lib/supabase.ts (anon) ได้
 */
export function supabaseFromRequest(request: Request): SupabaseClient {
  // 1. Authorization header (apiFetch ส่ง Bearer token)
  let bearerToken: string | null = null;
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    bearerToken = authHeader.substring(7);
  }

  // 2. F17: Supabase cookie (<img>, <a href> etc. ส่งแค่ cookie ไม่ใช่ header)
  if (!bearerToken) {
    const cookieHeader = request.headers.get("cookie") ?? "";
    const ref = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1];
    if (ref && cookieHeader) {
      const cookies: Record<string, string> = {};
      for (const part of cookieHeader.split(";")) {
        const [k, ...v] = part.trim().split("=");
        if (k) cookies[k] = decodeURIComponent(v.join("="));
      }
      const cookieName = `sb-${ref}-auth-token`;
      // Supabase ssr อาจ chunk cookie เป็น .0 .1 .2 ถ้ายาว
      let raw = cookies[cookieName] ?? "";
      if (!raw) {
        for (let i = 0; cookies[`${cookieName}.${i}`]; i++) {
          raw += cookies[`${cookieName}.${i}`];
        }
      }
      if (raw) {
        try {
          // ค่า cookie อาจเป็น 'base64-<base64-json>' หรือ JSON ตรงๆ
          const decoded = raw.startsWith("base64-") ? atob(raw.slice(7)) : raw;
          const parsed = JSON.parse(decoded) as { access_token?: string };
          if (parsed.access_token) bearerToken = parsed.access_token;
        } catch { /* malformed cookie — ignore */ }
      }
    }
  }

  const globalHeaders: Record<string, string> = {};
  if (bearerToken) globalHeaders.Authorization = `Bearer ${bearerToken}`;

  const client = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: globalHeaders },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (bearerToken) {
    const token = bearerToken;
    const auth = client.auth as unknown as { getUser: (jwt?: string) => Promise<GetUserResult> };
    const original = auth.getUser.bind(client.auth);
    auth.getUser = (jwt?: string) => (jwt && jwt !== token ? original(jwt) : cachedGetUser(token, () => original(jwt)));
  }
  return client;
}
