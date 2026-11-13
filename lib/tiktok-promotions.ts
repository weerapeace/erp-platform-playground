/**
 * โปรโมชัน/ส่วนลดของร้าน TikTok (อ่านอย่างเดียว) — pure (ไม่เรียก API) ใช้ได้ทั้งหน้าเว็บและหลังบ้าน + เทสต์
 * เจ้าของสั่ง 2026-11-13 "ทำ 1,2,4" (ข้อ 4 = ดึงโปรโมชัน/ส่วนลดของร้าน) · ⚠️ ต้องเปิดสิทธิ์ "Promotion Information" (seller.promotion.info) ในแอปก่อน
 *
 * เอกสารทางการ (อ่าน 2026-11-13):
 *   Search Promotion Activities 202309 — POST /promotion/202309/activities/search (shop_cipher)
 *     body { status?: NOT_START|ONGOING|EXPIRED|DEACTIVATED, activity_type?, page_size 0–100, page_token }
 *     → data{ activities[{ id, title, activity_type, status, begin_time, end_time (วินาที), product_level PRODUCT|VARIATION|SHOP, discount{ shipping_discount | bmsm_discount | … } }], next_page_token, total_count }
 *   Get Activity 202309 — GET /promotion/202309/activities/{id} (shop_cipher)
 *     → data{ …, products[{ id, activity_price{ amount }, discount (% เมื่อ DIRECT_DISCOUNT ระดับสินค้า), quantity_limit, quantity_per_user,
 *              skus[{ id, activity_price{ amount }, discount, quantity_limit, quantity_per_user, used_quantity }] }] }
 *   คูปองแยก API (Search Coupons) — ยังไม่ดึง
 */

export type TtsPromoSku = { skuId: string; price: number | null; discount: number | null };
export type TtsPromoProduct = { productId: string; price: number | null; discount: number | null; skus: TtsPromoSku[] };
export type TtsPromo = {
  id: string; title: string; type: string; typeLabel: string; status: string; statusLabel: string;
  begin: number | null; end: number | null; productLevel: string | null;
  /** เงื่อนไข/ส่วนลดแบบข้อความ (ส่วนลดค่าส่ง / ซื้อมากลดมาก / ของแถม) */
  detail: string | null;
  /** สินค้าในโปร · null = ยังไม่ได้ดึงรายละเอียด */
  products: TtsPromoProduct[] | null;
};

export const TTS_PROMO_TYPE_LABEL: Record<string, string> = {
  FIXED_PRICE: "ลดราคา (ตั้งราคาโปร)", DIRECT_DISCOUNT: "ลดราคา (%)", FLASHSALE: "แฟลชเซล",
  SHIPPING_DISCOUNT: "ส่วนลดค่าส่ง", BUY_MORE_SAVE_MORE: "ซื้อมากลดมาก", GIFT_WITH_PURCHASE: "ซื้อแล้วแถม", BUY_X_GET_Y: "ซื้อ X แถม Y",
};
export const TTS_PROMO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "ร่าง", NOT_START: "ยังไม่เริ่ม", ONGOING: "กำลังใช้", EXPIRED: "หมดเวลา", DEACTIVATED: "ปิดแล้ว", NOT_EFFECTIVE: "ไม่มีผล",
};
/** โปรที่มีราคาโปรต่อสินค้า (ใช้คิดราคาหลังโปร) */
export const TTS_PRICE_PROMO_TYPES = new Set(["FIXED_PRICE", "DIRECT_DISCOUNT", "FLASHSALE"]);

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Obj[] : []);
const str = (v: unknown): string => (v == null ? "" : String(v)).trim();
const num = (v: unknown): number | null => { const t = str(v); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
const baht = (n: number | null) => (n == null ? "" : `${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);

/** เงื่อนไขของโปรแบบข้อความภาษาคน */
function detailOf(type: string, discount: unknown): string | null {
  const d = obj(discount);
  if (!d) return null;
  const thr = (t: string, v: string) => (t === "MINIMAL_ITEM_QUANTITY" ? `ซื้อ ${v} ชิ้นขึ้นไป` : t === "MINIMAL_ORDER_AMOUNT" ? `ซื้อครบ ${baht(num(v))}` : "ไม่มีขั้นต่ำ");
  const off = (t: string, v: string) => (t === "PERCENTAGE_OFF" ? `ลด ${v}%` : t === "AMOUNT_OFF" || t === "AMOUNT_OFF_EACH" ? `ลด ${baht(num(v))}` : t === "FREE" ? "ฟรี" : v ? `${t} ${v}` : t);
  const ship = obj(d.shipping_discount);
  if (ship) return `${thr(str(ship.threshold_type), str(ship.threshold_value))} → ${str(ship.type) === "FREE_SHIPPING" ? "ส่งฟรี" : `ลดค่าส่งสูงสุด ${baht(num(ship.value))}`}`;
  const bm = arr(obj(d.bmsm_discount)?.details);
  if (bm.length) return bm.map((t) => `${thr(str(t.threshold_type), str(t.threshold_value))} ${off(str(t.type), str(t.value))}`).join(" · ");
  const gifts = arr(obj(d.gift_discount)?.gift_infos);
  if (gifts.length) return gifts.map((t) => `${thr(str(t.threshold_type), str(t.threshold_value))} ได้ของแถม ${arr(t.gift_details).length} รายการ`).join(" · ");
  const bx = obj(d.bxgy_discount);
  if (bx) return `${thr(str(bx.threshold_type), str(bx.threshold_value))} → ${off(str(bx.discount_type), str(bx.discount_value))}`;
  return null;
}

function promoOf(a: Obj): TtsPromo | null {
  const id = str(a.id ?? a.activity_id);
  if (!id) return null;
  const type = str(a.activity_type).toUpperCase();
  const status = str(a.status).toUpperCase();
  return {
    id, title: str(a.title) || `โปร #${id}`, type, typeLabel: TTS_PROMO_TYPE_LABEL[type] ?? (type || "โปรโมชัน"),
    status, statusLabel: TTS_PROMO_STATUS_LABEL[status] ?? (status || "ไม่ทราบ"),
    begin: num(a.begin_time), end: num(a.end_time), productLevel: str(a.product_level).toUpperCase() || null,
    detail: detailOf(type, a.discount), products: null,
  };
}

