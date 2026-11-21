/**
 * ความพร้อมของงานสินค้า ("ยังขาดอะไร" ใต้ความคืบหน้าในลิ้นชักงาน) — pure ใช้ได้ทั้งหน้าเว็บ/หลังบ้าน/เทสต์
 * --------------------------------------------------------------------------
 * เจ้าของขอ 2026-11-21: เช็กรายการที่ยังไม่มี (รายละเอียด/รับประกัน/ราคา/SKU/รูป/ขนาด/สี/Platform/หมวดร้าน) · ตั้งต่อประเภทงานได้
 * ⚠️ ไม่ใช่ตัวเช็กตัวที่ 2 — ข้อรายละเอียด/ขนาด/สี/ราคา/รูป มาจากตัวเช็กกลาง lib/product-listing-checks (ตัวเดียวกับปุ่ม "ตรวจเร็ว")
 *    ข้อ Platform มาจากสถานะลงร้านตัวเดียวกับแถบ Platform ในลิ้นชัก (usePlatformListedStatus)
 * ข้อมูลสินค้า: GET /api/creative-tasks/[id]/quick-check (ตัวโหลดเดียวกับ "ดูรูป") · ไม่ใช้ต้นทุน
 * ตั้งค่า: ui_config key `task_readiness_rules` = { default: string[] | null, byType: { [task_type]: string[] } }
 */
import { listingChecks, type QuickCheckParent } from "@/lib/product-listing-checks";

export const READINESS_RULES_KEY = "task_readiness_rules";

export type ReadinessKey = "desc" | "warranty" | "price" | "sku" | "img" | "size" | "color" | "platform" | "category";
export const READINESS_DEFS: { key: ReadinessKey; label: string; label_en: string; hint: string }[] = [
  { key: "desc", label: "รายละเอียดสินค้า", label_en: "Description", hint: "Description ไทย+อังกฤษ ครบ ไม่ซ้ำ ตัวเลขตรงกัน (กฎเดียวกับปุ่มตรวจเร็ว)" },
  { key: "warranty", label: "ข้อมูลรับประกัน", label_en: "Warranty", hint: "ช่องรับประกันของ Parent (ใส่ \"ไม่มีรับประกัน\" ก็นับว่าตั้งแล้ว)" },
  { key: "price", label: "ราคาขาย / ขีดฆ่า", label_en: "Prices", hint: "ทุก SKU มีราคาขาย และราคาขีดฆ่าสูงกว่าราคาขาย" },
  { key: "sku", label: "ตั้ง SKU", label_en: "SKUs", hint: "Parent มี SKU อย่างน้อย 1 ตัว" },
  { key: "img", label: "รูปสินค้า", label_en: "Images", hint: "Parent มีรูป และทุก SKU มีรูป" },
  { key: "size", label: "ขนาด / น้ำหนัก", label_en: "Size / weight", hint: "ใส่ขนาด (กว้าง×สูง×หนา) และน้ำหนัก" },
  { key: "color", label: "ชื่อสีไทย/อังกฤษ", label_en: "Color names", hint: "ทุก SKU มีชื่อสีไทยและอังกฤษ ถูกภาษา" },
  { key: "platform", label: "ลงครบทุก Platform", label_en: "All platforms listed", hint: "ทุกร้านที่เลือกในงานลงสินค้าแล้ว" },
  { key: "category", label: "หมวดหมู่ร้าน", label_en: "Shop category", hint: "ตั้งหมวดหมู่ Platform ของ Parent แล้ว" },
];
/** ค่าเริ่มต้น (ยังไม่ตั้ง) = ชุดที่เจ้าของเลือก 2026-11-21 */
export const DEFAULT_READINESS: ReadinessKey[] = ["desc", "warranty", "price", "sku", "img", "size", "color", "platform", "category"];

export type ReadinessRules = { default: ReadinessKey[] | null; byType: Record<string, ReadinessKey[]> };
const KEYS = new Set<string>(READINESS_DEFS.map((d) => d.key));
const cleanKeys = (v: unknown): ReadinessKey[] => (Array.isArray(v) ? v.filter((k): k is ReadinessKey => typeof k === "string" && KEYS.has(k)) : []);
export function cleanReadinessRules(raw: unknown): ReadinessRules {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const byType: Record<string, ReadinessKey[]> = {};
  const bt = (o.byType && typeof o.byType === "object" ? o.byType : {}) as Record<string, unknown>;
  for (const [k, v] of Object.entries(bt)) if (Array.isArray(v)) byType[k] = cleanKeys(v);
  return { default: Array.isArray(o.default) ? cleanKeys(o.default) : null, byType };
}
/** รายการเช็กที่ใช้กับประเภทงานนี้ (ตั้งเฉพาะประเภท > ค่ากลาง > ค่าเริ่มต้น) */
export function readinessKeysFor(rules: ReadinessRules | null, taskType: string | null | undefined): ReadinessKey[] {
  if (rules && taskType && rules.byType[taskType]) return rules.byType[taskType];
  return rules?.default ?? DEFAULT_READINESS;
}

