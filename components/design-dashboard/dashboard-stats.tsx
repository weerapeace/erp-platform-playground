"use client";
// Design Dashboard: แถวสถิติ 4 ช่อง (งานทั้งหมด · กำลังเดิน · ใกล้ครบ · ปิดแล้ว) — แยกจาก index.tsx (Y1)
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import type { BrandTheme } from "@/lib/brand-theme";
import { BrandSlot } from "@/components/brand-theme/slots";
import { LoadingCard } from "./dashboard-helpers";
import { useT } from "@/components/i18n";

export function DashboardStats({ isPhone, loading, visibleTotal, total, sheets, loadedLimitNote, scopeLabel, activeJobs, urgentJobs, finishedJobs, brandTheme }: {
  isPhone: boolean;
  loading: boolean;
  visibleTotal: number;
  total: number;
  sheets: DesignSheetListItem[];
  loadedLimitNote: string;
  scopeLabel: string;
  activeJobs: number;
  urgentJobs: number;
  finishedJobs: number;
  brandTheme: BrandTheme;
}) {
  const t = useT();
  return (
    <div className={`grid grid-cols-4 ${isPhone ? "gap-1.5" : "gap-2"}`}>
                {loading ? (
                  <><LoadingCard /><LoadingCard /><LoadingCard /><LoadingCard /></>
                ) : (
                  [
                    [t("งานทั้งหมด", "All jobs"), visibleTotal, total > sheets.length ? loadedLimitNote : scopeLabel],
                    [t("กำลังเดินงาน", "In progress"), activeJobs, t("ยังไม่จบหรือยกเลิก", "Not finished or cancelled")],
                    [t("ใกล้ครบกำหนด", "Due soon"), urgentJobs, t("ควรไล่สถานะวันนี้", "Follow up today")],
                    [t("ปิดงานแล้ว", "Closed"), finishedJobs, t("อนุมัติ / ตั้ง SKU / ยกเลิก", "Approved / SKU set / Cancelled")],
                  ].map(([label, value, hint], index) => (
                    <div key={label} data-gg-stat-card className={`relative overflow-hidden rounded-lg border border-white/70 bg-white/80 shadow-sm backdrop-blur ${isPhone ? "px-1 py-1.5 text-center" : "px-3 py-2"}`}>
                      <BrandSlot theme={brandTheme} id={`stat_icon_${index}`} />
                      {isPhone ? (
                        /* มือถือ: ตัวเลขใหญ่ + ป้ายสั้น 4 ช่องแถวเดียว */
                        <>
                          <div className="text-base font-semibold leading-tight text-slate-900">{value}</div>
                          <div className="truncate text-[9px] text-slate-400">{label}</div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[11px] font-medium text-slate-400">{label}</span>
                            <span className="text-xl font-semibold text-slate-900">{value}</span>
                          </div>
                          <div className="truncate text-[10px] text-slate-400">{hint}</div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
  );
}
