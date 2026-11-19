/**
 * 🚚 Shippop (ตัวกลางขนส่งหลายเจ้า · ชุด 9) — กฎกลาง + ตัวเรียก API (ฝั่งเซิร์ฟเวอร์) + โหมดจำลอง
 *
 * สเปกจากคู่มือทางการ (Postman "SHIPPOP API Documentation" · ดึงมา 2026-10-22):
 *   Base: production https://mkpservice.shippop.com/ · dev https://mkpservice.shippop.dev/
 *   ลำดับ: /pricelist/ (ดูราคา) → /booking/ (ได้ purchase_id + tracking_code "SP…") → /confirm/ (ส่งให้ขนส่ง ได้ courier_tracking_code · แก้/ยกเลิกไม่ได้แล้ว)
 *          → /label/ (ใบปะหน้า html/pdf) · /tracking/ (สถานะ) · /cancel/ (ยกเลิกด้วย courier_tracking_code) · webhook POST มาที่เรา (ไม่มีลายเซ็น)
 *   ที่อยู่: name · address · district(ตำบล/แขวง) · state(อำเภอ/เขต) · province · postcode · tel · น้ำหนักเป็น "กรัม" ขนาด "ซม."
 * ยังไม่มี SHIPPOP_API_KEY = โหมดจำลอง (ทุกปุ่มทำงาน ได้เลข SIM… ไม่เรียก Shippop จริง ไม่เสียเงิน)
 * env: SHIPPOP_API_KEY · SHIPPOP_EMAIL (อีเมลบัญชีที่ใช้จอง) · SHIPPOP_ENV=prod (ไม่ตั้ง = dev/sandbox) · SHIPPOP_WEBHOOK_SECRET
 */

export const SHIPPOP_COURIERS = [
  { code: "EMST", label: "ไปรษณีย์ไทย EMS", carrier: "thaipost" },
  { code: "THP", label: "ไปรษณีย์ไทย ลงทะเบียน", carrier: "thaipost" },
  { code: "FLE", label: "Flash Express", carrier: "flash" },
  { code: "KRYX", label: "KEX Express", carrier: "kerry" },
  { code: "JNTP", label: "J&T Express (เข้ารับ)", carrier: "jt" },
  { code: "BEST", label: "Best Express", carrier: "best" },
  { code: "SPX", label: "SPX Express (Shopee)", carrier: "other" },
  { code: "DHL", label: "DHL", carrier: "dhl" },
  { code: "FLEB", label: "Flash Express Bulky (ของใหญ่)", carrier: "flash" },
  { code: "LLM", label: "Lalamove (ด่วนในวัน)", carrier: "other" },
] as const;
export type ShippopCourier = (typeof SHIPPOP_COURIERS)[number]["code"];
/** รหัสเก่าที่คู่มือทางการไม่มีแล้ว → รหัสที่ใช้จริง (ตรวจ 2026-11-19 · ECP ไม่มีในคู่มือ) */
const COURIER_ALIAS: Record<string, string> = { ECP: "THP" };
export const normalizeCourier = (code: string | null | undefined) => { const c = String(code ?? "").trim().toUpperCase(); return COURIER_ALIAS[c] ?? c; };
export const isKnownCourier = (code: string | null | undefined) => SHIPPOP_COURIERS.some((c) => c.code === normalizeCourier(code));
/** ขนส่งแบบเอาไปส่งที่จุดเอง (ไม่เข้ารับ) — รหัสลงท้าย DS + KRYS (คู่มือ) · ไปรษณีย์ EMS ต้องเรียกเข้ารับเอง */
export const isDropOffCourier = (code: string) => /DS$/.test(normalizeCourier(code)) || normalizeCourier(code) === "KRYS";
export const courierLabel = (code: string) => SHIPPOP_COURIERS.find((c) => c.code === normalizeCourier(code))?.label ?? code;
/** รหัสขนส่ง Shippop → ช่องขนส่งของเรา (lib/parcel-tracking) — ลูกค้ากดดูพัสดุที่หน้าตามออเดอร์ได้ */
export const carrierOf = (code: string) => SHIPPOP_COURIERS.find((c) => c.code === normalizeCourier(code))?.carrier ?? "other";

