import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * สร้าง Supabase client ฝั่ง server ที่ "ส่งต่อ" token ของ user จาก request
 * → auth.uid() ใน SQL function จะรู้ว่าเป็น user คนไหน → erp_can() ทำงาน
 *
 * ใช้กับ API route ที่ต้อง mutation (create/update/delete)
 * read ทั่วไปยังใช้ lib/supabase.ts (anon) ได้
 */
export function supabaseFromRequest(request: Request): SupabaseClient {
  const authHeader = request.headers.get("authorization") ?? "";
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
