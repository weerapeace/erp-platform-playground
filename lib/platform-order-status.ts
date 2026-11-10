/**
 * 📦 กติกากลางของ "ออเดอร์จากแพลตฟอร์ม" (platform_orders) — pure · มีเทสต์ · ใช้ทั้งหน้าจอและ API
 *
 *   สถานะในระบบ (ใช้ทุกร้าน):  new ต้องจัดส่ง → confirmed ยืนยันแล้ว (ตัดสต๊อก) → packed แพ็กแล้ว รอขนส่ง → shipped ส่งแล้ว
 *                             ยกเลิกได้ก่อนส่ง (คืนสต๊อกถ้าเคยตัด — ทำที่ API)
 *   สถานะบนร้าน (platform_status) เก็บแยก เช่น Shopee READY_TO_SHIP — แปลงเป็นสถานะในระบบด้วย shopeeToInternal
 *
 *   ⚠️ ออเดอร์ที่อ่านมาจากอีเมล (source = "email") = ยอดขายที่ร้านส่งของไปแล้วผ่าน Seller Centre (ระบบ 📧 ดึงออเดอร์จากเมล)
 *      → ไม่ใช่งานที่ต้องจัดส่ง · ห้ามเปลี่ยนสถานะ/ตัดสต๊อกจากหน้าศูนย์ออเดอร์ (เคยกดยืนยันแล้วตัดสต๊อกคลังออนไลน์ติดลบได้)
 *
 * ใช้ที่: app/api/platform-orders (ตรวจก่อนบันทึก) · app/master/platform-orders (ป้าย/ตัวกรอง) · lib/platform-order-demo
 * ทะเบียน workflow: lib/workflow-registry.ts key "platform-order"
 */

/** แถวออเดอร์ที่ API /api/platform-orders ส่งให้หน้าจอ (รายการ) — โหมดทดลองใช้รูปเดียวกัน */
export type PlatformOrderRow = {
  id: string; platform_id: string | null; brand_id: string | null; external_order_id: string | null; order_no: string | null;
  customer_name: string | null; status: string; platform_status: string | null; total: number | null; currency: string | null;
  ordered_at: string | null; ship_by_at: string | null; tracking_no: string | null; carrier: string | null;
  stock_deducted: boolean; source: string | null; invoice_so_id: string | null; tax_invoice_requested: boolean;
  item_count?: number; created_at: string;
  /** ขนส่ง (lib/order-shipping) — สถานะ SHIPPOP ล่าสุด · รหัสขนส่ง · sim/live */
  shipping_status?: string | null; shipping_courier?: string | null; shipping_mode?: string | null;
  /** ยอดเก็บเงินปลายทาง · ช่องทางของออเดอร์ที่สร้างเอง (raw.channel เช่น phone) */
  cod_amount?: number; channel?: string | null;
};
export type PlatformOrderItemRow = {
  id: string; sku_code: string | null; matched_sku_id: string | null; matched_parent_sku_id?: string | null;
  name: string | null; qty: number; price: number | null; variant?: string | null;
};

export const PLATFORM_ORDER_STATUSES = ["new", "confirmed", "packed", "shipped", "cancelled"] as const;
export type PlatformOrderStatus = (typeof PLATFORM_ORDER_STATUSES)[number];

export type StatusTone = "info" | "accent" | "warning" | "success" | "muted";
export const PLATFORM_ORDER_STATUS_META: Record<PlatformOrderStatus, { label: string; short: string; tone: StatusTone }> = {
  new: { label: "ต้องจัดส่ง", short: "ต้องจัดส่ง", tone: "info" },
  confirmed: { label: "ยืนยันแล้ว (ตัดสต๊อก)", short: "ยืนยันแล้ว", tone: "accent" },
  packed: { label: "แพ็กแล้ว รอขนส่ง", short: "แพ็กแล้ว", tone: "warning" },
  shipped: { label: "ส่งแล้ว", short: "ส่งแล้ว", tone: "success" },
  cancelled: { label: "ยกเลิก", short: "ยกเลิก", tone: "muted" },
};

export function isPlatformOrderStatus(s: unknown): s is PlatformOrderStatus {
  return (PLATFORM_ORDER_STATUSES as readonly string[]).includes(String(s));
}

/** ที่มาของออเดอร์ที่เป็น "ยอดขายย้อนหลัง" (ส่งของแล้วนอกระบบ) — ดูได้อย่างเดียว */
export const REPORT_ONLY_SOURCES = ["email"] as const;
export function isReportOnly(source: string | null | undefined): boolean {
  return (REPORT_ONLY_SOURCES as readonly string[]).includes(String(source ?? ""));
}

/** เปลี่ยนจากสถานะไหนไปไหนได้ (ทุกร้านใช้ชุดเดียวกัน) */
const NEXT: Record<PlatformOrderStatus, PlatformOrderStatus[]> = {
  new: ["confirmed", "packed", "cancelled"],
  confirmed: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: [],
  cancelled: [],
};
export function allowedNext(from: string): PlatformOrderStatus[] {
  return isPlatformOrderStatus(from) ? NEXT[from] : [];
}