export interface ShippopAddress {
  name: string;
  address: string;
  district: string;
  state: string;
  province: string;
  postcode: string;
  tel: string;
}
/** รายการสินค้าในพัสดุ — คู่มือบังคับสำหรับพัสดุเก็บเงินปลายทาง (COD) */
export interface ShippopProduct {
  product_code: string;
  name: string;
  /** ราคาต่อชิ้น (บาท) */
  price: number;
  amount: number;
  /** กรัมต่อชิ้น */
  weight: number;
}
export interface ShippopParcel {
  name: string;
  /** กรัม */
  weight: number;
  width: number;
  length: number;
  height: number;
}

/** ขนาดกล่องจากที่ตั้ง "20x30x10" → ซม. (เพี้ยน = 20×30×10) */
export function parseBox(v: unknown): { width: number; length: number; height: number } {
  const m = String(v ?? "").match(/(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/);
  const n = (x: string | undefined, fb: number) => Math.max(1, Math.min(300, Number(x) || fb));
  return m ? { width: n(m[1], 20), length: n(m[2], 30), height: n(m[3], 10) } : { width: 20, length: 30, height: 10 };
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
/** เบอร์ไทย 10 หลัก (ขนส่งบางเจ้าตรวจรูปแบบ) */
export const telOf = (v: unknown) => {
  const d = digits(v);
  return d.startsWith("66") && d.length === 11 ? `0${d.slice(2)}` : d.slice(0, 10);
};

/** สถานะ Shippop → สถานะออเดอร์ของเรา (null = ไม่เปลี่ยนเอง) */
export function orderStatusFromShippop(s: string): "shipped" | "completed" | null {
  if (s === "shipping") return "shipped";
  if (s === "complete") return "completed";
  return null;
}

export const SHIPPOP_STATUS_LABEL: Record<string, string> = {
  wait: "รอยืนยัน",
  booking: "ยืนยันแล้ว รอขนส่งเข้ารับ",
  invalid: "ข้อมูลผิดพลาด",
  shipping: "กำลังจัดส่ง",
  package_detail: "ขนส่งแจ้งน้ำหนัก/ขนาดจริง",
  problem: "พัสดุมีปัญหา",
  complete: "ส่งถึงแล้ว",
  return: "ตีกลับต้นทาง",
  cancel: "ยกเลิกแล้ว",
  pending_transfer: "รอโอนเงินปลายทาง",
  transferred: "โอนเงินปลายทางแล้ว",
  return_shipping: "กำลังตีกลับ",
  return_problem: "ตีกลับมีปัญหา",
  return_complete: "ตีกลับถึงร้านแล้ว",
  return_return: "ตีกลับซ้ำ",
  return_close: "ปิดเรื่องตีกลับ",
  rider_accept: "ไรเดอร์รับงานแล้ว",
};

/**
 * สถานะที่มาจาก webhook → สถานะที่เก็บ (คู่มือ: หลังยืนยันแล้วส่งให้ขนส่งพลาด SHIPPOP จะส่ง "cancel" ชั่วคราว แล้วลองใหม่เอง ตามด้วย "booking")
 * → "cancel" จาก webhook ไม่ใช่จุดจบ: จดประวัติแต่คงสถานะเดิม (ไม่ปลดให้จองซ้ำ = กันจ่ายค่าส่ง 2 รอบ) · ยกเลิกจริงทำได้ทางปุ่มยกเลิกของเราเท่านั้น
 */
export function statusFromWebhook(current: string, incoming: string): { status: string; note?: string } {
  if (incoming === "cancel" && current !== "cancel") return { status: current, note: "SHIPPOP แจ้งยกเลิก (อาจชั่วคราว — ระบบส่งให้ขนส่งใหม่เอง) · ถ้าค้างนานให้ติดต่อ SHIPPOP" };
  return { status: incoming };
}
export const shippopStatusLabel = (s: string) => SHIPPOP_STATUS_LABEL[s] ?? s;

/** ข้อมูล Shippop ที่เก็บกับออเดอร์ (store_orders.shippop) */
export interface ShippopInfo {
  mode: "sim" | "live";
  /** จองบนระบบทดลองของ SHIPPOP (ไม่เสียเงิน · ใบปะหน้าใช้ส่งจริงไม่ได้) */
  sandbox?: boolean;
  purchaseId: string;
  trackingCode: string;
  courierCode: string;
  courierTrackingCode: string;
  price: number;
  codAmount: number;
  status: string;
  bookedAt: string;
  history: { status: string; at: string; note?: string }[];
}

/* ─────────── ตัวเรียก API (ฝั่งเซิร์ฟเวอร์) ─────────── */

export type ShippopMode = "sim" | "live";
export function shippopMode(): ShippopMode {
  return process.env.SHIPPOP_API_KEY?.trim() ? "live" : "sim";
}
/**
 * โหมดที่ใช้จริงของคำขอนี้ — ส่ง force = "sim" เพื่อบังคับจำลองแม้มีกุญแจแล้ว
 * (ศูนย์ออเดอร์ขั้น 1 ล็อกจำลองไว้จนเจ้าของอนุมัติขั้น 2 · เว็บร้านไม่ส่ง = ตามกุญแจเหมือนเดิม)
 * บังคับ "live" ไม่ได้ถ้าไม่มีกุญแจ
 */
const effMode = (force?: ShippopMode): ShippopMode => (force === "sim" ? "sim" : shippopMode());
/** ระบบที่กุญแจชี้ไป: prod = ของจริง (เสียเงิน) · sandbox = ระบบทดลอง (ค่าเริ่มต้น ไม่ตั้ง SHIPPOP_ENV) */
export const shippopEnv = (): "prod" | "sandbox" => (process.env.SHIPPOP_ENV?.trim() === "prod" ? "prod" : "sandbox");
const baseUrl = () => (shippopEnv() === "prod" ? "https://mkpservice.shippop.com" : "https://mkpservice.shippop.dev");

type Json = Record<string, unknown>;

async function call(path: string, body: Json): Promise<Json> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ api_key: process.env.SHIPPOP_API_KEY, ...body }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const j = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) throw new Error(`Shippop ${path} ${res.status}`);
  return j;
}

