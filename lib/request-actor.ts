/**
 * ของกลาง (ฝั่งเซิร์ฟเวอร์) — "ใครเรียก API นี้" ไว้ลง audit log / created_by
 * ใช้: const actor = await requestActor(supabaseFromRequest(request))  → { id, name }
 * ชื่อจาก user_profiles.display_name ถ้ามี ไม่งั้นอีเมล · ไม่ได้ login = { id: null, name: null }
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function requestActor(client: SupabaseClient): Promise<{ id: string | null; name: string | null }> {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { id: null, name: null };
  const { data: prof } = await client.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle();
  return { id: user.id, name: ((prof as { display_name?: string } | null)?.display_name || user.email || null) };
}
