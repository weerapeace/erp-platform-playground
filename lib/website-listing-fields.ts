/**
 * 🗂 ทะเบียนช่องของ "สินค้าบนเว็บ" (store_listings) — ของกลาง pure ใช้ได้ทั้ง client/server
 *
 * บอกว่ามีช่องอะไร · ชนิดอะไร · แก้หลายรายการได้ไหม → ป๊อป ✏️ แก้หลายรายการ วาดจากทะเบียนนี้ทั้งหมด (ห้ามฝังช่องในหน้าจอ)
 * เพิ่มช่องใหม่ = เพิ่มที่นี่ + รองรับใน listingPatchToRow (lib/website-listing-patch) → ป๊อปขึ้นเอง · API กรองตาม BULK_PATCH_KEYS
 *
 * ไม่เปิดแก้หลายรายการ (เป็นของเฉพาะรุ่น): รูป · รูปรายสี · แบนเนอร์ · ปั๊มชื่อ · รายละเอียดเฉพาะรุ่น · สีบนการ์ด · รูปเปิด
 * ชื่อ/คำอธิบาย: แก้หลายรายการได้แค่ "ล้างกลับเป็นอัตโนมัติ" (แต่ละรุ่นไม่ควรมีค่าเดียวกัน)
 */
import type { ListingPatch } from "@/lib/website-listing-patch";

export const STOCK_STATUS_OPTIONS = [
  { value: "in", label: "พร้อมส่ง" },
  { value: "low", label: "เหลือน้อย" },
  { value: "preorder", label: "สั่งจอง" },
];

export type ListingFieldKind = "choice" | "price" | "categories" | "badge" | "text" | "clear";
export type ListingFieldKey = "published" | "featured" | "price" | "categories" | "badge" | "stockStatus" | "unit" | "name" | "description";

export interface ListingFieldDef {
  key: ListingFieldKey;
  label: string;
  kind: ListingFieldKind;
  choices?: { value: string; label: string }[];
  hint?: string;
  /** แก้หลายรายการได้ไหม */
  bulk: boolean;
}

export const LISTING_FIELDS: ListingFieldDef[] = [
  { key: "published", label: "ขึ้นเว็บ", kind: "choice", bulk: true, choices: [{ value: "on", label: "ขึ้นเว็บ" }, { value: "off", label: "ซ่อน" }] },
  { key: "featured", label: "สินค้าแนะนำ", kind: "choice", bulk: true, choices: [{ value: "on", label: "ตั้งแนะนำ" }, { value: "off", label: "เลิกแนะนำ" }] },
  { key: "price", label: "ราคาเว็บ", kind: "price", bulk: true, hint: "ล้าง = กลับไปใช้ราคาจาก ERP" },
  { key: "categories", label: "หมวดบนเว็บ", kind: "categories", bulk: true, hint: "เพิ่ม / เอาออก / แทนทั้งชุด" },
  { key: "badge", label: "ป้ายบนการ์ด", kind: "badge", bulk: true },
  { key: "stockStatus", label: "สถานะสต๊อก", kind: "choice", bulk: true, choices: STOCK_STATUS_OPTIONS },
  { key: "unit", label: "หน่วยขาย", kind: "text", bulk: true, hint: "ว่าง = ใช้หน่วยจาก ERP" },
  { key: "name", label: "ชื่อบนเว็บ", kind: "clear", bulk: true, hint: "ล้างกลับเป็นชื่ออัตโนมัติ (ตามกฎชื่อร้าน)" },
  { key: "description", label: "คำอธิบายบนเว็บ", kind: "clear", bulk: true, hint: "ล้างกลับเป็นคำอธิบายจาก ERP" },
];
export const BULK_FIELDS = LISTING_FIELDS.filter((f) => f.bulk);

/** ช่องของ ListingPatch ที่ API ยอมให้แก้หลายรายการ (ชื่อ/คำอธิบาย = ล้างเท่านั้น) */
export const BULK_PATCH_KEYS = ["isPublished", "featured", "webPrice", "webBadge", "webStockStatus", "webUnit", "webName", "webDescription"] as const;

