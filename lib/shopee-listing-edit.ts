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

export type ShopeeLimits = { nameMin: number | null; nameMax: number | null; descMin: number | null; descMax: number | null; imagesMax: number | null };
export type ShopeeModelView = { modelId: string; sku: string | null; label: string | null; price: number | null; originalPrice: number | null; stock: number | null; image: string | null; status: string | null };
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
  const out = { nameMin: name.min, nameMax: name.max, descMin: desc.min, descMax: desc.max, imagesMax: num(imgs?.max_limit ?? imgs?.max) };
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
  const ms = (models?.models ?? []).map((m) => ({ modelId: m.model_id, sku: m.sku, label: m.label, price: m.price, originalPrice: m.original_price, stock: m.stock, image: m.image, status: m.status }));
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