/** ข้อมูล Parent ที่ใช้เช็ก = ข้อมูลตรวจเร็ว + ช่องเพิ่ม (รับประกัน/น้ำหนัก/หมวดร้าน) */
export type ReadinessParent = QuickCheckParent & { warranty?: string | null; weight_g?: number | null; platform_category_id?: string | null };
/** สถานะลงร้าน: code ร้าน → ลงครบทุกรุ่นไหม (ร้านที่ระบบลงสินค้าไม่ได้ = ไม่อยู่ใน map) · null = ยังโหลดไม่เสร็จ */
export type PlatformListed = Record<string, boolean> | null;

export type ReadinessItem = {
  key: ReadinessKey; label: string; label_en: string;
  ok: boolean;
  /** รายละเอียดที่ขาด (ภาษาคน) — ว่างเมื่อผ่าน */
  issues: string[];
  /** Parent ที่ยังไม่ผ่าน (ไว้กดพาไปแก้) */
  parentIds: string[];
  /** ยังรู้ไม่ได้ (เช่น สถานะลงร้านยังโหลดไม่เสร็จ) */
  pending?: boolean;
};

const LISTING_KEYS: Partial<Record<ReadinessKey, string[]>> = {
  desc: ["desc_th_empty", "desc_en_empty", "desc_th_dup", "desc_en_dup", "desc_en_short", "desc_cm_mismatch"],
  size: ["size_missing"],
  color: ["color_th_empty", "color_th_english", "color_en_empty", "color_en_thai"],
  price: ["price_missing", "fake_missing", "fake_low"],
  img: ["parent_no_images", "sku_no_images"],
};

export function taskReadiness(parents: ReadinessParent[], keys: ReadinessKey[], opts: { platforms?: string[]; listed?: PlatformListed; platformLabel?: (code: string) => string } = {}): ReadinessItem[] {
  const want = new Set(keys);
  const out: ReadinessItem[] = [];
  const checks = new Map(parents.map((p) => [p.id, listingChecks(p)]));
  const prefix = (p: ReadinessParent, s: string) => (parents.length > 1 ? `${p.code}: ${s}` : s);
  for (const def of READINESS_DEFS) {
    if (!want.has(def.key)) continue;
    const item: ReadinessItem = { key: def.key, label: def.label, label_en: def.label_en, ok: true, issues: [], parentIds: [] };
    const fail = (p: ReadinessParent | null, msg: string) => { item.ok = false; item.issues.push(p ? prefix(p, msg) : msg); if (p && !item.parentIds.includes(p.id)) item.parentIds.push(p.id); };
    if (def.key === "platform") {
      const pf = (opts.platforms ?? []);
      if (pf.length) {
        if (opts.listed == null) item.pending = true;
        else for (const code of pf) if (code in opts.listed && !opts.listed[code]) fail(null, `${opts.platformLabel?.(code) ?? code} ยังไม่ลง`);
      }
      out.push(item); continue;
    }
    if (!parents.length) { fail(null, "ยังไม่ผูก Parent SKU"); out.push(item); continue; }
    for (const p of parents) {
      const lk = LISTING_KEYS[def.key];
      if (lk) for (const c of checks.get(p.id) ?? []) if (lk.includes(c.key)) fail(p, c.text);
      if (def.key === "size" && !(Number(p.weight_g) > 0)) fail(p, "ยังไม่ใส่น้ำหนัก");
      if (def.key === "warranty" && !String(p.warranty ?? "").trim()) fail(p, "ยังไม่ตั้งข้อมูลรับประกัน");
      if (def.key === "sku" && !p.skus.length) fail(p, "ยังไม่มี SKU");
      if (def.key === "category" && !p.platform_category_id) fail(p, "ยังไม่ตั้งหมวดหมู่ร้าน");
    }
    out.push(item);
  }
  return out;
}

/** สรุปตัวเลข: ผ่านกี่ข้อจากทั้งหมด (ข้อที่ยังรู้ไม่ได้ไม่นับ) */
export function readinessSummary(items: ReadinessItem[]): { done: number; total: number; missing: number } {
  const known = items.filter((i) => !i.pending);
  const done = known.filter((i) => i.ok).length;
  return { done, total: known.length, missing: known.length - done };
}

/** สถานะปลายทางที่ "เตือนก่อนกด" ถ้ายังขาด (ส่งตรวจ / อนุมัติ / ตั้งเวลา / เผยแพร่ / ปิดงาน) — เตือนอย่างเดียว ไม่บล็อก */
export const READINESS_WARN_TO = new Set(["need_review", "approved", "scheduled", "published", "done"]);
