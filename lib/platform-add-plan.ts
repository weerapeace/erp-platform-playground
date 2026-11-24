/**
 * แผนลงสินค้าขึ้นร้าน (ของกลาง · pure · มีเทสต์ lib/__tests__/platform-add-plan.test.ts)
 * --------------------------------------------------------------------------
 * ตัวช่วยลงสินค้า (components/platform-listing/add-to-platform-wizard) ใช้ตัดสินว่าสินค้าแต่ละตัว × ร้าน จะ:
 *   ลงจริง (publish) · บันทึกร่าง (prepare) · ข้ามเพราะมีบนร้านแล้ว · ข้ามเพราะข้อมูลไม่ครบ · ข้ามเพราะผู้ใช้กดข้าม
 * กันซ้ำ (บทเรียน JEAN08 ถูกสร้างซ้ำบน LINE 6 รายการ ก.ค. 2026):
 *   - มีรายการบนร้านที่จับคู่สินค้านี้อยู่แล้ว (on_shop) หรือร่างมีรหัสบนร้าน (status listed) → ไม่ลงซ้ำ ไม่เตรียมทับ
 *   - ฝั่ง server (/api/line-shopping/create-product) ตรวจซ้ำอีกชั้น + ล็อกระหว่างกำลังลง
 * ห้าม import "@/..." (ใช้ทั้ง client และเทสต์)
 */

export type ReadinessStatus = "listed" | "ready" | "missing" | "new";

/** แถวจาก GET /api/product-platforms/readiness (+ on_shop) */
export type AddReadinessRow = {
  id: string;
  code: string;
  name: string;
  status: ReadinessStatus;
  /** ข้อมูลครบพอลงไหม (มีร่าง = ตรวจจากร่าง · ยังไม่มีร่าง = ถ้าเตรียมตอนนี้) */
  ready_now: boolean;
  /** ข้อที่ขาด (ข้อบังคับ) คั่นด้วย " · " */
  missing: string;
  warnings: string;
  /** มีรายการบนร้านนี้ที่จับคู่สินค้านี้อยู่แล้ว (platform_catalog_listings) */
  on_shop?: boolean;
  /** หมวดกลางของสินค้า (ชื่อ / id — null = ยังไม่ตั้ง) */
  central_category?: string;
  central_category_id?: string | null;
  /** หมวดของร้านนี้ที่จับคู่กับหมวดกลางไว้ ("" = ยังไม่จับคู่) */
  mapped_category?: string;
  /** หมวดที่จะใช้ลงร้านนี้ (ร่าง ถ้าไม่มี = จากการจับคู่) */
  platform_category?: string;
};

export type AddDecision = "publish" | "prepare" | "skip_listed" | "skip_missing" | "skip_user";

export const ADD_DECISION_LABEL: Record<AddDecision, string> = {
  publish: "ลงบนร้านจริง",
  prepare: "บันทึกร่าง",
  skip_listed: "ข้าม · มีบนร้านแล้ว",
  skip_missing: "ข้าม · ข้อมูลยังไม่ครบ",
  skip_user: "ข้าม · เลือกไม่ลง",
};

/** เลือกได้สูงสุดต่อครั้ง (เท่ากับเพดานของ /api/product-platforms/prepare) */
export const ADD_MAX_ITEMS = 200;
/** ลงจริงเกินจำนวนนี้ ต้องพิมพ์คำยืนยัน (กฎ bulk ของระบบ — ลงจริงแก้กลับยาก) */
export const ADD_TYPED_CONFIRM_OVER = 20;
export const ADD_CONFIRM_WORD = "ยืนยัน";

export const isOnShop = (r: Pick<AddReadinessRow, "status" | "on_shop">): boolean => r.status === "listed" || !!r.on_shop;

/**
 * ตัดสินสินค้า 1 ตัว × ร้าน 1 ร้าน
 * @param realPublish ร้านนี้ลงจริงได้ และผู้ใช้เลือกลงจริง (ไม่ใช่แค่เตรียมร่าง)
 * @param userSkipped ผู้ใช้กด "ข้ามตัวนี้"
 */
