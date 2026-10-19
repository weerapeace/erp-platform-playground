/**
 * 📝 ข้อความสำเร็จรูป "หลายแบบ" (product_highlight_items.variant_mode + variants) — ของกลาง pure (ห้ามใส่ "use client")
 *
 *   ข้อความเดียว (variant_mode = null)  → ใช้ name / name_en เหมือนเดิม
 *   select = Dropdown หลายแบบ           → แต่ละแบบเปลี่ยนทั้งประโยค เช่น ซิป: ฟันเหล็ก / ไนล่อน (แบบแรก = ค่าเริ่ม)
 *   toggle = ติ๊กสลับ 2 แบบ              → ไม่ติ๊ก = แบบที่ 1 · ติ๊ก "<ชื่อแบบที่ 2>" = แบบที่ 2 (เช่น ผ้าซับใน ↔ ทอลาย)
 *   variants = [{ label, th, en }] · name = ชื่อหัวข้อ (เช่น "ซิป")
 *
 * ค่าที่เลือกเก็บเป็น "ชื่อแบบ" (label) — ฟิลด์ size ของ parent_skus_v2.highlights / state ในป๊อปแทรก · ว่าง = ค่าเริ่ม
 * ใช้ที่: components/detail-insert (ป๊อปแทรก) · components/tick-list-field (รายละเอียดเพิ่ม ติ๊ก) · lib/product-fits fitLabels (เว็บร้าน)
 */

export type VariantMode = "select" | "toggle";
export type PhraseVariant = { label: string; th: string; en: string | null };
export type VariantItem = { name: string; name_en?: string | null; variant_mode?: unknown; variants?: unknown };

export const VARIANT_MODE_LABEL: Record<VariantMode, string> = { select: "Dropdown หลายแบบ", toggle: "ติ๊กสลับ 2 แบบ" };
const MAX_VARIANTS = 12;
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** อ่านแบบจาก DB → ใช้ได้จริงไหม (select ≥ 2 แบบ · toggle = 2 แบบแรก และแบบที่ 2 มีชื่อ) · ไม่ครบ = null (ใช้เป็นข้อความเดียว) */
export function parseVariants(mode: unknown, raw: unknown): { mode: VariantMode; variants: PhraseVariant[] } | null {
  if (mode !== "select" && mode !== "toggle") return null;
  let v: unknown = raw;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return null; } }
  if (!Array.isArray(v)) return null;
  const list: PhraseVariant[] = [];
  for (const x of v.slice(0, MAX_VARIANTS)) {
    const r = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const th = clean(r.th, 300);
    if (!th) continue;
    const label = clean(r.label, 40);
    if (label && list.some((y) => y.label === label)) continue;
    list.push({ label, th, en: clean(r.en, 300) || null });
  }
  if (mode === "toggle") {
    const two = list.slice(0, 2);
    return two.length === 2 && two[1].label ? { mode, variants: two } : null;
  }
  return list.length >= 2 && list.every((x) => x.label) ? { mode, variants: list } : null;
}

export const variantsOf = (it: VariantItem) => parseVariants(it.variant_mode, it.variants);

/** ชื่อแบบที่ให้เลือก (select = ทุกแบบ · toggle = แบบที่ 2 แบบเดียว = ช่องติ๊ก) · ข้อความเดียว = [] */
export function variantOptions(it: VariantItem): string[] {
  const p = variantsOf(it);
  if (!p) return [];
  return p.mode === "toggle" ? [p.variants[1].label] : p.variants.map((x) => x.label);
}

/** แบบที่ใช้จากชื่อที่เลือก (ไม่เลือก/ไม่ตรง = แบบแรก) · ข้อความเดียว = null */
export function pickVariant(it: VariantItem, label?: string | null): PhraseVariant | null {
  const p = variantsOf(it);
  if (!p) return null;
  const k = (label ?? "").trim();
  return (k && p.variants.find((x) => x.label === k)) || p.variants[0];
}

/** รายการพร้อมประโยคของแบบที่เลือก (name/name_en = ประโยค) — ส่งต่อให้ตัวประกอบบรรทัดเดิมได้เลย */
export function resolvePhrase<T extends VariantItem>(it: T, label?: string | null): T {
  const v = pickVariant(it, label);
  return v ? { ...it, name: v.th, name_en: v.en } : it;
}

/** ข้อความทั้งหมดของรายการ (ใช้ค้นหา) */
export function variantSearchText(it: VariantItem): string {
  const p = variantsOf(it);
  return [it.name, it.name_en ?? "", ...(p ? p.variants.flatMap((x) => [x.label, x.th, x.en ?? ""]) : [])].join(" ");
}
