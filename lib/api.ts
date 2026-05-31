"use client";

import { supabaseBrowser } from "./supabase-browser";

/**
 * fetch wrapper ที่แนบ access_token ของ user ปัจจุบันอัตโนมัติ
 * → ให้ API route ส่ง token ต่อไป Supabase (auth.uid ทำงาน + erp_can ตรวจสิทธิ์)
 *
 * ใช้แทน fetch() สำหรับทุก call ที่ต้องการตัวตน (create/update/delete)
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}
