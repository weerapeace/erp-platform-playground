/**
 * ของกลาง (pure): สกุลเงินของใบขอซื้อ/ใบสั่งซื้อ เทียบกับ "ร้านอยู่ประเทศไหน"
 * เจ้าของสั่ง 2026-11-05 ("ทำไมบางอันเป็นบาท ต้องเป็น ¥ สิ อยากให้แก้ได้ด้วย"):
 *   ต้นเหตุ = ร้านจีน 48/50 ร้านตั้ง default_currency = THB + ราคาร้านใน SKU (supplier_items) ของร้านจีน 607 แถวเป็นบาท
 *   → ขอซื้อ/PO ออกมาเป็นบาท (ร้านจีนที่ใบเป็นบาท 124 ใบ ณ วันทำ)
 * กติกา: ร้านจีน = shop_country "จีน" / ร้าน Taobao / ตั้งสกุลตั้งต้นเป็นหยวน
 *   ใบของร้านจีนที่เป็นบาท = "น่าสงสัย" (เตือน ไม่แก้เอง — ห้ามแปลงทีเดียวทั้งหมด เพราะมีแต่เจ้าของรู้ว่าตัวเลขเป็นบาทหรือหยวนจริง)
 * ใช้ที่: /api/purchasing/po-currency (แก้สกุลใบ) · /api/purchasing/create-pr (สกุลตั้งต้นตามร้าน) · ใบรับสินค้า (ป้ายเตือน) · ตะกร้าขอซื้อ
 */

export const CNY_CODES = ["RMB", "YUAN", "CNY"];
export type DocCurrency = "THB" | "RMB";

export const isCny = (c: unknown): boolean => CNY_CODES.includes(String(c ?? "").trim().toUpperCase());
/** รวมสะกด RMB/YUAN/CNY เป็น "RMB" · อื่น ๆ = "THB" */
export const normCurrency = (c: unknown): DocCurrency => (isCny(c) ? "RMB" : "THB");
export const currencySymbol = (c: unknown) => (isCny(c) ? "¥" : "฿");
export const currencyName = (c: unknown) => (isCny(c) ? "หยวน" : "บาท");

export type ShopCurrencyInfo = { shop_country?: string | null; default_currency?: string | null; is_taobao?: boolean | null } | null | undefined;

/** ร้านอยู่จีนไหม (ดูจากทะเบียนร้าน) */
export function isChinaShop(p: ShopCurrencyInfo): boolean {
  if (!p) return false;
  const c = String(p.shop_country ?? "").trim().toLowerCase();
  return c === "จีน" || c === "china" || c === "cn" || p.is_taobao === true || isCny(p.default_currency);
}

/** สกุลตั้งต้นของร้าน — ไม่รู้จักร้าน = null (ให้ผู้เรียกใช้ค่าเดิมของตัวเอง) */
export function shopDefaultCurrency(p: ShopCurrencyInfo): DocCurrency | null {
  if (!p) return null;
  return isChinaShop(p) ? "RMB" : normCurrency(p.default_currency);
}

/** ร้านจีน แต่ใบเป็นบาท → ควรให้คนเช็ก */
export const currencyMismatch = (docCurrency: unknown, shop: ShopCurrencyInfo): boolean => isChinaShop(shop) && !isCny(docCurrency);

export type CurrencyFixMode = "relabel" | "convert";

/**
 * ราคาใหม่หลังเปลี่ยนสกุล
 *   relabel = ตัวเลขถูกอยู่แล้ว แค่ป้ายผิด (45 → ¥45)
 *   convert = ตัวเลขเป็นสกุลเดิมจริง แปลงตามเรท (rate = บาท ต่อ 1 หยวน)
 */
export function convertPrice(price: number, from: unknown, to: unknown, mode: CurrencyFixMode, rate: number): number {
  const p = Number(price) || 0;
  const f = normCurrency(from), t = normCurrency(to);
  if (mode === "relabel" || f === t) return p;
  if (!(rate > 0)) throw new Error("ต้องมีเรทแลกเปลี่ยนก่อนแปลงราคา");
  const out = f === "THB" ? p / rate : p * rate;
  return Math.round(out * 10000) / 10000;
}
