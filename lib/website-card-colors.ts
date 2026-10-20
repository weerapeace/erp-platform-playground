/**
 * 🎴 สีที่โชว์บนการ์ดสินค้า (ต่อรุ่น ต่อร้าน) — store_listings.web_card_colors
 * ไฟล์ pure (ไม่มี "use client") ใช้ได้ทั้ง API และหน้าจอ
 *
 * colors = ชื่อสีที่โชว์เป็นจุดบนการ์ด เรียงตามนี้ (null = ทุกสีตามลำดับเดิม)
 * main   = สีหลัก → รูปแรกบนการ์ดเป็นรูปของสีนี้ (null = ตามลำดับเดิม)
 * เก็บเป็น "ชื่อสี" ให้คงอยู่แม้ SKU ถูกสร้างใหม่ · ชื่อที่ไม่มีในรุ่นแล้วจะถูกข้าม
 */
export interface CardColors {
  colors: string[] | null;
  main: string | null;
}

export const EMPTY_CARD_COLORS: CardColors = { colors: null, main: null };

const norm = (s: string) => s.trim().toLowerCase();

export function normalizeCardColors(raw: unknown): CardColors {
  if (!raw || typeof raw !== "object") return { ...EMPTY_CARD_COLORS };
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const colors = Array.isArray(r.colors)
    ? r.colors
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim().slice(0, 60))
        .filter((c) => (seen.has(norm(c)) ? false : (seen.add(norm(c)), true)))
        .slice(0, 24)
    : null;
  const main = typeof r.main === "string" && r.main.trim() ? r.main.trim().slice(0, 60) : null;
  return { colors, main };
}

/** ว่าง = ไม่ต้องเก็บ (ให้คอลัมน์เป็น null) */
export const isEmptyCardColors = (c: CardColors) => c.colors === null && c.main === null;

/**
 * ✏️ เปลี่ยนชื่อสี (แก้ชื่อสีไทยของ SKU) → ชื่อในการตั้งค่าการ์ดต้องตามไปด้วย ไม่งั้นสีนั้นหลุดจากการ์ด
 * ไม่มีชื่อเดิมอยู่ = คืนตัวเดิม (เทียบด้วย === ได้ว่าเปลี่ยนไหม)
 */
export function renameCardColor(cc: CardColors, from: string, to: string): CardColors {
  const f = norm(from);
  const t = to.trim();
  if (!f || !t || f === norm(t)) return cc;
  const hitColors = cc.colors?.some((c) => norm(c) === f) ?? false;
  const hitMain = !!cc.main && norm(cc.main) === f;
  if (!hitColors && !hitMain) return cc;
  return {
    colors: cc.colors ? [...new Set(cc.colors.map((c) => (norm(c) === f ? t : c)))] : null,
    main: hitMain ? t : cc.main,
  };
}

/**
 * แปลงเป็น id ตัวเลือกของสินค้าบนเว็บ (ใช้ใน products API)
 * @returns show = id ที่โชว์บนการ์ด (เรียงตามที่ตั้ง) · main = id สีหลัก — ไม่ได้ตั้ง/หาไม่เจอ = undefined
 */
export function resolveCardColors(
  items: { id: string; label: string }[],
  cc: CardColors
): { show?: string[]; main?: string } {
  const byLabel = new Map(items.map((it) => [norm(it.label), it.id]));
  const show = cc.colors ? cc.colors.map((c) => byLabel.get(norm(c))).filter((x): x is string => !!x) : undefined;
  const main = cc.main ? byLabel.get(norm(cc.main)) : undefined;
  // ตั้งไว้แต่ไม่เหลือสีที่โชว์ (เอาออกหมด) = ไม่โชว์จุดสีของรุ่นนี้ → ส่ง [] ไปตรง ๆ
  return { show, main };
}
