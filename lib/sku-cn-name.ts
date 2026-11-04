/**
 * ของกลางฝั่ง server — เติม "ชื่อจีน" ให้สินค้า (skus_v2.name_cn) จากแหล่งที่เป็นชื่อจีนจริง
 *   • บิลร้านจีนที่คนยืนยันคู่แล้ว (lib/seller-bill → ชื่อ + สเปกตามบิล เช่น "狗扣 9mm 银色")
 *   • การ์ด Taobao ที่จับคู่กับสินค้าแล้ว (app/api/taobao-products → ชื่อสินค้า + ตัวเลือกจีน)
 * กติกา: เติมเฉพาะสินค้าที่ "ยังไม่มีชื่อจีน" — ไม่ทับชื่อที่มีอยู่ (คนพิมพ์เอง/ใบ PO ร้านจีน) · ลงประวัติทุกตัว
 * ชื่อจีนนี้ใช้ต่อที่ ใบ PO ร้านจีน (/purchasing/orders) และช่วยจับคู่บิลร้านครั้งหน้า (lib/seller-bill-match)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAudit } from "@/lib/audit";

type Admin = SupabaseClient;
type Row = Record<string, unknown>;
const str = (v: unknown) => String(v ?? "").trim();
const hasCn = (s: string) => /[一-鿿]/.test(s);
export const CN_NAME_MAX = 200;

/** ชื่อจีนจากการ์ด Taobao = ชื่อสินค้า + ตัวเลือกแรก (เช่น "…拉锁头 黄色 [5个装]") · ไม่มีตัวจีน = null */
export function taobaoCnName(row: { original_name?: unknown; variants?: unknown }): string | null {
  const v0 = Array.isArray(row.variants) ? str((row.variants[0] as Row | undefined)?.originalName) : "";
  const name = `${str(row.original_name)} ${v0}`.replace(/\s+/g, " ").trim().slice(0, CN_NAME_MAX);
  return name && hasCn(name) ? name : null;
}

/** ชื่อจีนบนสินค้าหลายตัว → Map (เฉพาะตัวที่มีชื่อ) */
export async function loadSkuCnNames(admin: Admin, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const uniq = [...new Set(ids.filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await admin.from("skus_v2").select("id, name_cn").in("id", uniq.slice(i, i + 300));
    for (const r of (data ?? []) as Row[]) if (str(r.name_cn)) m.set(String(r.id), str(r.name_cn));
  }
  return m;
}

/** เติมชื่อจีนให้สินค้าที่ยังไม่มี → คืนจำนวนที่เติม (สินค้าซ้ำในรายการ = ใช้ชื่อแรก) */
export async function fillSkuCnNames(
  admin: Admin, items: { sku_id: string; name_cn: string | null }[],
  actor: { id: string | null; name: string | null }, source: "seller_bill" | "taobao_products", ref: string | null,
): Promise<number> {
  const want = new Map<string, string>();
  for (const it of items) {
    const name = str(it.name_cn).slice(0, CN_NAME_MAX);
    if (it.sku_id && name && hasCn(name) && !want.has(it.sku_id)) want.set(it.sku_id, name);
  }
  if (want.size === 0) return 0;
  const have = await loadSkuCnNames(admin, [...want.keys()]);
  let n = 0;
  for (const [skuId, name] of want) {
    if (have.has(skuId)) continue;
    const { error } = await admin.from("skus_v2").update({ name_cn: name }).eq("id", skuId);
    if (error) { console.error("[sku-cn-name] fill", skuId, error.message); continue; }
    n++;
    await writeAudit(admin, { action: "update", entityType: "skus_v2", entityId: skuId, actorId: actor.id, actorName: actor.name,
      metadata: { field: "name_cn", old_value: null, new_value: name, source, ref } });
  }
  return n;
}
