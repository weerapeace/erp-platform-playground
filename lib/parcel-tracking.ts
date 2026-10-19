/**
 * 🚚 เลขพัสดุ + ขนส่ง (ของกลาง · pure) — ใช้กับออเดอร์เว็บร้าน (store_orders.tracking_no / tracking_carrier)
 *
 * พนักงานเลือกขนส่ง + กรอกเลข ที่แท็บ 🧾 ออเดอร์ → ลูกค้าเห็นเลข + ปุ่มเปิดหน้าติดตามของขนส่ง
 * (หน้า ติดตามคำสั่งซื้อ / บัญชีสมาชิก / อีเมล "จัดส่งแล้ว")
 * ลิงก์: ขนส่งที่รู้รูปแบบลิงก์ = เปิดหน้าตามพัสดุของขนส่งตรง · ที่เหลือใช้ 17TRACK (ตามได้แทบทุกขนส่ง) · "อื่น ๆ" = โชว์เลขอย่างเดียว
 */

export interface CarrierDef {
  key: string;
  label: string;
  /** ลิงก์หน้าตามพัสดุ ({n} = เลขพัสดุ) · null = ไม่มีลิงก์ */
  url: string | null;
}

const T17 = "https://t.17track.net/th#nums={n}";

export const PARCEL_CARRIERS: CarrierDef[] = [
  { key: "thaipost", label: "ไปรษณีย์ไทย (EMS / ลงทะเบียน)", url: "https://track.thailandpost.co.th/?trackNumber={n}" },
  { key: "kerry", label: "Kerry Express (KEX)", url: "https://th.kex-express.com/th/track/?track={n}" },
  { key: "flash", label: "Flash Express", url: "https://www.flashexpress.co.th/fle/tracking?se={n}" },
  { key: "jt", label: "J&T Express", url: T17 },
  { key: "ninjavan", label: "Ninja Van", url: "https://www.ninjavan.co/th-th/tracking?id={n}" },
  { key: "best", label: "BEST Express", url: T17 },
  { key: "scg", label: "SCG Express", url: T17 },
  { key: "dhl", label: "DHL", url: "https://www.dhl.com/th-en/home/tracking.html?tracking-id={n}" },
  { key: "other", label: "อื่น ๆ", url: null },
];

export interface ParcelTracking {
  carrier: string;
  carrierLabel: string;
  number: string;
  url: string | null;
}

/** ทำความสะอาดเลขพัสดุ (ตัด space · ตัวพิมพ์ใหญ่ · เฉพาะ A-Z 0-9 - ) */
export const cleanTrackingNo = (v: unknown): string =>
  String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);

export const cleanCarrier = (v: unknown): string => (PARCEL_CARRIERS.some((c) => c.key === v) ? String(v) : "");

/** ข้อมูลพัสดุสำหรับโชว์ลูกค้า — ไม่มีเลข = null */
export function trackingOf(carrier: unknown, number: unknown): ParcelTracking | null {
  const n = cleanTrackingNo(number);
  if (!n) return null;
  const c = PARCEL_CARRIERS.find((x) => x.key === carrier) ?? PARCEL_CARRIERS[PARCEL_CARRIERS.length - 1];
  return { carrier: c.key, carrierLabel: c.key === "other" ? "" : c.label, number: n, url: c.url ? c.url.replace("{n}", encodeURIComponent(n)) : null };
}
