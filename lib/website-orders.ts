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
  PARENT_SELECT,
  CHILD_SELECT,
  type ParentRow,
  type ChildSku,
  type ListingRow,
} from "@/lib/website-field-map";
import { calcShippingFee, orderPrefixFor, readSiteInfo, type SiteInfo } from "@/lib/website-site-info";

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
}

export interface PublicOrderInput {
  items: PublicOrderItem[];
  customer: { name: string; phone: string; email?: string };
  ship: { addressLine: string; subdistrict?: string; district?: string; province?: string; postal?: string };
  paymentMethod: PaymentMethod;
  note?: string;
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
  grandTotal: number;
  note: string;
  createdAt: string;
  /** ข้อมูลโอนเงิน (เฉพาะออเดอร์พร้อมเพย์ที่ยังไม่ชำระ) */
  promptpay: { number: string; name: string } | null;
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
    const productId = clean(o.productId, 40);
    if (!UUID.test(productId)) return { ok: false, error: "รหัสสินค้าไม่ถูกต้อง" };
    const qty = Math.floor(num(o.qty));
    if (qty < 1 || qty > 99) return { ok: false, error: "จำนวนต้องอยู่ระหว่าง 1–99 ชิ้น" };
    items.push({
      productId,
      optionId: clean(o.optionId, 60) || undefined,
      option2Id: clean(o.option2Id, 60) || undefined,
      qty,
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
    },
  };
}

// ─── เลือก SKU ลูกจากรหัสตัวเลือก ───

const variantValue = (k: ChildSku): string =>
  clean((k.attribute_values as { variant_option?: { value?: unknown } } | null)?.variant_option?.value);

/** หา SKU ลูกจากรหัส "sku-xxxxxxxx" / "opt2-xxxxxxxx" ที่ API สินค้าเคยส่งไป */
function kidByOptionId(kids: ChildSku[], optionId: string | undefined, prefix: string): ChildSku | undefined {
  if (!optionId || !optionId.startsWith(prefix)) return undefined;
  const head = optionId.slice(prefix.length);
  if (head.length < 6) return undefined;
  return kids.find((k) => k.id.startsWith(head));
}

export function pickSku(
  kids: ChildSku[],
  optionId?: string,
  option2Id?: string
): { sku: ChildSku | null; variantLabel: string | null } {
  const k1 = kidByOptionId(kids, optionId, "sku-");
  const k2 = kidByOptionId(kids, option2Id, "opt2-");
  let cands = kids;
  const parts: string[] = [];
  if (k1) {
    const color = clean(k1.color);
    cands = cands.filter((k) => clean(k.color) === color);
    if (color) parts.push(color);
  }
  if (k2) {
    const v = variantValue(k2);
    cands = cands.filter((k) => variantValue(k) === v);
    if (v) parts.push(v);
  }
  const sku = cands[0] ?? k1 ?? kids[0] ?? null;
  return { sku, variantLabel: parts.length ? parts.join(" / ") : null };
}

/** ชื่อตัวเลือกที่เจ้าของกรอกทับเองในหน้าจัดการ (web_options) — รหัสเป็นอะไรก็ได้ */
function customOptionLabel(listing: ListingRow, optionId?: string): string | null {
  const wo = listing.web_options as { items?: { id?: string; label?: string }[] } | null | undefined;
  if (!optionId || !wo?.items?.length) return null;
  const hit = wo.items.find((i) => i.id === optionId);
  return hit?.label ? clean(hit.label, 80) : null;
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
  unit_price: number;
  qty: number;
  line_total: number;
};

const pad = (n: number, len: number) => String(n).padStart(len, "0");

/** เลขที่ออเดอร์: <PREFIX>-<พ.ศ.><เดือน>-<ลำดับ 5 หลัก> นับใหม่ทุกเดือนแยกร้าน */
export function orderNoPrefix(info: SiteInfo, shopSlug: string, now = new Date()): string {
  const be = now.getFullYear() + 543;
  return `${orderPrefixFor(info, shopSlug)}-${be}${pad(now.getMonth() + 1, 2)}-`;
}

export type CreateOrderResult =
  | { ok: true; order: OrderView }
  | { ok: false; error: string; status: number };

