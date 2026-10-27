/**
 * ค่ากลางของโมดูล Design Sheets — สถานะใบงาน + สถานะรอบเสนอราคา
 * ใช้ร่วมกัน: หน้า /master/design-sheets + หน้าพิมพ์ /print/design-sheet*
 * (label อยู่ที่เดียว แก้ที่นี่เปลี่ยนทุกหน้า)
 */

import { tr } from "@/lib/lang";

/**
 * ป้าย 2 ภาษา (ไทย/อังกฤษ) — label เป็น getter อ่านภาษาตอน "แสดงผล" (ถ้าแปลตอนโหลดไฟล์ จะได้ไทยเสมอเพราะภาษายังไม่ถูกโหลด)
 * lazyOpts = คู่ [ค่า, ป้าย] สำหรับ <select> โดยป้ายอ่านภาษาตอนใช้ (ช่องที่ 1 ของ tuple เป็น getter) — ที่ใช้อยู่ไม่ต้องแก้
 */
function lazyOpts(map: Record<string, { label: string }>): ReadonlyArray<readonly [string, string]> {
  return Object.keys(map).map((v) => {
    const pair = [v, ""] as [string, string];
    Object.defineProperty(pair, 1, { get: () => map[v].label, enumerable: true });
    return pair as readonly [string, string];
  });
}

export const DS_STATUS: Record<string, { label: string; cls: string }> = {
  design:        { get label() { return tr("ออกแบบ", "Design"); },                  cls: "bg-slate-100 text-slate-600" },
  sent_customer: { get label() { return tr("ส่งลูกค้าดู", "Sent to customer"); },     cls: "bg-blue-50 text-blue-700" },
  revising:      { get label() { return tr("แก้ไขตาม comment", "Revising"); },        cls: "bg-amber-50 text-amber-700" },
  costing:       { get label() { return tr("ตีราคา", "Costing"); },                  cls: "bg-violet-50 text-violet-700" },
  quoted:        { get label() { return tr("เสนอราคา", "Quoted"); },                 cls: "bg-indigo-50 text-indigo-700" },
  approved:      { get label() { return tr("อนุมัติ", "Approved"); },                 cls: "bg-emerald-50 text-emerald-700" },
  sku_created:   { get label() { return tr("ตั้ง SKU แล้ว", "SKU created"); },         cls: "bg-purple-50 text-purple-700" },
  cancelled:     { get label() { return tr("ยกเลิก", "Cancelled"); },                 cls: "bg-rose-50 text-rose-700" },
};
export const DS_STATUS_OPTS = lazyOpts(DS_STATUS);
export const DS_FINISHED = new Set(["approved", "sku_created", "cancelled"]);

// ---- สถานะจากระบบ Workflow กลาง (แก้เองได้ที่ /admin/workflows) ----
// สี workflow → คลาสป้ายสถานะ
export const WF_COLOR_CLS: Record<string, string> = {
  slate:   "bg-slate-100 text-slate-600",
  blue:    "bg-blue-50 text-blue-700",
  amber:   "bg-amber-50 text-amber-700",
  emerald: "bg-emerald-50 text-emerald-700",
  red:     "bg-rose-50 text-rose-700",
  purple:  "bg-purple-50 text-purple-700",
};
// สี workflow → ค่าสีจริง (ใช้กับหัวโซน Canvas)
export const WF_COLOR_HEX: Record<string, string> = {
  slate: "#94a3b8", blue: "#3b82f6", amber: "#f59e0b", emerald: "#10b981", red: "#f43f5e", purple: "#a855f7",
};
const DS_STATUS_HEX: Record<string, string> = {
  design: "#94a3b8", sent_customer: "#3b82f6", revising: "#f59e0b", costing: "#a855f7",
  quoted: "#6366f1", approved: "#10b981", sku_created: "#a855f7", cancelled: "#f43f5e",
};
export type WfStatusRow = { state_key: string; label: string; color: string; is_terminal: boolean; customer_only?: boolean };
export type StatusMeta = {
  map: Record<string, { label: string; cls: string }>;
  opts: ReadonlyArray<readonly [string, string]>;
  finished: Set<string>;                 // สถานะปิดงาน (is_terminal) — เลิกเตือน deadline
  colorHex: Record<string, string>;      // state_key → สีจริง (หัวโซน Canvas)
  customerOnly: Set<string>;             // สถานะ "ใช้เฉพาะงานลูกค้า" (ติ๊กในปุ่มจัดการสถานะ) — แบรนด์เราไม่เห็น
};
// ชุด fallback (ยังไม่มีสถานะใน workflow) — ขั้นส่งลูกค้ามีเฉพาะงานลูกค้า
const DS_CUSTOMER_ONLY = new Set(["quoted", "sent_customer"]);
/** แปลงสถานะจาก workflow เป็นชุดที่หน้าจอใช้ — ไม่มีข้อมูล = ใช้ชุด fallback ในโค้ด */
export function buildStatusMeta(rows: WfStatusRow[] | null | undefined): StatusMeta {
  if (!rows || rows.length === 0) return { map: DS_STATUS, opts: DS_STATUS_OPTS, finished: DS_FINISHED, colorHex: DS_STATUS_HEX, customerOnly: DS_CUSTOMER_ONLY };
  const map: Record<string, { label: string; cls: string }> = {};
  const colorHex: Record<string, string> = {};
  const finished = new Set<string>();
  const customerOnly = new Set<string>();
  for (const r of rows) {
    map[r.state_key] = { label: r.label, cls: WF_COLOR_CLS[r.color] ?? WF_COLOR_CLS.slate };
    colorHex[r.state_key] = WF_COLOR_HEX[r.color] ?? WF_COLOR_HEX.slate;
    if (r.is_terminal) finished.add(r.state_key);
    if (r.customer_only) customerOnly.add(r.state_key);
  }
  return { map, opts: rows.map((r) => [r.state_key, r.label] as const), finished, colorHex, customerOnly };
}

