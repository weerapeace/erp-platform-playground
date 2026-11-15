/**
 * 🖼 รูปของ Parent SKU ให้ AI ดู (ของกลางฝั่งเซิร์ฟเวอร์) — ไล่ 4 ชั้นจนครบเพดาน
 *   ① รูปปก ② แกลเลอรี Parent ③ รูป Description (มักเป็นรูปสเปค/อินโฟกราฟิก) ④ รูปของ SKU ลูก
 *   (ของจริงแกลเลอรี Parent มักมีแค่ 1 รูป — ถ้าดึงชั้นเดียว AI แทบไม่เห็นอะไร)
 * ใช้ที่: /api/ai/product-detail · /api/ai/desc-highlights
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export async function parentImageKeys(admin: SupabaseClient, parentId: string, cover: string | null, max: number): Promise<string[]> {
  const assetIdsInOrder: string[] = [];
  const pushUsages = (rows: { asset_id: string | null }[] | null) => {
    for (const r of rows ?? []) if (r.asset_id && !assetIdsInOrder.includes(r.asset_id)) assetIdsInOrder.push(r.asset_id);
  };
  const [uParent, uDesc] = await Promise.all([
    admin.from("asset_usages").select("asset_id, sort_order").eq("module", "parent_sku").eq("record_id", parentId)
      .order("sort_order", { ascending: true }).limit(max),
    admin.from("asset_usages").select("asset_id, sort_order").eq("module", "parent_sku_description").eq("record_id", parentId)
      .order("sort_order", { ascending: true }).limit(max),
  ]);
  pushUsages(uParent.data as { asset_id: string | null }[] | null);
  pushUsages(uDesc.data as { asset_id: string | null }[] | null);

  if (assetIdsInOrder.length < max) {
    const { data: kids } = await admin.from("skus_v2").select("id").eq("parent_sku_id", parentId).limit(max);
    const kidIds = ((kids ?? []) as { id: string }[]).map((k) => k.id);
    if (kidIds.length) {
      const { data: uKids } = await admin.from("asset_usages").select("asset_id, sort_order")
        .eq("module", "product_sku").in("record_id", kidIds)
        .order("sort_order", { ascending: true }).limit(max);
      pushUsages(uKids as { asset_id: string | null }[] | null);
    }
  }

  let keys: string[] = [];
  if (assetIdsInOrder.length) {
    const { data: assets } = await admin.from("assets").select("id, r2_key").in("id", assetIdsInOrder.slice(0, max * 2));
    const byId = new Map(((assets ?? []) as { id: string; r2_key: string | null }[]).map((a) => [a.id, a.r2_key]));
    keys = assetIdsInOrder.map((id) => byId.get(id)).filter((k): k is string => !!k);
  }
  if (cover) keys = [cover, ...keys.filter((k) => k !== cover)];
  return [...new Set(keys)].slice(0, max);
}
