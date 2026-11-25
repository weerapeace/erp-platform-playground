/**
 * ตัวเลือกบนร้าน ↔ สีในระบบ — ลิ้นชักสินค้าบนร้าน แท็บ "ตัวเลือก & ราคา" (เจ้าของเลือก 2026-11-24 "แบบ A + ข้อเสนอ 1, 2, 3, 5, 6")
 * pure · client-safe · ใช้ทุกร้าน (Shopee → TikTok → Lazada → LINE)
 *
 *  - sysVariantsNotOnShop  = สีในระบบ (เปิดใช้) ที่ยังไม่อยู่บนร้าน → แถว "มีในระบบ ยังไม่อยู่บนร้าน" + ปุ่มเพิ่ม
 *  - sysVariantOfOption    = ตัวเลือกบนร้านตัวนี้คือสีไหนในระบบ → ปุ่ม "ชื่อตามระบบ" (ข้อ 1) / รูปตามระบบ
 *  - sizeSkusForNewColor / sizePricesForNewColor = สินค้าสี×ไซซ์ (ข้อ 5): รหัส/ราคาต่อไซซ์ของสีใหม่ ตามแบบแผนของสีเดิม
 * จับคู่ด้วยรหัส: รหัสบนร้าน = รหัสระบบ หรือขึ้นต้นด้วยรหัสระบบแล้วต่อด้วยตัวที่ไม่ใช่ตัวเลข (MCT13-02L · WK46-01D/3 · CVRB001-01+BSAC001-01)
 * ข้อมูลสีในระบบ = GET /api/platform-catalog/drift?listing_id=&part=variants (ตัวประกอบข้อมูลเดียวกับตัวช่วยลงสินค้า)
 */

/** สีในระบบของสินค้าที่จับคู่ (ค่าที่ตัวช่วยลงสินค้าของร้านนั้นจะส่ง) */
export type SysVariantView = {
  code: string;
  /** ค่าตัวเลือก เรียงตามชั้น (ค่าแรก = ชื่อสีที่จะขึ้นร้าน เช่น "ม่วง (05)") */
  values: string[];
  /** ราคาตั้งที่ระบบจะส่ง */
  price: number | null;
  /** รูปประจำสี ("r2:<key>") */
  image: string | null;
  /** สต๊อกในระบบ (คงเหลือ − จอง) · ไม่รู้ = null */
  stock: number | null;
  /** SKU เปิดใช้อยู่ */
  active: boolean;
};
export type SysVariantsResponse = { variants: SysVariantView[] | null; platform_code: string | null; error: string | null };

const up = (s: unknown) => String(s ?? "").trim().toUpperCase();

/** รหัสบนร้านเป็นสีนี้ในระบบไหม */
export function skuMatchesSys(shopSku: string | null | undefined, sysCode: string): boolean {
  const a = up(shopSku), b = up(sysCode);
  if (!a || !b) return false;
  if (a === b) return true;
  if (!a.startsWith(b)) return false;
  return !/^[0-9]/.test(a.slice(b.length));
}

/** สีในระบบ (เปิดใช้) ที่ยังไม่มีรหัสไหนบนร้านตรงกัน */
export function sysVariantsNotOnShop(shopSkus: readonly (string | null | undefined)[], sys: readonly SysVariantView[]): SysVariantView[] {
  const skus = shopSkus.map(up).filter(Boolean);
  return sys.filter((v) => v.active && !skus.some((s) => skuMatchesSys(s, v.code)));
}

type ModelLite = { sku: string | null; tierIndex: number[]; originalPrice?: number | null; price?: number | null };

/** ตัวเลือกชั้นแรกตำแหน่งนี้ ↔ สีในระบบ (รหัสระบบที่ยาวสุดที่ตรงกับรหัสของ model ในตัวเลือกนี้) */
export function sysVariantOfOption<T extends { code: string }>(models: readonly ModelLite[], optionIndex: number, sys: readonly T[]): T | null {
  const skus = models.filter((m) => m.tierIndex[0] === optionIndex).map((m) => m.sku).filter((s): s is string => !!s);
  let best: T | null = null;
  for (const v of sys) if (skus.some((s) => skuMatchesSys(s, v.code)) && (!best || v.code.length > best.code.length)) best = v;
  return best;
}