// ---- งานลูกค้า vs แบรนด์เรา (กฎกลาง — บอร์ด / ป๊อปอัปใบงาน / หน้ามือถือ ใช้ตัวเดียวกัน) ----
/** งานของ "แบรนด์เรา" = แบรนด์ที่ไม่ได้ติ๊ก 👤 งานลูกค้า (หน้าแบรนด์) ·
 *  ไม่ระบุแบรนด์ / ยังไม่รู้ข้อมูลแบรนด์ = นับเป็นงานลูกค้า (เห็นครบทุกสถานะ งานไม่หาย) */
export function isOwnBrandJob(brand: { is_customer_job?: boolean | null } | null | undefined): boolean {
  return !!brand && !brand.is_customer_job;
}
/** สถานะที่เลือกได้ — แบรนด์เรา = ตัดสถานะ "ใช้เฉพาะงานลูกค้า" ออก
 *  (ยกเว้นสถานะที่ใบนี้อยู่ตอนนี้ — โชว์ค้างไว้ ข้อมูลไม่หาย) */
export function statusOptsFor(meta: StatusMeta, ownBrand: boolean, current?: string | null): ReadonlyArray<readonly [string, string]> {
  if (!ownBrand) return meta.opts;
  return meta.opts.filter(([k]) => !meta.customerOnly.has(k) || k === current);
}
/** ป้ายสถานะที่ไม่รู้จัก (เช่น สถานะถูกลบออกจาก workflow แล้ว) — โชว์ key เดิมสีเทา ข้อมูลไม่หาย */
export const UNKNOWN_STATUS_CLS = "bg-slate-100 text-slate-400";

export const QUOTE_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { get label() { return tr("รอผล", "Pending"); },   cls: "bg-slate-100 text-slate-600" },
  passed:  { get label() { return tr("ผ่าน", "Passed"); },    cls: "bg-emerald-50 text-emerald-700" },
  failed:  { get label() { return tr("ไม่ผ่าน", "Failed"); }, cls: "bg-rose-50 text-rose-700" },
};
export const QUOTE_STATUS_OPTS = lazyOpts(QUOTE_STATUS);

// ---- สูตรคำนวณปริมาณตีราคา (เฟส 4) ----
// สูตรเดียวกับ BOM (app/master/bom/line-editor.tsx → calcLine) — อิงวิธีคำนวณจาก material_groups
// area_face: กว้าง×ยาว×ชิ้น ×(1+เผื่อเสีย%) ÷หน้ากว้าง ÷ตัวหาร · area_100: พื้นที่×(1+เสีย)÷ตัวหาร
// length: ยาว×(1+เสีย)÷ตัวหาร · count: จำนวนชิ้น · manual/ไม่รู้ชนิด: พิมพ์ปริมาณเอง (คืน null)
export type CostCalcInput = {
  calc_method: string | null; width_cm: number | null; length_cm: number | null; pieces: number | null;
  face_width_cm: number | null; waste_percent: number | null; divisor: number | null;
};
const r4 = (n: number) => Math.round(n * 10000) / 10000;
export function calcCostQty(l: CostCalcInput): number | null {
  const m = l.calc_method ?? "manual";
  const d = l.divisor || 90;
  const k = 1 + (l.waste_percent || 0) / 100;
  const area = (l.width_cm || 0) * (l.length_cm || 0) * (l.pieces || 1);
  if (m === "count")     return l.pieces || 0;
  if (m === "length")    return l.length_cm ? r4(l.length_cm * k / d) : null;
  if (m === "area_100")  return (l.width_cm && l.length_cm) ? r4(area * k / d) : null;
  if (m === "area_face") return (l.width_cm && l.length_cm && l.face_width_cm) ? r4(area * k / l.face_width_cm / d) : null;
  return null;
}
