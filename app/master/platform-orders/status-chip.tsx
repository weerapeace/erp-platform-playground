"use client";

// ป้ายสถานะออเดอร์ — สี/ชื่อจากกติกากลาง lib/platform-order-status (ใช้ในตารางและแผงรายละเอียด)
import { PLATFORM_ORDER_STATUS_META, isPlatformOrderStatus, type StatusTone } from "@/lib/platform-order-status";

const TONE: Record<StatusTone, string> = {
  info: "bg-blue-50 text-blue-700 border-blue-200",
  accent: "bg-violet-50 text-violet-700 border-violet-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  muted: "bg-slate-100 text-slate-500 border-slate-200",
};

export function StatusChip({ s }: { s: string }) {
  const m = isPlatformOrderStatus(s) ? PLATFORM_ORDER_STATUS_META[s] : { short: s, tone: "muted" as StatusTone };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[m.tone]}`}>{m.short}</span>;
}
