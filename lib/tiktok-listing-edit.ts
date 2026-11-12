/**
 * กฎกลางของ "แก้สินค้าบน TikTok Shop" จากลิ้นชักสินค้าบนร้าน — pure (ไม่เรียก API) ใช้ได้ทั้งหน้าเว็บและหลังบ้าน + เทสต์
 * ⚠️ ห้าม import lib/tiktok-shop ที่นี่ (มีโค้ดเซ็นคำขอ/กุญแจ) — หน้าเว็บ import ไฟล์นี้
 *
 * เฟส A (2026-11-12 เจ้าของเลือก "เฟส A ชื่อ/เปิดปิด"):
 *   - แก้ชื่อสินค้า → Partial Edit (TikTok ส่งไปตรวจใหม่ ระหว่างตรวจ ร้านยังขายชื่อเดิม)
 *   - เปิดขาย (Activate → TikTok ตรวจก่อน สถานะเป็น "รอตรวจ" แล้วค่อยกลับมาเปิดขาย) / ปิดขาย (Deactivate → ซ่อนทันที)
 *   - ยังไม่ทำ: รายละเอียด (HTML มีรูปที่ฝากกับ TikTok) · ราคา · รูป · สต๊อก (BigSeller ยังซิงค์สต๊อกอยู่)
 *
 * รูปคำตอบ Get Product 202309 (เอกสารทางการ อ่าน 2026-11-12):
 *   data.{ id, title, status (รวมสถานะตรวจ: DRAFT/PENDING/FAILED/ACTIVATE/SELLER_DEACTIVATED/PLATFORM_DEACTIVATED/FREEZE/DELETED/SCHEDULED),
 *          product_status (ไม่รวมสถานะตรวจ), audit{ status: NONE/AUDITING/FAILED/PRE_APPROVED/APPROVED }, has_draft,
 *          audit_failed_reasons[{ position, reasons[], suggestions[] }], brand{ name }, category_chains[], main_images[{ urls[] }],
 *          description (HTML), skus[{ id, seller_sku, price{ tax_exclusive_price, sale_price }, inventory[{ quantity }], status_info{ status: NORMAL/DEACTIVATED }, sales_attributes[] }] }
 *   ?return_under_review_version=true → ฉบับที่ส่งตรวจอยู่ (ใช้ดูว่าชื่อใหม่รอตรวจไหม)
 */

/** TikTok ไทย: ชื่อสินค้า 25–255 ตัวอักษร (ตลาดอื่นต่างกัน — เอกสาร partial-edit-product-202509) */
export const TTS_TITLE_MIN = 25;
export const TTS_TITLE_MAX = 255;

export type TiktokSkuView = { skuId: string; sellerSku: string | null; label: string; price: number | null; stock: number | null; status: string | null };
export type TiktokListingView = {
  productId: string;
  title: string;
  /** สถานะรวม (มีสถานะตรวจด้วย) เช่น ACTIVATE / PENDING */
  status: string | null;
  /** สถานะสินค้าไม่รวมการตรวจ — ใช้ตัดสินว่าเปิด/ปิดขายได้ไหม */
  productStatus: string | null;
  auditStatus: string | null;
  hasDraft: boolean;
  /** ชื่อที่ส่งให้ TikTok ตรวจอยู่ (ต่างจากชื่อบนร้าน) · null = ไม่มี */
  pendingTitle: string | null;
  brand: string | null;
  category: string | null;
  images: string[];
  description: string;
  skus: TiktokSkuView[];
  /** เหตุผลที่ TikTok ตีกลับ (ถ้ามี) */
  rejectReasons: string[];
  updateTime: number | null;
};

/** คำตอบ GET/POST /api/tiktok-shop/listing-detail */
export type TiktokListingDetailResponse = { view: TiktokListingView | null; fetched_at: string | null; saved?: boolean; error: string | null };
/** คำตอบ POST /api/tiktok-shop/listing-edit · listing-display */
export type TiktokWriteResponse = { ok: boolean; view: TiktokListingView | null; summary?: string; warnings?: string[]; error: string | null };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arrOf = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") as Obj[] : []);
const str = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };
const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const up = (v: unknown): string | null => { const s = str(v); return s ? s.toUpperCase() : null; };

