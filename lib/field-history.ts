/**
 * ค่าเก่าของช่องข้อความ (ประวัติเวอร์ชัน entity_field_history) — ตัวอ่านเบา ๆ ไม่ดึงโค้ดอื่น (ใช้ในไฟล์ที่หน้าเว็บก็ import ได้ เช่น lib/line-create-payload)
 * ตัวจด/ย้อนเวอร์ชันเต็มอยู่ที่ lib/record-versions
 * ใช้: เช็กว่าร่างเป็น "สำเนาค่าเก่า" ไหม (lib/listing-description) · พลาด = [] (ไม่ทำให้หน้าล้ม)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof supabaseAdmin>;

/** ค่าเก่าทุกเวอร์ชันที่เก็บไว้ของช่อง 1 ช่อง (ใหม่ก่อน · ≤20) */
export async function loadFieldHistoryValues(admin: Admin, table: string, id: string, field: string): Promise<string[]> {
  try {
    const { data, error } = await admin.from("entity_field_history").select("old_value").eq("entity_type", table).eq("entity_id", id).eq("field_key", field).eq("kind", "field")
      .order("changed_at", { ascending: false }).limit(20);
    if (error) return [];
    return ((data ?? []) as { old_value: unknown }[]).map((r) => (typeof r.old_value === "string" ? r.old_value : "")).filter((x) => x.trim());
  } catch { return []; }
}
