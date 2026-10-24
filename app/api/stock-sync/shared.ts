/**
 * 🔄 ซิงค์สต๊อก — ของใช้ร่วมของ API ใน /api/stock-sync/* (ไม่ใช่ route · import ได้)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";

export type Admin = ReturnType<typeof supabaseAdmin>;

export type SyncChannel = {
  id: string; brand_id: string; provider: string; label: string;
  warehouse_id: string; buffer_qty: number; mode: string;
  last_import_at: string | null; last_import_by: string | null;
  last_import_summary: Record<string, unknown> | null;
  note: string | null; is_active: boolean;
};

/** เฟส 1: เปิดได้แค่ "ปิด" กับ "เทียบอย่างเดียว" — ส่งจริง/ทดลองส่ง รอเฟส 2 */
export const PHASE1_MODES = ["off", "compare"] as const;

export async function loadChannel(admin: Admin, id: unknown): Promise<SyncChannel | null> {
  if (!id || typeof id !== "string") return null;
  const { data } = await admin.from("stock_sync_channels").select("*").eq("id", id).maybeSingle();
  return (data as SyncChannel | null) ?? null;
}