const simNo = (p: string) => `${p}${Date.now().toString().slice(-7)}${Math.floor(Math.random() * 90 + 10)}`;
/** ราคาจำลอง (บาท) ตามน้ำหนัก — ไว้ดูหน้าตา/ลำดับขั้นเท่านั้น */
const simPrice = (code: string, grams: number) => Math.round((({ EMST: 45, ECP: 35, FLE: 38, KRYX: 42, JNTP: 36, BEST: 33, SPX: 32, DHL: 55, FLEB: 120, LLM: 90 } as Record<string, number>)[code] ?? 40) + Math.max(0, grams - 1000) / 1000 * 15);

export interface Quote {
  courierCode: string;
  courierName: string;
  price: number;
  available: boolean;
  estimate: string;
}

/** ดูราคาทุกขนส่ง (showall) สำหรับพัสดุ 1 ชิ้น */
export async function shippopQuote(from: ShippopAddress, to: ShippopAddress, parcel: ShippopParcel, force?: ShippopMode): Promise<Quote[]> {
  if (effMode(force) === "sim") return SHIPPOP_COURIERS.map((c) => ({ courierCode: c.code, courierName: c.label, price: simPrice(c.code, parcel.weight), available: true, estimate: c.code === "LLM" ? "ภายในวัน" : "1–3 วัน" }));
  const j = await call("/pricelist/", { data: { "0": { from, to, parcel, showall: 1 } } });
  const row = ((j.data as Json | undefined)?.["0"] ?? {}) as Record<string, Json>;
  return Object.values(row).map((q) => ({ courierCode: String(q.courier_code), courierName: String(q.courier_name ?? q.courier_code), price: Number(q.price) || 0, available: q.available === true, estimate: String(q.estimate_time ?? "") }));
}

