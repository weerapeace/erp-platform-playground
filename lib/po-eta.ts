/**
 * 📅 ของกลาง (pure): "วันคาดของเข้า" ของใบสั่งซื้อ — ใช้ที่ /api/purchasing/receivable (หน้ารับสินค้าเข้า · หน้าสั่งซื้อโหมดรับของ · แดชบอร์ด · ใบพิมพ์สั่งซื้อ/รอรับ)
 * เจ้าของสั่ง 2026-11-05: "คาดเข้า อยากให้ใส่ตามร้านด้วย คำนวณง่าย 10 วัน"
 *   ① วันที่ตั้งเองในใบ (purchase_orders_v2.expected_date) — ชนะเสมอ
 *   ② ระยะเวลาส่งของของร้าน (partners_v2.purchase_lead_time — ช่องเดียวกับหน้า "ตั้งค่าร้าน" /purchasing/shop-terms และปฏิทินจัดซื้อ · parseLeadTime ใน lib/credit-term)
 *      ปกตินับจากวันสั่ง · ร้านตั้ง "หลังชำระเงิน" → นับจากวันจ่ายจริง → วันครบกำหนดจ่าย → วันสั่ง
 *   ③ ร้านยังไม่ตั้ง = วันสั่ง + 10 วัน
 * (เดิม: นับจาก "วันจ่าย" + ลีดไทม์ร้านหลักของสินค้า · ร้านที่ยังไม่จ่าย = ไม่มีวันคาด · ร้านจีน 14 วัน → ใบส่วนใหญ่ไม่มีวันคาด)
 * ทดสอบ: lib/__tests__/po-eta.test.ts
 */
import { parseLeadTime } from "@/lib/credit-term";

export const DEFAULT_SHOP_LEAD_DAYS = 10;

export type PoEtaSource = "po" | "shop" | "default";
export type PoEta = { date: string | null; source: PoEtaSource | null; lead_days: number | null; after_pay: boolean };

/** บวกวันจากวันที่ฐาน (YYYY-MM-DD) แบบ UTC (ไม่โดน timezone ร่น) */
export function addDaysIso(date: string, days: number): string {
  const d = new Date(date.slice(0, 10) + "T00:00:00Z");
  if (isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function poEta(i: {
  expected_date?: string | null; order_date?: string | null;
  /** partners_v2.purchase_lead_time — "N" หรือ "N|after_pay" */
  shop_lead?: string | null;
  paid_date?: string | null; payment_due_date?: string | null;
}): PoEta {
  if (i.expected_date) return { date: i.expected_date.slice(0, 10), source: "po", lead_days: null, after_pay: false };
  const lead = parseLeadTime(i.shop_lead);
  if (lead) {
    const base = lead.afterPayment ? (i.paid_date || i.payment_due_date || i.order_date || null) : (i.order_date || null);
    return { date: base ? addDaysIso(base, lead.days) : null, source: base ? "shop" : null, lead_days: lead.days, after_pay: lead.afterPayment };
  }
  if (!i.order_date) return { date: null, source: null, lead_days: DEFAULT_SHOP_LEAD_DAYS, after_pay: false };
  return { date: addDaysIso(i.order_date, DEFAULT_SHOP_LEAD_DAYS), source: "default", lead_days: DEFAULT_SHOP_LEAD_DAYS, after_pay: false };
}

/** ป้ายสั้นบอกที่มา (หน้ารับของ) */
export const etaSourceLabel = (e: { expected_source?: PoEtaSource | string | null; lead_time_days?: number | null }): string | null =>
  e.expected_source === "shop" ? `~ร้าน ${e.lead_time_days ?? ""} วัน` : e.expected_source === "default" ? `~${DEFAULT_SHOP_LEAD_DAYS} วัน (ร้านยังไม่ตั้ง)` : null;
