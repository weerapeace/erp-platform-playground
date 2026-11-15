/**
 * สินค้า Shopee 1 ตัวในลิ้นชักสินค้าบนร้าน — กติกา pure (ใช้ทั้งหน้าเว็บและ API · มีเทสต์ lib/__tests__/shopee-listing-edit.test.ts)
 * ⚠️ client-safe: ห้าม import lib/shopee (มีกุญแจ/fetch ฝั่งเซิร์ฟเวอร์) — ใช้แค่ type
 *
 * เฟส 4A (เจ้าของ "เฟส 4" 2026-11-14): แก้ชื่อ + รายละเอียด (ข้อความธรรมดา) → v2.product.update_item (ส่งเฉพาะช่องที่เปลี่ยน · ช่องที่ไม่ส่งคงเดิม)
 *                                     เปิด/ปิดขาย → v2.product.unlist_item (ปิด = UNLIST · เปิด = กลับเป็น NORMAL)
 *   รูป / ตัวเลือก / ราคา = ดูอย่างเดียวในเฟสนี้ · สต๊อก = ไม่แก้ (BigSeller ยังซิงค์อยู่)
 * กติกา Shopee (เอกสาร open.shopee.com อ่าน 2026-11-14):
 *   - update_item: ทุกช่องไม่บังคับยกเว้น item_id · description_type extended (ร้าน whitelist) ต้องส่ง description_info แทน → เฟสนี้แก้เฉพาะแบบ normal
 *   - unlist_item: item_list ≤50 · สินค้าที่อยู่ในโปรโมชัน "ปิดขายไม่ได้" · รอตรวจ/ถูกแบน ปิด/เปิดไม่ได้ · ผลรายตัวอยู่ใน failure_list (HTTP 200)
 */
import type { ShopeeSlimModel } from "@/lib/shopee";

export type ShopeeLimits = { nameMin: number | null; nameMax: number | null; descMin: number | null; descMax: number | null; imagesMax: number | null; priceMin?: number | null; priceMax?: number | null };
export type ShopeeModelView = { modelId: string; sku: string | null; label: string | null; price: number | null; originalPrice: number | null; stock: number | null; image: string | null; status: string | null; /** อยู่ในโปรโมชัน — แก้ราคาตัวนี้ไม่ได้ */ promo?: boolean };
export type ShopeeListingView = {
  itemId: string;
  name: string;
  /** NORMAL / UNLIST / REVIEWING / BANNED / SELLER_DELETE / SHOPEE_DELETE */
  status: string;
  description: string;
  descriptionType: string;
  /** แก้รายละเอียดได้ไหม (แบบ extended = ร้าน whitelist ต้องใช้ฟอร์มอื่น → เฟสนี้ดูอย่างเดียว) */
  descriptionEditable: boolean;
  images: string[];
  categoryId: string | null;
  brand: string | null;
  itemSku: string | null;
  weight: number | null;
  dims: { length: number | null; width: number | null; height: number | null } | null;
  hasModel: boolean;
  models: ShopeeModelView[];
  /** สินค้าไม่มีตัวเลือก: ราคา/สต๊อกระดับสินค้า */
  price: number | null;
  originalPrice: number | null;
  stock: number | null;
  /** อยู่ในโปรโมชัน (has_promotion) — ปิดขายไม่ได้ / ราคาแก้ไม่ได้บางแบบ */
  inPromotion: boolean;
  updateTime: number | null;
  limits: ShopeeLimits | null;
};

export type ShopeeListingDetailResponse = { view: ShopeeListingView | null; fetched_at: string | null; saved?: boolean; error: string | null };
export type ShopeeWriteResponse = { ok: boolean; view: ShopeeListingView | null; summary?: string; warnings?: string[]; error: string | null };

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Obj : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const str = (v: unknown): string | null => { const s = v == null ? "" : String(v).trim(); return s || null; };

