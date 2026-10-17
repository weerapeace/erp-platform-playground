/**
 * 📂 หมวดย่อย (ต้นไม้หมวด 2 ชั้น: หมวด → หมวดย่อย) — pure · ไม่มี import
 *   ⚠️ มิเรอร์ทั้งไฟล์ไป storefront src/lib/category-tree.ts — แก้ที่นี่แล้วคัดลอก
 * ข้อมูล: แต่ละหมวดมี parent = รหัสหมวดแม่ (ว่าง = หมวดชั้นบน) · เก็บใน field_map.categories (ลำดับใน array = ลำดับที่โชว์)
 * กฎ: แม่ต้องเป็นหมวดชั้นบนที่มีอยู่จริง (ไม่ซ้อนเกิน 2 ชั้น · ไม่ชี้ตัวเอง) — ไม่ผ่าน = กลายเป็นหมวดชั้นบน
 * สินค้าในหมวดย่อย = อยู่ในหมวดแม่ด้วย (withParentCategories — ใส่ให้ตอนส่งข้อมูลสินค้าให้เว็บ)
 */
export interface CatNode {
  key: string;
  label: string;
  parent?: string | null;
}

/** ล้างแม่ที่ใช้ไม่ได้ (ไม่มีจริง / ตัวเอง / แม่เป็นหมวดย่อยอยู่แล้ว) */
export function cleanParents<T extends CatNode>(cats: T[]): T[] {
  const raw = new Map(cats.map((c) => [c.key, c.parent || null]));
  return cats.map((c) => {
    const p = c.parent || null;
    const ok = !!p && p !== c.key && raw.has(p) && !raw.get(p);
    return ok ? c : c.parent ? { ...c, parent: null } : c;
  });
}

export const isTopCategory = (c: CatNode) => !c.parent;
export const topCategories = <T extends CatNode>(cats: T[]): T[] => cats.filter((c) => !c.parent);
export const childCategories = <T extends CatNode>(cats: T[], key: string): T[] => cats.filter((c) => c.parent === key);
export const parentCategory = <T extends CatNode>(cats: T[], key: string): T | null => {
  const p = cats.find((c) => c.key === key)?.parent;
  return p ? cats.find((c) => c.key === p) ?? null : null;
};
/** หมวดนี้ + หมวดย่อยทั้งหมด */
export const familyKeys = (cats: CatNode[], key: string): string[] => [key, ...childCategories(cats, key).map((c) => c.key)];
/** ชื่อเต็ม "แม่ › ย่อย" (ใช้ในตัวเลือก/ชิป) */
export const categoryPathLabel = (cats: CatNode[], key: string): string => {
  const c = cats.find((x) => x.key === key);
  if (!c) return key;
  const p = c.parent ? cats.find((x) => x.key === c.parent) : null;
  return p ? `${p.label} › ${c.label}` : c.label;
};

/** ชื่อในตัวเลือก (dropdown/ชิป) — หมวดย่อยมี ↳ นำหน้า (รายการเรียงแบบต้นไม้อยู่แล้ว ลูกต่อท้ายแม่) */
export const categoryChoiceLabel = (c: { label: string; parent?: string | null }): string => (c.parent ? `↳ ${c.label}` : c.label);

/** เรียงแบบต้นไม้: หมวดชั้นบนตามลำดับ ตามด้วยหมวดย่อยของมัน (depth 0/1) */
export function categoryTree<T extends CatNode>(cats: T[]): { cat: T; depth: 0 | 1 }[] {
  const out: { cat: T; depth: 0 | 1 }[] = [];
  for (const c of cats) {
    if (c.parent) continue;
    out.push({ cat: c, depth: 0 });
    for (const k of cats) if (k.parent === c.key) out.push({ cat: k, depth: 1 });
  }
  return out;
}
/** array ที่เรียงแบบต้นไม้แล้ว (เก็บลงฐานข้อมูลแบบนี้ → ลำดับตรงกับที่เห็น) */
export const flattenTree = <T extends CatNode>(cats: T[]): T[] => categoryTree(cats).map((r) => r.cat);

/**
 * ลากเรียงในมุมมองต้นไม้ (from/to = ลำดับแถวใน categoryTree)
 *   หมวดชั้นบน → ย้ายทั้งกลุ่ม (พร้อมหมวดย่อย) ไปที่ตำแหน่งกลุ่มเป้าหมาย
 *   หมวดย่อย → ย้ายได้เฉพาะในแม่เดิม (วางบนแม่ = ไปเป็นตัวแรก) · ข้ามแม่ = ใช้ช่อง "อยู่ใต้หมวด"
 */
export function reorderCategoryTree<T extends CatNode>(cats: T[], from: number, to: number): T[] {
  const rows = categoryTree(cats);
  const a = rows[from];
  const b = rows[to];
  if (!a || !b || from === to) return cats;
  const move = <X,>(arr: X[], i: number, j: number) => {
    const next = arr.slice();
    const [x] = next.splice(i, 1);
    next.splice(j, 0, x);
    return next;
  };
  const tops = topCategories(cats);
  if (a.depth === 0) {
    const targetTop = b.depth === 0 ? b.cat.key : b.cat.parent!;
    const i = tops.findIndex((c) => c.key === a.cat.key);
    const j = tops.findIndex((c) => c.key === targetTop);
    if (i < 0 || j < 0 || i === j) return cats;
    const order = move(tops, i, j);
    return order.flatMap((t) => [t, ...childCategories(cats, t.key)]);
  }
  const sibs = childCategories(cats, a.cat.parent!);
  const i = sibs.findIndex((c) => c.key === a.cat.key);
  const j = b.depth === 1 && b.cat.parent === a.cat.parent ? sibs.findIndex((c) => c.key === b.cat.key) : b.depth === 0 && b.cat.key === a.cat.parent ? 0 : -1;
  if (i < 0 || j < 0 || i === j) return cats;
  const newSibs = move(sibs, i, j);
  return tops.flatMap((t) => [t, ...(t.key === a.cat.parent ? newSibs : childCategories(cats, t.key))]);
}

/** หมวดของสินค้า + หมวดแม่ (ต่อท้าย · ไม่ซ้ำ · ตัวแรกยังเป็นหมวดหลักเดิม) — สินค้าในหมวดย่อยจึงขึ้นในหน้าหมวดแม่ด้วย */
export function withParentCategories(cats: CatNode[], keys: string[]): string[] {
  const parentOf = new Map(cats.map((c) => [c.key, c.parent || null]));
  const out = [...keys];
  for (const k of keys) {
    const p = parentOf.get(k);
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}
