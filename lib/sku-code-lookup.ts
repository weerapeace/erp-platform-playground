import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * ของกลาง — หา "สินค้าตัวจริง" (SKU) ให้แถวจัดซื้อที่ยังไม่ผูก SKU
 *
 * ปัญหาที่แก้: ใบขอซื้อ / บรรทัดใบสั่งซื้อ ที่เกิดจากใบสั่งงาน (BOM) จะมี item_sku_id = ว่าง
 * เก็บรหัสไว้ในชื่อแบบ "[A037-3/10MM#N] คอหมา 1 cm." เท่านั้น
 * → หน้าจอเลยดึงรูป/ลิงก์ซื้อ/รหัสร้าน/MOQ ของ SKU มาโชว์ไม่ได้ (ขึ้นกล่อง 📦 ทั้งที่ SKU มีรูปแล้ว)
 *
 * ใช้:
 *   const codeMap = await skuIdsByBracketCode(admin, rows.map(r => r.item_name));
 *   const skuIdOf = (r) => resolveSkuId(r.item_sku_id, r.item_name, codeMap);
 */

/** ถอดรหัสสินค้าที่อยู่หน้าชื่อ: "[A037-3/10MM#N] คอหมา 1 cm." → "A037-3/10MM#N" */
export function bracketCode(name: unknown): string | null {
  const m = /^\s*\[([^\]]+)\]/.exec(String(name ?? ""));
  const code = m ? m[1].trim() : "";
  return code || null;
}

/** รหัส (จากชื่อ) → sku id — ดึงเป็น batch ทีเดียว (เฉพาะแถวที่ยังไม่ผูก SKU) */
export async function skuIdsByBracketCode(
  admin: SupabaseClient,
  names: unknown[],
): Promise<Map<string, string>> {
  const codes = [...new Set(names.map(bracketCode).filter(Boolean) as string[])];
  const out = new Map<string, string>();
  for (let i = 0; i < codes.length; i += 300) {
    const chunk = codes.slice(i, i + 300);
    // รหัสซ้ำกันได้ (มีไม่กี่ตัว) → เรียงให้ตัว "ที่มีรูปปก" มาก่อน แล้วเก็บตัวแรกไว้ ผลลัพธ์จะคงที่ทุกครั้ง
    const { data } = await admin.from("skus_v2").select("id, code, cover_image_r2_key")
      .in("code", chunk).order("cover_image_r2_key", { ascending: true, nullsFirst: false });
    for (const s of (data ?? []) as Record<string, unknown>[]) {
      if (s.code && s.id && !out.has(String(s.code))) out.set(String(s.code), String(s.id));
    }
  }
  return out;
}

/** sku id ที่ควรใช้จริง: ผูกไว้แล้วใช้ตัวนั้น · ยังไม่ผูก → เดาจากรหัสในชื่อ */
export function resolveSkuId(
  itemSkuId: unknown,
  itemName: unknown,
  codeMap: Map<string, string>,
): string | null {
  if (itemSkuId) return String(itemSkuId);
  const code = bracketCode(itemName);
  return code ? (codeMap.get(code) ?? null) : null;
}
