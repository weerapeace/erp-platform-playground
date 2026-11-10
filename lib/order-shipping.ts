/**
 * 🚚 กติกากลาง "ขนส่ง" ของศูนย์ออเดอร์ (ขั้น 1 · โหมดจำลอง · เจ้าของอนุมัติ 2026-11-10) — pure · มีเทสต์
 *
 *   ออเดอร์ 2 แบบ:
 *     - ช่องทางของเรา (LINE แชต / Facebook / IG / LINE SHOPPING / เว็บกรอกเอง / โทร-หน้าร้าน) → เลือกขนส่งเองผ่าน SHIPPOP
 *     - แพลตฟอร์ม (Shopee / Lazada / TikTok) → แพลตฟอร์มเลือกขนส่ง ห้ามส่งด้วยขนส่งอื่น (การติดตามบนแพลตฟอร์มจะพัง)
 *     - ออเดอร์จากเมล = ยอดขายที่ส่งแล้ว → ส่งไม่ได้
 *   ตัวเรียก SHIPPOP = lib/shippop (ตัวเดียวกับเว็บร้าน) · ที่อยู่ผู้ส่ง = shipping_profiles ต่อแบรนด์
 * ใช้ที่: app/api/platform-orders/ship · app/api/platform-orders (สร้างออเดอร์เอง/แก้ที่อยู่) · หน้า /master/platform-orders
 */
import { carrierOf, parseBox, telOf, type BookItem, type ShippopAddress, type ShippopInfo } from "@/lib/shippop";
import type { PlatformOrderStatus } from "@/lib/platform-order-status";

/** ขั้น 1 = ล็อกโหมดจำลอง (ไม่เรียกขนส่งจริง ไม่เสียเงิน) แม้มีกุญแจ SHIPPOP แล้ว — เปิดจริงในขั้น 2 เมื่อเจ้าของอนุมัติ */
export const ORDER_CENTER_SHIPPING_FORCE = "sim" as const;

export const MARKETPLACE_CODES = ["shopee", "lazada", "tiktok"] as const;
export const isMarketplace = (code: string | null | undefined) => (MARKETPLACE_CODES as readonly string[]).includes(String(code ?? ""));

/** ช่องทางที่เลือกได้ตอนสร้างออเดอร์เอง · open=false = ยังเปิดไม่ได้
 *  phone: ไม่มีแถวใน erp_platforms แต่ platform_orders.platform_id ยัง NOT NULL → รอเจ้าของอนุมัติผ่อนเงื่อนไขฐานข้อมูล (2026-11-10) */
export const MANUAL_CHANNELS = [
  { code: "line_oa", label: "LINE แชต", open: true },
  { code: "facebook", label: "Facebook", open: true },
  { code: "instagram", label: "Instagram", open: true },
  { code: "line_shopping", label: "LINE SHOPPING", open: true },
  { code: "website", label: "เว็บไซต์ (กรอกเอง)", open: true },
  { code: "phone", label: "โทร / หน้าร้าน", open: false },
] as const;
export const OPEN_MANUAL_CHANNELS = MANUAL_CHANNELS.filter((m) => m.open);
export const isOpenManualChannel = (c: unknown) => OPEN_MANUAL_CHANNELS.some((m) => m.code === c);
export type ManualChannel = (typeof MANUAL_CHANNELS)[number]["code"];
export const isManualChannel = (c: unknown): c is ManualChannel => MANUAL_CHANNELS.some((m) => m.code === c);
export const manualChannelLabel = (c: unknown) => MANUAL_CHANNELS.find((m) => m.code === c)?.label ?? "";

/** ที่อยู่ผู้รับ (platform_orders.ship_to) */
export type ShipTo = { name: string; phone: string; address: string; subdistrict: string; district: string; province: string; postal: string };
export const EMPTY_SHIP_TO: ShipTo = { name: "", phone: "", address: "", subdistrict: "", district: "", province: "", postal: "" };

/** จุดส่งของต่อแบรนด์ (shipping_profiles) */
export type ShippingProfile = {
  brand_id: string; sender_name: string | null; sender_phone: string | null; sender_address: string | null; sender_subdistrict: string | null;
  sender_district: string | null; sender_province: string | null; sender_postal: string | null;
  default_box: string; default_weight_g: number; default_courier: string | null;
};

