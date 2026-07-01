// ตัวช่วยฝั่ง server ของโมดูลเป้าหมาย: หา user ปัจจุบัน + permission นำร่อง
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

/**
 * permission นำร่อง (เฟส 2a): ทุก role มี notifications.view → ใช้เป็นตัวเช็ก "ล็อกอินแล้ว"
 * เฟส 2c: เปลี่ยนเป็น goals.view / goals.edit จริง + เพิ่มใน erp_can (backend) และ ROLE_PERMISSIONS (client)
 */
export const GOALS_VIEW = "notifications.view";
export const GOALS_EDIT = "notifications.view";

/** คืนเจ้าของ (id + ชื่อ) จาก JWT ของ request ผ่าน erp_current_user() */
export async function getRequestOwner(request: Request): Promise<{ id: string; name: string }> {
  const { data } = await supabaseFromRequest(request).rpc("erp_current_user");
  const p = data as { id?: string; display_name?: string; email?: string } | null;
  return { id: p?.id ?? "", name: p?.display_name ?? p?.email ?? "ผู้ใช้" };
}
