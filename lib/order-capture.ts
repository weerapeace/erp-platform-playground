/**
 * ของกลาง — "คำสั่งซื้อจากไลน์" (กล่องพัก purchase_order_captures)
 *
 * เส้นทาง: พนักงานซื้อของจาก Shopee/Taobao เสร็จ → แคปหน้าคำสั่งซื้อส่งเข้า "กลุ่มส่งรูปคำสั่งซื้อ" (slot purchase_capture)
 *   → webhook บอทเดิม (/api/china-pay/line-webhook) ส่งรูปมาที่นี่ → เก็บรูปลง R2 → AI อ่าน → พักในกล่อง (สถานะ "รอตรวจ")
 *   → บอทตอบกลับในกลุ่ม (reply = ฟรี ไม่นับโควตา push 300/เดือน) พร้อมลิงก์ไปตรวจ
 *   → คนตรวจ/แก้ แล้วกดยืนยันที่ /purchasing/line-orders (ผูก PO เดิม / เปิด PO ใหม่ / เก็บไว้ก่อน)
 *
 * กติกาสำคัญ:
 *   - ผล AI เป็นแค่ "ร่าง" ห้ามเอาไปแตะ PO จนกว่าคนกดยืนยัน
 *   - ยืนยันว่ารูปมาจากไลน์จริงด้วยการ "ดึงรูปจากไลน์ด้วยโทเคนบอทเรา" — ข้อความปลอมดึงรูปไม่ได้ = ไม่บันทึก
 *   - ไม่ให้ AI ถอดชื่อ/ที่อยู่/เบอร์ผู้รับ (รูปต้นฉบับยังมีอยู่ → ดูได้เฉพาะคนมีสิทธิ์ po.view)
 *   - ใช้กลุ่มที่คุยงานอยู่แล้วได้: รูปจากไลน์ที่ AI บอกว่า "ไม่ใช่คำสั่งซื้อ" → บอทไม่ตอบ + ตีตกให้เอง (กู้คืนได้)
 *     (อัปรูปเองจากหน้าเว็บไม่ตีตกอัตโนมัติ — คนอัปตั้งใจส่งมาเอง)
 *   - 1 รูปมีหลายคำสั่งซื้อได้ (แคปหน้ารายการ Taobao/Shopee — เจอจริงในรูปแรกของเจ้าของ 3 ร้าน) → แยก 1 ใบต่อ 1 คำสั่งซื้อ
 *     หน้ารายการไม่มีเลขคำสั่งซื้อ → เตือนซ้ำด้วย ร้าน+วันที่+ยอดจ่าย แทน · ให้ AI รู้ "วันนี้" กันเดาปีผิด
 */
import type { supabaseAdmin } from "@/lib/supabase-admin";
import { r2PutObject } from "@/lib/r2";
import { chatJson, imagesToDataUrls, openAiKey } from "@/lib/ai-caption";
import { appBaseUrl } from "@/lib/app-url";
import { writeAudit } from "@/lib/audit";
import { shopNameSimilarity } from "@/lib/partner-match";
import { computePoTotals, sumActiveLines } from "@/lib/po-total";
import { createManualPo } from "@/lib/po-manual";
import { LINE_SLOTS } from "@/lib/line-registry";
import {
  PLATFORM_LABEL, curSym, fieldLabel, isCNY,
  type CaptureItem, type CapturePlatform, type CaptureRow, type CaptureStatus, type PoLineLite, type PoSuggestion,
} from "@/lib/order-capture-shared";

export type { CaptureItem, CapturePlatform, CaptureRow, CaptureStatus, PoLineLite, PoSuggestion };

type Admin = ReturnType<typeof supabaseAdmin>;
type Rec = Record<string, unknown>;

export const CAPTURE_TABLE = "purchase_order_captures";
/** slot กลุ่มไลน์ใน line_config.groups (ตั้งได้ที่ LINE console / หน้าคำสั่งซื้อจากไลน์) */
export const ORDER_CAPTURE_SLOT = "purchase_capture";
/** โมเดลอ่านรูป — อ่านตัวหนังสือจีน/ไทยตัวเล็กในหน้าจอมือถือได้ดี ราคาถูก (เปลี่ยนได้ด้วย env) */
export const ORDER_AI_MODEL = (process.env.OPENAI_ORDER_MODEL || "gpt-4.1-mini").trim();
/** รูปชุดเดียวกัน (ส่งหลายรูปพร้อมกัน) รอครบได้นานเท่านี้ — เกินแล้วรวมเท่าที่มี */
const SET_WAIT_MS = 3 * 60 * 1000;

/** คอลัมน์ที่ส่งไปหน้าจอ (ไม่รวม ai_raw ที่ยาว) */
export const CAPTURE_COLUMNS = [
  "id", "source", "status", "platform", "shop_name", "order_no", "order_no_norm", "order_date", "currency", "items",
  "shipping_fee", "discount", "total_paid", "tracking_no", "note", "image_keys", "ai_confidence", "ai_unreadable",
  "ai_is_order", "ai_notes", "ai_error", "ai_model", "ai_read_at", "dup_of", "sender_line_user_id", "sender_name",
  "line_group_id", "image_set_id", "po_id", "po_mode", "confirmed_by", "confirmed_at", "rejected_by", "rejected_at",
  "reject_reason", "created_by", "created_at", "updated_at",
].join(", ");

// ---------------------------------------------------------------- ตัวช่วยเล็ก ๆ

const str = (v: unknown) => String(v ?? "").trim();
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
};
const r2d = (n: number) => Math.round(n * 100) / 100;

const PLATFORMS = Object.keys(PLATFORM_LABEL) as CapturePlatform[];
/** สกุลตั้งต้นของแพลตฟอร์ม (ถ้า AI ไม่บอก) */
const defaultCurrency = (p: CapturePlatform | null) => (p === "taobao" || p === "1688" ? "RMB" : "THB");
const money = (n: number | null, c: unknown) =>
  n === null ? "—" : `${curSym(c)}${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}`;

/** เลขคำสั่งซื้อแบบตัดช่องว่าง/ขีด/ตัวพิมพ์เล็ก — ไว้เทียบซ้ำ (สั้นกว่า 6 ตัว = ไม่น่าเชื่อ ไม่ใช้เทียบ) */
export function normOrderNo(v: unknown): string | null {
  const s = str(v).toUpperCase().replace(/[^0-9A-Z]/g, "");
  return s.length >= 6 ? s : null;
}

/** ลิงก์เปิดใบนี้ในหน้า ERP (ใช้ในข้อความตอบกลับไลน์) */
export const captureLink = (id: string) => `${appBaseUrl()}/purchasing/line-orders?open=${encodeURIComponent(id)}`;

export function normalizeRow(r: Rec): CaptureRow {
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    ...(r as unknown as CaptureRow),
    items: arr(r.items) as CaptureItem[],
    image_keys: arr(r.image_keys).map(String),
    ai_unreadable: arr(r.ai_unreadable).map(String),
    shipping_fee: numOrNull(r.shipping_fee),
    discount: numOrNull(r.discount),
    total_paid: numOrNull(r.total_paid),
    ai_confidence: numOrNull(r.ai_confidence),
  };
}

export async function loadCapture(admin: Admin, id: string): Promise<CaptureRow | null> {
  const { data } = await admin.from(CAPTURE_TABLE).select(CAPTURE_COLUMNS).eq("id", id).maybeSingle();
  return data ? normalizeRow(data as unknown as Rec) : null;
}

// ---------------------------------------------------------------- AI อ่านรูป

