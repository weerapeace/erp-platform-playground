"use client";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Supabase client สำหรับ browser (auth)
 * persistSession: true → เก็บ session ใน localStorage, ต่ออายุ token อัตโนมัติ
 * (แยกจาก lib/supabase.ts ที่ใช้ฝั่ง server แบบ stateless)
 */
export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
