// ============================================================
// สถานะแคมเปญ (ค่าคงที่) — แยกไฟล์เล็กจาก campaign-drawer
// เหตุผล: หน้าภาพรวม/รายการแคมเปญแค่อยากได้ป้ายสถานะ ไม่ต้องลากทั้ง drawer + ตัวพิมพ์ข้อความมาโหลดตั้งแต่เปิดหน้า
// ============================================================
import { tr } from "@/lib/lang";

export const CAMPAIGN_STATUS: { value: string; label: () => string; cls: string }[] = [
  { value: "planning", label: () => tr("วางแผน", "Planning"), cls: "bg-sky-50 text-sky-700 border-sky-200" },
  { value: "active",   label: () => tr("กำลังทำ", "Active"), cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  { value: "done",     label: () => tr("จบแล้ว", "Done"),  cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "cancelled",label: () => tr("ยกเลิก", "Cancelled"),  cls: "bg-slate-100 text-slate-400 border-slate-200" },
];