export interface BookItem {
  key: string;
  from: ShippopAddress;
  to: ShippopAddress;
  parcel: ShippopParcel;
  courierCode: string;
  codAmount: number;
  ref: string;
  /** รายการสินค้า — COD ไม่มี = ระบบใส่ 1 บรรทัดให้เอง (คู่มือบังคับ) */
  products?: ShippopProduct[];
}

/** รายการสินค้าที่จะส่งไปกับการจอง: มี = ใช้ (ตัดช่องว่าง) · COD แต่ไม่มี = 1 บรรทัดจากชื่อพัสดุ/ยอดเก็บ · ไม่ COD ไม่มี = ไม่ส่ง */
export function productsForBooking(it: Pick<BookItem, "products" | "codAmount" | "parcel" | "ref">): ShippopProduct[] | undefined {
  const list = (it.products ?? []).filter((p) => p.amount > 0).map((p) => ({
    product_code: String(p.product_code || "-").slice(0, 60), name: String(p.name || p.product_code || "สินค้า").replace(/\s+/g, " ").trim().slice(0, 120),
    price: Math.max(0, Math.round((Number(p.price) || 0) * 100) / 100), amount: Math.max(1, Math.round(Number(p.amount) || 1)), weight: Math.max(1, Math.round(Number(p.weight) || 1)),
  }));
  if (list.length) return list;
  if (it.codAmount > 0) return [{ product_code: it.ref || "-", name: it.parcel.name || "สินค้า", price: Math.round(it.codAmount), amount: 1, weight: Math.max(1, Math.round(it.parcel.weight)) }];
  return undefined;
}
export interface BookResult {
  key: string;
  ok: boolean;
  error?: string;
  trackingCode?: string;
  courierTrackingCode?: string;
  price?: number;
}

/** จอง + ยืนยันทันที (ส่งข้อมูลให้ขนส่ง) — หลายออเดอร์ในใบสั่งซื้อเดียว · คืนผลรายออเดอร์ */
export async function shippopBookAndConfirm(items: BookItem[], force?: ShippopMode): Promise<{ purchaseId: string; mode: "sim" | "live"; results: BookResult[] }> {
  if (effMode(force) === "sim") {
    return {
      purchaseId: simNo("SIMP"),
      mode: "sim",
      results: items.map((it) => ({ key: it.key, ok: true, trackingCode: simNo("SIM"), courierTrackingCode: simNo("SIMTH"), price: simPrice(it.courierCode, it.parcel.weight) })),
    };
  }
  const data = items.map((it) => ({
    from: it.from,
    to: it.to,
    parcel: it.parcel,
    courier_code: normalizeCourier(it.courierCode),
    ...(it.codAmount > 0 ? { cod_amount: Math.round(it.codAmount) } : {}),
    ...(productsForBooking(it) ? { product: productsForBooking(it) } : {}),
    meta: { ref_no_1: it.ref },
  }));
  const b = await call("/booking/", { email: process.env.SHIPPOP_EMAIL ?? "", data });
  if (b.status !== true || !b.purchase_id) throw new Error(String(b.message ?? "Shippop booking failed"));
  // บัญชีแบบเติมเงินก่อน (PREPAID) ได้ลิงก์จ่ายเงินแทน → จองผ่าน API ให้จบไม่ได้ ต้องขอ SHIPPOP เป็นบัญชีวางบิล
  if (typeof b.payment_url === "string" && b.payment_url) throw new Error("บัญชี SHIPPOP เป็นแบบเติมเงินก่อน — ต้องจ่ายในเว็บ SHIPPOP เอง (ขอ SHIPPOP เปลี่ยนเป็นบัญชีวางบิล)");
  const purchaseId = String(b.purchase_id);
  const booked = (b.data ?? {}) as Record<string, Json>;
  const c = await call("/confirm/", { purchase_id: purchaseId });
  const confirmed = ((c.result ?? c.data ?? {}) as Record<string, Json>) ?? {};
  const results = items.map((it, i) => {
    const bk = booked[String(i)] ?? {};
    const cf = confirmed[String(i)] ?? {};
    const ok = bk.status === true && cf.status !== false;
    return { key: it.key, ok, error: ok ? undefined : String(cf.message ?? bk.message ?? "จองไม่สำเร็จ"), trackingCode: bk.tracking_code ? String(bk.tracking_code) : undefined, courierTrackingCode: cf.courier_tracking_code ? String(cf.courier_tracking_code) : undefined, price: Number(bk.price) || 0 };
  });
  return { purchaseId, mode: "live", results };
}