/** ข้อมูลการจองที่เก็บกับออเดอร์ (platform_orders.shipping) */
export type OrderShipping = ShippopInfo & { provider: "shippop" };

const clip = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** ตรวจ/ล้างที่อยู่ผู้รับที่กรอกมา — ok=false → ข้อความภาษาคน */
export function cleanShipTo(raw: unknown): { ok: true; value: ShipTo } | { ok: false; error: string } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const v: ShipTo = {
    name: clip(o.name, 120), phone: telOf(o.phone), address: clip(o.address, 300), subdistrict: clip(o.subdistrict, 80),
    district: clip(o.district, 80), province: clip(o.province, 80), postal: String(o.postal ?? "").replace(/\D/g, "").slice(0, 5),
  };
  if (v.name.length < 2) return { ok: false, error: "กรอกชื่อผู้รับ" };
  if (v.phone.length < 9) return { ok: false, error: "เบอร์ผู้รับไม่ถูกต้อง (9–10 หลัก)" };
  if (v.address.length < 3) return { ok: false, error: "กรอกบ้านเลขที่/ถนน ของผู้รับ" };
  if (!v.province) return { ok: false, error: "กรอกจังหวัดของผู้รับ" };
  if (v.postal.length !== 5) return { ok: false, error: "รหัสไปรษณีย์ผู้รับต้องมี 5 หลัก" };
  return { ok: true, value: v };
}

export function shipToAddress(s: ShipTo): ShippopAddress {
  return { name: s.name, address: s.address, district: s.subdistrict, state: s.district, province: s.province, postcode: s.postal, tel: s.phone };
}
export const shipToText = (s: ShipTo | null | undefined) => (s ? [s.address, s.subdistrict, s.district, s.province, s.postal].filter(Boolean).join(" ") : "");

/** ที่อยู่ผู้ส่งจากจุดส่งของของแบรนด์ — ไม่ครบ = บอกช่องที่ขาด */
export function senderOfProfile(p: ShippingProfile | null): { ok: true; from: ShippopAddress } | { ok: false; error: string } {
  if (!p) return { ok: false, error: "แบรนด์นี้ยังไม่ได้ตั้งจุดส่งของ — กด ตั้งค่าการส่ง ในศูนย์ออเดอร์" };
  const from: ShippopAddress = {
    name: clip(p.sender_name, 120), address: clip(p.sender_address, 300), district: clip(p.sender_subdistrict, 80), state: clip(p.sender_district, 80),
    province: clip(p.sender_province, 80), postcode: String(p.sender_postal ?? "").replace(/\D/g, "").slice(0, 5), tel: telOf(p.sender_phone),
  };
  const missing = [!from.name && "ชื่อผู้ส่ง", from.tel.length < 9 && "เบอร์", !from.address && "ที่อยู่", !from.province && "จังหวัด", from.postcode.length !== 5 && "รหัสไปรษณีย์"].filter(Boolean);
  return missing.length ? { ok: false, error: `จุดส่งของยังไม่ครบ (ขาด: ${missing.join(", ")}) — กด ตั้งค่าการส่ง` } : { ok: true, from };
}

export const isShippingActive = (s: Pick<OrderShipping, "status"> | null | undefined) => !!s && s.status !== "cancel";

/** ส่งผ่าน SHIPPOP ได้ไหม — ok=false → เหตุผลภาษาคน */
export function canShipViaShippop(o: { source: string | null; platform_code: string | null; status: string; shipping?: Pick<OrderShipping, "status"> | null }): { ok: true } | { ok: false; reason: string } {
  if (o.source === "email") return { ok: false, reason: "ออเดอร์จากอีเมล — ร้านส่งของไปแล้ว" };
  if (o.platform_code === "lazada") return { ok: false, reason: "ออเดอร์ Lazada ใช้ขนส่งของ Lazada — กด พร้อมส่ง ของ Lazada (ขั้น 3)" };
  if (o.platform_code === "shopee") return { ok: false, reason: "ออเดอร์ Shopee ใช้ขนส่งของ Shopee — นัดใน Seller Centre (Shopee ยังไม่ให้ใช้ API)" };
  if (isMarketplace(o.platform_code)) return { ok: false, reason: "ออเดอร์แพลตฟอร์มใช้ขนส่งของแพลตฟอร์ม" };
  if (o.status === "shipped") return { ok: false, reason: "ส่งไปแล้ว" };
  if (o.status === "cancelled") return { ok: false, reason: "ยกเลิกแล้ว" };
  if (isShippingActive(o.shipping)) return { ok: false, reason: "จองขนส่งไปแล้ว" };
  return { ok: true };
}