/** วันนี้ตามเวลาไทย (YYYY-MM-DD) — ให้ AI เติมปีเองได้ถูกเมื่อภาพเห็นแค่ "10.25" */
export const todayBangkok = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

function aiSystem(today: string): string {
  return [
    "คุณคือผู้ช่วยฝ่ายจัดซื้อ อ่านภาพหน้าจอ \"คำสั่งซื้อที่ซื้อแล้ว\" จากแอป Shopee / Taobao / 1688 / Lazada / TikTok Shop แล้วตอบเป็น JSON อย่างเดียว ตามโครงนี้:",
    "{",
    '  "is_order": true/false — ภาพเป็นหน้าคำสั่งซื้อ / รายการคำสั่งซื้อ / รายละเอียดคำสั่งซื้อ / หน้าติดตามพัสดุ จริงไหม,',
    '  "orders": [ {',
    '    "platform": "taobao" | "shopee" | "1688" | "lazada" | "tiktok" | "other",',
    '    "shop_name": "ชื่อร้านตามที่เห็น (ภาษาเดิม)",',
    '    "order_no": "เลขคำสั่งซื้อ (Taobao: 订单编号 ตัวเลขยาว ~19 หลัก · Shopee: หมายเลขคำสั่งซื้อ/Order ID) ไม่เห็น = \\"\\"",',
    '    "order_date": "YYYY-MM-DD วันที่สั่ง/ชำระเงิน ไม่เห็น = \\"\\"",',
    '    "currency": "RMB" ถ้าราคาเป็น ¥/元 · "THB" ถ้าเป็น ฿/บาท,',
    '    "items": [{ "name": "ชื่อสินค้าตามภาพ", "name_th": "แปลชื่อเป็นไทยให้ครบใจความ — ต้องคงรูปทรง ขนาด/ตัวเลข เบอร์ รุ่น วัสดุ ไว้ทุกตัว (ชื่อเดิมเป็นไทยอยู่แล้ว = ใช้ชื่อเดิม)", "option": "ตัวเลือก (สี/ขนาด/规格) ตามภาพ แปลไทยในวงเล็บ — สีให้แปลเป็นชื่อสี เช่น 咖啡 = สีน้ำตาลกาแฟ", "qty": จำนวน, "unit_price": ราคาต่อชิ้นที่จ่ายจริง, "line_total": ยอดรวมของบรรทัด }],',
    '    "shipping_fee": ค่าส่ง (运费 / 含运费¥2 = 2) เป็นตัวเลข · ส่งฟรี = 0 · ไม่เห็น = null,',
    '    "discount": ส่วนลดรวมเป็นตัวเลขบวก · ไม่เห็น = null,',
    '    "total_paid": ยอดที่จ่ายจริงของคำสั่งซื้อนั้น (实付款 / ยอดชำระทั้งหมด) · ไม่เห็น = null,',
    '    "tracking_no": "เลขพัสดุ (运单号/快递单号/หมายเลขติดตามพัสดุ) ไม่เห็น = \\"\\"",',
    '    "confidence": 0-100 ความมั่นใจว่าอ่านคำสั่งซื้อนี้ถูก,',
    '    "unreadable": ["ชื่อช่องที่อ่านไม่ชัดหรือไม่เห็นในภาพ เช่น shipping_fee, order_no"],',
    '    "notes": "หมายเหตุสั้น ๆ ภาษาไทย ถ้ามีอะไรผิดปกติ (เช่น กล่องถูกตัดครึ่ง)"',
    "  } ]",
    "}",
    "กฎ:",
    "· 1 คำสั่งซื้อ = 1 รายการใน orders · หน้า \"รายการคำสั่งซื้อ\" (Taobao 我的订单/待发货/待收货 · Shopee การซื้อของฉัน) มักมีหลายคำสั่งซื้อ: แต่ละกล่องร้าน = 1 คำสั่งซื้อ ต้องใส่ให้ครบทุกกล่องที่เห็นราคา",
    "· หลายภาพที่เป็นคำสั่งซื้อเดียวกัน (เช่น หน้ารายละเอียดที่แคปต่อกัน) ให้รวมเป็นรายการเดียว",
    `· วันนี้คือ ${today} (เวลาไทย) — ถ้าภาพเห็นแค่ เดือน.วัน (เช่น 10.25 หรือ 10月25日) ให้ใช้ปีของวันนี้ ถ้าได้วันในอนาคตให้ใช้ปีก่อนหน้า`,
    "· ห้ามเดาตัวเลข — ไม่เห็นชัดให้ใส่ null แล้วใส่ชื่อช่องใน unreadable · ตัวเลขเป็นตัวเลขล้วน ไม่มีสัญลักษณ์เงินหรือคอมมา",
    "· ห้ามใส่ชื่อผู้รับ ที่อยู่ หรือเบอร์โทร ลงในคำตอบ · ถ้าภาพไม่ใช่คำสั่งซื้อ ให้ is_order=false และ orders เป็น []",
  ].join("\n");
}

export type AiOrderResult = {
  platform: CapturePlatform | null;
  shop_name: string;
  order_no: string;
  order_date: string | null;
  currency: string;
  items: CaptureItem[];
  shipping_fee: number | null;
  discount: number | null;
  total_paid: number | null;
  tracking_no: string;
  confidence: number | null;
  unreadable: string[];
  notes: string;
};
export type AiReadResult = { is_order: boolean; orders: AiOrderResult[] };

/** วันที่ที่ AI ให้มาอยู่ในอนาคต (มักเพราะเดาปีผิด) → ถอยไป 1 ปี */
function fixFutureDate(date: string | null, today: string): string | null {
  if (!date) return null;
  const limit = new Date(`${today}T00:00:00Z`).getTime() + 2 * 86400000;
  const t = new Date(`${date}T00:00:00Z`).getTime();
  if (!isFinite(t) || t <= limit) return date;
  return `${Number(date.slice(0, 4)) - 1}${date.slice(4)}`;
}

/** ทำคำสั่งซื้อ 1 รายการที่ AI ตอบให้อยู่ในรูปที่ปลอดภัย (AI ตอบอะไรแปลก ๆ มาก็ไม่พัง) */
export function sanitizeAiOrder(raw: Rec, today = todayBangkok()): AiOrderResult {
  const p = str(raw.platform).toLowerCase();
  const platform = (PLATFORMS as string[]).includes(p) ? (p as CapturePlatform) : (p ? "other" : null);
  const curRaw = str(raw.currency).toUpperCase();
  const currency = isCNY(curRaw) ? "RMB" : curRaw === "THB" ? "THB" : defaultCurrency(platform);
  const items: CaptureItem[] = (Array.isArray(raw.items) ? raw.items : []).map((x) => {
    const it = (x ?? {}) as Rec;
    const qty = numOrNull(it.qty);
    let unit = numOrNull(it.unit_price);
    const total = numOrNull(it.line_total);
    if (unit === null && total !== null && qty) unit = r2d(total / qty);
    return {
      name: str(it.name).slice(0, 300),
      name_th: str(it.name_th).slice(0, 300),
      option: str(it.option).slice(0, 200),
      qty: qty && qty > 0 ? qty : 1,
      unit_price: unit,
      line_total: total ?? (unit !== null && qty ? r2d(unit * qty) : null),
    };
  }).filter((it) => it.name || it.name_th).slice(0, 50);
  const date = str(raw.order_date);
  const conf = numOrNull(raw.confidence);
  return {
    platform,
    shop_name: str(raw.shop_name).slice(0, 200),
    order_no: str(raw.order_no).slice(0, 60),
    order_date: fixFutureDate(/^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null, today),
    currency,
    items,
    shipping_fee: numOrNull(raw.shipping_fee),
    discount: numOrNull(raw.discount),
    total_paid: numOrNull(raw.total_paid),
    tracking_no: str(raw.tracking_no).slice(0, 60),
    confidence: conf === null ? null : Math.max(0, Math.min(100, conf)),
    unreadable: (Array.isArray(raw.unreadable) ? raw.unreadable : []).map(str).filter(Boolean).slice(0, 20),
    notes: str(raw.notes).slice(0, 500),
  };
}

