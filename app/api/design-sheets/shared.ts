/**
 * ของใช้ร่วมของ design-sheets API (แยกจาก route.ts — route ต้อง export แค่ handler)
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

export const DS_STATUSES = ["design", "sent_customer", "revising", "costing", "quoted", "approved", "sku_created", "cancelled"] as const;

/** สถานะถูกต้องไหม — เช็คกับระบบ Workflow กลาง (แก้เองได้ที่ /admin/workflows), ไม่มีข้อมูล workflow = ใช้ชุดในโค้ด */
export async function isValidDsStatus(admin: ReturnType<typeof supabaseAdmin>, status: string): Promise<boolean> {
  const { data } = await admin.from("erp_workflow_states").select("state_key")
    .eq("entity_type", "design_sheet").eq("state_key", status).limit(1);
  if ((data ?? []).length > 0) return true;
  const { count } = await admin.from("erp_workflow_states").select("id", { count: "exact", head: true }).eq("entity_type", "design_sheet");
  return (count ?? 0) === 0 && (DS_STATUSES as readonly string[]).includes(status);
}
