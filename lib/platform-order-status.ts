/**
 * 📦 กติกากลางของ "ออเดอร์จากแพลตฟอร์ม" (platform_orders) — pure · มีเทสต์ · ใช้ทั้งหน้าจอและ API
 *
 *   สถานะในระบบ (ใช้ทุกร้าน):  new ต้องจัดส่ง → confirmed ยืนยันแล้ว (ตัดสต๊อก) → packed แพ็กแล้ว รอขนส่ง → shipped ส่งแล้ว
 *                             ยกเลิกได้ก่อนส่ง (คืนสต๊อกถ้าเคยตัด — ทำที่ API)
 *   สถานะบนร้าน (platform_status) เก็บแยก เช่น Shopee READY_TO_SHIP — แปลงเป็นสถานะในระบบด้วย shopeeToInternal
 *
 *   ⚠️ ออเดอร์ที่อ่านมาจากอีเมล (source = "email") = ยอดขายที่ร้านส่งของไปแล้วผ่าน Seller Centre (ระบบ 📧 ดึงออเดอร์จากเมล)
 *      → ไม่ใช่งานที่ต้องจัดส่ง · ห้ามเปลี่ยนสถานะ/ตัดสต๊อกจากหน้าศูนย์ออเดอร์ (เคยกดยืนยันแล้วตัดสต๊อกคลังออนไลน์ติดลบได้)
 *   ⚠️ ออเดอร์ที่ดึงจาก TikTok Shop API (source = "tiktok_api") = สถานะตามร้าน TikTok (แปลงด้วย tiktokToInternal ทุกครั้งที่ดึง)
 *      → ยังจัดส่งผ่าน TikTok Seller Center / BigSeller · นับเป็นงาน "ต้องจัดส่ง" ให้เห็นภาพรวม แต่เปลี่ยนสถานะ/ตัดสต๊อกที่นี่ไม่ได้ (isShopManaged)
 *   ⚠️ ออเดอร์ที่ดึงจาก Shopee Open Platform (source = "shopee_api") = สถานะตามร้าน Shopee (shopeeToInternal) แบบเดียวกับ TikTok
 *      → เจ้าของเลือก 2026-11-14 "ไม่ต้องดึงจากเมลแล้ว": ใบที่เคยมาจากเมล (เลขออเดอร์เดียวกัน) ถูกอัปเดตเป็นแหล่งนี้ตอนดึง (app/api/shopee/orders-sync)
 *   ⚠️ 2026-11-20 (เจ้าของเลือก widget หน้าสถานะดึงออเดอร์): เพิ่มแหล่งที่ "สถานะตามร้าน" อีก 3 ทาง — ดึงอัตโนมัติทุก 15 นาที
 *      lazada_api (app/api/lazada/orders-sync · ใบจากเมลถูกอัปเดตเป็นแหล่งนี้เหมือน Shopee) · line_shopping_api (app/api/line-shopping/orders-sync)
 *      webshop = ออเดอร์เว็บไซต์ของเราเอง (store_orders → lib/webshop-order-mirror) จัดการที่หน้าเว็บไซต์ › ออเดอร์ ศูนย์ออเดอร์ดูอย่างเดียว
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
  /** คอลัมน์ "สินค้า" — 3 รายการแรก (ชิ้นมากสุดก่อน) + รูป (lib/platform-order-items-server productSummary) */
  products?: { sku_code: string | null; name: string | null; qty: number; image_key: string | null }[];
};
export type PlatformOrderItemRow = {
  id: string; sku_code: string | null; matched_sku_id: string | null; matched_parent_sku_id?: string | null;
  name: string | null; qty: number; price: number | null; variant?: string | null;
  /** ลิ้นชักออเดอร์: รูป (SKU → Parent) · สี · ชื่อกล่อง · น้ำหนักต่อชิ้น (กรัม) */
  image_key?: string | null; color?: string | null; box_name?: string | null; weight_g?: number | null;
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

/** ที่มาของออเดอร์ที่ "สถานะตามร้าน" (ดึงจาก API ของแพลตฟอร์ม แล้วจัดการ/จัดส่งบนร้าน) — นับเป็นงาน แต่เปลี่ยนสถานะ/ตัดสต๊อกที่นี่ไม่ได้ */
export const SHOP_MANAGED_SOURCES = ["tiktok_api", "shopee_api", "lazada_api", "line_shopping_api", "webshop"] as const;
/** ชื่อร้าน + ที่ที่จัดการออเดอร์จริง ของแต่ละแหล่งที่สถานะตามร้าน */
const SHOP_MANAGED_META: Record<string, { name: string; where: string }> = {
  tiktok_api: { name: "TikTok", where: "TikTok Seller Center / BigSeller" },
  shopee_api: { name: "Shopee", where: "Shopee Seller Center / BigSeller" },
  lazada_api: { name: "Lazada", where: "Lazada Seller Center / BigSeller" },
  line_shopping_api: { name: "LINE SHOPPING", where: "LINE SHOPPING Seller Center" },
  webshop: { name: "เว็บไซต์", where: "หน้าเว็บไซต์ › ออเดอร์ ใน ERP" },
};
/** ชื่อร้านของออเดอร์ที่สถานะตามร้าน (ใช้ในข้อความ) · ไม่ใช่ = null */
export function shopManagedName(source: string | null | undefined): string | null {
  return SHOP_MANAGED_META[String(source ?? "")]?.name ?? null;
}
export function isShopManaged(source: string | null | undefined): boolean {
  return (SHOP_MANAGED_SOURCES as readonly string[]).includes(String(source ?? ""));
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
  if (isShopManaged(order.source)) {
    const m = SHOP_MANAGED_META[String(order.source ?? "")] ?? { name: "ร้าน", where: "หลังร้าน" };
    return { ok: false, reason: `ออเดอร์ ${m.name} — สถานะตามร้าน ${m.name} (จัดส่งใน ${m.where}) ระบบดึงมาให้ดูอย่างเดียว เปลี่ยนสถานะหรือตัดสต๊อกที่นี่ไม่ได้` };
  }
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

// ---- สถานะบนร้าน TikTok Shop (/order/202309/orders/search · status) ----
export const TIKTOK_STATUS_LABEL: Record<string, string> = {
  UNPAID: "ยังไม่ชำระเงิน",
  ON_HOLD: "รอยืนยัน (ผู้ซื้อยังยกเลิกได้)",
  AWAITING_SHIPMENT: "ที่ต้องจัดส่ง",
  PARTIALLY_SHIPPING: "ส่งแล้วบางส่วน",
  AWAITING_COLLECTION: "รอขนส่งมารับ",
  IN_TRANSIT: "กำลังจัดส่ง",
  DELIVERED: "ส่งถึงแล้ว",
  COMPLETED: "สำเร็จ",
  CANCELLED: "ยกเลิกแล้ว",
};

/** สถานะ TikTok → สถานะในระบบ · ไม่รู้จัก = null (เก็บค่าดิบใน platform_status) */
export function tiktokToInternal(code: string | null | undefined): PlatformOrderStatus | null {
  switch (String(code ?? "").toUpperCase()) {
    case "UNPAID":
    case "ON_HOLD":
    case "AWAITING_SHIPMENT":
      return "new";
    case "PARTIALLY_SHIPPING":
    case "AWAITING_COLLECTION":
      return "packed";
    case "IN_TRANSIT":
    case "DELIVERED":
    case "COMPLETED":
      return "shipped";
    case "CANCELLED":
      return "cancelled";
    default:
      return null;
  }
}

// ---- สถานะบนร้าน Lazada (/orders/get · statuses[] — 1 ออเดอร์มีหลายสถานะได้ (รายชิ้น) · เก็บตัวพิมพ์เล็กตามร้าน) ----
export const LAZADA_STATUS_LABEL: Record<string, string> = {
  unpaid: "ยังไม่ชำระเงิน",
  pending: "ที่ต้องจัดส่ง",
  topack: "ที่ต้องแพ็ก",
  repacked: "แพ็กใหม่",
  packed: "แพ็กแล้ว",
  ready_to_ship_pending: "รอพร้อมส่ง",
  ready_to_ship: "พร้อมส่ง",
  toship: "รอขนส่งมารับ",
  shipping: "กำลังจัดส่ง",
  shipped: "ส่งแล้ว",
  delivered: "ส่งถึงแล้ว",
  confirmed: "ผู้ซื้อยืนยันรับ",
  failed_delivery: "ส่งไม่สำเร็จ",
  lost_by_3pl: "ขนส่งทำหาย",
  damaged_by_3pl: "ขนส่งทำเสียหาย",
  returned: "คืนสินค้า",
  shipped_back: "ตีกลับ",
  shipped_back_success: "ตีกลับถึงร้านแล้ว",
  canceled: "ยกเลิกแล้ว",
  cancelled: "ยกเลิกแล้ว",
};
const LAZADA_RANK: Record<string, number> = {
  unpaid: 0, pending: 1, topack: 1, repacked: 1, packed: 2, ready_to_ship_pending: 2, ready_to_ship: 2, toship: 2,
  shipping: 3, shipped: 3, failed_delivery: 4, lost_by_3pl: 4, damaged_by_3pl: 4, delivered: 5, confirmed: 5,
  returned: 6, shipped_back: 6, shipped_back_success: 6,
};
/** สถานะรวมของ 1 ออเดอร์ Lazada จากสถานะรายชิ้น — ยกเลิกทุกชิ้น = canceled · ไม่งั้นใช้ชิ้นที่ "ช้าที่สุด" (ยังต้องส่ง = งานยังไม่จบ) */
export function lazadaOrderStatus(statuses: readonly unknown[] | null | undefined): string | null {
  const list = (statuses ?? []).map((x) => String(x ?? "").toLowerCase().trim()).filter(Boolean);
  if (!list.length) return null;
  const live = list.filter((x) => x !== "canceled" && x !== "cancelled");
  if (!live.length) return "canceled";
  return live.reduce((best, x) => ((LAZADA_RANK[x] ?? 99) < (LAZADA_RANK[best] ?? 99) ? x : best), live[0]);
}
/** สถานะ Lazada → สถานะในระบบ · ไม่รู้จัก = null */
export function lazadaToInternal(code: string | null | undefined): PlatformOrderStatus | null {
  const c = String(code ?? "").toLowerCase();
  if (c === "canceled" || c === "cancelled") return "cancelled";
  const r = LAZADA_RANK[c];
  if (r == null) return null;
  return r <= 1 ? "new" : r === 2 ? "packed" : "shipped";
}

// ---- สถานะ LINE SHOPPING (GET /orders · orderStatus + paymentStatus + shipmentStatus) → รหัสเดียว LINE_* ----
export const LINE_SHOPPING_STATUS_LABEL: Record<string, string> = {
  LINE_UNPAID: "ยังไม่ชำระเงิน",
  LINE_TO_SHIP: "ที่ต้องจัดส่ง",
  LINE_SHIPPED: "ส่งแล้ว",
  LINE_COMPLETED: "สำเร็จ",
  LINE_REFUND: "คืนเงิน",
  LINE_CANCELED: "ยกเลิกแล้ว",
  LINE_EXPIRED: "หมดเวลาชำระ",
};
export function lineShoppingStatus(o: { orderStatus?: unknown; paymentStatus?: unknown; shipmentStatus?: unknown }): string {
  const os = String(o.orderStatus ?? "").toUpperCase(), ps = String(o.paymentStatus ?? "").toUpperCase(), ss = String(o.shipmentStatus ?? "").toUpperCase();
  if (os === "CANCELED" || os === "CANCELLED") return "LINE_CANCELED";
  if (os === "EXPIRED") return "LINE_EXPIRED";
  if (ps === "REFUND") return "LINE_REFUND";
  if (os === "COMPLETED") return "LINE_COMPLETED";
  if (ss === "SHIPPED_ALL") return "LINE_SHIPPED";
  if (ps && ps !== "PAID") return "LINE_UNPAID";
  return "LINE_TO_SHIP";
}
export function lineShoppingToInternal(code: string | null | undefined): PlatformOrderStatus | null {
  switch (String(code ?? "")) {
    case "LINE_UNPAID": case "LINE_TO_SHIP": return "new";
    case "LINE_SHIPPED": case "LINE_COMPLETED": case "LINE_REFUND": return "shipped";
    case "LINE_CANCELED": case "LINE_EXPIRED": return "cancelled";
    default: return null;
  }
}

// ---- ออเดอร์เว็บไซต์ของเรา (store_orders) → รหัส WEB_* ----
export const WEBSHOP_STATUS_LABEL: Record<string, string> = {
  WEB_UNPAID: "รอชำระเงิน",
  WEB_VERIFYING: "รอตรวจสลิป",
  WEB_PENDING: "รอดำเนินการ",
  WEB_PREPARING: "กำลังเตรียมของ",
  WEB_SHIPPED: "จัดส่งแล้ว",
  WEB_COMPLETED: "สำเร็จ",
  WEB_CANCELLED: "ยกเลิก",
};
/** เก็บเงินปลายทาง = ไม่ต้องรอจ่ายก่อนส่ง */
export function webshopStatus(o: { status?: unknown; payment_status?: unknown; payment_method?: unknown }): string {
  const st = String(o.status ?? "").toLowerCase(), ps = String(o.payment_status ?? "").toLowerCase(), pm = String(o.payment_method ?? "").toLowerCase();
  if (st === "cancelled") return "WEB_CANCELLED";
  if (st === "completed") return "WEB_COMPLETED";
  if (st === "shipped") return "WEB_SHIPPED";
  if (pm !== "cod" && ps === "verifying") return "WEB_VERIFYING";
  if (pm !== "cod" && (ps === "unpaid" || ps === "")) return "WEB_UNPAID";
  return st === "preparing" ? "WEB_PREPARING" : "WEB_PENDING";
}
export function webshopToInternal(code: string | null | undefined): PlatformOrderStatus | null {
  switch (String(code ?? "")) {
    case "WEB_UNPAID": case "WEB_VERIFYING": case "WEB_PENDING": return "new";
    case "WEB_PREPARING": return "confirmed";
    case "WEB_SHIPPED": case "WEB_COMPLETED": return "shipped";
    case "WEB_CANCELLED": return "cancelled";
    default: return null;
  }
}

/** ผู้ซื้อยังไม่จ่าย (ยังไม่ต้องส่ง · ยังไม่นับยอดขาย) — ทุกร้าน */
const UNPAID_CODES = new Set(["UNPAID", "LINE_UNPAID", "LINE_EXPIRED", "WEB_UNPAID", "WEB_VERIFYING"]);
export function isUnpaidPlatformStatus(code: string | null | undefined): boolean {
  return UNPAID_CODES.has(String(code ?? "").toUpperCase());
}

/** ชื่อสถานะบนร้านภาษาไทย (Shopee / TikTok / Lazada / LINE SHOPPING / เว็บไซต์) · ไม่รู้จัก = ค่าดิบ */
export function platformStatusLabel(code: string | null | undefined): string {
  const c = String(code ?? "");
  return SHOPEE_STATUS_LABEL[c] ?? TIKTOK_STATUS_LABEL[c] ?? LAZADA_STATUS_LABEL[c] ?? LINE_SHOPPING_STATUS_LABEL[c] ?? WEBSHOP_STATUS_LABEL[c] ?? c;
}

/** ป้ายเตือนจากสถานะบนร้าน (ยังไม่จ่าย / ผู้ซื้อขอยกเลิก / คืนสินค้า) — ไม่มี = null */
export function platformStatusWarning(code: string | null | undefined): string | null {
  const c = String(code ?? "").toUpperCase();
  if (c === "UNPAID" || c === "LINE_UNPAID" || c === "WEB_UNPAID") return "ผู้ซื้อยังไม่ชำระเงิน — ยังไม่ต้องส่ง";
  if (c === "WEB_VERIFYING") return "มีสลิปรอตรวจ — ตรวจที่หน้าเว็บไซต์ › ออเดอร์ ก่อนแพ็ก";
  if (c === "ON_HOLD") return "ผู้ซื้อยังยกเลิกได้ — รอให้ขึ้น ที่ต้องจัดส่ง ก่อนแพ็ก";
  if (c === "IN_CANCEL") return "ผู้ซื้อขอยกเลิก — ตอบรับ/ปฏิเสธบนร้านก่อนแพ็ก";
  if (c === "TO_RETURN") return "มีคำขอคืนสินค้า/คืนเงิน";
  return null;
}

/** ต้องลงมือทำไหม (นับในการ์ด "ต้องจัดส่ง") — ไม่นับออเดอร์จากเมล · ไม่นับที่ผู้ซื้อยังไม่จ่าย */
export function needsAction(o: { status: string; source?: string | null; platform_status?: string | null }): boolean {
  if (isReportOnly(o.source)) return false;
  const ps = String(o.platform_status ?? "").toUpperCase();
  if (isUnpaidPlatformStatus(ps) || ps === "ON_HOLD") return false;
  return o.status === "new" || o.status === "confirmed" || o.status === "packed";
}

/**
 * นับเป็นยอดขายไหม (รายงานยอดขายแพลตฟอร์ม lib/platform-sales) — ยกเลิก = ไม่นับ · ผู้ซื้อยังไม่จ่าย (UNPAID ของ Shopee/TikTok จาก API) = ยังไม่นับ
 * 🐛 2026-11-14: ดึงออเดอร์ Shopee จาก API แล้วมีใบ UNPAID เข้ามา (เมลไม่เคยสร้าง — เมลมาตอนจ่ายแล้ว) → เดิมรายงานนับเป็นยอดขาย
 */
export function countsAsSale(o: { status: string; platform_status?: string | null }): boolean {
  if (o.status === "cancelled") return false;
  return !isUnpaidPlatformStatus(o.platform_status);
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
