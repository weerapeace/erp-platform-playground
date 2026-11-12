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

// ───────────────────────── เฟส B: ราคาต่อตัวเลือก (2026-11-12 เจ้าของสั่ง "ทำเฟส B แก้ราคา") ─────────────────────────
// Update Price 202309: มีผลทันที (ไม่ต้องรอตรวจ) · เฉพาะสินค้าสถานะ ACTIVATE และไม่อยู่ในโปรโมชันที่กำลังวิ่ง
// ราคา = ราคาแสดงก่อนส่วนลด · ไทย 30–260,000 บาท ทศนิยม 2 ตำแหน่ง (เอกสาร Product pricing)
export const TTS_PRICE_MIN = 30;
export const TTS_PRICE_MAX = 260_000;

export type TiktokPriceRow = { skuId: string; label: string; sellerSku: string | null; price: number | null };
export type TiktokPriceChange = { skuId: string; label: string; before: number | null; after: number };
export type TiktokPricePlan = { changes: TiktokPriceChange[]; errors: string[]; warnings: string[] };

const round2 = (n: number) => Math.round(n * 100) / 100;
const bahtText = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("th-TH", { maximumFractionDigits: 2 })}฿`);

/** แถวราคาตั้งต้นจากมุมมองในลิ้นชัก */
export const tiktokPriceRowsFromView = (v: Pick<TiktokListingView, "skus">): TiktokPriceRow[] =>
  v.skus.map((s) => ({ skuId: s.skuId, label: s.label, sellerSku: s.sellerSku, price: s.price }));

/** แก้ราคาได้ไหม (สินค้าต้องเปิดขายอยู่) — null = ได้ · ข้อความ = เหตุผล */
export function tiktokPriceBlock(v: Pick<TiktokListingView, "productStatus" | "status">): string | null {
  return (v.productStatus ?? v.status) === "ACTIVATE" ? null : "TikTok ให้แก้ราคาได้เฉพาะสินค้าที่เปิดขายอยู่ — สินค้าที่ปิดขาย/ร่าง/ถูกระงับ ต้องแก้ใน Seller Center";
}

/** เทียบราคาเดิม → ที่แก้ (หน้าเว็บกับ API ใช้ตัวเดียวกัน) · ส่งเฉพาะตัวที่เปลี่ยน */
export function planTiktokPrices(base: TiktokPriceRow[], edit: TiktokPriceRow[]): TiktokPricePlan {
  const byId = new Map(base.map((r) => [r.skuId, r]));
  const changes: TiktokPriceChange[] = [];
  const errors: string[] = [];
  let bigDrop = 0, bigRise = 0;
  for (const e of edit) {
    const b = byId.get(e.skuId);
    if (!b) { errors.push(`ไม่พบตัวเลือก ${e.label} บนร้าน — กดดึงตัวนี้จาก TikTok ใหม่`); continue; }
    if (e.price == null) { if (b.price != null) errors.push(`${b.label}: ราคาว่างไม่ได้`); continue; }
    const after = round2(e.price);
    if (b.price != null && Math.abs(after - b.price) < 0.005) continue;
    if (!Number.isFinite(after) || after < TTS_PRICE_MIN || after > TTS_PRICE_MAX) {
      errors.push(`${b.label}: ราคาต้องอยู่ระหว่าง ${TTS_PRICE_MIN.toLocaleString()}–${TTS_PRICE_MAX.toLocaleString()} บาท (TikTok ไทย)`);
      continue;
    }
    if (b.price != null && b.price > 0) {
      if (after <= b.price * 0.5) bigDrop++;
      else if (after >= b.price * 2) bigRise++;
    }
    changes.push({ skuId: b.skuId, label: b.label, before: b.price, after });
  }
  const warnings: string[] = [];
  if (changes.length) warnings.push("ราคาบน TikTok เปลี่ยนทันทีที่กดส่ง (ไม่ต้องรอตรวจ) — สินค้าที่อยู่ในโปรโมชัน TikTok จะไม่ยอมให้แก้");
  if (bigDrop) warnings.push(`ลดราคาลงครึ่งหนึ่งหรือมากกว่า ${bigDrop} ตัวเลือก — ตรวจตัวเลขอีกครั้ง`);
  if (bigRise) warnings.push(`ขึ้นราคาเป็น 2 เท่าหรือมากกว่า ${bigRise} ตัวเลือก — ตรวจตัวเลขอีกครั้ง`);
  return { changes, errors, warnings };
}

/** ข้อความแสดงการเปลี่ยน (ยืนยัน/ประวัติ) */
export const tiktokPriceChangeText = (c: Pick<TiktokPriceChange, "before" | "after">): string => `${bahtText(c.before)} → ${bahtText(c.after)}`;

/**
 * แก้ราคาหลายตัวเลือกพร้อมกัน (ติ๊กบางตัว = เฉพาะที่ติ๊ก · ไม่ติ๊ก = ทุกตัว) — เติมฟอร์มอย่างเดียว ยังไม่ส่ง
 * price = ตั้งราคาเดียวกัน · pct = ปรับตาม % จากราคาเดิม (−10 = ลด 10% · ปัดเป็นบาทเต็ม)
 */
export function applyTiktokBulkPrice(rows: TiktokPriceRow[], selected: Set<string>, opt: { price?: number | null; pct?: number | null }): { rows: TiktokPriceRow[]; changed: number; error: string | null } {
  const hasPrice = opt.price != null && Number.isFinite(opt.price);
  const hasPct = opt.pct != null && Number.isFinite(opt.pct) && opt.pct !== 0;
  if (!hasPrice && !hasPct) return { rows, changed: 0, error: "ใส่ราคา หรือ % ที่จะปรับก่อน" };
  if (hasPrice && hasPct) return { rows, changed: 0, error: "เลือกอย่างใดอย่างหนึ่ง: ตั้งราคา หรือ ปรับ %" };
  if (hasPct && (opt.pct! <= -100 || opt.pct! > 500)) return { rows, changed: 0, error: "ปรับ % ได้ระหว่าง −99 ถึง +500" };
  let changed = 0;
  const out = rows.map((r) => {
    if (selected.size && !selected.has(r.skuId)) return r;
    let next: number | null = r.price;
    if (hasPrice) next = round2(opt.price!);
    else if (r.price != null) next = Math.round(r.price * (1 + opt.pct! / 100));
    if (next === r.price) return r;
    changed++;
    return { ...r, price: next };
  });
  return { rows: out, changed, error: null };
}

// ───────────── ราคาในระบบ (เทียบข้างราคาบน TikTok · ดูอย่างเดียว + ปุ่มเติมฟอร์ม) ─────────────
// ข้อมูลจริง 2026-11-12: ราคาบน TikTok ≈ 2 เท่าของราคาขายในระบบเกือบทุกตัว (ร้านตั้งราคาสูงแล้วลดด้วยโปรโมชัน TikTok)
//   → "ไม่เท่ากับราคาขาย" ไม่ใช่ความผิด · เตือนแค่ 2 กรณี: ต่ำกว่าราคาขาย (ลดโปรแล้วยิ่งต่ำ) · ไม่ตรงราคาเต็ม (เมื่อในระบบตั้งราคาเต็มไว้)

/** ราคาในระบบของตัวเลือก 1 ตัว: ราคาขาย (list_price) · ราคาเต็ม (fake_price) */
export type TiktokErpPrice = { sale: number | null; full: number | null };
/** "below_sale" ราคาบน TikTok ต่ำกว่าราคาขายในระบบ · "full_diff" ไม่ตรงราคาเต็มในระบบ · null ไม่มีอะไรต้องเตือน/ไม่รู้ */
export type TiktokErpFlag = "below_sale" | "full_diff" | null;

/** เทียบราคาบน TikTok (หรือราคาที่กำลังแก้) กับราคาในระบบ — ต่างกันตั้งแต่ 1 บาทถึงนับ · ratio = กี่เท่าของราคาขาย (ทศนิยม 1) */
export function tiktokErpPriceCheck(price: number | null, erp: TiktokErpPrice | null): { flag: TiktokErpFlag; ratio: number | null } {
  if (price == null || !erp) return { flag: null, ratio: null };
  const ratio = erp.sale != null && erp.sale > 0 ? Math.round((price / erp.sale) * 10) / 10 : null;
  if (erp.sale != null && erp.sale > 0 && erp.sale - price >= 1) return { flag: "below_sale", ratio };
  if (erp.full != null && erp.full > 0 && Math.abs(price - erp.full) >= 1) return { flag: "full_diff", ratio };
  return { flag: null, ratio };
}

/**
 * ใช้ราคาเต็มในระบบเป็นราคาบน TikTok (เติมฟอร์มอย่างเดียว ยังไม่ส่ง) — เฉพาะตัวที่ในระบบมีราคาเต็ม
 * ids = เฉพาะตัวเหล่านี้ (ไม่ส่ง = ทุกตัว) · ตัวที่ไม่มีราคาเต็ม/เท่าเดิม = ข้าม
 */
export function applyTiktokErpFull(rows: TiktokPriceRow[], erpOf: (skuId: string) => TiktokErpPrice | null, ids?: string[]): { rows: TiktokPriceRow[]; changed: number } {
  let changed = 0;
  const out = rows.map((r) => {
    if (ids && !ids.includes(r.skuId)) return r;
    const full = erpOf(r.skuId)?.full ?? null;
    if (full == null || !(full > 0)) return r;
    const next = round2(full);
    if (r.price != null && Math.abs(r.price - next) < 0.005) return r;
    changed++;
    return { ...r, price: next };
  });
  return { rows: out, changed };
}
