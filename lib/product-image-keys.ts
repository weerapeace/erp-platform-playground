/**
 * 🖼 รูปของ Parent SKU ให้ AI ดู (ของกลางฝั่งเซิร์ฟเวอร์) — ไล่ 4 ชั้นจนครบเพดาน
 *   ① รูปปก ② แกลเลอรี Parent ③ รูป Description (มักเป็นรูปสเปค/อินโฟกราฟิก) ④ รูปของ SKU ลูก
 *   (ของจริงแกลเลอรี Parent มักมีแค่ 1 รูป — ถ้าดึงชั้นเดียว AI แทบไม่เห็นอะไร)
 * ใช้ที่: /api/ai/product-detail · /api/ai/desc-highlights
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ImageGroup = "parent" | "desc" | "sku";

/** แบบมีกลุ่ม (ป๊อป AI ร่างโชว์แยกกลุ่ม) — ลำดับเดียวกับ parentImageKeys: Parent (ปกก่อน) → Description → SKU ลูก */
export async function parentImageKeyGroups(admin: SupabaseClient, parentId: string, cover: string | null, max: number): Promise<{ key: string; group: ImageGroup }[]> {
  const ids: { id: string; group: ImageGroup }[] = [];
  const push = (rows: { asset_id: string | null }[] | null, group: ImageGroup) => {
    for (const r of rows ?? []) if (r.asset_id && !ids.some((x) => x.id === r.asset_id)) ids.push({ id: r.asset_id, group });
  };
  const [uParent, uDesc] = await Promise.all([
    admin.from("asset_usages").select("asset_id, sort_order").eq("module", "parent_sku").eq("record_id", parentId).order("sort_order", { ascending: true }).limit(max),
    admin.from("asset_usages").select("asset_id, sort_order").eq("module", "parent_sku_description").eq("record_id", parentId).order("sort_order", { ascending: true }).limit(max),
  ]);
  push(uParent.data as { asset_id: string | null }[] | null, "parent");
  push(uDesc.data as { asset_id: string | null }[] | null, "desc");
  const { data: kids } = await admin.from("skus_v2").select("id").eq("parent_sku_id", parentId).limit(max);
  const kidIds = ((kids ?? []) as { id: string }[]).map((k) => k.id);
  if (kidIds.length) {
    const { data: uKids } = await admin.from("asset_usages").select("asset_id, sort_order").eq("module", "product_sku").in("record_id", kidIds).order("sort_order", { ascending: true }).limit(max);
    push(uKids as { asset_id: string | null }[] | null, "sku");
  }
  let out: { key: string; group: ImageGroup }[] = [];
  if (ids.length) {
    const { data: assets } = await admin.from("assets").select("id, r2_key").in("id", ids.map((x) => x.id).slice(0, max * 3));
    const byId = new Map(((assets ?? []) as { id: string; r2_key: string | null }[]).map((a) => [a.id, a.r2_key]));
    out = ids.map((x) => ({ key: byId.get(x.id) ?? "", group: x.group })).filter((x) => !!x.key);
  }
  if (cover) out = [{ key: cover, group: "parent" as ImageGroup }, ...out.filter((x) => x.key !== cover)];
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.key) ? false : (seen.add(x.key), true))).slice(0, max);
}

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
