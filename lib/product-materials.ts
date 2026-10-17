/**
 * 🧵 วัสดุ + หน้าวัสดุบนเว็บร้าน (ของกลาง · pure ใช้ได้ทั้ง API และ test)
 *   ตาราง product_materials (ชื่อ/ชื่ออังกฤษ/slug/คำเรียกอื่น/รูป/คำอธิบาย/วิธีดูแล 2 ภาษา)
 *   เว็บร้าน: ชื่อวัสดุ (หรือคำเรียกอื่น) ที่อยู่ในคำอธิบายสินค้า → ลิงก์ /materials/<slug> อัตโนมัติ
 *   ลิงก์เฉพาะวัสดุที่เปิดใช้ + มีคำอธิบายแล้ว (กันลูกค้าเจอหน้าว่าง)
 * ใช้ที่: app/api/public/storefront/products (materialLinks) · app/api/public/storefront/materials (หน้าวัสดุ)
 */

export type MaterialRow = {
  id: string;
  name: string;
  name_en?: string | null;
  slug: string;
  aliases?: string | null;
  image_key?: string | null;
  description?: string | null;
  description_en?: string | null;
  care?: string | null;
  care_en?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

/** คอลัมน์ที่ส่งออกเว็บได้ (ไม่มีข้อมูลภายใน) */
export const MATERIAL_SELECT = "id, name, name_en, slug, aliases, image_key, description, description_en, care, care_en, sort_order, is_active";

const s = (v: unknown) => String(v ?? "").trim();

/** มีหน้าวัสดุให้ลิงก์ไหม (เปิดใช้ + มีคำอธิบายภาษาใดภาษาหนึ่ง) */
export const hasMaterialPage = (m: MaterialRow): boolean => m.is_active !== false && !!s(m.slug) && !!(s(m.description) || s(m.description_en));

/** คำที่ใช้จับในคำอธิบาย: ชื่อ + ชื่ออังกฤษ + คำเรียกอื่น (คั่นจุลภาค) · ตัดซ้ำ · สั้นกว่า 2 ตัวอักษรไม่ใช้ (กันจับมั่ว) */
export function materialTerms(m: MaterialRow): string[] {
  const all = [m.name, m.name_en, ...s(m.aliases).split(/[,\n]/)].map(s).filter((x) => x.length >= 2);
  const seen = new Set<string>();
  return all.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export type MaterialLink = { slug: string; terms: string[] };

/** วัสดุที่มีหน้า + ถูกพูดถึงในข้อความใดข้อความหนึ่ง (ไทย/อังกฤษ) → รายการลิงก์ให้เว็บ (ไม่มี = []) */
export function findMaterialLinks(texts: (string | null | undefined)[], mats: MaterialRow[]): MaterialLink[] {
  const hay = texts.map((t) => s(t).toLowerCase()).filter(Boolean);
  if (!hay.length) return [];
  const out: MaterialLink[] = [];
  for (const m of mats) {
    if (!hasMaterialPage(m)) continue;
    const terms = materialTerms(m);
    if (terms.some((t) => hay.some((h) => h.includes(t.toLowerCase())))) out.push({ slug: s(m.slug), terms });
  }
  return out;
}

/** ข้อมูลหน้าวัสดุที่ส่งออกเว็บ (คำอธิบายไม่ว่าง · รูป = URL) — เว็บหน้า /en สลับ <key>_en เอง */
export type PublicMaterial = {
  slug: string;
  name: string;
  name_en?: string;
  description?: string;
  description_en?: string;
  care?: string;
  care_en?: string;
  image?: string;
  terms: string[];
};

export function publicMaterial(m: MaterialRow, imageUrl: (key: string) => string): PublicMaterial {
  const out: PublicMaterial = { slug: s(m.slug), name: s(m.name), terms: materialTerms(m) };
  for (const k of ["name_en", "description", "description_en", "care", "care_en"] as const) if (s(m[k])) out[k] = s(m[k]);
  if (s(m.image_key)) out.image = imageUrl(s(m.image_key));
  return out;
}