/** ขนาดใบปะหน้าที่ SHIPPOP ทำให้ได้ (คู่มือ /label_tracking_code/) · ค่าเริ่ม = สติกเกอร์ 4×6 นิ้ว (≈100×150 มม.) */
export const LABEL_SIZES = [
  { code: "sticker4x6", label: "สติกเกอร์ 4×6 นิ้ว (100×150 มม.)", hint: "เครื่องพิมพ์ความร้อน" },
  { code: "A6", label: "A6", hint: "" },
  { code: "A5", label: "A5", hint: "" },
  { code: "A4", label: "A4", hint: "เครื่องพิมพ์ทั่วไป" },
  { code: "letter4x6", label: "ซอง 4×6 (152×90 มม.)", hint: "" },
] as const;
export type LabelSize = (typeof LABEL_SIZES)[number]["code"];
export const labelSizeOf = (v: unknown): LabelSize => (LABEL_SIZES.find((s) => s.code === v)?.code ?? "sticker4x6");

/** ใบปะหน้าของรหัส SP… หลายรายการ (HTML) — โหมดจำลอง = null (ใช้ใบปะหน้าของเราเอง) */
export async function shippopLabelHtml(trackingCodes: string[], force?: ShippopMode, size: LabelSize = "sticker4x6"): Promise<string | null> {
  if (effMode(force) === "sim" || !trackingCodes.length) return null;
  const j = await call("/label_tracking_code/", { tracking_code: trackingCodes.join(","), size: labelSizeOf(size), type: "html", ...(size === "sticker4x6" ? { showproduct: 1 } : {}) });
  return typeof j.html === "string" ? j.html : null;
}

/** สถานะล่าสุดจาก Shippop (ใช้ยืนยัน webhook — เส้นนี้ไม่ต้องใช้ api_key) */
export async function shippopTrack(trackingCode: string): Promise<{ status: string; courierTrackingCode: string } | null> {
  if (shippopMode() === "sim") return null;
  const res = await fetch(`${baseUrl()}/tracking/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tracking_code: trackingCode }), cache: "no-store", signal: AbortSignal.timeout(15000) });
  const j = (await res.json().catch(() => ({}))) as Json;
  return j.status === true ? { status: String(j.order_status ?? ""), courierTrackingCode: String(j.courier_tracking_code ?? "") } : null;
}

/** ยกเลิก (ก่อนขนส่งเข้ารับ) */
export async function shippopCancel(courierTrackingCode: string, force?: ShippopMode): Promise<boolean> {
  if (effMode(force) === "sim") return true;
  const j = await call("/cancel/", { courier_tracking_code: courierTrackingCode });
  return j.status === true;
}