/** รายละเอียดสินค้าจาก Get Product → มุมมองในลิ้นชัก · underReview = คำตอบเดียวกันแบบ return_under_review_version=true (ถ้าดึงมา) */
export function tiktokListingView(detail: unknown, underReview?: unknown): TiktokListingView | null {
  const d = obj(detail);
  const id = str(d?.id);
  if (!d || !id) return null;
  const title = str(d.title) ?? "";
  const skus: TiktokSkuView[] = arrOf(d.skus).map((s) => {
    const price = obj(s.price) ?? {};
    const inv = arrOf(s.inventory);
    const label = arrOf(s.sales_attributes).map((a) => [str(a.name), str(a.value_name)].filter(Boolean).join(": ")).filter(Boolean).join(" · ");
    return {
      skuId: str(s.id) ?? "",
      sellerSku: str(s.seller_sku),
      label: label || str(s.seller_sku) || "ตัวเลือกเดียว",
      price: num(price.tax_exclusive_price) ?? num(price.sale_price),
      stock: inv.length ? inv.reduce((a, w) => a + Math.max(0, num(w.quantity) ?? 0), 0) : null,
      status: up(obj(s.status_info)?.status),
    };
  }).filter((s) => s.skuId);
  const reasons: string[] = [];
  for (const r of arrOf(d.audit_failed_reasons)) {
    for (const x of [...(Array.isArray(r.reasons) ? r.reasons : []), ...(Array.isArray(r.suggestions) ? r.suggestions : [])]) { const t = str(x); if (t && !reasons.includes(t)) reasons.push(t); }
  }
  const chain = arrOf(d.category_chains);
  const leaf = chain.find((c) => c.is_leaf === true) ?? chain[chain.length - 1];
  const rv = obj(underReview);
  const reviewTitle = rv && str(rv.id) === id ? str(rv.title) : null;
  return {
    productId: id,
    title,
    status: up(d.status),
    productStatus: up(d.product_status) ?? up(d.status),
    auditStatus: up(obj(d.audit)?.status),
    hasDraft: d.has_draft === true,
    pendingTitle: reviewTitle && reviewTitle !== title ? reviewTitle : null,
    brand: str(obj(d.brand)?.name),
    category: str(leaf?.local_name),
    images: arrOf(d.main_images).map((m) => (Array.isArray(m.urls) ? str(m.urls[0]) : null) ?? (Array.isArray(m.thumb_urls) ? str(m.thumb_urls[0]) : null)).filter((u): u is string => !!u),
    description: typeof d.description === "string" ? d.description : "",
    skus,
    rejectReasons: reasons,
    updateTime: num(d.update_time),
  };
}

export type TiktokTone = "ok" | "off" | "wait" | "bad" | "none";
const STATUS_LABEL: Record<string, { label: string; tone: TiktokTone }> = {
  ACTIVATE: { label: "เปิดขาย", tone: "ok" },
  SELLER_DEACTIVATED: { label: "ปิดขาย", tone: "off" },
  PENDING: { label: "รอ TikTok ตรวจ", tone: "wait" },
  SCHEDULED: { label: "ตั้งเวลาขาย", tone: "wait" },
  DRAFT: { label: "ฉบับร่าง", tone: "none" },
  FAILED: { label: "ตรวจไม่ผ่าน", tone: "bad" },
  PLATFORM_DEACTIVATED: { label: "TikTok ระงับ", tone: "bad" },
  FREEZE: { label: "ถูกระงับชั่วคราว", tone: "bad" },
  DELETED: { label: "ลบแล้ว", tone: "off" },
};
/** ป้ายสถานะ (สถานะรวม) */
export function tiktokStatusBadge(status: string | null | undefined): { label: string; tone: TiktokTone } {
  const s = (status ?? "").toUpperCase();
  return STATUS_LABEL[s] ?? { label: s || "ไม่ทราบสถานะ", tone: "none" };
}

/** เปิดขายอยู่ไหม (ใช้สถานะไม่รวมการตรวจ — แก้ชื่อรอตรวจ ร้านยังขายอยู่) */
export const tiktokIsOpen = (v: Pick<TiktokListingView, "productStatus" | "status">): boolean => (v.productStatus ?? v.status) === "ACTIVATE";

