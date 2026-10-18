/**
 * ของกลาง — ออเดอร์จากเว็บร้านออนไลน์ (ตาราง store_orders / store_order_items)
 *
 * ใช้ร่วม:
 *   - /api/public/storefront/orders  (ลูกค้ากดสั่งจากเว็บร้าน — สาธารณะ)
 *   - /api/website/orders            (แท็บ "🧾 ออเดอร์" ใน ERP)
 *
 * หลักการสำคัญ: **คิดราคาฝั่งเซิร์ฟเวอร์ใหม่เสมอ** จากสินค้าที่เผยแพร่ + กติกาจับคู่ฟิลด์ของร้าน
 * ไม่เชื่อราคาที่หน้าเว็บส่งมา (ลูกค้าแก้ตัวเลขในเบราว์เซอร์ได้)
 *
 * รหัสตัวเลือกที่เว็บส่งกลับมา = รหัสเดียวกับที่ /api/public/storefront/products ส่งไป
 *   "sku-xxxxxxxx"  = 8 ตัวแรกของ id SKU ลูก (ตัวเลือกชั้นที่ 1 = สี)
 *   "opt2-xxxxxxxx" = 8 ตัวแรกของ id SKU ลูกที่มี variant_option นั้น (ตัวเลือกชั้นที่ 2)
 * ดู resolveOptions / resolveOptions2 ใน lib/website-field-map.ts
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import {
  normalizeFieldMap,
  resolveProduct,
  attachNameRefs,
  nameRuleNeedsRefs,
  PARENT_SELECT,
  CHILD_SELECT,
  skuUnitPrice,
  sortKids,
  type ParentRow,
  type ChildSku,
  type ListingRow,
} from "@/lib/website-field-map";
import { baseColor, cleanVariantOff, variantValue } from "@/lib/website-size-options";
import { calcCardFee, calcGiftFee, calcShippingFee, orderPrefixFor, readSiteInfo, type SiteInfo } from "@/lib/website-site-info";
import { normalizePersonalize, normalizePersonalizeChoice, personalizeLabel, type PersonalizeChoice } from "@/lib/website-personalize";
import { normalizeCouponCode, type StoreCoupon } from "@/lib/website-coupons";
import { checkCoupon } from "@/lib/website-coupons-db";
import { pointsConfigFrom, validateRedeem } from "@/lib/member-points";
import { pointsBalance, redeemForOrder } from "@/lib/member-points-db";
import { normalizeOrderCard, readOrderCard, type OrderGiftCard } from "@/lib/website-gift-cards";
import { readGiftCards } from "@/lib/website-gift-cards-db";
import { writeAudit } from "@/lib/audit";
import { beltDesignLine, type BeltDesignRow } from "@/lib/belt-builder-order";
import { SwatchIndex, rowToSwatchEntry, SWATCH_SELECT } from "@/lib/color-swatch";
import { customerLang, type CustomerLang } from "@/lib/customer-messages";
import { dropFromRow, hiddenDropCodes } from "@/lib/website-new-drops";

type Admin = ReturnType<typeof supabaseAdmin>;

// ─── สถานะ (ชุดเดียวกับเว็บ Pixiedustie เดิม จะได้ดูออเดอร์รวมกันได้) ───

export type OrderStatus = "pending" | "preparing" | "shipped" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "paid" | "refunded";
export type PaymentMethod = "cod" | "promptpay";

export const ORDER_STATUSES: { key: OrderStatus; label: string; tone: string }[] = [
  { key: "pending", label: "รอดำเนินการ", tone: "bg-amber-100 text-amber-800" },
  { key: "preparing", label: "กำลังเตรียมของ", tone: "bg-blue-100 text-blue-800" },
  { key: "shipped", label: "จัดส่งแล้ว", tone: "bg-indigo-100 text-indigo-800" },
  { key: "completed", label: "สำเร็จ", tone: "bg-emerald-100 text-emerald-800" },
  { key: "cancelled", label: "ยกเลิก", tone: "bg-slate-200 text-slate-600" },
];

export const PAYMENT_STATUSES: { key: PaymentStatus; label: string; tone: string }[] = [
  { key: "unpaid", label: "ยังไม่ชำระ", tone: "bg-rose-100 text-rose-700" },
  { key: "paid", label: "ชำระแล้ว", tone: "bg-emerald-100 text-emerald-800" },
  { key: "refunded", label: "คืนเงินแล้ว", tone: "bg-slate-200 text-slate-600" },
];

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cod: "เก็บเงินปลายทาง",
  promptpay: "โอนพร้อมเพย์",
};

export const orderStatusLabel = (s: string) => ORDER_STATUSES.find((x) => x.key === s)?.label ?? s;
export const paymentStatusLabel = (s: string) => PAYMENT_STATUSES.find((x) => x.key === s)?.label ?? s;

// ─── ข้อมูลที่ลูกค้ากรอก ───

export interface PublicOrderItem {
  /** id ของ Parent SKU (= product.id ที่ API สินค้าส่งไป) */
  productId: string;
  optionId?: string;
  option2Id?: string;
  qty: number;
  /** ปั๊มชื่อ (ถ้าลูกค้าเลือก) — ตรวจกับค่าที่ตั้งไว้ของรุ่นตอนสร้างออเดอร์ */
  personalize?: { text?: unknown; style?: unknown; position?: unknown } | null;
  /** 🧵 เข็มขัดสั่งทำ (Belt Builder): id แบบใน belt_designs — ใช้แทน productId · ราคาเอาจากแบบที่บันทึกไว้ (คิดฝั่งเซิร์ฟเวอร์แล้ว) */
  beltDesignId?: string;
}