/** คำตอบ Search Promotion Activities → รายการโปร (ยังไม่มีสินค้า) */
export function ttsPromosOf(data: unknown): TtsPromo[] {
  return arr(obj(data)?.activities).map(promoOf).filter((x): x is TtsPromo => !!x);
}

/** เติมสินค้าจาก Get Activity */
export function ttsPromoWithDetail(p: TtsPromo, detail: unknown): TtsPromo {
  const d = obj(detail);
  if (!d) return p;
  const base = promoOf({ ...d, id: d.activity_id ?? p.id }) ?? p;
  const products = arr(d.products).map((x): TtsPromoProduct => ({
    productId: str(x.id), price: num(obj(x.activity_price)?.amount), discount: num(x.discount),
    skus: arr(x.skus).map((k) => ({ skuId: str(k.id), price: num(obj(k.activity_price)?.amount), discount: num(k.discount) })).filter((k) => k.skuId),
  })).filter((x) => x.productId);
  return { ...p, ...base, detail: base.detail ?? p.detail, products };
}

/** โปรที่สินค้านี้อยู่ (กำลังใช้ก่อน → ยังไม่เริ่ม) · โปรทั้งร้าน (SHOP) ไม่นับเป็นของสินค้า */
export function tiktokPromosForProduct(list: TtsPromo[], productId: string): TtsPromo[] {
  const rank = (st: string) => (st === "ONGOING" ? 0 : st === "NOT_START" ? 1 : 2);
  return list.filter((p) => p.products?.some((x) => x.productId === productId)).sort((a, b) => rank(a.status) - rank(b.status) || (a.begin ?? 0) - (b.begin ?? 0));
}

/** ราคาหลังโปรของตัวเลือก 1 ตัว (ราคาโปรตรง ๆ หรือ ลด %) · ไม่รู้ = null */
export function tiktokPromoPrice(p: TtsPromo, productId: string, skuId: string, basePrice: number | null): number | null {
  const prod = p.products?.find((x) => x.productId === productId);
  if (!prod) return null;
  const sku = prod.skus.find((k) => k.skuId === skuId);
  const price = sku?.price ?? prod.price;
  if (price != null && p.type !== "DIRECT_DISCOUNT") return price;
  const pct = sku?.discount ?? prod.discount;
  if (pct != null && basePrice != null) return Math.round(basePrice * (1 - pct / 100) * 100) / 100;
  return price;
}

/** ช่วงเวลาโปร (เวลาไทย) */
export function tiktokPromoPeriod(p: Pick<TtsPromo, "begin" | "end">): string {
  const f = (sec: number | null) => (sec ? new Date(sec * 1000).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
  if (!p.begin && !p.end) return "ไม่มีกำหนด";
  return `${f(p.begin) || "…"} – ${f(p.end) || "ไม่มีกำหนด"}`;
}
