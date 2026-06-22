"use client";

import { supabaseBrowser } from "./supabase-browser";

/**
 * fetch wrapper ที่แนบ access_token ของ user ปัจจุบันอัตโนมัติ
 * → ให้ API route ส่ง token ต่อไป Supabase (auth.uid ทำงาน + erp_can ตรวจสิทธิ์)
 *
 * ใช้แทน fetch() สำหรับทุก call ที่ต้องการตัวตน (create/update/delete)
 */
/**
 * ทำคำค้นให้ปลอดภัยกับ URL query ของ Cloudflare/OpenNext
 * worker ตัด query string ที่ตัว "#" (มองเป็น fragment) → คำค้นหลัง "#" หาย + param ถัดไปหาย
 * แทน "#" ด้วยช่องว่าง (ตัวค้นหา tokenize/normalize มองเป็นตัวคั่นอยู่แล้ว ผลลัพธ์เหมือนเดิม)
 */
export const safeSearch = (s: string): string => s.replace(/#/g, " ").replace(/\s+/g, " ").trim();

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // กันทั้งระบบ: Cloudflare/OpenNext ตัด query string ที่ตัว "#" (มองเป็น fragment) → param หลัง "#" หาย
  // แทน %23 (=#) ในส่วน query ด้วย %20 (ช่องว่าง) ทุก request — ไม่มี param ไหนต้องการ "#" จริง
  const qi = input.indexOf("?");
  if (qi >= 0) input = input.slice(0, qi) + input.slice(qi).replace(/%23/gi, "%20");
  return fetch(input, { ...init, headers });
}
