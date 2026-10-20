/**
 * 🗂 จัดหมวดสินค้าบนเว็บแบบเร็ว (ของกลาง · pure) — หน้า "สินค้าบนเว็บ" มุมมอง 🗂 จัดหมวด (components/website-category-sorter)
 *   ขั้น 1 ⚡ ใส่หมวดหลักทีเดียวจากหมวดใน ERP — เดาหมวดเว็บจากชื่อหมวด ERP (guessWebCategory) · กฎที่ตั้งไว้แล้ว (field_map.category.rules) มาก่อน
 *   ขั้น 2 🗂 กระดาน — กองสินค้าตามหมวด (boardNodes/inNode) · ย้ายไปหมวดปลายทาง (moveToTarget) · ย้อนได้
 * กติกาเดียวกับช่อง "หมวดบนเว็บ" ในตั้งค่าเว็บของสินค้า: ตัวแรก = หมวดหลัก · อยู่หมวดย่อย = ใส่หมวดแม่คู่ไปด้วย (แม่ก่อนลูก)
 * ต้นไม้หมวด 2 ชั้นใช้ของกลาง lib/website-category-tree
 */
import { topCategories, childCategories, parentCategory, familyKeys, type CatNode } from "@/lib/website-category-tree";

export type SortCat = CatNode & { icon?: string };

/** หมวดแม่ของหมวดนี้ (ชั้นบน = ตัวเอง) */
export const mainOf = (cats: SortCat[], key: string): string => parentCategory(cats, key)?.key ?? key;

/** คำในชื่อหมวด ERP → คำที่น่าจะอยู่ในรหัส/ชื่อหมวดเว็บ (ลำดับสำคัญ: กระเป๋าสตางค์ ก่อน กระเป๋า) */
const HINTS: [RegExp, string][] = [
  [/กระเป๋าสตางค์|wallet|purse/i, "wallet"],
  [/เข็มขัด|belt/i, "belt"],
  [/พวงกุญแจ|key\s*chain|key\s*ring/i, "keychain"],
  [/ของขวัญ|gift/i, "gift"],
  [/accessor|อุปกรณ์เสริม|เครื่องประดับ/i, "accessor"],
  [/กระเป๋า|bag/i, "bag"],
  [/เสื้อผ้า|cloth|apparel/i, "cloth"],
];
const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, " ").trim();

/**
 * เดาหมวดเว็บจากชื่อหมวด ERP — ชื่อตรงกันเป๊ะก่อน → คำใบ้ (HINTS) หาในรหัส/ชื่อหมวด (ชั้นบนก่อน) · ไม่เจอ = ""
 */
export function guessWebCategory(erpName: string, cats: SortCat[]): string {
  const n = norm(erpName);
  if (!n) return "";
  const exact = cats.find((c) => norm(c.label) === n || norm(c.key) === n);
  if (exact) return exact.key;
  const tops = topCategories(cats);
  const order = [...tops, ...cats.filter((c) => !tops.includes(c))];
  for (const [re, word] of HINTS) {
    if (!re.test(erpName)) continue;
    const hit = order.find((c) => norm(c.key).includes(word) || norm(c.label).includes(word));
    if (hit) return hit.key;
  }
  return "";
}

/** ใส่หมวดหลัก — หมวดหลักขึ้นก่อน คงหมวดอื่นไว้ */
export function withMain(current: string[], mainKey: string): string[] {
  return [mainKey, ...current.filter((k) => k !== mainKey)];
}

/** ย้ายเข้าหมวดย่อย: ตัดหมวดย่อยอื่นของแม่เดียวกันออก · ใส่ [แม่, ลูก] ไว้หน้า (แม่ = หมวดหลัก) · หมวดอื่นคงไว้ */
export function withSub(current: string[], subKey: string, cats: SortCat[]): string[] {
  const parent = mainOf(cats, subKey);
  if (parent === subKey) return withMain(current, subKey);
  const siblings = new Set(childCategories(cats, parent).map((c) => c.key));
  const rest = current.filter((k) => k !== parent && !siblings.has(k));
  const parentWasMain = current[0] === parent || !current.length || !current.some((k) => mainOf(cats, k) !== parent);
  return parentWasMain ? [parent, subKey, ...rest] : [...rest, parent, subKey];
}

/** เอาหมวดย่อยของแม่นี้ออก (กลับไป "ยังไม่มีหมวดย่อย") */
export function withoutSubs(current: string[], mainKey: string, cats: SortCat[]): string[] {
  const subs = new Set(childCategories(cats, mainKey).map((c) => c.key));
  return current.filter((k) => !subs.has(k));
}

/** เพิ่มหมวดแบบป้าย (หมวดที่ไม่มีหมวดย่อย เช่น Gifts / Men / Women) — มีแล้ว = คงเดิม */
export function addCat(current: string[], key: string): string[] {
  return current.includes(key) ? current : [...current, key];
}

export const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** สินค้าที่ "ยังไม่ได้จัดหมวดเอง" (ขั้น 1 ใส่ให้) — ไม่เคยตั้งหลายหมวด/ตั้งเป็นว่าง และไม่มีหมวดแบบเดิม */
export const isUnsorted = (l: { webCategories: string[] | null; webCategory?: string }) => !(l.webCategories ?? []).length && !(l.webCategory ?? "").trim();

