/**
 * ตัวช่วยตั้งชื่อ Parent SKU (pure · เทสต์ lib/__tests__/parent-name-builder.test.ts)
 *   ใช้ที่ป๊อป "＋ เพิ่ม Parent SKU" (components/parent-sku-create-modal) — เจ้าของขอ 2026-11-25
 *   รูปแบบชื่อที่ใช้กันจริง: แบรนด์ (คอลเลกชัน) ชนิด วัสดุ จุดเด่น รหัส
 *     TH: "Louis Montini (Evelyn) กระเป๋าใส่บัตรคล้องคอ หนังวัวแท้ สลักชื่อฟรี WK46"
 *     EN: "Louis Montini (Evelyn) Lanyard card holder, genuine cowhide, free name engraving WK46"
 */
export type NameParts = {
  brand?: string | null;
  collection?: string | null;
  type?: string | null;
  materials?: string[];
  highlights?: string[];
  code?: string | null;
};

const clean = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();
const list = (a: string[] | undefined) => (a ?? []).map(clean).filter(Boolean);

/** ต่อชื่อจากชิ้นส่วน (ชิ้นที่ว่างข้ามไป) · รหัสต้องมีเลขจึงต่อท้าย (พิมพ์แค่ตัวหน้า "CVB" ยังไม่ต่อ) */
export function buildParentName(p: NameParts, lang: "th" | "en" = "th"): string {
  const col = clean(p.collection);
  const code = clean(p.code).toUpperCase();
  const head = [clean(p.brand), col ? `(${col})` : ""].filter(Boolean).join(" ");
  const mats = list(p.materials);
  const hls = list(p.highlights);
  const tail = /\d/.test(code) ? code : "";
  if (lang === "en") {
    const body = [clean(p.type), mats.join(" & "), hls.join(", ")].filter(Boolean).join(", ");
    return [head, body, tail].filter(Boolean).join(" ");
  }
  return [head, clean(p.type), mats.join(" "), hls.join(" "), tail].filter(Boolean).join(" ");
}

/** เอาชื่อรุ่นก่อนมาแก้: เปลี่ยนรหัสเดิมในชื่อเป็นรหัสใหม่ (ไม่มีรหัสเดิมในชื่อ = ต่อท้าย) */
export function swapCodeInName(name: string, oldCode: string, newCode: string): string {
  const n = clean(name);
  const o = clean(oldCode);
  const c = clean(newCode).toUpperCase();
  if (!n) return "";
  if (!c || !/\d/.test(c)) return n;
  if (o) {
    const re = new RegExp(o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (re.test(n)) return n.replace(re, c);
  }
  return `${n} ${c}`;
}

/** หมวดสินค้าเดิม (product_family: bag/belt/jewelry/spare/general) เดาจากชื่อหมวดกลาง/ชนิด */
export function guessFamily(text: string | null | undefined): "bag" | "belt" | "jewelry" | "spare" | "general" {
  const t = clean(text).toLowerCase();
  if (!t) return "general";
  if (/เข็มขัด|belt/.test(t)) return "belt";
  if (/อะไหล่|spare|หัวเข็มขัด|buckle/.test(t)) return "spare";
  if (/สร้อย|แหวน|ต่างหู|กำไล|เครื่องประดับ|jewel|necklace|ring|bracelet|earring/.test(t)) return "jewelry";
  if (/กระเป๋า|ซอง|bag|wallet|pouch|holder|tote|backpack/.test(t)) return "bag";
  return "general";
}

/** ความยาวสูงสุดที่ร้านค้ารับ (Shopee 120 ตัวอักษร) */
export const NAME_MAX = 120;
