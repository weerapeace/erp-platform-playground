"use client";

/**
 * ช่อง "ชื่อรายการ" ในตาราง App Subscription — โลโก้ + ชื่อ (ตัวเด่น) + ป้ายแพ็กเกจ + บรรทัดรองจาง (ผู้ใช้/อีเมล)
 * ใช้ร่วมตารางหน้าหลัก + หน้าส่วนตัว (แก้ที่เดียว ตารางทั้งสองเปลี่ยนตาม)
 */
import { AppLogo } from "@/components/logo-picker";
import type { Subscription } from "@/lib/subscriptions";
import { MembersChip } from "./members-chip";

export function SubNameCell({ sub }: { sub: Subscription }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <AppLogo src={sub.logo_url} name={sub.name} size={28} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-slate-800 truncate">{sub.name}</span>
          <PlanBadge plan={sub.plan_name} />
        </div>
        {sub.members?.length >= 2
          ? <MembersChip sub={sub} />
          : sub.account_email && <div className="text-[11px] text-slate-400 truncate">{sub.account_email}</div>}
      </div>
    </div>
  );
}

/** ป้ายแพ็กเกจที่เลือก (เช่น "Plus") — ใช้ร่วมตาราง + การ์ดบอร์ด · ไม่ได้เลือก = ไม่แสดง */
export function PlanBadge({ plan }: { plan?: string | null }) {
  if (!plan) return null;
  return <span className="shrink-0 max-w-[110px] truncate text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700" title={`แพ็กเกจ ${plan}`}>{plan}</span>;
}