/** หมวดที่จัดไว้แล้วของสินค้า (กระดานใช้ค่านี้) — ยังไม่ได้จัด = [] (แม้เว็บจะใช้กฎ/ค่าเริ่มต้นใส่ให้อยู่) */
export const sortedCats = (l: { webCategories: string[] | null; webCategory?: string; categories: string[] }): string[] =>
  isUnsorted(l) ? [] : l.webCategories?.length ? l.webCategories : l.categories;

/** ขั้น 1: จัดกลุ่มสินค้าที่ยังไม่ได้จัด ตามชื่อหมวด ERP (ไม่มีหมวด ERP = "") เรียงจากมากไปน้อย */
export function groupByErp<T extends { erpCategory?: string | null }>(items: T[]): { name: string; items: T[] }[] {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = (it.erpCategory ?? "").trim();
    m.set(k, [...(m.get(k) ?? []), it]);
  }
  return [...m.entries()].map(([name, list]) => ({ name, items: list })).sort((a, b) => (a.name ? 0 : 1) - (b.name ? 0 : 1) || b.items.length - a.items.length);
}

/* ───────── ขั้น 2 กระดาน ───────── */

/** กองบนกระดาน: "__none" = ยังไม่ได้จัด · "<หมวด>" = ทั้งหมวด (รวมหมวดย่อย) · "__nosub:<แม่>" = อยู่แม่แต่ยังไม่มีหมวดย่อย */
export const NONE = "__none";
export const nosubNode = (mainKey: string) => `__nosub:${mainKey}`;
export const nodeMain = (node: string): string | null => (node.startsWith("__nosub:") ? node.slice(8) : null);

/** สินค้านี้อยู่ในกองนี้ไหม (list = sortedCats ของสินค้า) */
export function inNode(list: string[], node: string, cats: SortCat[]): boolean {
  if (node === NONE) return !list.length;
  const m = nodeMain(node);
  if (m) {
    const subs = childCategories(cats, m).map((c) => c.key);
    return list.includes(m) && !list.some((k) => subs.includes(k));
  }
  const fam = familyKeys(cats, node);
  return list.some((k) => fam.includes(k));
}

/** ปลายทางที่ย้ายได้ (ชิปมีเลข 1–9) — กองยังไม่ได้จัด = หมวดชั้นบน · อยู่ในหมวดที่มีหมวดย่อย = หมวดย่อยของแม่นั้น · หมวดป้าย = หมวดชั้นบนอื่น */
export function quickTargets(node: string, cats: SortCat[]): string[] {
  const tops = topCategories(cats).map((c) => c.key);
  if (node === NONE) return tops;
  const m = nodeMain(node) ?? mainOf(cats, node);
  const subs = childCategories(cats, m).map((c) => c.key);
  return subs.length ? subs.filter((k) => k !== node) : tops.filter((k) => k !== m);
}

/**
 * ย้ายสินค้า 1 ตัวไปปลายทาง (from = กองที่อยู่ตอนนี้)
 *   หมวดย่อย → withSub · กองยังไม่มีหมวดย่อย → withoutSubs · กองยังไม่ได้จัด → [] (เอาออกทุกหมวด)
 *   หมวดหลักที่มีหมวดย่อย: จากกองหมวดหลักอื่น = แทนหมวดหลักเดิม (ทั้งกลุ่ม) · ไม่งั้น = ขึ้นเป็นหมวดหลัก
 *   หมวดป้าย (ชั้นบน ไม่มีหมวดย่อย): จากกองป้ายอื่น = แทนป้ายเดิม · ไม่งั้น = เพิ่มป้าย (คงหมวดเดิม)
 */
export function moveToTarget(list: string[], from: string, target: string, cats: SortCat[]): string[] {
  if (target === NONE) return [];
  const tm = nodeMain(target);
  if (tm) return withoutSubs(list.includes(tm) ? list : withMain(list, tm), tm, cats);
  if (mainOf(cats, target) !== target) return withSub(list, target, cats);
  const fromMain = from === NONE ? null : nodeMain(from) ?? mainOf(cats, from);
  const hasKids = (k: string) => childCategories(cats, k).length > 0;
  if (fromMain && fromMain !== target && hasKids(fromMain) === hasKids(target)) {
    const drop = new Set(familyKeys(cats, fromMain));
    const rest = list.filter((k) => !drop.has(k));
    return hasKids(target) ? withMain(rest, target) : list[0] && drop.has(list[0]) ? [target, ...rest] : addCat(rest, target);
  }
  return hasKids(target) ? withMain(list, target) : addCat(list, target);
}

/** เอาออกจากกองนี้ (✕) — หมวดหลัก = ทั้งกลุ่ม · หมวดย่อย = เหลือแม่ · กอง "ยังไม่มีหมวดย่อย" = ทั้งแม่ */
export function removeFromNode(list: string[], node: string, cats: SortCat[]): string[] {
  if (node === NONE) return list;
  const m = nodeMain(node);
  const drop = new Set(m ? [m] : mainOf(cats, node) === node ? familyKeys(cats, node) : [node]);
  return list.filter((k) => !drop.has(k));
}
