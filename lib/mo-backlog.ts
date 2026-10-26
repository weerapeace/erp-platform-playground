/**
 * ของกลาง: แบ่ง "ใบสั่งผลิตค้าง" เป็นกลุ่มตามสิ่งที่ต้องทำ — ใช้ทั้ง API /api/mo/backlog และหน้า /master/mo-backlog
 *
 * กลุ่ม (ไม่ซ้อนกัน — 1 ใบอยู่กลุ่มเดียว):
 *   A ส่งคืนครบแล้ว ยังไม่ปิด      → ปิดงาน
 *   B จ่ายครบ อยู่กับช่าง (ยังคืนไม่ครบ) → รอรับคืน (ขั้นถัดไป: รับคืนครบ + ปิด)
 *   P จ่ายบางส่วน                 → ทำงานต่อตามปกติ
 *   C ยังไม่จ่ายเลย อายุเกิน 90 วัน → ยกเลิก หรือยืนยันว่ายังทำ
 *   D ยังไม่จ่าย 61–90 วัน · E 31–60 วัน · F ไม่ถึง 30 วัน
 * อายุใบนับจาก created_at (มีครบทุกใบ — order_date กรอกไว้แค่บางใบ)
 */

export type MoBacklogBucket = "A" | "B" | "P" | "C" | "D" | "E" | "F";

export type MoBacklogRow = {
  id: string;
  mo_no: string;
  product_sku: string | null;
  product_name: string | null;
  qty: number;
  status: string;
  created_at: string | null;
  age_days: number;
  due_date: string | null;           // 📦 นัดส่งลูกค้า
  internal_due_date: string | null;  // 🪑 ส่งงานภายใน
  dispatched: number;
  received: number;
  open_work_orders: number;
  /** แอดมินข้ามขั้น "รับคืน" แล้ว (lib/mo-skip) → ปิดงานได้โดยไม่ต้องรับคืนครบ */
  receive_skipped?: boolean;
  last_dispatch_date: string | null;
  has_bom: boolean;
  prep_total: number; prep_ready: number;
  cut_total: number; cut_ready: number;
  groups: string;                    // ชื่อกลุ่ม (คั่นด้วย , ) — "" = ไม่อยู่กลุ่มไหน
  bucket: MoBacklogBucket;
  overdue_days: number | null;       // เลยวันนัดส่งลูกค้ากี่วัน (null = ยังไม่เลย/ไม่มีวัน/ส่งครบแล้ว)
};

export const MO_BUCKETS: Record<MoBacklogBucket, { label: string; hint: string; tone: "green" | "violet" | "blue" | "red" | "orange" | "amber" | "slate" }> = {
  A: { label: "ส่งคืนครบ ยังไม่ปิด",   hint: "ช่างส่งของครบแล้ว — ปิดงานได้เลย", tone: "green" },
  B: { label: "อยู่กับช่าง",            hint: "จ่ายครบแล้ว รอช่างส่งคืน",        tone: "violet" },
  P: { label: "จ่ายบางส่วน",            hint: "ยังจ่ายงานไม่ครบจำนวน",            tone: "blue" },
  C: { label: "ยังไม่จ่าย เกิน 90 วัน", hint: "เก่ามาก — ยกเลิก หรือยืนยันว่ายังทำ", tone: "red" },
  D: { label: "ยังไม่จ่าย 61–90 วัน",   hint: "ทบทวนว่ายังต้องผลิตไหม",           tone: "orange" },
  E: { label: "ยังไม่จ่าย 31–60 วัน",   hint: "ตั้งวันกำหนดให้ครบ",               tone: "amber" },
  F: { label: "ใบใหม่ ไม่ถึง 30 วัน",   hint: "ปกติ",                            tone: "slate" },
};

export const MO_BUCKET_ORDER: MoBacklogBucket[] = ["A", "B", "P", "C", "D", "E", "F"];

export function bucketOf(r: { qty: number; dispatched: number; received: number; age_days: number }): MoBacklogBucket {
  if (r.qty > 0 && r.received >= r.qty) return "A";
  if (r.qty > 0 && r.dispatched >= r.qty) return "B";
  if (r.dispatched > 0) return "P";
  if (r.age_days > 90) return "C";
  if (r.age_days > 60) return "D";
  if (r.age_days > 30) return "E";
  return "F";
}

/** อายุใบ (วัน) ตามปฏิทินไทย — today/created เป็น "YYYY-MM-DD" ตามเวลาไทย */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const p = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((p(toYmd) - p(fromYmd)) / 86_400_000);
}

/** วันที่ตามเวลาไทยของ timestamp (ISO) → "YYYY-MM-DD" */
export function bangkokYmd(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}