/** ตรวจก่อนเปลี่ยนสถานะ — ok=false → เหตุผลภาษาคน (ส่งกลับให้ผู้ใช้ได้เลย) */
export function checkTransition(order: { status: string; source?: string | null }, to: string): { ok: true } | { ok: false; reason: string } {
  if (isReportOnly(order.source)) return { ok: false, reason: "ออเดอร์นี้มาจากอีเมลแจ้งยอดขาย (ร้านส่งของไปแล้ว) — เปลี่ยนสถานะหรือตัดสต๊อกจากที่นี่ไม่ได้" };
  if (!isPlatformOrderStatus(to)) return { ok: false, reason: "สถานะไม่ถูกต้อง" };
  if (order.status === to) return { ok: true };
  if (!allowedNext(order.status).includes(to)) {
    const from = isPlatformOrderStatus(order.status) ? PLATFORM_ORDER_STATUS_META[order.status].short : order.status;
    return { ok: false, reason: `เปลี่ยนจาก "${from}" เป็น "${PLATFORM_ORDER_STATUS_META[to].short}" ไม่ได้` };
  }
  return { ok: true };
}

// ---- สถานะบนร้าน Shopee (v2.order.get_order_detail · order_status) ----
export const SHOPEE_STATUS_LABEL: Record<string, string> = {
  UNPAID: "ยังไม่ชำระเงิน",
  READY_TO_SHIP: "ที่ต้องจัดส่ง",
  PROCESSED: "นัดขนส่งแล้ว",
  RETRY_SHIP: "ส่งใหม่",
  SHIPPED: "ส่งแล้ว",
  TO_CONFIRM_RECEIVE: "รอผู้ซื้อยืนยันรับ",
  IN_CANCEL: "ผู้ซื้อขอยกเลิก",
  CANCELLED: "ยกเลิกแล้ว",
  TO_RETURN: "คืนสินค้า/คืนเงิน",
  COMPLETED: "สำเร็จ",
  INVOICE_PENDING: "รอใบแจ้งหนี้",
};

/** สถานะ Shopee → สถานะในระบบ · ไม่รู้จัก = null (เก็บค่าดิบไว้ใน platform_status แล้วให้คนดู) */
export function shopeeToInternal(code: string | null | undefined): PlatformOrderStatus | null {
  switch (String(code ?? "").toUpperCase()) {
    case "UNPAID":
    case "READY_TO_SHIP":
    case "RETRY_SHIP":
    case "IN_CANCEL":
    case "INVOICE_PENDING":
      return "new";
    case "PROCESSED":
      return "packed";
    case "SHIPPED":
    case "TO_CONFIRM_RECEIVE":
    case "COMPLETED":
    case "TO_RETURN":
      return "shipped";
    case "CANCELLED":
      return "cancelled";
    default:
      return null;
  }
}

/** ป้ายเตือนจากสถานะบนร้าน (ยังไม่จ่าย / ผู้ซื้อขอยกเลิก / คืนสินค้า) — ไม่มี = null */
export function platformStatusWarning(code: string | null | undefined): string | null {
  const c = String(code ?? "").toUpperCase();
  if (c === "UNPAID") return "ผู้ซื้อยังไม่ชำระเงิน — ยังไม่ต้องส่ง";
  if (c === "IN_CANCEL") return "ผู้ซื้อขอยกเลิก — ตอบรับ/ปฏิเสธบนร้านก่อนแพ็ก";
  if (c === "TO_RETURN") return "มีคำขอคืนสินค้า/คืนเงิน";
  return null;
}

/** ต้องลงมือทำไหม (นับในการ์ด "ต้องจัดส่ง") — ไม่นับออเดอร์จากเมล · ไม่นับที่ผู้ซื้อยังไม่จ่าย */
export function needsAction(o: { status: string; source?: string | null; platform_status?: string | null }): boolean {
  if (isReportOnly(o.source)) return false;
  if (String(o.platform_status ?? "").toUpperCase() === "UNPAID") return false;
  return o.status === "new" || o.status === "confirmed" || o.status === "packed";
}

// ---- กำหนดส่ง (ship_by_at) ----
export type ShipDue = "late" | "today" | "tomorrow" | "later" | "none";
export const SHIP_DUE_LABEL: Record<ShipDue, string> = { late: "เลยกำหนดส่ง", today: "ต้องส่งวันนี้", tomorrow: "ส่งภายในพรุ่งนี้", later: "", none: "" };

const BKK = 7 * 3600_000;
const bkkDay = (ms: number) => Math.floor((ms + BKK) / 86_400_000);

/** เทียบกำหนดส่งกับเวลาตอนนี้ (นับวันตามเวลาไทย) · ส่งแล้ว/ยกเลิก = none */
export function shipDue(o: { ship_by_at?: string | null; status: string }, now = Date.now()): ShipDue {
  if (!o.ship_by_at || o.status === "shipped" || o.status === "cancelled") return "none";
  const t = Date.parse(o.ship_by_at);
  if (!Number.isFinite(t)) return "none";
  if (t < now) return "late";
  const d = bkkDay(t) - bkkDay(now);
  return d <= 0 ? "today" : d === 1 ? "tomorrow" : "later";
}

/** ช่วงเวลา (ISO) ของ "วันนี้" ตามเวลาไทย — ใช้กรองใน API */
export function bangkokDayRange(now = Date.now()): { start: string; end: string } {
  const day = bkkDay(now);
  const start = day * 86_400_000 - BKK;
  return { start: new Date(start).toISOString(), end: new Date(start + 86_400_000).toISOString() };
}