export async function createStorefrontOrder(sb: Admin, shop: OrderShop, raw: unknown): Promise<CreateOrderResult> {
  const v = validateOrderInput(raw);
  if (!v.ok) return { ok: false, error: v.error, status: 400 };
  const input = v.input;

  const info = await readSiteInfo(sb, shop.id);
  if (input.paymentMethod === "cod" && !info.pay_cod) return { ok: false, error: "ร้านนี้ไม่รับเก็บเงินปลายทาง", status: 400 };
  if (input.paymentMethod === "promptpay" && !info.pay_promptpay) return { ok: false, error: "ร้านนี้ไม่รับโอนพร้อมเพย์", status: 400 };

  const fieldMap = normalizeFieldMap(shop.field_map);
  const parentIds = [...new Set(input.items.map((i) => i.productId))];

  const [{ data: listData }, { data: parents }, { data: children }] = await Promise.all([
    sb
      .from("store_listings")
      .select("parent_sku_id, is_published, web_name, web_price, web_description, web_images, web_unit, web_category, web_options")
      .eq("shop_id", shop.id)
      .in("parent_sku_id", parentIds),
    sb.from("parent_skus_v2").select(PARENT_SELECT).in("id", parentIds),
    sb.from("skus_v2").select(CHILD_SELECT).in("parent_sku_id", parentIds).eq("is_active", true),
  ]);

  const listingByParent = new Map<string, ListingRow & { parent_sku_id: string; is_published: boolean }>();
  for (const l of (listData ?? []) as (ListingRow & { parent_sku_id: string; is_published: boolean })[]) {
    listingByParent.set(l.parent_sku_id, l);
  }
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
    const listing = listingByParent.get(it.productId);
    const parent = parentById.get(it.productId);
    if (!listing || !listing.is_published || !parent) {
      return { ok: false, error: "มีสินค้าที่ไม่ได้เปิดขายบนเว็บแล้ว กรุณาเอาออกจากตะกร้า", status: 409 };
    }
    const kids = kidsByParent.get(parent.id) ?? [];
    const resolved = resolveProduct(
      fieldMap,
      parent,
      kids,
      listing,
      parent.category_id ? catName.get(parent.category_id) ?? null : null
    );
    const price = Math.round(resolved.price * 100) / 100;
    if (price <= 0) return { ok: false, error: `สินค้า ${resolved.name} ยังไม่มีราคา กรุณาติดต่อร้าน`, status: 409 };

    const picked = pickSku(kids, it.optionId, it.option2Id);
    const variant = customOptionLabel(listing, it.optionId) ?? picked.variantLabel;
    const lineTotal = Math.round(price * it.qty * 100) / 100;
    subtotal += lineTotal;
    lines.push({
      sku_id: picked.sku?.id ?? null,
      sku_code: picked.sku?.code ?? null,
      parent_code: parent.code ?? null,
      name: resolved.name,
      variant_label: variant,
      unit_price: price,
      qty: it.qty,
      line_total: lineTotal,
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;
  const shippingFee = calcShippingFee(subtotal, info);
  const discount = 0;
  const grandTotal = Math.round((subtotal + shippingFee - discount) * 100) / 100;

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
        grand_total: grandTotal,
        note: input.note ?? null,
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
          name: l.name,
          variantLabel: l.variant_label,
          unitPrice: l.unit_price,
          qty: l.qty,
          lineTotal: l.line_total,
        })),
        subtotal,
        shippingFee,
        discount,
        grandTotal,
        note: input.note ?? "",
        createdAt: order.created_at,
        promptpay: promptpayFor(info, input.paymentMethod, "unpaid"),
      },
    };
  }
  return { ok: false, error: "ระบบไม่ว่าง กรุณาลองใหม่อีกครั้ง", status: 503 };
}

function promptpayFor(info: SiteInfo, method: string, paymentStatus: string): OrderView["promptpay"] {
  if (method !== "promptpay" || paymentStatus !== "unpaid" || !info.promptpay_number) return null;
  return { number: info.promptpay_number, name: info.promptpay_name };
}

// ─── ลูกค้าตามออเดอร์ (ต้องรู้เลขที่ + เบอร์โทร กันคนอื่นสุ่มดู) ───

type OrderRow = {
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
  grand_total: number | string;
  note: string | null;
  created_at: string;
};

type ItemRow = {
  name: string;
  variant_label: string | null;
  unit_price: number | string;
  qty: number;
  line_total: number | string;
};

export function toOrderView(o: OrderRow, items: ItemRow[], info: SiteInfo | null): OrderView {
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
      name: i.name,
      variantLabel: i.variant_label,
      unitPrice: num(i.unit_price),
      qty: i.qty,
      lineTotal: num(i.line_total),
    })),
    subtotal: num(o.subtotal),
    shippingFee: num(o.shipping_fee),
    discount: num(o.discount),
    grandTotal: num(o.grand_total),
    note: o.note ?? "",
    createdAt: o.created_at,
    promptpay: info ? promptpayFor(info, o.payment_method, o.payment_status) : null,
  };
}

export async function findStorefrontOrder(
  sb: Admin,
  shopId: string,
  orderNo: string,
  phone: string
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
    sb.from("store_order_items").select("name, variant_label, unit_price, qty, line_total").eq("order_id", row.id).order("id"),
    readSiteInfo(sb, shopId),
  ]);
  return toOrderView(row, (items ?? []) as ItemRow[], info);
}