/** อ่านช่วงความยาวจาก v2.product.get_item_limit (ทนชื่อช่องต่างกันเล็กน้อย) · อ่านไม่ได้ = null (ให้ Shopee ตรวจเอง) */
export function shopeeLimitsOf(j: Obj | null): ShopeeLimits | null {
  if (!j) return null;
  const r = obj(j.response) ?? j;
  const rng = (k: string) => { const o = obj(r[k]); return { min: num(o?.min_limit ?? o?.min), max: num(o?.max_limit ?? o?.max) }; };
  const name = rng("item_name_length_limit"), desc = rng("item_description_length_limit");
  const imgs = obj(r.item_image_count_limit);
  const price = rng("price_limit");
  const out = { nameMin: name.min, nameMax: name.max, descMin: desc.min, descMax: desc.max, imagesMax: num(imgs?.max_limit ?? imgs?.max), priceMin: price.min, priceMax: price.max };
  return Object.values(out).some((v) => v != null) ? out : null;
}

/** ข้อความรายละเอียดจากคำตอบ get_item_base_info (normal = description · extended = ต่อข้อความใน field_list) */
export function shopeeDescriptionOf(base: Obj): { text: string; type: string } {
  const type = (str(base.description_type) ?? "normal").toLowerCase();
  if (type === "extended") {
    const fields = arr(obj(obj(base.description_info)?.extended_description)?.field_list).map(obj).filter((x): x is Obj => !!x);
    return { text: fields.filter((f) => str(f.field_type) === "text").map((f) => String(f.text ?? "")).join("\n").trim(), type };
  }
  return { text: String(base.description ?? ""), type };
}

/**
 * รายละเอียดสด (get_item_base_info) + ตัวเลือก (shopeeModelsToSlim · server) + ช่วงความยาว → มุมมองในลิ้นชัก
 * ไม่มี item_id = null
 */
export function shopeeListingView(base: Obj, models: { models: ShopeeSlimModel[] } | null, limits: ShopeeLimits | null = null): ShopeeListingView | null {
  const itemId = str(base.item_id);
  if (!itemId) return null;
  const desc = shopeeDescriptionOf(base);
  const p = obj(arr(base.price_info)[0]);
  const s2 = num(obj(obj(base.stock_info_v2)?.summary_info)?.total_available_stock);
  const dim = obj(base.dimension);
  const ms = (models?.models ?? []).map((m) => ({ modelId: m.model_id, sku: m.sku, label: m.label, price: m.price, originalPrice: m.original_price, stock: m.stock, image: m.image, status: m.status, promo: m.promo === true }));
  return {
    itemId, name: String(base.item_name ?? ""), status: (str(base.item_status) ?? "").toUpperCase(),
    description: desc.text, descriptionType: desc.type, descriptionEditable: desc.type !== "extended",
    images: arr(obj(base.image)?.image_url_list).map((u) => str(u)).filter((u): u is string => !!u),
    categoryId: base.category_id != null ? String(base.category_id) : null,
    brand: str(obj(base.brand)?.original_brand_name), itemSku: str(base.item_sku),
    weight: num(base.weight),
    dims: dim ? { length: num(dim.package_length), width: num(dim.package_width), height: num(dim.package_height) } : null,
    hasModel: base.has_model === true || ms.length > 0, models: ms,
    price: num(p?.current_price), originalPrice: num(p?.original_price), stock: s2,
    inPromotion: base.has_promotion === true, updateTime: num(base.update_time), limits,
  };
}

// ───────── ป้ายสถานะ ─────────
export function shopeeStatusBadge(status: string | null | undefined): { label: string; tone: "ok" | "off" | "warn" | "bad" } {
  switch (String(status ?? "").toUpperCase()) {
    case "NORMAL": return { label: "ขายอยู่", tone: "ok" };
    case "UNLIST": return { label: "ปิดขาย", tone: "off" };
    case "REVIEWING": return { label: "รอ Shopee ตรวจ", tone: "warn" };
    case "BANNED": return { label: "ถูกแบน", tone: "bad" };
    case "SELLER_DELETE": case "SHOPEE_DELETE": return { label: "ลบแล้ว", tone: "bad" };
    default: return { label: status || "ไม่รู้สถานะ", tone: "off" };
  }
}
export const shopeeIsOpen = (v: Pick<ShopeeListingView, "status">) => v.status === "NORMAL";

/** นับความยาวแบบที่คนเห็น (อักษรไทยประสม/emoji = 1) */
export function shopeeTextLength(s: string): number {
  try { return [...new Intl.Segmenter("th", { granularity: "grapheme" }).segment(s)].length; }
  catch { return [...s].length; }
}

