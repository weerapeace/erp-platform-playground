"use client";

// ============================================================
// ป้ายสถานะ / ความสำคัญ ของงาน — ไฟล์เล็กแยกจาก task-detail-drawer
// เหตุผล: หน้าไหนแค่อยากได้ป้าย ไม่ต้องลากทั้ง drawer + ตัวพิมพ์ข้อความ (rich text) มาโหลดตั้งแต่เปิดหน้า
// ============================================================
import { useT } from "@/components/i18n";
import { statusMeta } from "./use-statuses";
import { PRIORITY_META, priorityLabel, type CreativePriority } from "./data";

export function StatusBadge({ status }: { status: string }) {
  useT();   // subscribe ภาษา → ป้ายสถานะสลับตามภาษา
  const m = statusMeta(status);
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}</span>;
}
export function PriorityBadge({ priority }: { priority: CreativePriority }) {
  useT();   // subscribe ภาษา → ป้ายสลับตามภาษา
  const m = PRIORITY_META[priority] ?? PRIORITY_META.normal;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${m.cls}`}>{priorityLabel(priority)}</span>;
}
