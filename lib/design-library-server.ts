/**
 * 📚 Design Library — ตัวอ่านข้อมูลฝั่งเซิร์ฟเวอร์ที่หลาย API ใช้ร่วม (bundle · cost · send-to-sheet)
 *   loadMaterials  = หน่วยจริง (uoms.name) + หน้าผ้าของ SKU — ไม่มีราคา
 *   loadCostPrices = ราคาทุน standard_price — ผู้เรียกต้องเช็ก products.cost.view เองก่อน
 *   loadCalcRows   = ค่าคิดผ้า bom_calc_settings (ตัวเดียวกับใบตีราคา)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import type { MaterialInfo } from "@/lib/design-library-cost";

type Admin = ReturnType<typeof supabaseAdmin>;

export async function loadMaterials(admin: Admin, ids: string[]): Promise<Record<string, MaterialInfo>> {
  if (!ids.length) return {};
  // หน่วย = uoms.name ของ SKU (ราคาทุน standard_price เป็นราคาต่อหน่วยนี้) — purchase_uom_en ยังว่างทุกแถว
  const { data } = await admin.from("skus_v2").select("id, code, name_th, fabric_width_cm, uom:uoms!skus_v2_uom_id_fkey(name)").in("id", ids);
  const out: Record<string, MaterialInfo> = {};
  for (const r of (data ?? []) as unknown as { id: string; code: string; name_th: string | null; fabric_width_cm: number | null; uom: { name: string | null } | { name: string | null }[] | null }[]) {
    const u = Array.isArray(r.uom) ? r.uom[0] : r.uom;
    out[r.id] = { code: r.code, name: r.name_th ?? r.code, uom: u?.name ?? null, face_width_cm: Number(r.fabric_width_cm) > 0 ? Number(r.fabric_width_cm) : null };
  }
  return out;
}

/** ราคาทุน (>0) ตาม sku_id · error = null (ให้ผู้เรียกบอกผู้ใช้) */
export async function loadCostPrices(admin: Admin, ids: string[]): Promise<Record<string, number> | null> {
  if (!ids.length) return {};
  const { data, error } = await admin.from("skus_v2").select("id, standard_price").in("id", ids);
  if (error) return null;
  const prices: Record<string, number> = {};
  for (const r of (data ?? []) as { id: string; standard_price: number | null }[]) if (Number(r.standard_price) > 0) prices[r.id] = Number(r.standard_price);
  return prices;
}

export const CALC_SELECT = "material_type, default_face_width_cm, loss_percent, uom, cm_per_unit";
export async function loadCalcRows(admin: Admin) {
  const { data } = await admin.from("bom_calc_settings").select(CALC_SELECT).eq("is_active", true);
  return data ?? [];
}