export function decideAdd(r: AddReadinessRow, realPublish: boolean, userSkipped: boolean): AddDecision {
  if (isOnShop(r)) return "skip_listed";
  if (userSkipped) return "skip_user";
  if (!realPublish) return "prepare";               // บันทึกร่างได้แม้ข้อมูลยังไม่ครบ (เก็บผลตรวจไว้ในร่าง)
  return r.ready_now ? "publish" : "skip_missing";
}

export type AddPlanSummary = Record<AddDecision, number> & { total: number };

export function summarizePlan(decisions: AddDecision[]): AddPlanSummary {
  const out: AddPlanSummary = { publish: 0, prepare: 0, skip_listed: 0, skip_missing: 0, skip_user: 0, total: decisions.length };
  for (const d of decisions) out[d]++;
  return out;
}

/** เปิดขายทันทีเกินจำนวนนี้ ต้องพิมพ์คำยืนยันด้วย (เจ้าของเลือก 2026-11-21 ข้อ 4 — ลูกค้าเห็นสินค้าทันที) */
export const ADD_ONSALE_TYPED_OVER = 5;

/** ต้องพิมพ์คำยืนยันไหม (นับเฉพาะที่จะลงจริง · onsaleCount = ตัวที่จะเปิดขายทันทีหลังลง) */
export const needsTypedConfirm = (publishCount: number, onsaleCount = 0): boolean =>
  publishCount > ADD_TYPED_CONFIRM_OVER || onsaleCount > ADD_ONSALE_TYPED_OVER;

/** หลังลงร้านเสร็จ: ปิดไว้ก่อน / เปิดขายทันที */
export type AfterDisplay = "hide" | "onsale";
/** ค่าที่จำไว้ต่อร้าน (useUserPref) → ตรวจรูป · ผิดรูป = null (ใช้ค่าเริ่ม ปิดไว้ก่อน) */
export function parseAfterDisplayPref(raw: unknown): Record<string, AfterDisplay> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, AfterDisplay> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (v === "hide" || v === "onsale") out[k] = v;
  return out;
}

/** แยกข้อที่ขาด (สตริง " · ") เป็นรายการ */
export const missingList = (missing: string): string[] => missing.split(" · ").map((s) => s.trim()).filter(Boolean);

/** ข้อที่ขาดข้อนี้เป็นเรื่องหมวดของร้านไหม ("หมวดหมู่ปลายทาง" LINE · "เลือกหมวดหมู่ปลายทาง" ทั่วไป/TikTok · "หมวด Lazada/Shopee") */
export const isCategoryMissingLabel = (label: string): boolean => /หมวด/.test(label);

/**
 * ทำไม "ขาดหมวด" (ตัวช่วยลงสินค้า — แก้หมวดได้ในแถวเลย · เจ้าของเลือก 2026-11-24)
 *   no_central  = สินค้ายังไม่มีหมวดกลาง → เลือก/เพิ่มหมวดกลาง
 *   no_mapping  = มีหมวดกลางแล้ว แต่หมวดกลางนั้นยังไม่จับคู่กับร้านนี้ → เลือกหมวดของร้าน (บันทึกเป็นค่ามาตรฐานของหมวดกลาง)
 *   draft_empty = จับคู่ไว้แล้ว แต่ร่างที่เตรียมไว้ก่อนหน้ายังไม่มีหมวด → ใส่หมวดมาตรฐานลงร่าง
 *   null        = ไม่ได้ขาดหมวด (หรือมีบนร้านแล้ว / พร้อมแล้ว)
 */
export type CategoryGap = "no_central" | "no_mapping" | "draft_empty";
export function categoryGap(r: Pick<AddReadinessRow, "status" | "on_shop" | "ready_now" | "missing" | "central_category_id" | "mapped_category">): CategoryGap | null {
  if (isOnShop(r) || r.ready_now) return null;
  if (!missingList(r.missing).some(isCategoryMissingLabel)) return null;
  if (!r.central_category_id) return "no_central";
  if (!(r.mapped_category ?? "").trim()) return "no_mapping";
  return "draft_empty";
}
