/**
 * ร้านเว็บที่ตั้งหมวดของตัวเองแล้ว (แถว "Website" แยกรายร้าน ในหน้าจับคู่หมวดหมู่แพลตฟอร์ม) — ใช้ร่วม:
 *   /api/platform-category-map (GET) · /api/platform-category-map/autofill (ปุ่มใส่ให้เอง)
 * ร้านที่ยังใช้หมวดตั้งต้นของระบบ = ไม่โชว์ · centralRules = หมวดกลาง → รหัสหมวดเว็บ (shops.field_map.category.centralRules)
 */
import { normalizeFieldMap } from "@/lib/website-field-map";
import { categoryPathLabel } from "@/lib/website-category-tree";

export type WebShopRow = { id: string; name: string; slug: string; field_map: unknown };
export type WebShopCats = {
  id: string;
  name: string;
  slug: string;
  categories: { key: string; label: string; path: string; parent: string | null }[];
  centralRules: Record<string, string>;
};

export function webShopsOf(rows: WebShopRow[]): WebShopCats[] {
  return rows
    .filter((s) => {
      const raw = (s.field_map ?? {}) as { categories?: unknown };
      return Array.isArray(raw.categories) && raw.categories.length > 0;
    })
    .map((s) => {
      const fm = normalizeFieldMap(s.field_map);
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        categories: fm.categories.map((c) => ({ key: c.key, label: c.label, path: categoryPathLabel(fm.categories, c.key), parent: c.parent ?? null })),
        centralRules: fm.category.centralRules,
      };
    });
}
