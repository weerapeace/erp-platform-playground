// ไอคอนหน้าจอโฮม iPhone ของแอปแจ้งเตือน — ดึงไอคอนที่ตั้งไว้ (ของกลาง lib/app-branding)
// (ต้องเป็นไฟล์ของหน้านี้เอง: ไอคอนแบบไฟล์ของชั้นบนจะทับค่าที่ตั้งใน metadata)
import { supabaseAdmin } from "@/lib/supabase-admin";
import { appIconResponse } from "@/lib/app-branding-server";

export const dynamic = "force-dynamic";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return appIconResponse(supabaseAdmin(), "notify", 180);
}