/** ผล AI ทั้งรูป → หลายคำสั่งซื้อ (รองรับคำตอบแบบเก่าที่เป็นคำสั่งซื้อเดียวไม่มี orders ด้วย) */
export function sanitizeAiResult(raw: Rec, today = todayBangkok()): AiReadResult {
  const list = Array.isArray(raw.orders) ? (raw.orders as Rec[]) : (raw.shop_name || raw.items ? [raw] : []);
  const orders = list.map((o) => sanitizeAiOrder((o ?? {}) as Rec, today))
    .filter((o) => o.items.length > 0 || o.order_no || o.total_paid !== null)
    .slice(0, 20);
  return { is_order: raw.is_order !== false && orders.length > 0, orders };
}

/** ส่งรูป (data URL) ให้ AI อ่าน — detail "high" เพราะตัวหนังสือในหน้าจอมือถือเล็ก */
export async function readOrdersWithAi(dataUrls: string[]): Promise<{ result: AiReadResult; raw: Rec }> {
  const today = todayBangkok();
  const content: unknown[] = [
    { type: "text", text: `ภาพหน้าจอคำสั่งซื้อ ${dataUrls.length} ภาพ` },
    ...dataUrls.map((url) => ({ type: "image_url", image_url: { url, detail: "high" } })),
  ];
  const raw = await chatJson(aiSystem(today), content, 3000, ORDER_AI_MODEL);
  return { result: sanitizeAiResult(raw, today), raw };
}

// ---------------------------------------------------------------- ซ้ำ

/**
 * ใบอื่นที่น่าจะเป็นคำสั่งซื้อเดียวกัน (ไม่นับใบที่ตีตก) — ใบเก่าสุดมาก่อน
 *   มีเลขคำสั่งซื้อ = เทียบเลข · ไม่มีเลข (เช่น แคปหน้ารายการ) = เทียบ ร้าน + วันที่ + ยอดจ่าย ตรงกันทั้ง 3 อย่าง
 */
export async function findDuplicate(
  admin: Admin, id: string, orderNoNorm: string | null,
  fallback?: { shop_name: string | null; order_date: string | null; total_paid: number | null },
): Promise<CaptureRow | null> {
  let q = admin.from(CAPTURE_TABLE).select(CAPTURE_COLUMNS).neq("id", id).neq("status", "rejected").neq("status", "collecting");
  if (orderNoNorm) q = q.eq("order_no_norm", orderNoNorm);
  else if (fallback?.shop_name && fallback.order_date && fallback.total_paid !== null) {
    q = q.eq("shop_name", fallback.shop_name).eq("order_date", fallback.order_date).eq("total_paid", fallback.total_paid);
  } else return null;
  const { data } = await q.order("created_at", { ascending: true }).limit(1);
  const row = (data ?? [])[0];
  return row ? normalizeRow(row as unknown as Rec) : null;
}

/** ผล AI 1 คำสั่งซื้อ → ช่องที่บันทึกลงใบ */
function orderFields(o: AiOrderResult): Rec {
  return {
    platform: o.platform,
    shop_name: o.shop_name || null,
    order_no: o.order_no || null,
    order_no_norm: normOrderNo(o.order_no),
    order_date: o.order_date,
    currency: o.currency,
    items: o.items,
    shipping_fee: o.shipping_fee,
    discount: o.discount,
    total_paid: o.total_paid,
    tracking_no: o.tracking_no || null,
    ai_confidence: o.confidence,
    ai_unreadable: o.unreadable,
  };
}

/** ตอนอ่านใหม่ใบที่เคยแยกมาจากรูปหลายคำสั่งซื้อ → เลือกคำสั่งซื้อที่เป็น "ของใบนี้" (ร้านเดิม > ลำดับเดิม > อันแรก) */
function pickOwnOrder(cap: CaptureRow, orders: AiOrderResult[], prevIndex: number | null): AiOrderResult | null {
  if (orders.length === 0) return null;
  if (cap.shop_name) {
    const byShop = orders.find((o) => o.shop_name && shopNameSimilarity(o.shop_name, cap.shop_name) >= 0.7);
    if (byShop) return byShop;
  }
  if (prevIndex !== null && orders[prevIndex]) return orders[prevIndex];
  return orders[0];
}

export type ProcessResult = {
  /** ใบนี้ (หลังอ่าน) */
  row: CaptureRow | null;
  /** ใบที่แยกเพิ่มจากรูปเดียวกัน (รูปมีหลายคำสั่งซื้อ) */
  extra: CaptureRow[];
};

/**
 * ให้ AI อ่านรูปของใบนี้ แล้วบันทึกผลเป็น "รอตรวจ" — ใช้ทั้งตอนรับจากไลน์ / อัปรูปเอง / กดอ่านใหม่
 * split = true (อ่านครั้งแรก): รูปมีหลายคำสั่งซื้อ (แคปหน้ารายการ) → แยกเป็น 1 ใบต่อ 1 คำสั่งซื้อ (ใช้รูปเดียวกัน)
 * split = false (กดอ่านใหม่): ไม่สร้างใบเพิ่ม — อัปเดตเฉพาะคำสั่งซื้อที่เป็นของใบนี้
 */
