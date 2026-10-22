/**
 * ของกลาง (ฝั่งเซิร์ฟเวอร์) — "ใครเรียก API นี้" ไว้ลง audit log / created_by / ส่งอีเมลทดสอบถึงตัวเอง
 * ใช้: const actor = await requestActor(supabaseFromRequest(request))  → { id, name, email }
 * ชื่อจาก user_profiles.display_name ถ้ามี ไม่งั้นอีเมล · ไม่ได้ login = ค่า null ทั้งหมด
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function requestActor(client: SupabaseClient): Promise<{ id: string | null; name: string | null; email: string | null }> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { id: null, name: null, email: null };
  const { data: prof } = await client.from("user_profiles").select("display_name, email").eq("id", user.id).maybeSingle();
  const p = prof as { display_name?: string | null; email?: string | null } | null;
  return { id: user.id, name: p?.display_name || user.email || null, email: user.email || p?.email || null };
}
