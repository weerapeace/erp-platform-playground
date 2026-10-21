"use client";
// Design Dashboard: ป๊อปตั้งค่าแบรนด์ (เรียงลำดับ / ซ่อน-โชว์ · บันทึกรายคน) — แยกจาก index.tsx (Y1)
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { BRAND_GROUPS, GROUP_LABEL, type BrandSummary } from "./dashboard-helpers";
import { useT } from "@/components/i18n";

export function BrandSettingsModal({ brandSettingsOpen, setBrandSettingsOpen, orderedAll, brandPrefs, topBrands, moveBrand, brandMark, toggleHiddenBrand }: {
  brandSettingsOpen: boolean;
  setBrandSettingsOpen: (open: boolean) => void;
  orderedAll: BrandSummary[];
  brandPrefs: { order: string[]; hidden: string[] };
  topBrands: BrandSummary[];
  moveBrand: (key: string, dir: -1 | 1) => void;
  brandMark: (brand: BrandSummary, cls: string) => ReactNode;
  toggleHiddenBrand: (key: string) => void;
}) {
  const t = useT();
  return (
    <>{brandSettingsOpen && createPortal(
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onClick={() => setBrandSettingsOpen(false)}>
                <div className="flex max-h-[85vh] w-[440px] max-w-full flex-col rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                    <div className="text-base font-semibold text-slate-800">⚙️ {t("ตั้งค่าแบรนด์", "Brand settings")}</div>
                    <button onClick={() => setBrandSettingsOpen(false)} className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
                  </div>
                  <div className="flex-1 overflow-auto p-3">
                    <p className="mb-2 text-[11px] text-slate-400">{t("เรียงลำดับด้วยลูกศร ▲▼ · กด 👁 เพื่อซ่อน (ที่ซ่อนไปอยู่ใน “แบรนด์อื่นๆ”) · แต่ละกลุ่มโชว์ 4 อันดับแรกที่ไม่ซ่อนเป็นการ์ด · บันทึกอัตโนมัติ (เฉพาะคุณ)", "Reorder with ▲▼ · press 👁 to hide (hidden ones go to “Other brands”) · each group shows its top 4 visible brands as cards · saved automatically (just for you)")}</p>
                    <p className="mb-3 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500">
                      {t("แบรนด์ไหนเป็น “งานลูกค้า” หรือ “แบรนด์เรา” ตั้งที่ช่อง 👤 งานลูกค้า ใน ", "Whether a brand is a “Customer job” or “Our brand” is set by the 👤 Customer job box on the ")}<a href="/master/brands" className="text-blue-600 hover:underline">{t("หน้าแบรนด์", "Brands page")}</a> {t("(มีผลกับทุกคน) · แบรนด์เราจะไม่เห็นสถานะที่ติ๊ก “เฉพาะงานลูกค้า” ในปุ่มจัดการสถานะ", "(applies to everyone) · our brands won't see statuses marked “Customer jobs only” in Manage statuses")}
                    </p>
                    {BRAND_GROUPS.map((group) => {
                      const list = orderedAll.filter((b) => b.own === (group === "own"));
                      if (list.length === 0) return null;
                      return (
                        <div key={group} className="mb-3">
                          <div className={`mb-1 text-xs font-semibold ${group === "own" ? "text-teal-700" : "text-violet-700"}`}>{GROUP_LABEL[group].icon} {GROUP_LABEL[group].title}</div>
                          {list.map((brand, i) => {
                            const hidden = brandPrefs.hidden.includes(brand.key);
                            const isTop = topBrands.some((b) => b.key === brand.key);
                            return (
                              <div key={brand.key} className={`mb-1 flex items-center gap-2 rounded-lg border px-2 py-1.5 ${hidden ? "border-slate-100 bg-slate-50 opacity-70" : "border-slate-200"}`}>
                                <div className="flex flex-col text-[10px] leading-none">
                                  <button onClick={() => moveBrand(brand.key, -1)} disabled={i === 0} className="py-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-25">▲</button>
                                  <button onClick={() => moveBrand(brand.key, 1)} disabled={i === list.length - 1} className="py-0.5 text-slate-400 hover:text-slate-700 disabled:opacity-25">▼</button>
                                </div>
                                {brandMark(brand, "h-7 w-7")}
                                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{brand.name}</span>
                                <span className="text-[11px] text-slate-400">{brand.active} {t("เดิน", "active")}</span>
                                {isTop && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600">{t("โชว์", "Shown")}</span>}
                                <button onClick={() => toggleHiddenBrand(brand.key)} title={hidden ? t("เลิกซ่อน", "Unhide") : t("ซ่อน", "Hide")}
                                  className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100">{hidden ? "🙈" : "👁"}</button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                    {orderedAll.length === 0 && <div className="py-6 text-center text-sm text-slate-300">{t("ยังไม่มีแบรนด์", "No brands yet")}</div>}
                  </div>
                </div>
              </div>,
              document.body,
            )}</>
  );
}
