/**
 * วันนัดส่งของใบสั่งขาย (กติกาล้วน) — เจ้าของเลือกแบบ B 2026-11-22: ใส่วันทั้งใบ + แยกวันรายรายการได้
 *   หัวใบ  so_orders.due_date         = วันนัดส่งของทั้งใบ
 *   รายการ so_order_lines.due_date    = วันนัดส่งเฉพาะรายการ (ว่าง = ใช้ของหัวใบ)
 *   ลูกค้าเห็นในไลน์ (lib/line-customer-view lineDueOf ลำดับเดียวกัน)
 * ใช้ที่: /api/so-orders/due · ป๊อปตั้งวัน app/sales/orders/due-editor.tsx
 */
import { soLineProgress } from "@/lib/mo-so-rule";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** ค่าวันที่ส่งมา: "YYYY-MM-DD" = ตั้ง · null/"" = ล้าง · undefined = ไม่แตะ · ผิดรูป = error */
export function parseDue(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const s = String(v).slice(0, 10);
  if (!YMD.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) throw new Error("วันที่ไม่ถูกต้อง");
  return s;
}

/** วันของรายการที่ใช้จริง = รายการ → หัวใบ */
export const effectiveLineDue = (lineDue: string | null | undefined, orderDue: string | null | undefined): string | null =>
  (lineDue || orderDue || null)?.slice(0, 10) ?? null;

/** ปุ่มลัดวันนัดส่ง: +n วันจากวันที่สั่ง (คิดเป็นวันปฏิทิน ไม่ขึ้นกับเขตเวลา) */
export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const DUE_SHORTCUTS = [7, 14, 30] as const;

export type DueLine = { id: string; sku: string | null; qty: number; mo_id: string | null; due_date: string | null };
export type DueMo = { id: string; mo_no: string; product_sku: string | null; qty: number; status: string | null; due_date: string | null };

/**
 * ใบสั่งผลิตที่ต้องอัปเดตวันส่งตามวันนัดใหม่ (เมื่อผู้ใช้ติ๊ก "อัปเดตใบสั่งผลิตด้วย")
 *   จับคู่รายการ↔ใบผลิตด้วยกติกาเดียวกับหน้าสถานะใบสั่งขาย (soLineProgress)
 *   วันใหม่ = วันรายการ → หัวใบ · วันใหม่ว่าง = ไม่ล้างวันของใบผลิต · วันเท่าเดิม = ข้าม · ใบผลิตยกเลิก/ปิดแล้ว = ข้าม
 *   onlyLineIds = เฉพาะรายการที่เพิ่งแก้ (ไม่ส่ง = ทุกรายการ เช่น แก้วันหัวใบ)
 */
export function moDueTargets(lines: DueLine[], mos: DueMo[], orderDue: string | null, onlyLineIds?: Set<string>): { mo_id: string; mo_no: string; from: string | null; to: string }[] {
  const prog = soLineProgress(lines.map((l) => ({ id: l.id, sku: l.sku, qty: l.qty, mo_id: l.mo_id })), mos);
  const moById = new Map(mos.map((m) => [m.id, m]));
  const out: { mo_id: string; mo_no: string; from: string | null; to: string }[] = [];
  const seen = new Set<string>();
  for (const l of lines) {
    if (onlyLineIds && !onlyLineIds.has(l.id)) continue;
    const to = effectiveLineDue(l.due_date, orderDue);
    if (!to) continue;
    for (const pm of prog.byLine[l.id]?.mos ?? []) {
      const m = moById.get(pm.id);
      if (!m || seen.has(m.id) || m.status === "cancelled" || m.status === "done" || m.status === "closed") continue;
      seen.add(m.id);
      const from = m.due_date ? m.due_date.slice(0, 10) : null;
      if (from !== to) out.push({ mo_id: m.id, mo_no: m.mo_no, from, to });
    }
  }
  return out;
}
