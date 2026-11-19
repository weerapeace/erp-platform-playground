/**
 * 🚚 ชั้นกลาง "ผู้ให้บริการขนส่ง" (ของกลาง · เฟส 1 SHIPPOP · 2026-11-19)
 *
 * หน้าที่: ให้ทุกที่ที่จะ ดูราคา / จอง / ใบปะหน้า / ถามสถานะ / ยกเลิก เรียกผ่านแบบฟอร์มเดียวกัน
 *   → วันหน้าเพิ่มตัวกลางขนส่งเจ้าอื่น (เช่น iShip / ShipJung) = เขียนตัวเสียบใหม่ 1 ไฟล์ + เพิ่มใน PROVIDERS ไม่ต้องแก้หน้าจอ/API
 * ตอนนี้มีเจ้าเดียว = SHIPPOP (lib/shipping/shippop.ts ห่อ lib/shippop.ts เดิม)
 * ใช้ที่: app/api/platform-orders/ship (ศูนย์ออเดอร์) · เว็บร้าน (/api/website/orders/shippop) ยังเรียก lib/shippop ตรง — ย้ายมาได้ภายหลัง
 * ห้าม: เรียก API ขนส่งตรงจากหน้า/route ใหม่ — ผ่านตัวนี้ · ค่าส่งจริงบันทึกที่ศูนย์ค่าใช้จ่าย (logShippingCost ใน lib/shipping/cost.ts)
 */
import type { BookItem, BookResult, LabelSize, Quote, ShippopAddress, ShippopMode, ShippopParcel } from "@/lib/shippop";
import { shippopProvider } from "@/lib/shipping/shippop";

export type ShippingMode = ShippopMode;
export type ShippingAddress = ShippopAddress;
export type ShippingParcel = ShippopParcel;
export type ShippingQuote = Quote;
export type ShippingBookItem = BookItem;
export type ShippingBookResult = BookResult;

export interface ShippingProvider {
  code: string;
  label: string;
  couriers: readonly { code: string; label: string; carrier: string }[];
  /** โหมดตามกุญแจ (ไม่มีกุญแจ = sim) */
  mode(): ShippingMode;
  /** ระบบที่กุญแจชี้ไป (sandbox = ไม่เสียเงิน) */
  env(): "prod" | "sandbox";
  quote(from: ShippingAddress, to: ShippingAddress, parcel: ShippingParcel, force?: ShippingMode): Promise<ShippingQuote[]>;
  /** จอง + ยืนยันกับขนส่ง (เสียเงินเมื่อเป็นโหมดจริงบน prod) */
  book(items: ShippingBookItem[], force?: ShippingMode): Promise<{ purchaseId: string; mode: ShippingMode; results: ShippingBookResult[] }>;
  labelHtml(trackingCodes: string[], force?: ShippingMode, size?: LabelSize): Promise<string | null>;
  track(trackingCode: string): Promise<{ status: string; courierTrackingCode: string } | null>;
  /** ยกเลิก — ได้เฉพาะก่อนขนส่งเข้ารับ */
  cancel(courierTrackingCode: string, force?: ShippingMode): Promise<boolean>;
  courierLabel(code: string): string;
  isKnownCourier(code: string): boolean;
  statusLabel(status: string): string;
}

const PROVIDERS: Record<string, ShippingProvider> = { shippop: shippopProvider };

/** ผู้ให้บริการตามรหัส (ไม่ระบุ/ไม่รู้จัก = SHIPPOP) */
export function shippingProvider(code?: string | null): ShippingProvider {
  return PROVIDERS[String(code ?? "shippop")] ?? shippopProvider;
}
export const SHIPPING_PROVIDER_CODES = Object.keys(PROVIDERS);