export async function processCapture(admin: Admin, id: string, actorName = "line-bot", split = false): Promise<ProcessResult> {
  const cap = await loadCapture(admin, id);
  if (!cap) return { row: null, extra: [] };
  const now = () => new Date().toISOString();
  const done = async (patch: Rec): Promise<ProcessResult> => {
    await admin.from(CAPTURE_TABLE).update({ ...patch, updated_at: now() }).eq("id", id);
    return { row: await loadCapture(admin, id), extra: [] };
  };
  if (!openAiKey()) return done({ status: "pending", ai_error: "ยังไม่ได้ตั้งค่า AI (OPENAI_API_KEY) — กรอกข้อมูลเองได้" });
  if (cap.image_keys.length === 0) return done({ status: "pending", ai_error: "ไม่มีรูปให้อ่าน" });

  try {
    const urls = await imagesToDataUrls(cap.image_keys);
    if (urls.length === 0) return done({ status: "pending", ai_error: "เปิดรูปจากที่เก็บไม่ได้ — ลองกดให้ AI อ่านใหม่" });
    const { result, raw } = await readOrdersWithAi(urls);
    // มีค่าใช้จ่าย → ลง audit ทุกครั้ง (นับค่า AI ได้ภายหลัง)
    await writeAudit(admin, {
      action: "ai_order_read", entityType: CAPTURE_TABLE, entityId: id, actorId: null, actorName,
      metadata: { actor: actorName, images: urls.length, model: ORDER_AI_MODEL, orders: result.orders.length, platform: result.orders[0]?.platform ?? null },
    });
    const base: Rec = { status: "pending", ai_is_order: result.is_order, ai_error: null, ai_model: ORDER_AI_MODEL, ai_read_at: now() };

    if (!result.is_order || result.orders.length === 0) {
      return done({ ...base, ai_raw: raw, ai_notes: str(raw.notes) || null, items: [], order_no: null, order_no_norm: null, dup_of: null });
    }

    const prevSplit = ((cap as unknown as { ai_raw?: Rec }).ai_raw?._split ?? null) as { index?: number } | null;
    const orders = split ? result.orders : [pickOwnOrder(cap, result.orders, prevSplit?.index ?? null)!];
    const total = orders.length;
    const note = (i: number, o: AiOrderResult) =>
      [total > 1 ? `รูปนี้มี ${total} คำสั่งซื้อ — ใบนี้คือใบที่ ${i + 1}/${total}` : "", o.notes].filter(Boolean).join(" · ") || null;

    // ใบนี้ = คำสั่งซื้อแรก
    const first = orders[0];
    const firstDup = await findDuplicate(admin, id, normOrderNo(first.order_no), first);
    const res = await done({
      ...base, ...orderFields(first), ai_notes: note(0, first), dup_of: firstDup?.id ?? null,
      ai_raw: { ...raw, _split: total > 1 ? { index: 0, total } : (prevSplit ?? undefined) },
    });

    // คำสั่งซื้อที่เหลือในรูปเดียวกัน → ใบใหม่ใบละคำสั่งซื้อ (รูป/คนส่ง/กลุ่มเดียวกัน)
    const extra: CaptureRow[] = [];
    for (let i = 1; i < total; i++) {
      const o = orders[i];
      const { data: ins } = await admin.from(CAPTURE_TABLE).insert({
        source: cap.source, status: "processing", image_keys: cap.image_keys,
        sender_line_user_id: cap.sender_line_user_id, sender_name: cap.sender_name, line_group_id: cap.line_group_id,
        line_message_ids: (cap as unknown as { line_message_ids?: unknown }).line_message_ids ?? [], created_by: cap.created_by,
      }).select("id").single();
      if (!ins) continue;
      const newId = String((ins as Rec).id);
      const dup = await findDuplicate(admin, newId, normOrderNo(o.order_no), o);
      await admin.from(CAPTURE_TABLE).update({
        ...base, ...orderFields(o), ai_notes: note(i, o), dup_of: dup?.id ?? null,
        ai_raw: { _split: { index: i, total }, from: id }, updated_at: now(),
      }).eq("id", newId);
      const row = await loadCapture(admin, newId);
      if (row) extra.push(row);
    }
    return { row: res.row, extra };
  } catch (e) {
    return done({ status: "pending", ai_error: String((e as Error)?.message ?? e).slice(0, 300) });
  }
}

// ---------------------------------------------------------------- LINE

type LineCfg = { token?: string; groups?: Record<string, string> } & Rec;
export type LineEvent = {
  type?: string;
  replyToken?: string;
  timestamp?: number;
  deliveryContext?: { isRedelivery?: boolean };
  source?: { type?: string; groupId?: string; roomId?: string; userId?: string };
  message?: { id?: string; type?: string; imageSet?: { id?: string; index?: number; total?: number } };
};

/** เหตุการณ์ "รูปในกลุ่มส่งรูปคำสั่งซื้อ" เท่านั้น — กลุ่มอื่น (บิลจีน/ขอซื้อ ฯลฯ) ไม่ยุ่ง */
export function pickOrderImageEvents(cfg: LineCfg, events: LineEvent[]): LineEvent[] {
  const gid = str(cfg.groups?.[ORDER_CAPTURE_SLOT]);
  if (!gid || !str(cfg.token)) return [];
  return events.filter((e) =>
    e.type === "message" && e.message?.type === "image" && e.source?.groupId === gid && /^\d{5,30}$/.test(str(e.message?.id)));
}

async function lineReply(token: string, replyToken: string | undefined, text: string): Promise<void> {
  if (!replyToken) return;
  try {
    await fetch("https://api.line.me/v2/bot/message/reply", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ replyToken, messages: [{ type: "text", text: text.slice(0, 4900) }] }),
    });
  } catch { /* ตอบไม่ได้ก็ไม่เป็นไร — ข้อมูลอยู่ใน ERP แล้ว */ }
}