export interface PublicOrderInput {
  items: PublicOrderItem[];
  customer: { name: string; phone: string; email?: string };
  ship: { addressLine: string; subdistrict?: string; district?: string; province?: string; postal?: string };
  paymentMethod: PaymentMethod;
  note?: string;
  /** โค้ดส่วนลด (ตรวจ+คิดใหม่ฝั่งเซิร์ฟเวอร์เสมอ — lib/website-coupons) */
  couponCode?: string;
  /** 🎀 ห่อของขวัญ — ค่าห่อคิดจากที่ร้านตั้ง (calcGiftFee) ไม่เชื่อตัวเลขจากหน้าเว็บ */
  gift?: { wrap: boolean; /** 💌 การ์ดอวยพรแยกจากห่อ (ร้านเปิด card_enabled) */ addCard?: boolean; message?: string; hidePrice?: boolean; card?: unknown };
  /** 🌐 ภาษาที่ลูกค้าใช้ตอนสั่ง (หน้า /en = "en") → ข้อความแจ้งลูกค้า/หน้าตามออเดอร์ใช้ภาษานี้ */
  lang: CustomerLang;
}

export interface OrderLineView {
  name: string;
  variantLabel: string | null;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface OrderView {
  orderNo: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  ship: { addressLine: string; subdistrict: string; district: string; province: string; postal: string };
  items: OrderLineView[];
  subtotal: number;
  shippingFee: number;
  discount: number;
  /** โค้ดส่วนลดที่ใช้ (ไม่มี = null) */
  couponCode?: string | null;
  /** ⭐ แต้มที่ใช้ลด + เป็นเงินเท่าไร (ไม่ได้ใช้ = 0) */
  pointsUsed?: number;
  pointsDiscount?: number;
  /** ⭐ แต้มที่ได้จากออเดอร์นี้ (ได้เมื่อสถานะ "สำเร็จ") */
  pointsEarned?: number;
  /** 🎀 ห่อของขวัญ (ไม่ห่อ = false / 0 / "") */
  giftWrap?: boolean;
  giftFee?: number;
  /** 💌 ค่าการ์ดอวยพร (บริการแยกจากห่อ) — 0 = ไม่ได้ซื้อการ์ดแยก/การ์ดฟรี */
  giftCardFee?: number;
  /** 💌 สั่งการ์ดแยก (ไม่ห่อก็ได้) — ไม่ห่อ + มีข้อความ/การ์ด = true ด้วย */
  giftCardOnly?: boolean;
  giftMessage?: string;
  giftHidePrice?: boolean;
  /** 🎴 การ์ด (ถึง/จาก/ลาย/ตัวหนังสือ) — ข้อความอยู่ giftMessage · ไม่มีการ์ด = null */
  giftCard?: OrderGiftCard | null;
  grandTotal: number;
  note: string;
  createdAt: string;
  /** ข้อมูลโอนเงิน (เฉพาะออเดอร์พร้อมเพย์ที่ยังไม่ชำระ) */
  promptpay: { number: string; name: string } | null;
  /** 🌐 ภาษาที่ลูกค้าใช้ตอนสั่ง */
  lang?: CustomerLang;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => Number(v) || 0;
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** ตรวจข้อมูลที่ลูกค้ากรอก — บอกว่าขาดอะไร ไม่เดาค่าให้ */
export function validateOrderInput(raw: unknown): { ok: true; input: PublicOrderInput } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const itemsRaw = Array.isArray(r.items) ? (r.items as unknown[]) : [];
  if (!itemsRaw.length) return { ok: false, error: "ตะกร้าว่าง" };
  if (itemsRaw.length > 50) return { ok: false, error: "สั่งได้ไม่เกิน 50 รายการต่อออเดอร์" };

  const items: PublicOrderItem[] = [];
  for (const it of itemsRaw) {
    const o = (it ?? {}) as Record<string, unknown>;
    const qty = Math.floor(num(o.qty));
    if (qty < 1 || qty > 99) return { ok: false, error: "จำนวนต้องอยู่ระหว่าง 1–99 ชิ้น" };
    // 🧵 เข็มขัดสั่งทำ: อ้างแบบที่บันทึกไว้แทนสินค้า
    const beltDesignId = clean(o.beltDesignId, 40);
    if (beltDesignId) {
      if (!UUID.test(beltDesignId)) return { ok: false, error: "รหัสแบบเข็มขัดไม่ถูกต้อง" };
      items.push({ productId: "", beltDesignId, qty, personalize: null });
      continue;
    }
    const productId = clean(o.productId, 40);
    if (!UUID.test(productId)) return { ok: false, error: "รหัสสินค้าไม่ถูกต้อง" };
    items.push({
      productId,
      optionId: clean(o.optionId, 60) || undefined,
      option2Id: clean(o.option2Id, 60) || undefined,
      qty,
      personalize: o.personalize && typeof o.personalize === "object" ? (o.personalize as PublicOrderItem["personalize"]) : null,
    });
  }

  const c = (r.customer ?? {}) as Record<string, unknown>;
  const name = clean(c.name, 120);
  const phone = digits(c.phone);
  const email = clean(c.email, 120);
  if (name.length < 2) return { ok: false, error: "กรุณากรอกชื่อผู้รับ" };
  if (phone.length < 9 || phone.length > 12) return { ok: false, error: "กรุณากรอกเบอร์โทรให้ถูกต้อง (9–10 หลัก)" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "รูปแบบอีเมลไม่ถูกต้อง" };

  const s = (r.ship ?? {}) as Record<string, unknown>;
  const addressLine = clean(s.addressLine, 500);
  if (addressLine.length < 5) return { ok: false, error: "กรุณากรอกที่อยู่จัดส่ง" };
  const postal = digits(s.postal).slice(0, 5);

  const pm = clean(r.paymentMethod, 20);
  if (pm !== "cod" && pm !== "promptpay") return { ok: false, error: "กรุณาเลือกวิธีชำระเงิน" };

  // 🎀 ห่อของขวัญ (ข้อความการ์ด ≤ 300 ตัว · ขึ้นบรรทัดใหม่ได้)
  const g = (r.gift ?? {}) as Record<string, unknown>;
  // 💌 การ์ดแยก (addCard) ส่งมาได้โดยไม่ห่อ
  const gift = g.wrap === true || g.addCard === true
    ? { wrap: g.wrap === true, ...(g.addCard === true ? { addCard: true } : {}), message: String(g.message ?? "").replace(/\r/g, "").trim().slice(0, 300) || undefined, hidePrice: g.hidePrice === true, card: g.card && typeof g.card === "object" ? g.card : undefined }
    : undefined;

  return {
    ok: true,
    input: {
      items,
      customer: { name, phone, email: email || undefined },
      ship: {
        addressLine,
        subdistrict: clean(s.subdistrict, 80),
        district: clean(s.district, 80),
        province: clean(s.province, 80),
        postal,
      },
      paymentMethod: pm,
      note: clean(r.note, 500) || undefined,
      couponCode: normalizeCouponCode(r.couponCode) || undefined,
      gift,
      lang: customerLang(r.lang),
    },
  };
}

// ─── เลือก SKU ลูกจากรหัสตัวเลือก ───

/** หา SKU ลูกจากรหัส "sku-xxxxxxxx" / "opt2-xxxxxxxx" ที่ API สินค้าเคยส่งไป */
function kidByOptionId(kids: ChildSku[], optionId: string | undefined, prefix: string): ChildSku | undefined {
  if (!optionId || !optionId.startsWith(prefix)) return undefined;
  const head = optionId.slice(prefix.length);
  if (head.length < 6) return undefined;
  return kids.find((k) => k.id.startsWith(head));
}

/**
 * opts.requireOption2 = สินค้านี้มีตัวเลือกชุดที่ 2 บนเว็บ (ไซส์) → สีที่มี SKU ไซส์ต้องเลือกไซส์ และต้องเป็นคู่ที่มีจริง + ไม่ได้ปิดไว้ (opts.off)
 *   ไม่ผ่าน = คืน error (ไม่ตกไปใช้ SKU ตัวหลักของสีแบบเงียบ ๆ — รหัสสินค้าในออเดอร์จะผิดตัว)
 * ไม่ส่ง opts = แบบเดิม (ร้านที่ไม่ได้เปิดตัวเลือกชุดที่ 2)
 */
export function pickSku(
  kids: ChildSku[],
  optionId?: string,
  option2Id?: string,
  opts: { requireOption2?: boolean; off?: Set<string>; label2?: string } = {}
): { sku: ChildSku | null; variantLabel: string | null; variantParts: string[]; error?: string } {
  // เรียงแบบเดียวกับที่เว็บสร้างตัวเลือก (sortKids) → SKU ที่หยิบ = ตัวเดียวกับที่เว็บโชว์ราคา
  kids = sortKids(kids);
  const k1 = kidByOptionId(kids, optionId, "sku-");
  const k2 = kidByOptionId(kids, option2Id, "opt2-");
  let cands = kids;
  const parts: string[] = [];
  if (k1) {
    // สีของ SKU ไซส์บางแถวพิมพ์ "/L" ติดท้าย (ข้อมูลเก่า) → เทียบด้วยสีที่ตัดแล้ว (ตัวเดียวกับที่เว็บใช้)
    const color = baseColor(k1);
    cands = cands.filter((k) => baseColor(k) === color);
    if (color) parts.push(color);
  }
  if (opts.requireOption2) {
    const sized = cands.filter((k) => variantValue(k));
    if (sized.length) {
      const label2 = opts.label2 || "ตัวเลือก";
      const fail = (error: string) => ({ sku: null, variantLabel: null, variantParts: [] as string[], error });
      const v = k2 ? variantValue(k2) : "";
      if (!v) return fail(`กรุณาเลือก${label2}`);
      const hit = sized.find((k) => variantValue(k) === v && !opts.off?.has(k.id.toLowerCase()));
      if (!hit) return fail(`${label2} ${v} ไม่มี${parts[0] ? `ในสี ${parts[0]}` : "แล้ว"}`);
      return { sku: hit, variantLabel: [...parts, v].join(" / "), variantParts: [...parts, v] };
    }
    // สีนี้ไม่มี SKU ไซส์ = ขายตัวหลักของสี (ไม่ต้องเลือกไซส์) — SKU ที่รหัสตัวเลือกอ้างก่อน
    const sku = (k1 && !variantValue(k1) ? k1 : null) ?? cands.find((k) => !variantValue(k)) ?? cands[0] ?? null;
    return { sku, variantLabel: parts.length ? parts.join(" / ") : null, variantParts: parts };
  }
  if (k2) {
    const v = variantValue(k2);
    cands = cands.filter((k) => variantValue(k) === v);
    if (v) parts.push(v);
  }
  // ไม่มีตัวเลือกชุด 2 = SKU ที่รหัสตัวเลือกอ้างตรง ๆ (สีเดียวกันมีหลาย SKU ราคาต่างกัน → ต้องได้ตัวที่เว็บโชว์ราคา)
  const sku = (k2 ? cands[0] : k1 ?? cands[0]) ?? kids[0] ?? null;
  return { sku, variantLabel: parts.length ? parts.join(" / ") : null, variantParts: parts };
}

/** ชื่อตัวเลือกที่เจ้าของกรอกทับเองในหน้าจัดการ (web_options) — รหัสเป็นอะไรก็ได้ */
function customOptionLabel(listing: ListingRow, optionId?: string): string | null {
  const wo = listing.web_options as { items?: { id?: string; label?: string }[] } | null | undefined;
  if (!optionId || !wo?.items?.length) return null;
  const hit = wo.items.find((i) => i.id === optionId);
  return hit?.label ? clean(hit.label, 80) : null;
}
/** 🌐 ชื่ออังกฤษของตัวเลือกที่กรอกทับเอง (label_en · ไม่กรอก = "") */
function customOptionLabelEn(listing: ListingRow, optionId?: string): string {
  const wo = listing.web_options as { items?: { id?: string; label_en?: string }[] } | null | undefined;
  return optionId ? clean(wo?.items?.find((i) => i.id === optionId)?.label_en, 80) : "";
}

// ─── สร้างออเดอร์ ───

export interface OrderShop {
  id: string;
  slug: string;
  field_map: unknown;
}

type LineInsert = {
  sku_id: string | null;
  sku_code: string | null;
  parent_code: string | null;
  name: string;
  variant_label: string | null;
  /** 🌐 ชื่อ/ตัวเลือกภาษาอังกฤษ ณ ตอนสั่ง (null = ใช้ไทย) — ลูกค้าหน้า /en เห็นอันนี้ · พนักงานเห็นไทยเสมอ */
  name_en?: string | null;
  variant_label_en?: string | null;
  unit_price: number;
  qty: number;
  line_total: number;
  personalize: PersonalizeChoice | null;
  /** 🧵 แบบเข็มขัด (belt_designs.id) — รายการสินค้าปกติ = null */
  belt_design_id?: string | null;
};

const pad = (n: number, len: number) => String(n).padStart(len, "0");

/** เลขที่ออเดอร์: <PREFIX>-<พ.ศ.><เดือน>-<ลำดับ 5 หลัก> นับใหม่ทุกเดือนแยกร้าน */
export function orderNoPrefix(info: SiteInfo, shopSlug: string, now = new Date()): string {
  const be = now.getFullYear() + 543;
  return `${orderPrefixFor(info, shopSlug)}-${be}${pad(now.getMonth() + 1, 2)}-`;
}

export type CreateOrderResult =
  | { ok: true; order: OrderView; /** id ในฐานข้อมูล (ไว้แจ้งลูกค้า — ไม่ส่งให้หน้าเว็บ) */ orderId: string }
  | { ok: false; error: string; status: number };

/**
 * opts.customerId = สมาชิกที่ล็อกอิน (มาจากเว็บร้านฝั่งเซิร์ฟเวอร์ผ่านด่านกุญแจภายในเท่านั้น — ห้ามรับจากเบราว์เซอร์ตรง ๆ)
 * opts.redeemPoints = ⭐ แต้มที่สมาชิกขอใช้ลดราคา (สมาชิกเท่านั้น · ตรวจ + ตัดแต้มแบบล็อกแถวที่นี่ · lib/member-points)
 */
export async function createStorefrontOrder(sb: Admin, shop: OrderShop, raw: unknown, opts: { customerId?: string | null; redeemPoints?: number } = {}): Promise<CreateOrderResult> {
  const v = validateOrderInput(raw);
  if (!v.ok) return { ok: false, error: v.error, status: 400 };
  const input = v.input;

  const info = await readSiteInfo(sb, shop.id);
  if (input.paymentMethod === "cod" && !info.pay_cod) return { ok: false, error: "ร้านนี้ไม่รับเก็บเงินปลายทาง", status: 400 };
  if (input.paymentMethod === "promptpay" && !info.pay_promptpay) return { ok: false, error: "ร้านนี้ไม่รับโอนพร้อมเพย์", status: 400 };

  const fieldMap = normalizeFieldMap(shop.field_map);
  const parentIds = [...new Set(input.items.filter((i) => !i.beltDesignId).map((i) => i.productId))];
  // 🧵 แบบเข็มขัดที่สั่ง: ต้องเป็นของร้านนี้ ยังไม่เคยสั่ง และมีราคา (ราคาคิดไว้ตอนบันทึกแบบ — lib/belt-builder-order)
  const beltIds = [...new Set(input.items.map((i) => i.beltDesignId).filter((x): x is string => !!x))];
  const beltById = new Map<string, BeltDesignRow>();
  if (beltIds.length) {
    const { data: bd } = await sb.from("belt_designs").select("id, status, total_price, selections, order_ref").eq("shop_id", shop.id).in("id", beltIds);
    for (const d of (bd ?? []) as BeltDesignRow[]) beltById.set(d.id, d);
  }

  const [{ data: listData }, { data: parents }, { data: children }, { data: swatchRows }, { data: dropRows }] = await Promise.all([
    sb
      .from("store_listings")
      .select("parent_sku_id, is_published, web_name, web_price, web_description, web_images, web_unit, web_category, web_categories, web_options, web_personalize, web_stock_status, web_variant_off")
      .eq("shop_id", shop.id)
      .in("parent_sku_id", parentIds),
    sb.from("parent_skus_v2").select(PARENT_SELECT).in("id", parentIds),
    sb.from("skus_v2").select(CHILD_SELECT).in("parent_sku_id", parentIds).eq("is_active", true),
    // 🌐 ชื่อสีภาษาอังกฤษ (ทะเบียนสีกลาง) — เก็บคู่ไทยในรายการสินค้า ให้ลูกค้าหน้า /en เห็นภาษาเดียวกับตอนเลือก
    sb.from("erp_color_dictionary").select(SWATCH_SELECT).eq("is_active", true),
    // 🆕 ชุดมาใหม่ที่ยังไม่ถึงเวลาเปิด (ตั้งซ่อน) — ห้ามสั่งก่อนเวลา (กันลิงก์/ตะกร้าเก่า)
    sb.from("store_new_drops").select("id, start_at, end_at, codes, hide_until_start").eq("shop_id", shop.id),
  ]);
  const dropHidden = hiddenDropCodes(((dropRows ?? []) as Record<string, unknown>[]).map(dropFromRow));
  const swatches = new SwatchIndex(((swatchRows ?? []) as Parameters<typeof rowToSwatchEntry>[0][]).map(rowToSwatchEntry));
  const enOf = (s: string) => swatches.english(s) || s;

  const listingByParent = new Map<string, ListingRow & { parent_sku_id: string; is_published: boolean; web_stock_status?: string | null }>();
  for (const l of (listData ?? []) as (ListingRow & { parent_sku_id: string; is_published: boolean; web_stock_status?: string | null })[]) {
    listingByParent.set(l.parent_sku_id, l);
  }
  // ชื่อสินค้าในออเดอร์ต้องตรงกับที่ลูกค้าเห็นบนเว็บ (กฎลบแบรนด์/คอลเลกชัน)
  if (nameRuleNeedsRefs(fieldMap)) await attachNameRefs(sb, (parents ?? []) as ParentRow[]);
  const parentById = new Map(((parents ?? []) as ParentRow[]).map((p) => [p.id, p]));
  const kidsByParent = new Map<string, ChildSku[]>();
  for (const k of (children ?? []) as (ChildSku & { parent_sku_id: string })[]) {
    const arr = kidsByParent.get(k.parent_sku_id) ?? [];
    arr.push(k);
    kidsByParent.set(k.parent_sku_id, arr);
  }

  const catIds = [...new Set(((parents ?? []) as ParentRow[]).map((p) => p.category_id).filter(Boolean))] as string[];
  const catName = new Map<string, string>();
  if (catIds.length) {
    const { data: cats } = await sb.from("product_categories").select("id, name").in("id", catIds);
    for (const c of (cats ?? []) as { id: string; name: string }[]) catName.set(c.id, c.name);
  }

  const lines: LineInsert[] = [];
  let subtotal = 0;
  for (const it of input.items) {
    if (it.beltDesignId) {
      const bl = beltDesignLine(beltById.get(it.beltDesignId) ?? null, it.qty);
      if (!bl.ok) return { ok: false, error: bl.error, status: 409 };
      subtotal += bl.line.line_total;
      lines.push(bl.line);
      continue;
    }
    const listing = listingByParent.get(it.productId);
    const parent = parentById.get(it.productId);
    if (!listing || !listing.is_published || !parent) {
      return { ok: false, error: "มีสินค้าที่ไม่ได้เปิดขายบนเว็บแล้ว กรุณาเอาออกจากตะกร้า", status: 409 };
    }
    if (dropHidden.has(String(parent.code ?? "").toUpperCase())) return { ok: false, error: "มีสินค้าที่ยังไม่ถึงเวลาเปิดขาย กรุณาเอาออกจากตะกร้า", status: 409 };
    const kids = kidsByParent.get(parent.id) ?? [];
    const resolved = resolveProduct(
      fieldMap,
      parent,
      kids,
      listing,
      parent.category_id ? catName.get(parent.category_id) ?? null : null
    );
    // 🚫 ตั้ง "สินค้าหมด" ใน ERP แล้ว = รับออเดอร์ไม่ได้ (กันตะกร้าเก่าที่ใส่ไว้ก่อนของหมด)
    if (listing.web_stock_status === "out") return { ok: false, error: `สินค้า ${resolved.name} หมดแล้ว กรุณาเอาออกจากตะกร้า`, status: 409 };

    // 📐 มีตัวเลือกชุดที่ 2 (ไซส์) บนเว็บ → ต้องเป็นคู่ สี×ไซส์ ที่มีจริงและไม่ได้ปิดไว้ (lib/website-size-options)
    const picked = pickSku(kids, it.optionId, it.option2Id, {
      requireOption2: !!resolved.options2,
      off: new Set(cleanVariantOff(listing.web_variant_off)),
      label2: resolved.options2?.label,
    });
    if (picked.error) return { ok: false, error: `สินค้า ${resolved.name}: ${picked.error}`, status: 409 };
    // 💰 ราคาตาม SKU ที่ลูกค้าเลือกจริง — สูตรเดียวกับที่เว็บโชว์ (lib/website-field-map skuUnitPrice / variantPrices) · ราคาเว็บทับ/ตัวเลือกกรอกเอง = ราคารุ่น
    const price = Math.round(skuUnitPrice(fieldMap, listing, picked.sku, resolved.price) * 100) / 100;
    if (price <= 0) return { ok: false, error: `สินค้า ${resolved.name} ยังไม่มีราคา กรุณาติดต่อร้าน`, status: 409 };
    const custom = customOptionLabel(listing, it.optionId);
    let variant = custom ?? picked.variantLabel;
    let variantEn = custom ? customOptionLabelEn(listing, it.optionId) || enOf(custom) : picked.variantParts.length ? picked.variantParts.map(enOf).join(" / ") : null;
    // 🔤 ปั๊มชื่อ: ยอมเฉพาะรุ่นที่เปิดไว้ และข้อความ/แบบ/ตำแหน่งต้องผ่านตัวกรอง
    let personalize: PersonalizeChoice | null = null;
    if (it.personalize) {
      const cfg = (listing as { web_personalize?: unknown } | null)?.web_personalize ? normalizePersonalize((listing as { web_personalize?: unknown }).web_personalize) : null;
      personalize = normalizePersonalizeChoice(it.personalize, cfg);
      if (!personalize) return { ok: false, error: `สินค้า ${resolved.name} ปั๊มชื่อไม่ได้ หรือข้อความไม่ถูกต้อง`, status: 409 };
      variant = [variant, personalizeLabel(personalize, cfg)].filter(Boolean).join(" · ");
      variantEn = [variantEn, personalizeLabel(personalize, cfg, "en")].filter(Boolean).join(" · ");
    }
    const lineTotal = Math.round(price * it.qty * 100) / 100;
    subtotal += lineTotal;
    lines.push({
      personalize,
      sku_id: picked.sku?.id ?? null,
      sku_code: picked.sku?.code ?? null,
      parent_code: parent.code ?? null,
      name: resolved.name,
      variant_label: variant,
      // ช่อง name_en ที่กรอกเป็นไทย (ข้อมูลเก่า) = ไม่ถือเป็นชื่ออังกฤษ
      name_en: resolved.name_en && !/[฀-๿]/.test(resolved.name_en) ? resolved.name_en : null,
      variant_label_en: variantEn && variantEn !== variant ? variantEn : null,
      unit_price: price,
      qty: it.qty,
      line_total: lineTotal,
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const shippingFee = calcShippingFee(subtotal, info);
  // 🎀 ห่อของขวัญ: ร้านปิดบริการไปแล้วระหว่างลูกค้ากรอก = บอกให้เอาออก (ไม่เงียบห่อไม่ได้) · ข้อความ/ซ่อนราคา รับเฉพาะที่ร้านเปิดให้เลือก
  if (input.gift?.wrap && !info.gift_enabled) return { ok: false, error: "ร้านปิดบริการห่อของขวัญแล้ว — เอาตัวเลือกห่อของขวัญออกแล้วสั่งอีกครั้ง", status: 409 };
  if (input.gift?.addCard && !info.card_enabled) return { ok: false, error: "ร้านปิดบริการการ์ดอวยพรแล้ว — เอาตัวเลือกเขียนการ์ดออกแล้วสั่งอีกครั้ง", status: 409 };
  const giftWrap = !!input.gift?.wrap;
  // 💌 การ์ดแยก: ไม่ห่อก็เขียนการ์ดได้ · ค่าการ์ดคิดจากที่ร้านตั้ง (ไม่เชื่อหน้าเว็บ)
  const cardOnly = !!input.gift?.addCard;
  const giftFee = calcGiftFee(giftWrap, info);
  const giftCardFee = calcCardFee(cardOnly, info);
  const msgOk = cardOnly || (giftWrap && info.gift_allow_message);
  const giftMessage = msgOk ? input.gift?.message ?? null : null;
  const giftHidePrice = (giftWrap || cardOnly) && info.gift_allow_hide_price && !!input.gift?.hidePrice;
  // 🎴 การ์ด: ตรวจความยาว/จำนวนบรรทัดตามที่ร้านตั้ง + ลาย/ตัวหนังสือต้องยังเปิดอยู่ (lib/website-gift-cards)
  let giftCard: OrderGiftCard | null = null;
  if (msgOk) {
    const rc = normalizeOrderCard(input.gift?.card ?? null, await readGiftCards(sb, shop.id), giftMessage ?? "");
    if (!rc.ok) return { ok: false, error: rc.error, status: 400 };
    giftCard = rc.card;
  }
  // 🎟️ โค้ดส่วนลด: ตรวจ + คิดใหม่ที่นี่เสมอ (ไม่เชื่อยอดจากหน้าเว็บ) · ใช้ไม่ได้ = ไม่รับออเดอร์ บอกเหตุผล (ลูกค้าเอาโค้ดออกแล้วสั่งต่อได้)
  let discount = 0;
  let coupon: StoreCoupon | null = null;
  if (input.couponCode) {
    const cr = await checkCoupon(sb, shop.id, input.couponCode, subtotal, input.customer.phone, opts.customerId ?? null);
    if (!cr.ok) return { ok: false, error: `โค้ดส่วนลด ${input.couponCode}: ${cr.error}`, status: 400 };
    discount = cr.discount;
    coupon = cr.coupon ?? null;
  }
  // ⭐ ใช้แต้มลดราคา (สมาชิกเท่านั้น · หลังคูปอง) — ตรวจกับยอดคงเหลือตอนนี้ แล้วตัดจริงแบบล็อกแถวหลังบันทึกออเดอร์
  let pointsUsed = 0;
  let pointsDiscount = 0;
  const wantPoints = Math.floor(Number(opts.redeemPoints) || 0);
  if (opts.customerId && wantPoints > 0) {
    const rr = validateRedeem(wantPoints, await pointsBalance(sb, opts.customerId), Math.max(0, subtotal - discount), pointsConfigFrom(info));
    if (!rr.ok) return { ok: false, error: `ใช้แต้ม: ${rr.error}`, status: 400 };
    pointsUsed = rr.points;
    pointsDiscount = rr.discount;
  }
  const grandTotal = Math.round((subtotal + shippingFee + giftFee + giftCardFee - discount - pointsDiscount) * 100) / 100;

  const prefix = orderNoPrefix(info, shop.slug);
  for (let attempt = 0; attempt < 6; attempt++) {
    const { count } = await sb
      .from("store_orders")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id)
      .like("order_no", `${prefix}%`);
    const orderNo = prefix + pad((count ?? 0) + 1 + attempt, 5);

    // ประกาศเป็น Record ก่อน — กัน TS ไล่ชนิด insert ของ supabase ลึกเกิน (TS2589) กับตารางที่ไม่มีใน generated types
    const payload: Record<string, unknown> = {
        shop_id: shop.id,
        order_no: orderNo,
        status: "pending",
        customer_name: input.customer.name,
        customer_phone: input.customer.phone,
        customer_email: input.customer.email ?? null,
        ship_address_line: input.ship.addressLine,
        ship_subdistrict: input.ship.subdistrict || null,
        ship_district: input.ship.district || null,
        ship_province: input.ship.province || null,
        ship_postal: input.ship.postal || null,
        payment_method: input.paymentMethod,
        payment_status: "unpaid",
        subtotal,
        shipping_fee: shippingFee,
        discount,
        coupon_code: coupon?.code ?? null,
        points_used: pointsUsed,
        points_discount: pointsDiscount,
        gift_wrap: giftWrap,
        gift_fee: giftFee,
        gift_card_fee: giftCardFee,
        gift_message: giftMessage,
        gift_hide_price: giftHidePrice,
        gift_card: giftCard,
        grand_total: grandTotal,
        note: input.note ?? null,
        customer_id: opts.customerId ?? null,
        lang: input.lang,
    };
    const ins = await sb.from("store_orders").insert(payload).select("id, order_no, created_at").maybeSingle();
    const insErr = ins.error;
    const order = ins.data as { id: string; order_no: string; created_at: string } | null;

    if (insErr || !order) {
      if (!insErr) return { ok: false, error: "บันทึกออเดอร์ไม่สำเร็จ กรุณาลองใหม่", status: 500 };
      if ((insErr as { code?: string }).code === "23505") continue; // เลขชน → ขยับเลขแล้วลองใหม่
      console.error("[website-orders] insert order", insErr);
      return { ok: false, error: "บันทึกออเดอร์ไม่สำเร็จ กรุณาลองใหม่", status: 500 };
    }

    const { error: itemsErr } = await sb
      .from("store_order_items")
      .insert(lines.map((l) => ({ ...l, order_id: order.id })));
    if (itemsErr) {
      await sb.from("store_orders").delete().eq("id", order.id);
      console.error("[website-orders] insert items", itemsErr);
      return { ok: false, error: "บันทึกรายการสินค้าไม่สำเร็จ กรุณาลองใหม่", status: 500 };
    }

    // 🧵 แบบเข็มขัดที่สั่ง → ordered + จำเลขที่ออเดอร์ (แท็บ "แบบของลูกค้า" ใน /admin/belt-builder เห็นว่าแบบไหนสั่งแล้ว) + audit
    if (beltIds.length) {
      const { error: bdErr } = await sb.from("belt_designs").update({ status: "ordered", order_ref: order.order_no, updated_at: new Date().toISOString() }).in("id", beltIds);
      if (bdErr) console.error("[website-orders] mark belt designs ordered", bdErr);
      for (const id of beltIds) await writeAudit(sb, { action: "order", entityType: "belt_designs", entityId: id, actorName: input.customer.phone, metadata: { order_no: order.order_no, order_id: order.id, shop: shop.slug } });
    }

    // ⭐ ตัดแต้มจริง (ล็อกแถวสมาชิก) — ไม่พอแล้ว (ใช้ไปกับอีกออเดอร์พร้อมกัน) = ยกเลิกออเดอร์นี้ทั้งใบ ไม่ให้ได้ส่วนลดฟรี
    if (opts.customerId && pointsUsed > 0 && !(await redeemForOrder(sb, opts.customerId, order.id, pointsUsed))) {
      await sb.from("store_orders").delete().eq("id", order.id);
      return { ok: false, error: "แต้มไม่พอแล้ว (อาจใช้ไปกับออเดอร์อื่น) — รีเฟรชหน้าแล้วลองใหม่", status: 409 };
    }

    // บันทึกการใช้คูปอง (นับจำนวนครั้ง/เบอร์ละครั้ง) — พังก็ไม่ล้มออเดอร์ (ยอดลดถูกบันทึกในออเดอร์แล้ว) แค่ log
    if (coupon && discount > 0) {
      const { error: redErr } = await sb
        .from("store_coupon_redemptions")
        .insert({ coupon_id: coupon.id, shop_id: shop.id, order_id: order.id, customer_phone: input.customer.phone, discount });
      if (redErr) console.error("[website-orders] coupon redemption", redErr);
    }

    return {
      ok: true,
      order: {
        orderNo: order.order_no,
        status: "pending",
        paymentMethod: input.paymentMethod,
        paymentStatus: "unpaid",
        customerName: input.customer.name,
        customerPhone: input.customer.phone,
        ship: {
          addressLine: input.ship.addressLine,
          subdistrict: input.ship.subdistrict ?? "",
          district: input.ship.district ?? "",
          province: input.ship.province ?? "",
          postal: input.ship.postal ?? "",
        },
        items: lines.map((l) => ({
          name: (input.lang === "en" && l.name_en) || l.name,
          variantLabel: (input.lang === "en" && l.variant_label_en) || l.variant_label,
          unitPrice: l.unit_price,
          qty: l.qty,
          lineTotal: l.line_total,
        })),
        subtotal,
        shippingFee,
        discount,
        couponCode: coupon?.code ?? null,
        pointsUsed,
        pointsDiscount,
        pointsEarned: 0,
        giftWrap,
        giftFee,
        giftCardFee,
        giftCardOnly: cardOnly || (!giftWrap && !!(giftMessage || giftCard)),
        giftMessage: giftMessage ?? "",
        giftHidePrice,
        giftCard,
        grandTotal,
        note: input.note ?? "",
        createdAt: order.created_at,
        promptpay: promptpayFor(info, input.paymentMethod, "unpaid"),
        lang: input.lang,
      },
      orderId: order.id,
    };
  }
  return { ok: false, error: "ระบบไม่ว่าง กรุณาลองใหม่อีกครั้ง", status: 503 };
}

function promptpayFor(info: SiteInfo, method: string, paymentStatus: string): OrderView["promptpay"] {
  if (method !== "promptpay" || paymentStatus !== "unpaid" || !info.promptpay_number) return null;
  return { number: info.promptpay_number, name: info.promptpay_name };
}

// ─── ลูกค้าตามออเดอร์ (ต้องรู้เลขที่ + เบอร์โทร กันคนอื่นสุ่มดู) ───

export type OrderRow = {
  id: string;
  order_no: string;
  status: string;
  payment_method: string;
  payment_status: string;
  customer_name: string;
  customer_phone: string;
  ship_address_line: string | null;
  ship_subdistrict: string | null;
  ship_district: string | null;
  ship_province: string | null;
  ship_postal: string | null;
  subtotal: number | string;
  shipping_fee: number | string;
  discount: number | string;
  coupon_code?: string | null;
  points_used?: number | null;
  points_discount?: number | string | null;
  points_earned?: number | null;
  gift_wrap?: boolean | null;
  gift_fee?: number | string | null;
  gift_card_fee?: number | string | null;
  gift_message?: string | null;
  gift_hide_price?: boolean | null;
  gift_card?: unknown;
  grand_total: number | string;
  note: string | null;
  created_at: string;
  lang?: string | null;
};

export type ItemRow = {
  name: string;
  variant_label: string | null;
  name_en?: string | null;
  variant_label_en?: string | null;
  unit_price: number | string;
  qty: number;
  line_total: number | string;
};

/** viewLang = ภาษาที่จะโชว์ชื่อสินค้า (ไม่ส่ง = ภาษาที่ลูกค้าใช้ตอนสั่ง) · พนักงาน = "th" เสมอ */
export function toOrderView(o: OrderRow, items: ItemRow[], info: SiteInfo | null, viewLang?: CustomerLang): OrderView {
  const show = viewLang ?? customerLang(o.lang);
  return {
    orderNo: o.order_no,
    status: o.status,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    customerName: o.customer_name,
    customerPhone: o.customer_phone,
    ship: {
      addressLine: o.ship_address_line ?? "",
      subdistrict: o.ship_subdistrict ?? "",
      district: o.ship_district ?? "",
      province: o.ship_province ?? "",
      postal: o.ship_postal ?? "",
    },
    items: items.map((i) => ({
      name: (show === "en" && i.name_en) || i.name,
      variantLabel: (show === "en" && i.variant_label_en) || i.variant_label,
      unitPrice: num(i.unit_price),
      qty: i.qty,
      lineTotal: num(i.line_total),
    })),
    subtotal: num(o.subtotal),
    shippingFee: num(o.shipping_fee),
    discount: num(o.discount),
    couponCode: o.coupon_code ?? null,
    pointsUsed: num(o.points_used),
    pointsDiscount: num(o.points_discount),
    pointsEarned: num(o.points_earned),
    giftWrap: !!o.gift_wrap,
    giftFee: num(o.gift_fee),
    giftCardFee: num(o.gift_card_fee),
    giftCardOnly: num(o.gift_card_fee) > 0 || (!o.gift_wrap && !!(o.gift_message || o.gift_card)),
    giftMessage: o.gift_message ?? "",
    giftHidePrice: !!o.gift_hide_price,
    giftCard: readOrderCard(o.gift_card),
    grandTotal: num(o.grand_total),
    note: o.note ?? "",
    createdAt: o.created_at,
    promptpay: info ? promptpayFor(info, o.payment_method, o.payment_status) : null,
    lang: customerLang(o.lang),
  };
}

export async function findStorefrontOrder(
  sb: Admin,
  shopId: string,
  orderNo: string,
  phone: string,
  viewLang?: CustomerLang
): Promise<OrderView | null> {
  const no = clean(orderNo, 40).toUpperCase();
  const ph = digits(phone);
  if (!no || ph.length < 9) return null;

  const { data: o } = await sb.from("store_orders").select("*").eq("shop_id", shopId).eq("order_no", no).maybeSingle();
  if (!o) return null;
  const row = o as OrderRow;
  // เทียบ 9 หลักท้าย — กันเคสกรอก 0 นำ / +66 ไม่เหมือนกัน
  if (digits(row.customer_phone).slice(-9) !== ph.slice(-9)) return null;

  const [{ data: items }, info] = await Promise.all([
    sb.from("store_order_items").select("name, variant_label, name_en, variant_label_en, unit_price, qty, line_total").eq("order_id", row.id).order("id"),
    readSiteInfo(sb, shopId),
  ]);
  return toOrderView(row, (items ?? []) as ItemRow[], info, viewLang);
}
