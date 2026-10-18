/**
 * 🏷️ แท็ก → หมวดบนเว็บ — ฝั่งเซิร์ฟเวอร์: โหลดแท็กของสินค้า + ความลึกของแท็ก แล้วคืนตัวคิดหมวดต่อสินค้า
 * ใช้ที่: API สินค้าหน้าร้าน · หน้าจัดเว็บ (listings) · ป๊อป 🔗 ของแท็ก · API กฎแท็ก (ใส่หมวดให้รุ่นที่มีอยู่)
 * ร้านไม่มีกฎแท็ก = ไม่ยิง query เพิ่มเลย (ไม่ช้าลง)
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { ancestorTagsOf } from "@/lib/tag-hierarchy";
import { tagRuleCategories } from "@/lib/website-tag-categories";

type Admin = ReturnType<typeof supabaseAdmin>;

export const PARENT_TAG_JUNCTION = "parent_skus_v2_product_family_m2m";
const CHUNK = 300;

export type TagContext = {
  /** แท็กของสินค้า (Parent SKU) */
  tagsOf: (parentId: string) => string[];
  /** ชั้นของแท็ก (0 = ชั้นบน · 1 = แท็กย่อย) */
  depthOf: (tagId: string) => number;
};

/** โหลดแท็กของสินค้าชุดหนึ่ง + ความลึกของแท็กทุกตัว */
export async function loadTagContext(sb: Admin, parentIds: string[]): Promise<TagContext> {
  const byParent = new Map<string, string[]>();
  const ids = [...new Set(parentIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await sb.from(PARENT_TAG_JUNCTION).select("src_id, tgt_id").in("src_id", ids.slice(i, i + CHUNK)).limit(20_000);
    for (const r of (data ?? []) as { src_id: string; tgt_id: string }[]) {
      const k = String(r.src_id);
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(String(r.tgt_id));
    }
  }
  const [{ data: tags }, { data: groups }] = await Promise.all([
    sb.from("product_families").select("id, name, group_id").eq("is_active", true),
    sb.from("product_family_groups").select("id, name, parent_group_id").eq("is_active", true),
  ]);
  const tagRows = ((tags ?? []) as { id: string; name: string; group_id: string | null }[]).map((t) => ({ ...t, id: String(t.id) }));
  const groupRows = ((groups ?? []) as { id: string; name: string; parent_group_id: string | null }[]).map((g) => ({ ...g, id: String(g.id) }));
  const depth = new Map<string, number>();
  for (const t of tagRows) depth.set(t.id, ancestorTagsOf(t.id, tagRows, groupRows, (x) => x.name).length);
  return { tagsOf: (pid) => byParent.get(pid) ?? [], depthOf: (tid) => depth.get(tid) ?? 0 };
}

/**
 * ตัวคิด "หมวดจากกฎแท็ก" ต่อสินค้า สำหรับร้านหนึ่ง — ร้านไม่มีกฎ = คืนตัวที่ตอบ undefined (ไม่ยิง query)
 * ส่งผลลัพธ์เข้า resolveProduct(..., tagCategories) / computeListingDisplay({ tagCategories })
 */
export async function loadTagCategoryResolver(
  sb: Admin,
  tagRules: Record<string, string> | undefined,
  parentIds: string[],
): Promise<(parentId: string) => string[] | undefined> {
  if (!tagRules || !Object.keys(tagRules).length || !parentIds.length) return () => undefined;
  const ctx = await loadTagContext(sb, parentIds);
  return (pid) => tagRuleCategories(tagRules, ctx.tagsOf(pid), ctx.depthOf);
}
