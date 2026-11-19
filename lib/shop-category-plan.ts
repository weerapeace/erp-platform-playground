/**
 * หมวดในร้าน — กติกากลาง (pure · ใช้ทั้งหน้าเว็บและหลังบ้าน · เทสต์ lib/__tests__/shop-category-plan.test.ts)
 * --------------------------------------------------------------------------
 * แผนต่อร้าน (แบรนด์ × แพลตฟอร์ม) = หมวด (platform_shop_categories) + สินค้าในหมวด (platform_shop_category_items)
 * ระบบจำ 2 อย่าง: "แผน" (name/sort_order/in_plan/deleted_at) กับ "สิ่งที่ติ๊กว่าทำในหลังร้านแล้ว" (on_shop/shop_name/shop_sort)
 *   เช็กลิสต์ = ส่วนต่างของ 2 อย่างนี้ → แก้แผนทีหลัง รายการที่ต้องไปกดโผล่เองเฉพาะส่วนที่ต่าง (ข้อเสนอ 1 ที่เจ้าของเลือก)
 *   ติ๊กว่าทำแล้ว = stepEffect() ปรับฝั่ง "ทำแล้ว" ให้ตรงแผน · ยกเลิกติ๊ก = ใส่ค่าก่อนหน้ากลับ (undoOf)
 * ⚠️ "บนร้าน" = ตามที่คนติ๊ก ไม่ใช่ข้อมูลจริงจากร้าน (Lazada/LINE/TikTok ไม่เปิด API หมวดในร้าน · Shopee เปิด แต่ร้านยังไม่ได้สิทธิ์)
 */

export const SHOP_CAT_NAME_MAX = 60;
/** Shopee รับชื่อหมวดในร้าน ≤ 40 ตัวอักษร (v2.shop_category) */
export const SHOP_CAT_NAME_WARN = 40;
const NEW_DAYS = 14;

export type ShopCat = {
  id: string; name: string; sort_order: number; central_category_id: string | null;
  on_shop: boolean; shop_name: string | null; shop_sort: number | null; deleted_at: string | null;
};
export type ShopCatItem = { category_id: string; parent_sku_id: string; sort_order: number; in_plan: boolean; on_shop: boolean };
export type ShopCatProduct = {
  id: string; code: string; name: string; cover: string | null;
  central_id: string | null; central_name: string | null;
  /** มีบนร้านนี้ (จับคู่รายการบนร้านที่ยังขายอยู่) */
  listed: boolean;
  /** วันที่เห็นบนร้านครั้งแรก (ISO) — ใช้แนะนำหมวด "สินค้าใหม่" */
  first_seen: string | null;
};

export type ShopCatStepKind = "create" | "rename" | "add" | "remove" | "delete" | "reorder";
export type ShopCatStep = { key: string; kind: ShopCatStepKind; categoryId: string | null; title: string; codes: string[] };

export type CatPatch = Partial<Pick<ShopCat, "on_shop" | "shop_name" | "shop_sort">>;
export type ItemPatch = Partial<Pick<ShopCatItem, "on_shop">>;
export type StepEffect = { cats: { id: string; patch: CatPatch }[]; items: { category_id: string; parent_sku_id: string; patch: ItemPatch }[] };

export const normCatName = (s: string) => s.replace(/\s+/g, " ").trim();

/** ตรวจชื่อหมวด — คืนข้อความผิด หรือ null · ซ้ำ = เทียบกับหมวดที่ยังไม่ลบในร้านเดียวกัน (ไม่สนตัวพิมพ์) */
export function validateCatName(name: string, cats: Pick<ShopCat, "id" | "name" | "deleted_at">[], selfId?: string | null): string | null {
  const n = normCatName(name);
  if (!n) return "ใส่ชื่อหมวดก่อน";
  if (n.length > SHOP_CAT_NAME_MAX) return `ชื่อหมวดยาวเกิน ${SHOP_CAT_NAME_MAX} ตัวอักษร`;
  const dup = cats.some((c) => !c.deleted_at && c.id !== selfId && normCatName(c.name).toLowerCase() === n.toLowerCase());
  return dup ? `มีหมวด “${n}” ในร้านนี้แล้ว` : null;
}

/** หมวดที่ยังไม่ลบ เรียงตามลำดับ */
export const activeCats = <T extends Pick<ShopCat, "deleted_at" | "sort_order" | "name">>(cats: T[]): T[] =>
  cats.filter((c) => !c.deleted_at).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "th"));

/** สินค้าในแผนของหมวด เรียงตามลำดับ */
export const planItemsOf = (items: ShopCatItem[], catId: string): ShopCatItem[] =>
  items.filter((i) => i.category_id === catId && i.in_plan).sort((a, b) => a.sort_order - b.sort_order);

