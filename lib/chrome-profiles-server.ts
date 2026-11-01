/**
 * ฝั่ง server ของทะเบียนโปรไฟล์ Chrome — อ่านรายการงาน + ไล่อัปเดตรายการที่ใช้โปรไฟล์ (ใช้ใน API เท่านั้น)
 * ดูกติกาที่ lib/chrome-profiles.ts
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyChromeProfileToSub, type ChromeProfileInput } from "@/lib/chrome-profiles";

const SUB_COLS = "id, name, type, chrome_profile, account_email, chrome_profile_dir, chrome_profile_url, members";

type SubRow = {
  id: string; name: string; type: string | null;
  chrome_profile: string; account_email: string; chrome_profile_dir: string; chrome_profile_url: string;
  members: unknown;
};

/** รายการ "งาน" ทั้งหมด (ไม่รวมส่วนตัว — ส่วนตัวเป็นของแต่ละคน ทะเบียนกลางไม่ไปแตะ) */
export async function loadWorkSubs(db: SupabaseClient): Promise<{ rows: SubRow[]; error: string | null }> {
  const { data, error } = await db.from("subscriptions").select(SUB_COLS);
  if (error) return { rows: [], error: error.message };
  // กรองใน JS (type เป็น null ได้ — .neq จะตัดแถว null ทิ้ง)
  return { rows: ((data ?? []) as SubRow[]).filter((r) => r.type !== "personal"), error: null };
}

/**
 * อัปเดตทุกรายการงานที่ใช้ชื่อเล่น `oldNick` ให้เป็นค่าตามโปรไฟล์ `p`
 * คืนชื่อรายการที่เปลี่ยน (ไว้บอกผู้ใช้ + audit) · แถวที่เขียนไม่ผ่านนับใน failed (ไม่ล้มทั้งหมด)
 */
export async function propagateChromeProfile(db: SupabaseClient, oldNick: string, p: ChromeProfileInput)
  : Promise<{ updated: string[]; failed: string[]; error: string | null }> {
  const { rows, error } = await loadWorkSubs(db);
  if (error) return { updated: [], failed: [], error };
  const updated: string[] = [], failed: string[] = [];
  const now = new Date().toISOString();
  for (const r of rows) {
    const patch = applyChromeProfileToSub(r, oldNick, p);
    if (!patch) continue;
    const { error: e } = await db.from("subscriptions").update({ ...patch, updated_at: now }).eq("id", r.id);
    (e ? failed : updated).push(r.name);
  }
  return { updated, failed, error: null };
}
