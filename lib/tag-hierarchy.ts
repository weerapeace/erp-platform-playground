/**
 * ลำดับชั้นแท็ก (product_families) — กฎกลางเรื่อง "แท็กแม่ ↔ แท็กย่อย" (ไฟล์ pure ใช้ได้ทั้งหน้าจอและ API)
 *
 * ข้อมูลไม่มีคอลัมน์ "แท็กแม่" ตรง ๆ — ผูกกันด้วยกลุ่ม + ชื่อ:
 *   แท็ก "กระเป๋า" อยู่ในกลุ่ม "หมวดหมู่สินค้า"  +  หมวดย่อย "↳ กระเป๋า" (ชื่อเดียวกัน) ใต้กลุ่มเดียวกัน
 *   → แท็กในหมวดย่อยนั้น (กระเป๋าเป้, กระเป๋าถือ) = แท็กย่อยของ "กระเป๋า"
 *
 * ใช้ที่: ตัวเลือกแท็กในฟอร์มสินค้า (relation-multi) · Tags Manager · ป๊อป AI เขียนรายละเอียด · ป๊อปจัดการแท็ก (tag-organizer)
 * ⚠️ ตัวกรองค้นหา (tag-filter) ไม่ใช้ "เลือกลูก = เลือกแม่" — จะทำให้ผลค้นหากว้างขึ้นผิดความตั้งใจ
 */

export type TagLike = { id: string; group_id?: string | null };
export type TagGroupLike = { id: string; name: string; parent_group_id: string | null };

/** ชื่อตรงกันไหม (ไม่สนช่องว่างหัวท้าย/ตัวพิมพ์) */
export const sameTagName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** หมวดย่อยที่ผูกกับแท็กแม่ = ชื่อเดียวกับแท็ก + อยู่ใต้กลุ่มที่แท็กนั้นอยู่ */
export function subGroupOfTag<G extends TagGroupLike>(tagName: string, tagGroupId: string | null | undefined, groups: G[]): G | null {
  if (!tagGroupId) return null;
  return groups.find((g) => g.parent_group_id === tagGroupId && sameTagName(g.name, tagName)) ?? null;
}

/** แท็กแม่ของหมวดย่อย = แท็กชื่อเดียวกันที่อยู่ในกลุ่มแม่ของหมวดย่อยนั้น */
export function parentTagOfGroup<T extends TagLike>(group: TagGroupLike, tags: T[], nameOf: (t: T) => string): T | null {
  if (!group.parent_group_id) return null;
  return tags.find((t) => t.group_id === group.parent_group_id && sameTagName(nameOf(t), group.name)) ?? null;
}

/** แท็กแม่ของแท็ก (null = ไม่ได้อยู่ในหมวดย่อยที่ผูกกับแท็กแม่) */
export function parentTagOf<T extends TagLike>(tagId: string, tags: T[], groups: TagGroupLike[], nameOf: (t: T) => string): T | null {
  const t = tags.find((x) => x.id === tagId);
  if (!t?.group_id) return null;
  const g = groups.find((x) => x.id === t.group_id);
  if (!g) return null;
  const p = parentTagOfGroup(g, tags, nameOf);
  return p && p.id !== tagId ? p : null;
}

/** แท็กแม่ไล่ขึ้นทุกชั้น (ใกล้สุดก่อน) — ปกติมีชั้นเดียว · กันวนด้วย seen */
export function ancestorTagsOf<T extends TagLike>(tagId: string, tags: T[], groups: TagGroupLike[], nameOf: (t: T) => string): T[] {
  const out: T[] = [];
  const seen = new Set<string>([tagId]);
  let cur = parentTagOf(tagId, tags, groups, nameOf);
  while (cur && !seen.has(cur.id)) {
    out.push(cur); seen.add(cur.id);
    cur = parentTagOf(cur.id, tags, groups, nameOf);
  }
  return out;
}