/** ชื่อตามระบบของสี (ค่าแรก) */
export const sysOptionName = (v: { values: readonly string[] } | null | undefined): string | null => v?.values[0]?.replace(/\s+/g, " ").trim() || null;

/**
 * สินค้าสี×ไซซ์: รหัสต่อไซซ์ (index ชั้นที่ 2) ของสีใหม่ — หาส่วนท้ายจากสีเดิม (MCT13-01S − MCT13-01 = "S") แล้วต่อท้ายรหัสสีใหม่
 * ไซซ์ที่หาแบบแผนไม่ได้ = null (ให้คนกรอกเอง)
 */
export function sizeSkusForNewColor(models: readonly ModelLite[], sys: readonly { code: string }[], newCode: string, sizeCount: number): (string | null)[] {
  const suffix = new Map<number, string>();
  for (const m of models) {
    const size = m.tierIndex[1];
    if (size == null || suffix.has(size) || !m.sku) continue;
    const own = sysVariantOfOption(models, m.tierIndex[0], sys);
    if (own && skuMatchesSys(m.sku, own.code)) suffix.set(size, m.sku.trim().slice(own.code.trim().length));
  }
  return Array.from({ length: sizeCount }, (_, i) => (suffix.has(i) ? `${newCode.trim()}${suffix.get(i)}` : null));
}

/** สินค้าสี×ไซซ์: ราคาต่อไซซ์ของสีใหม่ = ราคาตั้งที่พบบ่อยสุดของไซซ์นั้นในสีเดิม · ไม่มี = fallback (ราคาระบบ) */
export function sizePricesForNewColor(models: readonly ModelLite[], sizeCount: number, fallback: number | null): (number | null)[] {
  return Array.from({ length: sizeCount }, (_, i) => {
    const count = new Map<number, number>();
    for (const m of models) { const p = m.originalPrice ?? m.price ?? null; if (m.tierIndex[1] === i && p != null) count.set(p, (count.get(p) ?? 0) + 1); }
    let best: number | null = null, n = 0;
    for (const [p, c] of count) if (c > n) { best = p; n = c; }
    return best ?? fallback;
  });
}

/**
 * ชั้นไหนคือ "สี" — ชั้นที่แต่ละค่าตรงกับสีในระบบตัวเดียวมากที่สุด (ไซซ์/จำนวน = ค่าเดียวกระจายหลายสี) · เสมอ = ชื่อชั้นมีคำว่า สี/color → ชั้นแรก
 * tiers[i].values[j].skus = รหัสบนร้านของตัวเลือกที่มีค่านี้ · คืน index ของชั้น (ไม่มีชั้น = -1)
 * ใช้: Lazada (lib/lazada-option-edit) · LINE (variant-structure-editor) — บางสินค้าเรียง "จำนวน · สี"
 */
export function pickColorTier(tiers: readonly { name: string; values: readonly { skus: readonly (string | null | undefined)[] }[] }[], sysCodes: readonly string[]): number {
  if (!tiers.length) return -1;
  const score = (t: (typeof tiers)[number]) => t.values.filter((val) => {
    const hits = new Set<string | null>(val.skus.map((sku) => sysCodes.filter((c) => skuMatchesSys(sku, c)).sort((a, b) => b.length - a.length)[0] ?? null));
    return hits.size === 1 && !hits.has(null);
  }).length;
  const isColor = (t: (typeof tiers)[number]) => /colou?r|สี/i.test(t.name);
  return tiers.map((t, i) => ({ i, sc: score(t), c: isColor(t) })).sort((a, b) => b.sc - a.sc || Number(b.c) - Number(a.c) || a.i - b.i)[0].i;
}
