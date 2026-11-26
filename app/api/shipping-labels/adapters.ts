// ทะเบียนตัวดึงใบปะหน้าจริงต่อแหล่งออเดอร์ (platform_orders.source) — ต้องตรงกับ LABEL_SOURCES ใน lib/shipping-label
// เพิ่ม TikTok/Lazada: เขียนตัวดึง (รับออเดอร์ร้านเดียวกัน คืนผลต่อใบ) แล้วใส่ที่นี่ + LABEL_SOURCES — API/หน้าจอไม่ต้องแก้
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LabelFetchResult } from "@/lib/shipping-label";
import { fetchShopeeLabels, type LabelOrderRow } from "../shopee/shipping-label";

export type { LabelOrderRow };
export type LabelAdapter = (admin: SupabaseClient, rows: LabelOrderRow[], userId: string | null) => Promise<LabelFetchResult[]>;

export const LABEL_ADAPTERS: Record<string, LabelAdapter> = {
  shopee_api: fetchShopeeLabels,
};