async function lineMemberName(token: string, groupId: string, userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  try {
    const r = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/member/${encodeURIComponent(userId)}`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const j = (await r.json()) as { displayName?: string };
    return str(j.displayName) || null;
  } catch { return null; }
}

/** ดึงไฟล์รูปจากไลน์ — ทำหน้าที่ยืนยันด้วยว่าข้อความมีอยู่จริง (id ปลอม = ไลน์ตอบ 404) */
async function fetchLineImage(token: string, messageId: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  try {
    const r = await fetch(`https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`,
      { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const type = (r.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!type.startsWith("image/")) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > 15 * 1024 * 1024) return null;
    return { bytes: buf, type };
  } catch { return null; }
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

/** อัปรูปคำสั่งซื้อขึ้น R2 — ชื่อไฟล์สุ่ม เดาไม่ได้ */
export async function putCaptureImage(bytes: Uint8Array, type: string): Promise<string> {
  const ym = new Date().toISOString().slice(0, 7);
  const key = `line-orders/${ym}/${crypto.randomUUID()}.${EXT[type] ?? "jpg"}`;
  await r2PutObject(key, bytes, type);
  return key;
}

/** ข้อความตอบกลับในไลน์ (ข้อความเดียวเสมอ) — caps = ทุกใบที่ได้จากรูปนี้ (รูปหน้ารายการอาจมีหลายคำสั่งซื้อ) */
export function buildReplyText(caps: CaptureRow[], dups: Map<string, CaptureRow>): string {
  const cap = caps[0];
  if (caps.length > 1) {
    const lines: string[] = [`📥 รับรูปแล้ว — เจอ ${caps.length} คำสั่งซื้อ${cap.platform ? ` (${PLATFORM_LABEL[cap.platform]})` : ""} แยกเป็น ${caps.length} ใบ`];
    caps.slice(0, 8).forEach((c, i) => {
      const ship = c.shipping_fee ? ` · ค่าส่ง ${money(c.shipping_fee, c.currency)}` : "";
      const first = c.items[0] ? ` · ${c.items[0].name_th || c.items[0].name}${c.items.length > 1 ? ` +${c.items.length - 1}` : ""}` : "";
      lines.push(`${i + 1}) ${c.shop_name || "ไม่รู้ร้าน"} · ${money(c.total_paid, c.currency)}${ship}${first}${dups.has(c.id) ? " ⚠️ อาจซ้ำ" : ""}`);
    });
    if (caps.length > 8) lines.push(`…อีก ${caps.length - 8} ใบ`);
    if (caps.every((c) => !c.order_no)) lines.push("ℹ️ หน้ารายการไม่มีเลขคำสั่งซื้อ — ถ้าต้องการเลขให้แคปหน้ารายละเอียดเพิ่ม");
    lines.push(`ตรวจ/ยืนยันใน ERP 👉 ${appBaseUrl()}/purchasing/line-orders`);
    return lines.join("\n");
  }
  const link = captureLink(cap.id);
  const dup = dups.get(cap.id) ?? null;
  if (cap.ai_error && !cap.order_no && cap.items.length === 0) {
    return `📥 รับรูปแล้ว แต่ AI อ่านไม่สำเร็จ\nเปิดตรวจ/กรอกเองใน ERP 👉 ${link}`;
  }
  if (cap.ai_is_order === false) {
    return `🤔 รูปนี้ไม่เหมือนหน้าคำสั่งซื้อ\nถ้าใช่ เปิดตรวจใน ERP 👉 ${link}`;
  }
  const lines: string[] = [];
  lines.push(`📥 รับรูปคำสั่งซื้อแล้ว${cap.platform ? ` (${PLATFORM_LABEL[cap.platform]})` : ""}`);
  if (cap.shop_name) lines.push(`ร้าน: ${cap.shop_name}`);
  if (cap.order_no) lines.push(`เลขที่: ${cap.order_no}`);
  const extra = cap.shipping_fee !== null ? ` (ค่าส่ง ${money(cap.shipping_fee, cap.currency)})` : "";
  lines.push(`${cap.items.length} รายการ · ยอดจ่าย ${money(cap.total_paid, cap.currency)}${extra}`);
  for (const it of cap.items.slice(0, 5)) {
    lines.push(`• ${it.name_th || it.name}${it.option ? ` [${it.option}]` : ""} ×${it.qty}`);
  }
  if (cap.items.length > 5) lines.push(`• …อีก ${cap.items.length - 5} รายการ`);
  if (dup) {
    const when = new Date(dup.created_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
    lines.push(`⚠️ คำสั่งซื้อนี้ส่งมาแล้วเมื่อ ${when}${dup.sender_name ? ` (${dup.sender_name})` : ""} — อาจเป็นรูปซ้ำ`);
  }
  if (cap.ai_unreadable.length) lines.push(`⚠️ AI อ่านไม่ชัด: ${cap.ai_unreadable.map(fieldLabel).join(", ")}`);
  lines.push(`ตรวจ/ยืนยันใน ERP 👉 ${link}`);
  return lines.join("\n");
}

/**
 * รับรูปจากไลน์ทีละเหตุการณ์ (เรียกจาก webhook ใน after() — ตอบ 200 ให้ไลน์ไปก่อนแล้ว)
 * ส่งหลายรูปพร้อมกัน (imageSet) = รวมเป็นใบเดียว · AI อ่านเมื่อรูปครบชุด
 */
export async function handleOrderImageEvents(admin: Admin, cfg: LineCfg, events: LineEvent[]): Promise<void> {
  const token = str(cfg.token);
  for (const ev of events) {
    try { await handleOne(admin, token, ev); }
    catch (e) { console.error("[order-capture] handle event", e); }
  }
}

async function handleOne(admin: Admin, token: string, ev: LineEvent): Promise<void> {
  const msgId = str(ev.message?.id);
  const groupId = str(ev.source?.groupId);
  // ไลน์ส่งซ้ำ (redelivery) — รูปนี้บันทึกไปแล้ว ไม่ทำซ้ำ
  // jsonb ต้องส่งเป็น JSON (`cs.["…"]`) — .contains() กับ array จะส่งรูปแบบ array ของ Postgres ที่ jsonb อ่านไม่ได้
  const { data: seen } = await admin.from(CAPTURE_TABLE).select("id").filter("line_message_ids", "cs", JSON.stringify([msgId])).limit(1);
  if ((seen ?? []).length > 0) return;

  const img = await fetchLineImage(token, msgId);
  if (!img) return;   // ดึงไม่ได้ = ข้อความปลอม/หมดอายุ → ไม่บันทึก
  const key = await putCaptureImage(img.bytes, img.type);
  const sender = await lineMemberName(token, groupId, ev.source?.userId);

  const set = ev.message?.imageSet;
  const total = Math.max(1, Math.min(20, Number(set?.total) || 1));
  const setId = total > 1 ? str(set?.id) || null : null;
  const base = {
    source: "line",
    image_keys: [key],
    sender_line_user_id: ev.source?.userId ?? null,
    sender_name: sender,
    line_group_id: groupId,
    line_message_ids: [msgId],
    created_by: sender ?? "line",
  };

  if (!setId) {
    const { data: ins } = await admin.from(CAPTURE_TABLE).insert({ ...base, status: "processing" }).select("id").single();
    if (!ins) return;
    await finishAndReply(admin, token, String((ins as Rec).id), ev.replyToken);
    return;
  }

  // รูปชุด — เก็บทีละรูปก่อน ครบเมื่อไหร่ค่อยรวมเป็นใบเดียวแล้วอ่าน
  await admin.from(CAPTURE_TABLE).insert({
    ...base, status: "collecting", image_set_id: setId, image_set_index: Number(set?.index) || 1, image_set_total: total,
  });
  const primaryId = await mergeImageSet(admin, setId, total);
  if (primaryId) await finishAndReply(admin, token, primaryId, ev.replyToken);
}

/**
 * รวมรูปชุดเดียวกันเป็นใบเดียว — คืน id ใบหลักให้ "ตัวที่รวมได้" เท่านั้น (อีกตัวที่มาพร้อมกันได้ null)
 * force = รวมเท่าที่มี แม้ยังไม่ครบ (ใช้กับชุดที่รอนานเกิน)
 */
export async function mergeImageSet(admin: Admin, setId: string, total: number, force = false): Promise<string | null> {
  const { data } = await admin.from(CAPTURE_TABLE)
    .select("id, status, image_set_index, image_keys, line_message_ids").eq("image_set_id", setId);
  const rows = ((data ?? []) as Rec[]).filter((r) => r.status === "collecting");
  if (rows.length === 0 || (!force && rows.length < total)) return null;
  rows.sort((a, b) => Number(a.image_set_index ?? 0) - Number(b.image_set_index ?? 0));
  const primary = rows[0];
  const keys = rows.flatMap((r) => (Array.isArray(r.image_keys) ? r.image_keys : []).map(String));
  const ids = rows.flatMap((r) => (Array.isArray(r.line_message_ids) ? r.line_message_ids : []).map(String));
  // จองใบหลักแบบมีเงื่อนไข (status ยังเป็น collecting) — ถ้าอีกตัวจองไปแล้วจะได้ 0 แถว
  const { data: claimed } = await admin.from(CAPTURE_TABLE)
    .update({ status: "processing", image_keys: keys, line_message_ids: ids, updated_at: new Date().toISOString() })
    .eq("id", String(primary.id)).eq("status", "collecting").select("id").maybeSingle();
  if (!claimed) return null;
  await admin.from(CAPTURE_TABLE).delete().eq("image_set_id", setId).eq("status", "collecting").neq("id", String(primary.id));
  return String(primary.id);
}

/** AI บอกชัดว่า "ไม่ใช่หน้าคำสั่งซื้อ" และอ่านไม่ได้อะไรเลย (ไม่มีเลขที่ ไม่มีรายการ) — ใช้กับรูปจากไลน์เท่านั้น */
export const isNotOrderImage = (cap: Pick<CaptureRow, "ai_is_order" | "order_no" | "items">) =>
  cap.ai_is_order === false && !cap.order_no && cap.items.length === 0;

/** ตีตกอัตโนมัติ (รูปที่ไม่ใช่คำสั่งซื้อ) — กู้คืนได้ที่แท็บ "ตีตก" */
export async function autoRejectNotOrder(admin: Admin, id: string): Promise<void> {
  const now = new Date().toISOString();
  await admin.from(CAPTURE_TABLE).update({
    status: "rejected", rejected_by: "AI", rejected_at: now, reject_reason: "AI: ไม่ใช่หน้าคำสั่งซื้อ", updated_at: now,
  }).eq("id", id).eq("status", "pending");
  await writeAudit(admin, {
    action: "reject", entityType: CAPTURE_TABLE, entityId: id, actorId: null, actorName: "AI",
    metadata: { actor: "AI", reason: "not_order", auto: true },
  });
}

async function finishAndReply(admin: Admin, token: string, id: string, replyToken: string | undefined): Promise<void> {
  const { row: cap, extra } = await processCapture(admin, id, "line-bot", true);
  if (!cap) return;
  // รูปที่ไม่ใช่คำสั่งซื้อ (รูปสินค้า/รูปคุยงานในกลุ่มที่ใช้ร่วมกัน) → บอทเงียบ + ย้ายไป "ตีตก" ให้เอง ไม่ให้แชท/กล่องรก
  if (extra.length === 0 && isNotOrderImage(cap)) { await autoRejectNotOrder(admin, id); return; }
  const caps = [cap, ...extra];
  const dups = new Map<string, CaptureRow>();
  for (const c of caps) {
    if (!c.dup_of) continue;
    const d = await loadCapture(admin, c.dup_of);
    if (d) dups.set(c.id, d);
  }
  await lineReply(token, replyToken, buildReplyText(caps, dups));
}

/**
 * รูปชุดที่รอครบนานเกินไป (เช่นรูปหนึ่งดึงไม่ได้) → รวมเท่าที่มีให้เป็น "รอตรวจ" (ไม่อ่าน AI ตรงนี้ ให้คนกดอ่านใหม่)
 * เรียกตอนเปิดหน้ารายการ — ไม่ต้องมีตัวตั้งเวลา
 */
export async function finalizeStaleSets(admin: Admin): Promise<void> {
  const before = new Date(Date.now() - SET_WAIT_MS).toISOString();
  const { data } = await admin.from(CAPTURE_TABLE).select("image_set_id, image_set_total")
    .eq("status", "collecting").lt("created_at", before).limit(50);
  const sets = new Map<string, number>();
  for (const r of (data ?? []) as Rec[]) if (r.image_set_id) sets.set(String(r.image_set_id), Number(r.image_set_total) || 1);
  for (const [setId, total] of sets) {
    const id = await mergeImageSet(admin, setId, total, true);
    if (id) await admin.from(CAPTURE_TABLE).update({ status: "pending", ai_error: "รูปชุดนี้มาไม่ครบ — กด \"ให้ AI อ่านใหม่\"" }).eq("id", id);
  }
  // ใบที่ค้าง "กำลังอ่าน" นานเกิน (เครื่องดับกลางทาง) → ให้กลับมาเป็นรอตรวจ
  await admin.from(CAPTURE_TABLE).update({ status: "pending", ai_error: "AI อ่านไม่เสร็จ — กด \"ให้ AI อ่านใหม่\"" })
    .eq("status", "processing").lt("updated_at", before);
}

// ---------------------------------------------------------------- เสนอ PO ที่น่าจะใช่

/** ตัดช่องว่าง/เครื่องหมาย แล้วเทียบคู่ตัวอักษร (ใช้ได้กับไทย/จีนที่ไม่มีเว้นวรรค) */
function bigrams(s: string): Map<string, number> {
  const t = s.toLowerCase().replace(/[\s\[\]().,#*×x\-_/:;'"]+/g, "");
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) { const g = t.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1); }
  return m;
}
export function nameSimilarity(a: string, b: string): number {
  const A = bigrams(a), B = bigrams(b);
  let sa = 0, sb = 0, inter = 0;
  A.forEach((v) => { sa += v; });
  B.forEach((v) => { sb += v; });
  if (!sa || !sb) return 0;
  A.forEach((v, g) => { inter += Math.min(v, B.get(g) ?? 0); });
  return (2 * inter) / (sa + sb);
}

const OPEN_PO_STATUS = ["draft", "purchase", "partial"];
const PLATFORM_SELLER: Partial<Record<CapturePlatform, RegExp>> = {
  taobao: /tao\s*bao|taobao|เถาเป่า|淘宝/i,
  "1688": /1688/,
  shopee: /shopee|ช้อปปี้/i,
  lazada: /lazada|ลาซาด้า/i,
  tiktok: /tiktok|ติ๊กต็อก/i,
};

/** โหลดบรรทัด PO (ที่ยังใช้งาน) ของหลายใบ */
export async function loadPoLines(admin: Admin, poIds: string[]): Promise<Map<string, PoLineLite[]>> {
  const out = new Map<string, PoLineLite[]>();
  if (poIds.length === 0) return out;
  // แบ่งทีละ 100 ใบ — กัน URL ยาวเกิน และกันเพดาน 1,000 แถวต่อคำขอของ PostgREST ตัดบรรทัดทิ้งเงียบ ๆ
  const chunks: string[][] = [];
  for (let i = 0; i < poIds.length; i += 100) chunks.push(poIds.slice(i, i + 100));
  const results = await Promise.all(chunks.map((ids) => admin.from("purchase_order_lines_v2")
    .select("id, po_id, item_name, qty, price_est, item_sku_id, qty_received, is_active, sort_order")
    .in("po_id", ids).order("sort_order", { ascending: true }).limit(5000)));
  for (const l of results.flatMap((r) => (r.data ?? []) as Rec[])) {
    if (l.is_active === false) continue;
    const arr = out.get(String(l.po_id)) ?? [];
    arr.push({
      id: String(l.id), item_name: str(l.item_name), qty: Number(l.qty) || 0, price_est: Number(l.price_est) || 0,
      item_sku_id: (l.item_sku_id as string) ?? null, qty_received: Number(l.qty_received) || 0,
    });
    out.set(String(l.po_id), arr);
  }
  return out;
}

/** จับคู่รายการในรูปกับบรรทัด PO แบบดีที่สุด (บรรทัดละ 1 รายการ) — คืน [mapping, คะแนนรวม, จำนวนที่ตรง] */
function mapItemsToLines(items: CaptureItem[], lines: PoLineLite[]): { mapping: (string | null)[]; score: number; hits: number } {
  const used = new Set<string>();
  const mapping: (string | null)[] = [];
  let score = 0, hits = 0;
  for (const it of items) {
    let best: { id: string; s: number } | null = null;
    for (const l of lines) {
      if (used.has(l.id)) continue;
      let s = 0;
      if (it.sku_id && l.item_sku_id && it.sku_id === l.item_sku_id) s += 3;
      const sim = Math.max(nameSimilarity(`${it.name_th} ${it.option}`, l.item_name), it.sku_name ? nameSimilarity(it.sku_name, l.item_name) : 0);
      if (sim >= 0.3) s += 2 * sim;
      if (s > 0 && it.qty && Math.abs(it.qty - l.qty) < 0.001) s += 1;
      if (s > 0 && it.unit_price && l.price_est && Math.abs(it.unit_price - l.price_est) <= Math.max(0.01, l.price_est * 0.02)) s += 0.5;
      if (s >= 0.8 && (!best || s > best.s)) best = { id: l.id, s };
    }
    mapping.push(best?.id ?? null);
    if (best) { used.add(best.id); score += best.s; hits++; }
  }
  return { mapping, score, hits };
}

/** หา PO ที่ยังค้าง (ร่าง/รอรับของ) ที่น่าจะเป็นใบเดียวกับคำสั่งซื้อนี้ — ให้คนเลือกยืนยัน ไม่ผูกเอง */
export async function suggestPurchaseOrders(admin: Admin, cap: CaptureRow, limit = 3): Promise<PoSuggestion[]> {
  const since = new Date(Date.now() - 150 * 86400000).toISOString();
  const { data } = await admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, status, currency, order_date, grand_total, created_at")
    .eq("is_active", true).in("status", OPEN_PO_STATUS).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(400);
  const pos = (data ?? []) as Rec[];
  if (pos.length === 0) return [];
  const linesBy = await loadPoLines(admin, pos.map((p) => String(p.id)));
  const sellerRe = cap.platform ? PLATFORM_SELLER[cap.platform] : undefined;

  const scored: PoSuggestion[] = [];
  for (const p of pos) {
    const lines = linesBy.get(String(p.id)) ?? [];
    const reasons: string[] = [];
    let score = 0;
    const seller = str(p.seller_name);
    if (sellerRe && sellerRe.test(seller)) { score += 1.5; reasons.push(`ร้าน "${seller}"`); }
    else if (cap.shop_name && shopNameSimilarity(seller, cap.shop_name) >= 0.7) { score += 2.5; reasons.push(`ชื่อร้านตรง "${seller}"`); }
    const m = mapItemsToLines(cap.items, lines);
    if (m.hits > 0) { score += m.score; reasons.push(`สินค้าตรง ${m.hits}/${cap.items.length} รายการ`); }
    if (m.hits === 0) continue;   // ไม่มีสินค้าตรงเลย = ไม่เสนอ (กันเสนอมั่ว)
    if (cap.currency && isCNY(cap.currency) === isCNY(p.currency)) score += 0.3;
    else if (cap.currency) reasons.push("⚠ สกุลเงินไม่ตรงกับใบ");
    scored.push({
      id: String(p.id), po_no: str(p.po_no), seller_name: seller, status: str(p.status), currency: str(p.currency),
      order_date: (p.order_date as string) ?? null, grand_total: Number(p.grand_total) || 0,
      score: r2d(score), reasons, lines, mapping: m.mapping,
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** ค้น PO ที่ยังค้างด้วยเลขที่/ชื่อร้าน (ให้เลือกเองเมื่อระบบเสนอไม่ตรง) */
export async function searchOpenPos(admin: Admin, q: string): Promise<{ id: string; po_no: string; seller_name: string; status: string; currency: string; order_date: string | null; grand_total: number }[]> {
  const term = q.replace(/[%,()]/g, " ").trim();
  let query = admin.from("purchase_orders_v2")
    .select("id, po_no, seller_name, status, currency, order_date, grand_total")
    .eq("is_active", true).in("status", OPEN_PO_STATUS).order("created_at", { ascending: false }).limit(20);
  if (term) query = query.or(`po_no.ilike.%${term}%,seller_name.ilike.%${term}%`);
  const { data } = await query;
  return ((data ?? []) as Rec[]).map((p) => ({
    id: String(p.id), po_no: str(p.po_no), seller_name: str(p.seller_name), status: str(p.status),
    currency: str(p.currency), order_date: (p.order_date as string) ?? null, grand_total: Number(p.grand_total) || 0,
  }));
}

// ---------------------------------------------------------------- ยืนยัน

export type ConfirmInput = {
  mode: "link" | "new" | "none";
  po_id?: string | null;
  /** ผูก PO เดิม: ใส่ราคาจริงจากรูปลงบรรทัดที่จับคู่ */
  update_prices?: boolean;
  /** เปิด PO ใหม่: ชื่อร้านในใบ (ว่าง = ตามแพลตฟอร์ม เช่น Taobao) */
  seller_name?: string;
  /** ยืนยันแม้เลขคำสั่งซื้อซ้ำกับใบที่ยืนยันไปแล้ว */
  force?: boolean;
};
export type ConfirmResult =
  | { ok: true; po_id: string | null; po_no: string | null; warnings: string[] }
  | { ok: false; status: number; error: string };

const itemLabel = (it: CaptureItem) => {
  const base = it.sku_name || it.name_th || it.name;
  return it.option && !it.sku_name ? `${base} (${it.option})` : base;
};
const unitPrice = (it: CaptureItem) =>
  it.unit_price !== null && it.unit_price !== undefined ? it.unit_price : (it.line_total !== null && it.qty ? r2d(it.line_total / it.qty) : 0);

/** ข้อความอ้างอิงคำสั่งซื้อที่ต่อท้ายหมายเหตุ PO (ค้นหาเจอจากหน้ารายการ PO) */
const orderRef = (cap: CaptureRow) =>
  `🧾 ${cap.platform ? PLATFORM_LABEL[cap.platform] : "คำสั่งซื้อ"}${cap.order_no ? ` #${cap.order_no}` : ""}${cap.shop_name ? ` · ${cap.shop_name}` : ""}`;

export async function confirmCapture(admin: Admin, cap: CaptureRow, input: ConfirmInput, actor: { id: string; name: string }): Promise<ConfirmResult> {
  if (cap.status !== "pending") return { ok: false, status: 400, error: "ใบนี้ไม่ได้อยู่ในสถานะรอตรวจ" };
  if (cap.items.length === 0 && input.mode !== "none") return { ok: false, status: 400, error: "ยังไม่มีรายการสินค้า — เพิ่มรายการก่อน หรือเลือก \"เก็บไว้ก่อน\"" };

  // เลขคำสั่งซื้อซ้ำกับใบที่ยืนยันไปแล้ว = น่าจะซื้อซ้ำ/ส่งซ้ำ → กันไว้ก่อน (ยืนยันซ้ำได้ถ้าตั้งใจ)
  if (cap.order_no_norm && !input.force) {
    const { data: dups } = await admin.from(CAPTURE_TABLE).select("id, po_id, confirmed_at")
      .eq("order_no_norm", cap.order_no_norm).eq("status", "confirmed").neq("id", cap.id).limit(1);
    if ((dups ?? []).length > 0) return { ok: false, status: 409, error: "เลขคำสั่งซื้อนี้ยืนยันไปแล้วในอีกใบ — ถ้าตั้งใจจริงให้กดยืนยันซ้ำอีกครั้ง" };
  }

  const warnings: string[] = [];
  let poId: string | null = null;
  let poNo: string | null = null;

  if (input.mode === "new") {
    const seller = str(input.seller_name) || (cap.platform && cap.platform !== "other" ? PLATFORM_LABEL[cap.platform] : "") || str(cap.shop_name);
    const res = await createManualPo(admin, {
      seller_name: seller,
      currency: isCNY(cap.currency) ? "RMB" : "THB",
      order_date: cap.order_date ?? undefined,
      note: [orderRef(cap), cap.shipping_fee ? `ค่าส่ง ${money(cap.shipping_fee, cap.currency)}` : "", cap.tracking_no ? `พัสดุ ${cap.tracking_no}` : ""].filter(Boolean).join(" · "),
      lines: cap.items.map((it) => ({ item_sku_id: it.sku_id ?? null, item_name: itemLabel(it), qty: it.qty, price: unitPrice(it), note: it.mo_no ? `จากใบสั่งผลิต ${it.mo_no}` : null })),
    }, actor, { source: "line_capture", capture_id: cap.id });
    if (!res.ok) return res;
    poId = res.id; poNo = res.po_no;
  }

  if (input.mode === "link") {
    const id = str(input.po_id);
    if (!id) return { ok: false, status: 400, error: "ยังไม่ได้เลือกใบสั่งซื้อ" };
    const { data: po } = await admin.from("purchase_orders_v2")
      .select("id, po_no, currency, vat_rate, vat_included, note, is_active").eq("id", id).maybeSingle();
    const p = po as Rec | null;
    if (!p || p.is_active === false) return { ok: false, status: 404, error: "ไม่พบใบสั่งซื้อนี้" };
    poId = String(p.id); poNo = str(p.po_no);
    const linesBy = await loadPoLines(admin, [poId]);
    const lines = linesBy.get(poId) ?? [];
    const lineIds = new Set(lines.map((l) => l.id));
    const sameCur = !cap.currency || isCNY(cap.currency) === isCNY(p.currency);
    if (input.update_prices && !sameCur) warnings.push("สกุลเงินในรูปไม่ตรงกับใบสั่งซื้อ — ไม่ได้ใส่ราคาให้ (แก้ในใบเอง)");

    let changed = 0;
    let added = 0;
    let sort = lines.length;
    for (const it of cap.items) {
      const target = str(it.po_line_id);
      const price = unitPrice(it);
      if (target === "new") {
        const { error } = await admin.from("purchase_order_lines_v2").insert({
          po_id: poId, item_sku_id: it.sku_id ?? null, item_name: itemLabel(it), qty: it.qty,
          price_est: sameCur ? price : 0, line_total: sameCur ? r2d(price * it.qty) : 0,
          currency: str(p.currency) || null, note: [it.mo_no ? `จากใบสั่งผลิต ${it.mo_no}` : "", `จาก${orderRef(cap)}`].filter(Boolean).join(" · "), sort_order: sort++,
        });
        if (error) warnings.push(`เพิ่ม "${itemLabel(it)}" ไม่สำเร็จ: ${error.message}`); else added++;
        continue;
      }
      if (!target || !lineIds.has(target)) continue;
      const line = lines.find((l) => l.id === target)!;
      if (Math.abs(line.qty - it.qty) > 0.001) warnings.push(`"${line.item_name}" ในใบสั่ง ${line.qty} แต่ซื้อจริง ${it.qty} — จำนวนในใบไม่ได้เปลี่ยน`);
      if (input.update_prices && sameCur && price > 0) {
        const upd: Rec = { price_est: price, line_total: r2d(line.qty * price) };
        if (it.sku_id && !line.item_sku_id) upd.item_sku_id = it.sku_id;
        const { error } = await admin.from("purchase_order_lines_v2").update(upd).eq("id", target);
        if (error) warnings.push(`ใส่ราคา "${line.item_name}" ไม่สำเร็จ: ${error.message}`); else changed++;
      }
    }

    // ยอดใบใหม่ (ของกลาง lib/po-total) + ต่อท้ายหมายเหตุให้รู้ว่ามาจากคำสั่งซื้อไหน
    const patch: Rec = {};
    if (changed > 0 || added > 0) {
      const { data: nowLines } = await admin.from("purchase_order_lines_v2").select("line_total, is_active").eq("po_id", poId);
      patch.grand_total = computePoTotals(sumActiveLines((nowLines ?? []) as Rec[] as { line_total: number }[]), Number(p.vat_rate) || 0, !!p.vat_included).total;
    }
    const ref = orderRef(cap);
    const note = str(p.note);
    if (!note.includes(cap.order_no || ref)) patch.note = note ? `${note}\n${ref}` : ref;
    if (Object.keys(patch).length) await admin.from("purchase_orders_v2").update(patch).eq("id", poId);
    await writeAudit(admin, {
      action: "update", entityType: "purchase_orders_v2", entityId: poId, actorId: actor.id, actorName: actor.name,
      metadata: { po_no: poNo, source: "line_capture", capture_id: cap.id, order_no: cap.order_no, prices_updated: changed, lines_added: added },
    });
  }

  const now = new Date().toISOString();
  await admin.from(CAPTURE_TABLE).update({
    status: "confirmed", po_id: poId, po_mode: input.mode, confirmed_by: actor.name, confirmed_at: now, updated_at: now,
  }).eq("id", cap.id);
  await writeAudit(admin, {
    action: "confirm", entityType: CAPTURE_TABLE, entityId: cap.id, actorId: actor.id, actorName: actor.name,
    metadata: { mode: input.mode, po_id: poId, po_no: poNo, order_no: cap.order_no, platform: cap.platform, warnings },
  });
  return { ok: true, po_id: poId, po_no: poNo, warnings };
}

// ---------------------------------------------------------------- ตั้งกลุ่มไลน์ (หน้าแอดมิน)

/** กลุ่มที่ปกติมีรูปอื่นเยอะ — ถ้าใช้รับรูปคำสั่งซื้อ AI จะอ่านทุกรูป (เตือนในหน้าตั้งค่า) */
const IMAGE_HEAVY_SLOTS = ["bills", "transfers", "creative", "qc", "production"];

export type KnownLineGroup = {
  id: string; name: string | null; members: number | null;
  /** บอทยังอยู่ในกลุ่มไหม (ถามไลน์ไม่ได้ = ออกจากกลุ่มแล้ว/ไม่ใช่กลุ่ม) */
  reachable: boolean;
  /** ตอนนี้กลุ่มนี้ใช้กับระบบไหนอยู่ (ป้ายไทย) */
  uses: string[];
  /** กลุ่มที่มีรูปอื่นเยอะ (บิล/สลิป/งานออกแบบ/QC) */
  busy_images: boolean;
  is_current: boolean; is_captured: boolean;
};

/**
 * กลุ่มไลน์ที่ระบบรู้จัก = กลุ่มของทุกระบบใน line_config.groups + กลุ่มล่าสุดที่บอทเห็น
 * ถามชื่อ/จำนวนคนจากไลน์ (อ่านอย่างเดียว ไม่ส่งข้อความ) ให้แอดมินกด "ใช้กลุ่มนี้" ได้ทันที
 */
export async function loadLineGroupSetup(admin: Admin) {
  const { data: row } = await admin.from("china_app_settings").select("sval").eq("skey", "line_config").maybeSingle();
  const cfg = ((row as Rec | null)?.sval ?? {}) as Rec;
  const token = str(cfg.token);
  const current = str((cfg.groups as Rec | undefined)?.[ORDER_CAPTURE_SLOT]);
  const captured = str(cfg.group_id);

  const slotsOf = new Map<string, string[]>();
  for (const [slot, gid] of Object.entries((cfg.groups ?? {}) as Rec)) {
    const g = str(gid); if (!g || slot === ORDER_CAPTURE_SLOT) continue;
    slotsOf.set(g, [...(slotsOf.get(g) ?? []), slot]);
  }
  for (const g of [current, captured]) if (g && !slotsOf.has(g)) slotsOf.set(g, []);
  const lineGet = async (path: string): Promise<Rec | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`https://api.line.me/v2/bot/${path}`, { headers: { Authorization: `Bearer ${token}` } });
      return res.ok ? ((await res.json()) as Rec) : null;
    } catch { return null; }
  };
  const groups: KnownLineGroup[] = await Promise.all([...slotsOf.entries()].map(async ([gid, slots]) => {
    const [sum, cnt] = await Promise.all([lineGet(`group/${encodeURIComponent(gid)}/summary`), lineGet(`group/${encodeURIComponent(gid)}/members/count`)]);
    return {
      id: gid,
      name: sum ? str(sum.groupName) || null : null,
      members: cnt ? Number(cnt.count) || null : null,
      reachable: !!sum,
      uses: slots.map((s) => (LINE_SLOTS as Record<string, { label: string }>)[s]?.label ?? s),
      busy_images: slots.some((s) => IMAGE_HEAVY_SLOTS.includes(s)),
      is_current: gid === current,
      is_captured: gid === captured,
    };
  }));
  // กลุ่มที่ใช้อยู่ก่อน → กลุ่มที่ใช้กับระบบอื่น (ไม่ใช่กลุ่มรูปเยอะ) → กลุ่มอื่น → กลุ่มรูปเยอะไว้ท้าย
  const rank = (g: KnownLineGroup) => (g.is_current ? 0 : g.busy_images ? 3 : g.uses.length ? 1 : 2);
  groups.sort((x, y) => rank(x) - rank(y));
  return {
    has_token: !!token,
    has_secret: !!(process.env.LINE_CHANNEL_SECRET || cfg.channel_secret),
    current, current_name: groups.find((g) => g.is_current)?.name ?? null,
    captured, captured_at: (cfg.group_captured_at as string | undefined) ?? null,
    groups,
  };
}
