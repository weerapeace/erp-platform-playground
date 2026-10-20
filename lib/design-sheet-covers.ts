/**
 * รูปปกของใบงานออกแบบ (ของกลาง · ฝั่งเซิร์ฟเวอร์) — รูปแรกจากระบบแนบไฟล์กลาง (erp_playground_attachments)
 * เรียง: รูปหลัก → ลำดับ → เก่าก่อน · ข้ามไฟล์ที่ไม่ใช่รูป
 * ใช้: รายการใบงาน (/api/design-sheets) + อีเมลรายงานงานค้าง (lib/email-report)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

export async function designSheetCoverMap(admin: ReturnType<typeof supabaseAdmin>, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await admin.from("erp_playground_attachments")
    .select("entity_id, public_url, content_type, is_primary, sort_order, created_at")
    .eq("entity_type", "design_sheet").in("entity_id", ids)
    .order("is_primary", { ascending: false }).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  for (const a of (data ?? []) as Array<Record<string, unknown>>) {
    const eid = String(a.entity_id);
    const ct = (a.content_type as string) ?? "";
    if (!ct.startsWith("image/")) continue;
    if (!map.has(eid)) map.set(eid, String(a.public_url));
  }
  return map;
}