export type TiktokDisplayPlan = { api: "activate" | "deactivate" | "none"; summary: string; errors: string[]; warnings: string[] };
/** เปิด/ปิดขายทั้งสินค้า — TikTok เปิด/ปิดได้ทีละสินค้า (ไม่มีทีละตัวเลือกใน API นี้) */
export function planTiktokDisplay(v: Pick<TiktokListingView, "productStatus" | "status">, open: boolean): TiktokDisplayPlan {
  const ps = v.productStatus ?? v.status ?? "";
  if (open) {
    if (ps === "ACTIVATE") return { api: "none", summary: "เปิดขายอยู่แล้ว", errors: [], warnings: [] };
    if (ps === "SELLER_DEACTIVATED" || ps === "PLATFORM_DEACTIVATED") {
      return {
        api: "activate", summary: "เปิดขายทั้งสินค้า", errors: [],
        warnings: [
          "TikTok จะส่งสินค้าไปตรวจก่อน — สถานะเป็น “รอ TikTok ตรวจ” แล้วค่อยกลับมาเปิดขายเมื่อผ่าน",
          ...(ps === "PLATFORM_DEACTIVATED" ? ["สินค้านี้ถูก TikTok ระงับ — ถ้ายังไม่ได้แก้ตามเหตุผลของ TikTok อาจเปิดไม่ผ่าน"] : []),
        ],
      };
    }
  } else {
    if (ps === "SELLER_DEACTIVATED" || ps === "PLATFORM_DEACTIVATED") return { api: "none", summary: "ปิดขายอยู่แล้ว", errors: [], warnings: [] };
    if (ps === "ACTIVATE") return { api: "deactivate", summary: "ปิดขายทั้งสินค้า", errors: [], warnings: [] };
  }
  const label = tiktokStatusBadge(v.status ?? ps).label;
  return { api: "none", summary: "", errors: [`สินค้าสถานะ “${label}” ${open ? "เปิด" : "ปิด"}ขายจากที่นี่ไม่ได้ — จัดการใน TikTok Seller Center`], warnings: [] };
}

/** ความยาวชื่อแบบที่คนเห็น (นับทีละตัวอักษร ไม่ใช่ทีละ byte) */
export const ttsTitleLength = (s: string): number => [...s].length;

export type TiktokTitlePlan = { title: string; changed: boolean; errors: string[]; warnings: string[] };
/** ตรวจชื่อใหม่ก่อนส่ง (หน้าเว็บกับ API ใช้ตัวเดียวกัน) */
export function planTiktokTitle(before: string, after: string): TiktokTitlePlan {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const title = norm(after);
  // เทียบแบบตัดช่องว่างซ้ำทั้งคู่ — ชื่อเดิมบนร้านมีเว้นวรรคซ้ำ ไม่นับว่า "แก้แล้ว" ตั้งแต่เปิด
  const changed = title !== norm(before);
  const errors: string[] = [];
  if (changed) {
    const n = ttsTitleLength(title);
    if (!title) errors.push("ชื่อสินค้าว่างไม่ได้");
    else if (n < TTS_TITLE_MIN) errors.push(`ชื่อสั้นไป — TikTok ไทยต้องยาว ${TTS_TITLE_MIN}–${TTS_TITLE_MAX} ตัวอักษร (ตอนนี้ ${n})`);
    else if (n > TTS_TITLE_MAX) errors.push(`ชื่อยาวไป — TikTok ไทยรับไม่เกิน ${TTS_TITLE_MAX} ตัวอักษร (ตอนนี้ ${n})`);
    if (/<[^>]+>/.test(title)) errors.push("ชื่อสินค้าใส่แท็ก HTML ไม่ได้");
  }
  return {
    title, changed, errors,
    warnings: changed && !errors.length ? ["TikTok จะส่งชื่อใหม่ไปตรวจก่อน — ระหว่างตรวจ ร้านยังขายด้วยชื่อเดิม (ตรวจไม่ผ่าน = ชื่อเดิมอยู่ต่อ)", "TikTok อาจจำกัดจำนวนสินค้าที่แก้แล้วส่งตรวจต่อวัน (ดูโควตาได้ที่หน้าแรก Seller Center)"] : [],
  };
}

/** ผลรายตัวจาก Activate/Deactivate (data.errors[] — ต้องเช็กแม้ code = 0) → ข้อความ */
export function tiktokDisplayErrors(data: unknown, productId: string): string[] {
  const out: string[] = [];
  for (const e of arrOf(obj(data)?.errors)) {
    const pid = str(obj(e.detail)?.product_id);
    if (pid && pid !== productId) continue;
    const extra = arrOf(obj(e.detail)?.extra_errors).map((x) => str(x.message)).filter(Boolean);
    out.push([str(e.message) ?? `รหัส ${str(e.code) ?? "?"}`, ...extra].join(" · "));
  }
  return out;
}

/** สำเนาย่อ: ตัวแปลงทั้งร้านไม่มีสถานะ SKU จากรายละเอียด → เติมของเดิมตามรหัสตัวเลือก (ไม่ให้หายเป็น null) */
export function keepSkuStatus<T extends { id: string | null; status: string | null }>(next: T[], prev: unknown): T[] {
  const old = new Map(arrOf(obj(prev)?.skus).map((s) => [str(s.id), str(s.status)]));
  return next.map((s) => (s.status == null && s.id && old.get(s.id) ? { ...s, status: old.get(s.id) ?? null } : s));
}