// ───────── แผนแก้ชื่อ / รายละเอียด ─────────
export type ShopeeEditInput = { name?: string | null; description?: string | null };
export type ShopeeEditPlan = {
  body: { item_name?: string; description?: string };
  changes: { label: string; before: string; after: string }[];
  errors: string[];
  warnings: string[];
};
const clip = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** เทียบกับของจริงล่าสุด → ส่งเฉพาะช่องที่เปลี่ยน · ช่วงความยาวตาม get_item_limit (ไม่รู้ = ให้ Shopee ตรวจ) */
export function planShopeeEdit(view: ShopeeListingView, input: ShopeeEditInput): ShopeeEditPlan {
  const out: ShopeeEditPlan = { body: {}, changes: [], errors: [], warnings: [] };
  const L = view.limits;
  if (input.name != null) {
    const name = input.name.replace(/\s+/g, " ").trim();
    if (name !== view.name.trim()) {
      const n = shopeeTextLength(name);
      if (!name) out.errors.push("ชื่อสินค้าว่างไม่ได้");
      else if (L?.nameMin != null && n < L.nameMin) out.errors.push(`ชื่อสินค้าสั้นไป (${n} ตัวอักษร · Shopee ต้องอย่างน้อย ${L.nameMin})`);
      else if (L?.nameMax != null && n > L.nameMax) out.errors.push(`ชื่อสินค้ายาวไป (${n} ตัวอักษร · Shopee รับได้ไม่เกิน ${L.nameMax})`);
      out.body.item_name = name;
      out.changes.push({ label: "ชื่อสินค้า", before: clip(view.name), after: clip(name) });
    }
  }
  if (input.description != null) {
    const desc = input.description.replace(/\r\n/g, "\n").trim();
    if (desc !== view.description.trim()) {
      if (!view.descriptionEditable) out.errors.push("รายละเอียดสินค้านี้เป็นแบบมีรูป (extended) — แก้ใน Shopee Seller Centre (ระบบยังแก้ได้เฉพาะแบบข้อความ)");
      const n = shopeeTextLength(desc);
      if (!desc) out.errors.push("รายละเอียดว่างไม่ได้");
      else if (L?.descMin != null && n < L.descMin) out.errors.push(`รายละเอียดสั้นไป (${n} ตัวอักษร · Shopee ต้องอย่างน้อย ${L.descMin})`);
      else if (L?.descMax != null && n > L.descMax) out.errors.push(`รายละเอียดยาวไป (${n} ตัวอักษร · Shopee รับได้ไม่เกิน ${L.descMax})`);
      out.body.description = desc;
      out.changes.push({ label: "รายละเอียด", before: `${shopeeTextLength(view.description)} ตัวอักษร`, after: `${n} ตัวอักษร` });
    }
  }
  if (out.changes.length && view.status === "REVIEWING") out.warnings.push("สินค้านี้กำลังรอ Shopee ตรวจ — แก้แล้วอาจต้องรอตรวจต่อ");
  if (out.changes.length && view.status === "BANNED") out.warnings.push("สินค้านี้ถูก Shopee แบน — แก้ตามที่ Shopee แจ้งแล้วอาจต้องรอตรวจใหม่");
  return out;
}

// ───────── แผนเปิด / ปิดขาย ─────────
export type ShopeeDisplayPlan = { api: "unlist" | "relist" | "none"; summary: string; errors: string[]; warnings: string[] };
export function planShopeeDisplay(view: ShopeeListingView, open: boolean): ShopeeDisplayPlan {
  const st = view.status;
  if (st === "REVIEWING" || st === "BANNED") return { api: "none", summary: "", errors: ["Shopee ไม่ให้เปิด/ปิดขายสินค้าที่กำลังตรวจหรือถูกแบน"], warnings: [] };
  if (st === "SELLER_DELETE" || st === "SHOPEE_DELETE") return { api: "none", summary: "", errors: ["สินค้านี้ถูกลบแล้ว"], warnings: [] };
  if (open && st === "NORMAL") return { api: "none", summary: "เปิดขายอยู่แล้ว", errors: [], warnings: [] };
  if (!open && st === "UNLIST") return { api: "none", summary: "ปิดขายอยู่แล้ว", errors: [], warnings: [] };
  const warnings = !open && view.inPromotion ? ["สินค้านี้อยู่ในโปรโมชัน — Shopee มักไม่ให้ปิดขายจนกว่าจะนำออกจากโปรโมชันใน Seller Centre (ถ้าไม่ผ่าน ระบบจะบอกเหตุผลจาก Shopee)"] : [];
  return { api: open ? "relist" : "unlist", summary: open ? "เปิดขายแล้ว" : "ปิดขายแล้ว", errors: [], warnings };
}

