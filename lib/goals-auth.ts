// ตัวช่วยฝั่ง server ของโมดูลเป้าหมาย: หา user ปัจจุบัน + permission นำร่อง
import { supabaseFromRequest } from "@/lib/supabase-auth-server";

/**
 * permission จริง (เฟส 2c) — เก็บใน erp_role_permissions (erp_can อ่านตาราง)
 * viewer = goals.view เท่านั้น · admin/manager/staff/PR_manager = view + edit
 */
export const GOALS_VIEW = "goals.view";
export const GOALS_EDIT = "goals.edit";

/** คืนเจ้าของ (id + ชื่อ) จาก JWT ของ request ผ่าน erp_current_user() */
export async function getRequestOwner(request: Request): Promise<{ id: string; name: string }> {
  const { data } = await supabaseFromRequest(request).rpc("erp_current_user");
  const p = data as { id?: string; display_name?: string; email?: string } | null;
  return { id: p?.id ?? "", name: p?.display_name ?? p?.email ?? "ผู้ใช้" };
}
