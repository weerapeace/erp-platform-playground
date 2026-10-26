// favicon ของแอปแจ้งเตือน — ดึงไอคอนที่ตั้งไว้ (ของกลาง lib/app-branding) · เปลี่ยนได้ด้วยปุ่ม ✏️ ใต้ QR
import { supabaseAdmin } from "@/lib/supabase-admin";
import { appIconResponse } from "@/lib/app-branding-server";

export const dynamic = "force-dynamic";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  return appIconResponse(supabaseAdmin(), "notify", 64);
}