/** ผลของ unlist_item (HTTP 200 แต่ทำไม่สำเร็จรายตัวได้) → เหตุผลของสินค้านี้ · ว่าง = สำเร็จ */
export function shopeeUnlistErrors(resp: Obj, itemId: string): string[] {
  const r = obj(resp.response) ?? resp;
  const fail = arr(r.failure_list).map(obj).filter((x): x is Obj => !!x).filter((f) => String(f.item_id ?? "") === itemId);
  if (fail.length) return fail.map((f) => str(f.failed_reason) ?? "Shopee ไม่ให้ทำรายการนี้");
  const ok = arr(r.success_list).map(obj).some((s) => String(s?.item_id ?? "") === itemId);
  return ok ? [] : ["Shopee ไม่ได้ยืนยันว่าทำสำเร็จ — กดดึงตัวนี้จาก Shopee เพื่อเช็ก"];
}

// ───────── เฟส 4B: ราคา (ราคาตั้ง original_price ต่อตัวเลือก) → v2.product.update_price ─────────
// กติกา Shopee (เอกสาร 2026-11-14): price_list 1–50 ต่อครั้ง · model_id 0 = สินค้าไม่มีตัวเลือก · ร้านไทยตั้งได้เฉพาะ "จำนวนเต็มบาท"
//   สินค้า/ตัวเลือกที่อยู่ในโปรโมชัน = แก้ราคาไม่ได้ (error_cannt_edit_price_in_promotion ฯลฯ) · ผลรายตัวอยู่ใน failure_list (HTTP 200)
// ⚠️ ร้าน Louis Montini ตั้งราคาตั้งสูงแล้วลดผ่านโปรโมชัน → ราคาที่ลูกค้าจ่าย (current_price) มาจากโปรโมชัน แก้ตรงนี้ไม่ได้
export const SHOPEE_PRICE_BATCH = 50;
export type ShopeePriceRow = { modelId: string; label: string; price: number | null; promo: boolean };
export type ShopeePriceChange = { modelId: string; label: string; before: number | null; after: number; promo: boolean };
export type ShopeePricePlan = { changes: ShopeePriceChange[]; errors: string[]; warnings: string[] };

/** แถวราคาตั้งจากของจริง (ไม่มีตัวเลือก = แถวเดียว model 0) */
export function shopeePriceRowsFromView(v: ShopeeListingView): ShopeePriceRow[] {
  if (!v.hasModel) return [{ modelId: "0", label: "สินค้าเดียว (ไม่มีตัวเลือก)", price: v.originalPrice, promo: v.inPromotion }];
  return v.models.map((m) => ({ modelId: m.modelId, label: m.label ?? m.sku ?? `ตัวเลือก ${m.modelId}`, price: m.originalPrice, promo: m.promo === true }));
}