/** เช็กลิสต์ "ต้องไปกดในหลังร้าน" — เรียง: หมวดตามลำดับ (สร้าง/เปลี่ยนชื่อ/ใส่/เอาออก) → ลบหมวด → เรียงหมวดใหม่ */
export function shopCategoryChecklist(cats: ShopCat[], items: ShopCatItem[], codeOf: (parentId: string) => string): ShopCatStep[] {
  const steps: ShopCatStep[] = [];
  const act = activeCats(cats);
  const codes = (list: ShopCatItem[]) => list.map((i) => codeOf(i.parent_sku_id));
  for (const c of act) {
    const mine = items.filter((i) => i.category_id === c.id).sort((a, b) => a.sort_order - b.sort_order);
    const plan = mine.filter((i) => i.in_plan);
    if (!c.on_shop) {
      steps.push({ key: `create:${c.id}`, kind: "create", categoryId: c.id, title: `สร้างหมวด “${c.name}”${plan.length ? ` แล้วใส่ ${plan.length} สินค้า` : ""}`, codes: codes(plan) });
      continue;
    }
    if ((c.shop_name ?? "") !== c.name) steps.push({ key: `rename:${c.id}`, kind: "rename", categoryId: c.id, title: `เปลี่ยนชื่อหมวด “${c.shop_name ?? ""}” เป็น “${c.name}”`, codes: [] });
    const add = mine.filter((i) => i.in_plan && !i.on_shop);
    if (add.length) steps.push({ key: `add:${c.id}`, kind: "add", categoryId: c.id, title: `ใส่ ${add.length} สินค้าเข้า “${c.name}”`, codes: codes(add) });
    const rm = mine.filter((i) => !i.in_plan && i.on_shop);
    if (rm.length) steps.push({ key: `remove:${c.id}`, kind: "remove", categoryId: c.id, title: `เอา ${rm.length} สินค้าออกจาก “${c.name}”`, codes: codes(rm) });
  }
  for (const c of cats.filter((x) => x.deleted_at && x.on_shop)) {
    steps.push({ key: `delete:${c.id}`, kind: "delete", categoryId: c.id, title: `ลบหมวด “${c.shop_name ?? c.name}” ในหลังร้าน`, codes: [] });
  }
  const live = act.filter((c) => c.on_shop);
  const shopOrder = [...live].sort((a, b) => (a.shop_sort ?? 0) - (b.shop_sort ?? 0)).map((c) => c.id).join("|");
  if (live.length > 1 && shopOrder !== live.map((c) => c.id).join("|")) {
    steps.push({ key: "reorder", kind: "reorder", categoryId: null, title: `เรียงหมวดใหม่: ${act.map((c) => c.name).join(" › ")}`, codes: [] });
  }
  return steps;
}

/** ติ๊กว่าทำข้อนี้ในหลังร้านแล้ว → ค่าที่ต้องเปลี่ยน (ฝั่ง "ทำแล้ว" เท่านั้น ไม่แตะแผน) · ไม่มีข้อนี้แล้ว = null */
export function stepEffect(key: string, cats: ShopCat[], items: ShopCatItem[]): StepEffect | null {
  const act = activeCats(cats);
  const rank = new Map(act.map((c, i) => [c.id, i]));
  const [kind, id] = key.split(":") as [ShopCatStepKind, string | undefined];
  const cat = id ? cats.find((c) => c.id === id) : undefined;
  const mine = (pred: (i: ShopCatItem) => boolean) => items.filter((i) => i.category_id === id && pred(i)).map((i) => ({ category_id: i.category_id, parent_sku_id: i.parent_sku_id, patch: { on_shop: i.in_plan } as ItemPatch }));
  switch (kind) {
    case "create":
      if (!cat || cat.deleted_at || cat.on_shop) return null;
      return { cats: [{ id: cat.id, patch: { on_shop: true, shop_name: cat.name, shop_sort: rank.get(cat.id) ?? 0 } }], items: mine((i) => i.in_plan !== i.on_shop) };
    case "rename":
      if (!cat || cat.deleted_at || !cat.on_shop || cat.shop_name === cat.name) return null;
      return { cats: [{ id: cat.id, patch: { shop_name: cat.name } }], items: [] };
    case "add": {
      if (!cat || cat.deleted_at || !cat.on_shop) return null;
      const list = mine((i) => i.in_plan && !i.on_shop);
      return list.length ? { cats: [], items: list } : null;
    }
    case "remove": {
      if (!cat || cat.deleted_at || !cat.on_shop) return null;
      const list = mine((i) => !i.in_plan && i.on_shop);
      return list.length ? { cats: [], items: list } : null;
    }
    case "delete":
      if (!cat || !cat.deleted_at || !cat.on_shop) return null;
      return {
        cats: [{ id: cat.id, patch: { on_shop: false, shop_name: null, shop_sort: null } }],
        items: items.filter((i) => i.category_id === cat.id && i.on_shop).map((i) => ({ category_id: i.category_id, parent_sku_id: i.parent_sku_id, patch: { on_shop: false } })),
      };
    case "reorder": {
      const live = act.filter((c) => c.on_shop);
      return live.length ? { cats: live.map((c) => ({ id: c.id, patch: { shop_sort: rank.get(c.id) ?? 0 } })), items: [] } : null;
    }
    default:
      return null;
  }
}

