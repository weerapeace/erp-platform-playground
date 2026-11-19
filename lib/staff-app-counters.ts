/**
 * ตัวเลขงานค้างบนปุ่มแอปพนักงาน (รอบ 3) — รายการตัวนับที่เลือกได้ (ไฟล์ pure)
 * ใช้ทะเบียนตัวเลขสดของแผนผังการทำงาน (lib/flow-map FLOW_METRICS) — ไม่มีระบบนับตัวที่ 2
 * แยกจาก lib/staff-app-extras เพราะ lib/flow-map ใหญ่ (~110KB) ห้ามหลุดเข้าหน้าแรกแอป — ใช้แค่ตัวช่วยสร้าง + API
 */
import { FLOW_METRICS, type FlowMetricKey } from "@/lib/flow-map";

// ── ตัวนับ ──
/** ตัวนับที่เลือกใส่ปุ่มได้ — ตัดยอดรวมจำนวนหน่วย/ชิ้น (ไม่ใช่ "งานค้าง") ออก */
const BADGE_UNITS = new Set(["ใบ", "รายการ", "บรรทัด", "ครั้ง", "รอบ"]);
export type BadgeCounter = { key: FlowMetricKey; label: string; unit: string; finance: boolean; bad: boolean };
export const BADGE_COUNTERS: BadgeCounter[] = (Object.keys(FLOW_METRICS) as FlowMetricKey[])
  .filter((k) => BADGE_UNITS.has(FLOW_METRICS[k].unit))
  .map((k) => ({ key: k, label: FLOW_METRICS[k].label, unit: FLOW_METRICS[k].unit, finance: !!FLOW_METRICS[k].finance, bad: !!FLOW_METRICS[k].bad }));

export function isBadgeCounter(key: unknown): key is FlowMetricKey {
  return typeof key === "string" && BADGE_COUNTERS.some((c) => c.key === key);
}