const bahtTxt = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("th-TH")}฿`);
export const shopeePriceChangeText = (c: Pick<ShopeePriceChange, "before" | "after">) => `${bahtTxt(c.before)} → ${bahtTxt(c.after)}`;

/**
 * เทียบราคาที่แก้กับของจริง → เฉพาะตัวที่เปลี่ยน
 * บล็อก: ว่าง · ไม่ใช่จำนวนเต็ม (ไทย) · นอกช่วงราคาของร้าน · เปลี่ยนแรงจนน่าจะพิมพ์ผิด (เหลือ ≤20% หรือ ≥5 เท่า — กติกาเดียวกับ Lazada)
 * เตือน: ลดครึ่ง/ขึ้น 2 เท่า · อยู่ในโปรโมชัน (Shopee มักปฏิเสธ) · ตัวเลือกแพงสุดเกิน 5 เท่าของถูกสุด
 */
export function planShopeePrices(view: ShopeeListingView, edit: ShopeePriceRow[]): ShopeePricePlan {
  const base = shopeePriceRowsFromView(view);
  const byId = new Map(base.map((r) => [r.modelId, r]));
  const out: ShopeePricePlan = { changes: [], errors: [], warnings: [] };
  const L = view.limits;
  let half = 0, double = 0;
  for (const e of edit) {
    const b = byId.get(e.modelId);
    if (!b) { out.errors.push(`ไม่พบตัวเลือก ${e.label} บนร้าน — กดดึงตัวนี้จาก Shopee ใหม่`); continue; }
    if (e.price == null) { if (b.price != null) out.errors.push(`${b.label}: ราคาว่างไม่ได้`); continue; }
    const after = e.price;
    if (b.price != null && after === b.price) continue;
    if (!Number.isFinite(after) || after <= 0) { out.errors.push(`${b.label}: ราคาต้องมากกว่า 0`); continue; }
    if (!Number.isInteger(after)) { out.errors.push(`${b.label}: Shopee ไทยตั้งราคาได้เฉพาะจำนวนเต็มบาท (${after})`); continue; }
    if (L?.priceMin != null && after < L.priceMin) { out.errors.push(`${b.label}: ต่ำกว่าราคาต่ำสุดที่ร้านตั้งได้ (${bahtTxt(L.priceMin)})`); continue; }
    if (L?.priceMax != null && after > L.priceMax) { out.errors.push(`${b.label}: สูงกว่าราคาสูงสุดที่ร้านตั้งได้ (${bahtTxt(L.priceMax)})`); continue; }
    if (b.price != null && b.price > 0) {
      if (after <= b.price * 0.2 || after >= b.price * 5) { out.errors.push(`${b.label}: ${shopeePriceChangeText({ before: b.price, after })} เปลี่ยนเกิน 80% — น่าจะพิมพ์ผิด (ถ้าตั้งใจ ให้แก้ทีละขั้นหรือแก้ใน Seller Centre)`); continue; }
      if (after <= b.price * 0.5) half++;
      else if (after >= b.price * 2) double++;
    }
    out.changes.push({ modelId: b.modelId, label: b.label, before: b.price, after, promo: b.promo });
  }
  if (!out.changes.length) return out;
  out.warnings.push("ราคาตั้งบน Shopee เปลี่ยนทันทีที่กดส่ง · ราคาที่ลูกค้าจ่ายตอนนี้มาจากโปรโมชันของร้าน (แก้ตรงนี้ไม่ได้)");
  const promoN = out.changes.filter((c) => c.promo).length;
  if (promoN) out.warnings.push(`${promoN} ตัวเลือกอยู่ในโปรโมชัน — Shopee มักไม่ให้แก้ราคาจนกว่าจะนำออกจากโปรโมชันใน Seller Centre (ถ้าไม่ผ่าน ระบบบอกเหตุผลรายตัว · ตัวอื่นยังส่งได้)`);
  if (half) out.warnings.push(`ลดราคาลงครึ่งหนึ่งหรือมากกว่า ${half} ตัวเลือก — ตรวจตัวเลขอีกครั้ง`);
  if (double) out.warnings.push(`ขึ้นราคาเป็น 2 เท่าหรือมากกว่า ${double} ตัวเลือก — ตรวจตัวเลขอีกครั้ง`);
  const finalPrices = base.map((r) => out.changes.find((c) => c.modelId === r.modelId)?.after ?? r.price).filter((n): n is number => n != null && n > 0);
  if (finalPrices.length > 1 && Math.max(...finalPrices) > Math.min(...finalPrices) * 5) out.warnings.push("ราคาตัวเลือกแพงสุดเกิน 5 เท่าของถูกสุด — Shopee อาจไม่รับ");
  return out;
}

/** ก้อนที่ส่ง update_price (แบ่งชุดละ 50) */
export function shopeePriceBatches(itemId: string, changes: ShopeePriceChange[]): { item_id: number; price_list: { model_id: number; original_price: number }[] }[] {
  const out: { item_id: number; price_list: { model_id: number; original_price: number }[] }[] = [];
  for (let i = 0; i < changes.length; i += SHOPEE_PRICE_BATCH) {
    out.push({ item_id: Number(itemId), price_list: changes.slice(i, i + SHOPEE_PRICE_BATCH).map((c) => ({ model_id: Number(c.modelId), original_price: c.after })) });
  }
  return out;
}

/** ผล update_price รายตัว (HTTP 200 แต่ไม่สำเร็จรายตัวได้) · ไม่อยู่ทั้งสองรายการ = ถือว่าไม่ยืนยัน */
export function shopeePriceResult(resp: Obj, sentModelIds: string[]): { ok: string[]; failed: { modelId: string; reason: string }[]; unsure: string[] } {
  const r = obj(resp.response) ?? resp;
  const failList = arr(r.failure_list).map(obj).filter((x): x is Obj => !!x);
  const okList = arr(r.success_list).map(obj).filter((x): x is Obj => !!x);
  const reasonOf = (f: Obj) => str(f.failed_reason) ?? "Shopee ไม่ให้แก้ราคาตัวนี้";
  // สินค้าไม่มีตัวเลือก: ส่ง model_id 0 แต่ Shopee ตอบ success_list: [{ original_price }] โดยไม่มี model_id เลย (ลองจริง BCG01-03 2026-11-15) → ดูจากรายการที่ตอบแทน
  if (sentModelIds.length === 1 && sentModelIds[0] === "0") {
    if (failList.length) return { ok: [], failed: [{ modelId: "0", reason: reasonOf(failList[0]) }], unsure: [] };
    return okList.length ? { ok: ["0"], failed: [], unsure: [] } : { ok: [], failed: [], unsure: ["0"] };
  }
  const fail = new Map(failList.map((f) => [String(f.model_id ?? ""), reasonOf(f)]));
  const okSet = new Set(okList.map((s) => String(s.model_id ?? "")));
  const ok: string[] = [], failed: { modelId: string; reason: string }[] = [], unsure: string[] = [];
  for (const id of sentModelIds) {
    if (fail.has(id)) failed.push({ modelId: id, reason: fail.get(id)! });
    else if (okSet.has(id)) ok.push(id);
    else unsure.push(id); // Shopee ตอบรับคำสั่งแต่ไม่ได้บอกรายตัว → API ดึงราคาจริงกลับมาเช็กเอง
  }
  return { ok, failed, unsure };
}

/**
 * แก้ราคาหลายตัวเลือกพร้อมกัน (ติ๊กบางตัว = เฉพาะที่ติ๊ก · ไม่ติ๊ก = ทุกตัว) — เติมฟอร์มอย่างเดียว ยังไม่ส่ง
 * price = ตั้งราคาเดียวกัน · pct = ปรับตาม % จากราคาเดิม (ปัดเป็นบาทเต็ม — Shopee ไทยรับเฉพาะจำนวนเต็ม)
 */
export function applyShopeeBulkPrice(rows: ShopeePriceRow[], selected: Set<string>, opt: { price?: number | null; pct?: number | null }): { rows: ShopeePriceRow[]; changed: number; error: string | null } {
  const hasPrice = opt.price != null && Number.isFinite(opt.price);
  const hasPct = opt.pct != null && Number.isFinite(opt.pct) && opt.pct !== 0;
  if (!hasPrice && !hasPct) return { rows, changed: 0, error: "ใส่ราคา หรือ % ที่จะปรับก่อน" };
  if (hasPrice && hasPct) return { rows, changed: 0, error: "เลือกอย่างใดอย่างหนึ่ง: ตั้งราคา หรือ ปรับ %" };
  if (hasPct && (opt.pct! <= -100 || opt.pct! > 500)) return { rows, changed: 0, error: "ปรับ % ได้ระหว่าง −99 ถึง +500" };
  let changed = 0;
  const out = rows.map((r) => {
    if (selected.size && !selected.has(r.modelId)) return r;
    let next: number | null = r.price;
    if (hasPrice) next = Math.round(opt.price!);
    else if (r.price != null) next = Math.round(r.price * (1 + opt.pct! / 100));
    if (next === r.price) return r;
    changed++;
    return { ...r, price: next };
  });
  return { rows: out, changed, error: null };
}