/** ค่าก่อนหน้าของช่องที่ stepEffect จะเปลี่ยน — เก็บไว้ "ยกเลิกติ๊ก" */
export function undoOf(effect: StepEffect, cats: ShopCat[], items: ShopCatItem[]): StepEffect {
  const catById = new Map(cats.map((c) => [c.id, c]));
  const itemKey = (cid: string, pid: string) => `${cid}|${pid}`;
  const itemBy = new Map(items.map((i) => [itemKey(i.category_id, i.parent_sku_id), i]));
  return {
    cats: effect.cats.map(({ id, patch }) => {
      const c = catById.get(id); const prev: CatPatch = {};
      if (c) for (const k of Object.keys(patch) as (keyof CatPatch)[]) (prev as Record<string, unknown>)[k] = c[k];
      return { id, patch: prev };
    }),
    items: effect.items.map(({ category_id, parent_sku_id }) => ({ category_id, parent_sku_id, patch: { on_shop: itemBy.get(itemKey(category_id, parent_sku_id))?.on_shop ?? false } })),
  };
}

/** สินค้าบนร้านที่ยังไม่อยู่หมวดไหนเลย (นับเฉพาะหมวดที่ยังไม่ลบ) */
export function unassignedProducts(products: ShopCatProduct[], cats: ShopCat[], items: ShopCatItem[]): ShopCatProduct[] {
  const live = new Set(activeCats(cats).map((c) => c.id));
  const inPlan = new Set(items.filter((i) => i.in_plan && live.has(i.category_id)).map((i) => i.parent_sku_id));
  return products.filter((p) => p.listed && !inPlan.has(p.id)).sort((a, b) => a.code.localeCompare(b.code));
}

const firstWord = (s: string) => normCatName(s).split(" ")[0] ?? "";
/** ชื่อหมวดในร้านกับชื่อหมวดกลาง "น่าจะเรื่องเดียวกัน" (มีคำหนึ่งอยู่ในอีกคำ · ตัดภาษาอังกฤษท้ายชื่อหมวดกลาง) */
export function catNameMatches(shopCat: string, central: string | null): boolean {
  const a = normCatName(shopCat).toLowerCase(); const b = normCatName(central ?? "").toLowerCase();
  if (!a || !b) return false;
  const bw = firstWord(b);
  return b.includes(a) || a.includes(b) || (bw.length >= 3 && a.includes(bw));
}

/**
 * สินค้าที่แนะนำให้ใส่หมวดนี้ (คนกดเลือกใส่เอง — ระบบไม่ใส่ให้เงียบ ๆ · ข้อเสนอ 2)
 * เหตุผล: ผูกหมวดกลางไว้ตรงกัน > ชื่อหมวดกลางตรงชื่อหมวด > หมวดชื่อ "ใหม่" = เห็นบนร้านไม่เกิน 14 วัน
 * ข้ามตัวที่อยู่หมวดนี้แล้ว · ตัวที่ยังไม่อยู่หมวดไหนขึ้นก่อน
 */
export function suggestForCategory(cat: Pick<ShopCat, "id" | "name" | "central_category_id">, products: ShopCatProduct[], cats: ShopCat[], items: ShopCatItem[], now = new Date()): { product: ShopCatProduct; reason: string }[] {
  const inThis = new Set(planItemsOf(items, cat.id).map((i) => i.parent_sku_id));
  const free = new Set(unassignedProducts(products, cats, items).map((p) => p.id));
  const isNewCat = /ใหม่|new/i.test(cat.name);
  const cutoff = now.getTime() - NEW_DAYS * 86_400_000;
  const out: { product: ShopCatProduct; reason: string; score: number }[] = [];
  for (const p of products) {
    if (!p.listed || inThis.has(p.id)) continue;
    let reason = ""; let score = 0;
    if (cat.central_category_id && p.central_id === cat.central_category_id) { reason = `หมวดกลาง “${p.central_name ?? ""}”`; score = 3; }
    else if (!cat.central_category_id && catNameMatches(cat.name, p.central_name)) { reason = `หมวดกลาง “${p.central_name ?? ""}”`; score = 2; }
    else if (isNewCat && p.first_seen && new Date(p.first_seen).getTime() >= cutoff) { reason = `ลงร้านใน ${NEW_DAYS} วัน`; score = 1; }
    if (!score) continue;
    out.push({ product: p, reason, score: score + (free.has(p.id) ? 0.5 : 0) });
  }
  return out.sort((a, b) => b.score - a.score || a.product.code.localeCompare(b.product.code)).map(({ product, reason }) => ({ product, reason }));
}

/** เช็กลิสต์เป็นข้อความ (คัดลอกไปวางในแชต/โน้ต) */
export function checklistText(steps: ShopCatStep[], shopLabel: string): string {
  if (!steps.length) return `หมวดในร้าน ${shopLabel}: ตรงกับแผนแล้ว ไม่มีอะไรต้องกด`;
  return [`หมวดในร้าน ${shopLabel} — ต้องไปกดในหลังร้าน ${steps.length} ข้อ`, ...steps.map((s, i) => `${i + 1}. ${s.title}${s.codes.length ? `\n   รหัส: ${s.codes.join(", ")}` : ""}`)].join("\n");
}
