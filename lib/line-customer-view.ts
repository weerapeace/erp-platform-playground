/**
 * ไลน์บริษัท รอบ 4 — หน้าเล็กของลูกค้าในไลน์: เช็คสถานะงาน · ตารางส่งงาน (กติกาล้วน ใช้ได้ทั้งหน้าเว็บ/เซิร์ฟเวอร์)
 * ตัวดึงข้อมูล: lib/line-customer-view-server.ts · หน้า: app/a/customer-view.tsx (?me=orders|schedule) · คู่มือ docs/line-company-oa.md
 *
 * กติกา:
 *   - ลูกค้าไม่เห็นราคา/ยอดเงิน/ต้นทุน/ชื่อช่างเด็ดขาด — ส่งออกเฉพาะ สินค้า · จำนวน · ขั้นงาน · ส่งแล้วกี่ชิ้น · วันนัดส่ง
 *   - ขั้นงานใช้กติกาเดียวกับหน้าสถานะใบสั่งขาย (lib/so-order-stage → soLineStageMulti) ห้ามคิดเอง
 *   - เห็นเฉพาะใบสั่งขายของร้านที่ผูกไลน์ไว้ (line_customer_links status linked)
 */
import { SO_LINE_STAGES, type SoLineStage, type SoShipState } from "@/lib/so-order-stage";

export type LineCustomerPage = "orders" | "schedule";
export const LINE_CUSTOMER_PAGES: LineCustomerPage[] = ["orders", "schedule"];
export const isLineCustomerPage = (v: unknown): v is LineCustomerPage => typeof v === "string" && (LINE_CUSTOMER_PAGES as string[]).includes(v);
export const LINE_CUSTOMER_TITLE: Record<LineCustomerPage, string> = { orders: "สถานะงานของร้าน", schedule: "ตารางส่งงาน" };

export type LineCustomerGate = "ok" | "not_linked" | "pending" | "blocked";
export const LINE_CUSTOMER_GATE_TEXT: Record<Exclude<LineCustomerGate, "ok">, { title: string; body: string }> = {
  not_linked: { title: "ไลน์นี้ยังไม่ได้ผูกกับร้าน", body: "สแกน QR ลูกค้าของบริษัท หรือขอ QR ร้านจากพนักงานขาย แล้วค่อยเปิดหน้านี้ใหม่ · หรือพิมพ์ถามในแชตได้เลย" },
  pending: { title: "รอพนักงานยืนยันร้าน", body: "ได้รับคำขอผูกไลน์แล้ว พนักงานจะยืนยันร้านให้เร็วที่สุด ระหว่างนี้พิมพ์ถามในแชตได้เลย" },
  blocked: { title: "ไลน์นี้ถูกระงับการดูข้อมูล", body: "พิมพ์ติดต่อพนักงานในแชตได้เลย" },
};

/** ขั้นงานแบบที่ลูกค้าอ่านเข้าใจ (ภายในบริษัทใช้ SO_LINE_STAGES — ลูกค้าไม่ต้องรู้เรื่องใบสั่งผลิต) */
export const CUSTOMER_STAGE_TEXT: Record<SoLineStage, string> = {
  0: "รับออเดอร์แล้ว",
  1: "เตรียมผลิต",
  2: "กำลังผลิต",
  3: "ผลิตเสร็จ รอส่ง",
  4: "ส่งแล้ว",
};
export const CUSTOMER_STAGE_COUNT = SO_LINE_STAGES.length;

export type CustomerLine = {
  id: string; product: string; sku: string | null; qty: number; unit: string; image_url: string | null;
  stage: SoLineStage; shipped: number; ship: SoShipState;
  /** วันนัดส่ง: รายการ → หัวใบ → ใบสั่งผลิต (ช้าสุด) · approx = ไม่ได้มาจากใบสั่งขายโดยตรง */
  due_date: string | null; due_approx: boolean;
};
export type CustomerOrder = {
  id: string; order_no: string; customer_po_no: string | null; order_date: string | null; shipped: boolean;
  /** ขั้นของทั้งใบ = รายการที่ช้าที่สุด */
  stage: SoLineStage; lines: CustomerLine[];
};

/** ขั้นทั้งใบ = ขั้นต่ำสุดของรายการ (ไม่มีรายการ = รับออเดอร์แล้ว) */
export const orderStageOf = (lines: { stage: SoLineStage }[]): SoLineStage =>
  (lines.length ? Math.min(...lines.map((l) => l.stage)) : 0) as SoLineStage;

/** วันนัดส่งของรายการ: รายการก่อน → หัวใบ → ใบสั่งผลิต (เอาวันช้าสุด เพราะต้องรอใบสุดท้าย) */
export function lineDueOf(lineDue: string | null, orderDue: string | null, moDues: (string | null)[]): { due_date: string | null; due_approx: boolean } {
  if (lineDue) return { due_date: lineDue.slice(0, 10), due_approx: false };
  if (orderDue) return { due_date: orderDue.slice(0, 10), due_approx: false };
  const mo = moDues.filter(Boolean).map((d) => (d as string).slice(0, 10)).sort().pop() ?? null;
  return { due_date: mo, due_approx: !!mo };
}

export type ScheduleItem = { key: string; order_id: string; order_no: string; product: string; qty_left: number; unit: string; due_date: string; approx: boolean; stage: SoLineStage; late: boolean };

/** ตารางส่งงาน = รายการที่ยังส่งไม่ครบ + มีวันนัดส่ง (เรียงตามวัน) · ไม่มีวันนัด แยกนับไว้ */
export function buildSchedule(orders: CustomerOrder[], todayYmd: string): { items: ScheduleItem[]; no_date: number } {
  const items: ScheduleItem[] = [];
  let noDate = 0;
  for (const o of orders) {
    for (const l of o.lines) {
      if (l.stage === 4 || l.ship === "full") continue;
      const left = Math.max(0, l.qty - l.shipped);
      if (!l.due_date) { noDate++; continue; }
      items.push({ key: `${o.id}:${l.id}`, order_id: o.id, order_no: o.order_no, product: l.product, qty_left: left, unit: l.unit, due_date: l.due_date, approx: l.due_approx, stage: l.stage, late: l.due_date < todayYmd });
    }
  }
  items.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.order_no.localeCompare(b.order_no));
  return { items, no_date: noDate };
}

/** วันนี้ตามเวลาไทย YYYY-MM-DD */
export const thaiToday = (now = new Date()): string => new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