export type CategoriesOp = { mode: "add" | "remove" | "replace"; keys: string[] };
export type PriceOp = { mode: "set" | "clear"; value?: number };
/** ค่าที่ป๊อปส่งมา (เฉพาะช่องที่ติ๊ก) */
export type MassEditValues = Partial<{
  published: string;
  featured: string;
  price: PriceOp;
  categories: CategoriesOp;
  badge: string;
  stockStatus: string;
  unit: string;
  name: true;
  description: true;
}>;

/** ค่าในป๊อป → patch เดียวกันทุกรุ่น + คำสั่งหมวด (คิดต่อรุ่น) · ผิด = บอกว่าต้องแก้อะไร */
export function massEditPlan(v: MassEditValues): { ok: true; patch: ListingPatch; categories: CategoriesOp | null } | { ok: false; error: string } {
  const patch: ListingPatch = {};
  if (v.published !== undefined) {
    if (v.published !== "on" && v.published !== "off") return { ok: false, error: "เลือกว่าจะขึ้นเว็บหรือซ่อน" };
    patch.isPublished = v.published === "on";
  }
  if (v.featured !== undefined) {
    if (v.featured !== "on" && v.featured !== "off") return { ok: false, error: "เลือกว่าจะตั้งหรือเลิกแนะนำ" };
    patch.featured = v.featured === "on";
  }
  if (v.price) {
    if (v.price.mode === "clear") patch.webPrice = null;
    else {
      const n = Number(v.price.value);
      if (!(n > 0)) return { ok: false, error: "ใส่ราคาเว็บให้มากกว่า 0 (หรือเลือก 'ล้าง')" };
      patch.webPrice = Math.round(n * 100) / 100;
    }
  }
  if (v.badge !== undefined) patch.webBadge = String(v.badge).trim().slice(0, 40);
  if (v.stockStatus !== undefined) {
    if (!STOCK_STATUS_OPTIONS.some((o) => o.value === v.stockStatus)) return { ok: false, error: "เลือกสถานะสต๊อก" };
    patch.webStockStatus = v.stockStatus;
  }
  if (v.unit !== undefined) patch.webUnit = String(v.unit).trim().slice(0, 40);
  if (v.name) patch.webName = "";
  if (v.description) patch.webDescription = "";
  let categories: CategoriesOp | null = null;
  if (v.categories) {
    const keys = [...new Set((v.categories.keys ?? []).filter((k) => typeof k === "string" && k))];
    if (!["add", "remove", "replace"].includes(v.categories.mode)) return { ok: false, error: "เลือกว่าจะเพิ่ม/เอาออก/แทนหมวด" };
    if (v.categories.mode !== "replace" && !keys.length) return { ok: false, error: "เลือกหมวดที่จะเพิ่ม/เอาออกก่อน" };
    categories = { mode: v.categories.mode, keys };
  }
  if (!Object.keys(patch).length && !categories) return { ok: false, error: "ติ๊กช่องที่จะแก้อย่างน้อย 1 ช่อง" };
  return { ok: true, patch, categories };
}

/** หมวดใหม่ของ 1 รุ่น (คงลำดับเดิม · ตัวแรก = หมวดหลัก) */
export function applyCategoriesOp(current: string[], op: CategoriesOp): string[] {
  if (op.mode === "replace") return [...op.keys];
  if (op.mode === "add") return [...current, ...op.keys.filter((k) => !current.includes(k))];
  return current.filter((k) => !op.keys.includes(k));
}

/** กรอง patch ที่ API รับจากแก้หลายรายการ (ช่องอื่นทิ้ง · ชื่อ/คำอธิบายรับแค่ค่าว่าง) */
export function sanitizeBulkPatch(p: ListingPatch): ListingPatch {
  const out: Record<string, unknown> = {};
  for (const k of BULK_PATCH_KEYS) {
    if (p[k] === undefined) continue;
    if ((k === "webName" || k === "webDescription") && String(p[k] ?? "").trim()) continue;
    out[k] = p[k];
  }
  return out as ListingPatch;
}
