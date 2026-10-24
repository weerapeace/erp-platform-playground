/**
 * รหัสวัตถุดิบของบรรทัดใบขอซื้อ (purchase_requests_v2) — ใช้จับคู่กับ mo_material_summary.component_sku
 * เพื่อนับว่าใบสั่งผลิต "ขอซื้อแล้ว" เท่าไร
 *
 * ใบขอซื้อเกิดได้ 2 ทาง → เก็บรหัสไว้คนละที่:
 *   1) แท็บ "ใบสั่งผลิต" → item_name = "[รหัส] ชื่อ" (ไม่มี item_sku_id)
 *   2) การ์ดสินค้าปกติ + เลือกเหตุผลเป็นใบสั่งผลิต → item_name = ชื่อเฉย ๆ แต่มี item_sku_id
 * เดิมอ่านแค่แบบ 1 → แบบ 2 ไม่ถูกนับ ใบงานยังขึ้น "ต้องซื้อ" ทั้งที่ขอไปแล้ว (ของจริง: 42 คู่ใน 31 ใบงาน)
 * ⚠️ server-side เท่านั้น (ใช้ supabaseAdmin)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PrLineRef = { item_name?: unknown; item_sku_id?: unknown };

/** คืนฟังก์ชัน row → รหัสวัตถุดิบ (ลำดับ: [รหัส] ในชื่อ → รหัสจาก item_sku_id → ชื่อเต็มแบบเดิม) */
export async function prLineCodeResolver(admin: SupabaseClient, rows: PrLineRef[]): Promise<(row: PrLineRef) => string> {
  const prefixOf = (row: PrLineRef) => /^\[([^\]]+)\]/.exec(String(row.item_name ?? ""))?.[1] ?? null;
  const ids = [...new Set(rows.filter((r) => !prefixOf(r) && r.item_sku_id).map((r) => String(r.item_sku_id)))];
  const codeById = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin.from("skus_v2").select("id, code").in("id", ids.slice(i, i + 300));
    for (const s of (data ?? []) as { id: string; code: string | null }[]) if (s.code) codeById.set(String(s.id), s.code);
  }
  return (row) => prefixOf(row) ?? (row.item_sku_id ? codeById.get(String(row.item_sku_id)) : undefined) ?? String(row.item_name ?? "");
}
