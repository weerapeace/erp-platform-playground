"use client";

/**
 * ป้าย "👥 N ผู้ใช้" ของรายการที่มีหลายผู้ใช้ในบิลเดียว (subscriptions.members)
 * ใช้ร่วมตารางหน้าหลัก / หน้าส่วนตัว / การ์ดบอร์ด — รายการคนเดียวไม่แสดงอะไร
 */
import { memberLabel, type Subscription } from "@/lib/subscriptions";

export function MembersChip({ sub, className }: { sub: Pick<Subscription, "members">; className?: string }) {
  const ms = sub.members ?? [];
  if (ms.length < 2) return null;
  const active = ms.filter((m) => m.active).length;
  const names = ms.map((m) => `${memberLabel(m)}${m.active ? "" : " (ปิด)"}`).join(", ");
  const tip = ms.map((m) => `${memberLabel(m)}${m.account_email && m.name ? ` — ${m.account_email}` : ""}${m.active ? "" : " (ปิด)"}`).join("\n");
  return (
    <span title={tip} className={`inline-flex items-center gap-1 max-w-full text-[11px] text-indigo-700 ${className ?? ""}`}>
      <span className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-50">👥 {active < ms.length ? `${active}/${ms.length}` : ms.length} ผู้ใช้</span>
      <span className="truncate text-slate-500">{names}</span>
    </span>
  );
}