/** น้ำหนักพัสดุ (กรัม) = น้ำหนักต่อชิ้นจากสินค้า × จำนวน · สินค้าที่ไม่มีน้ำหนัก = ใช้ค่าตั้งต้นของจุดส่งของ */
export function parcelWeight(items: { qty: number; weight_g: number | null }[], defaultPerPiece: number): { grams: number; missing: number } {
  let grams = 0, missing = 0;
  const def = Math.max(50, Math.round(Number(defaultPerPiece) || 500));
  for (const it of items) {
    const q = Math.max(0, Number(it.qty) || 0);
    const w = Number(it.weight_g) || 0;
    if (w > 0) grams += w * q; else { grams += def * q; if (q > 0) missing++; }
  }
  return { grams: Math.max(50, Math.round(grams || def)), missing };
}

/** ออเดอร์ → รายการจอง SHIPPOP */
export function bookItemOf(o: { id: string; order_no: string | null; ship_to: ShipTo | null; cod_amount: number | null }, from: ShippopAddress, opts: { courierCode: string; grams: number; box: string }): { ok: true; item: BookItem } | { ok: false; error: string } {
  const no = o.order_no ?? o.id;
  const st = cleanShipTo(o.ship_to);
  if (!st.ok) return { ok: false, error: `${no}: ${st.error}` };
  return {
    ok: true,
    item: { key: o.id, from, to: shipToAddress(st.value), parcel: { name: `ออเดอร์ ${no}`, weight: Math.max(50, Math.round(opts.grams)), ...parseBox(opts.box) }, courierCode: opts.courierCode, codAmount: Math.max(0, Math.round(Number(o.cod_amount) || 0)), ref: no },
  };
}

/** สถานะ SHIPPOP → สถานะออเดอร์ (เดินหน้าอย่างเดียว · null = ไม่เปลี่ยนเอง) */
export function orderStatusFromShipping(s: string): PlatformOrderStatus | null {
  if (s === "booking") return "packed";
  if (s === "shipping" || s === "complete") return "shipped";
  return null;
}

/** ลำดับสถานะที่ปุ่ม "จำลองสถานะถัดไป" เดินให้ (โหมดจำลองเท่านั้น) */
export const SIM_STATUS_FLOW = ["booking", "shipping", "complete"] as const;
export function nextSimStatus(cur: string): string | null {
  const i = (SIM_STATUS_FLOW as readonly string[]).indexOf(cur);
  return i >= 0 && i < SIM_STATUS_FLOW.length - 1 ? SIM_STATUS_FLOW[i + 1] : null;
}

/** ข้อมูลการจองใหม่ (เก็บลง platform_orders.shipping) */
export function newShipping(args: { mode: "sim" | "live"; purchaseId: string; trackingCode: string; courierCode: string; courierTrackingCode?: string; price?: number; codAmount: number; at: string }): OrderShipping {
  return {
    provider: "shippop", mode: args.mode, purchaseId: args.purchaseId, trackingCode: args.trackingCode, courierCode: args.courierCode,
    courierTrackingCode: args.courierTrackingCode ?? "", price: args.price ?? 0, codAmount: args.codAmount, status: "booking", bookedAt: args.at,
    history: [{ status: "booking", at: args.at }],
  };
}
export const trackingOfShipping = (s: OrderShipping) => s.courierTrackingCode || s.trackingCode;
export const carrierOfShipping = (s: OrderShipping) => carrierOf(s.courierCode);

/** เลขออเดอร์ที่สร้างเอง: M + ปีเดือนวัน (เวลาไทย) + ตัวอักษรสุ่ม 4 ตัว เช่น M261110-7K2Q */
export function manualOrderNo(now = Date.now(), rnd: () => number = Math.random): string {
  const d = new Date(now + 7 * 3600_000);
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const abc = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 4; i++) s += abc[Math.floor(rnd() * abc.length) % abc.length];
  return `M${ymd}-${s}`;
}
