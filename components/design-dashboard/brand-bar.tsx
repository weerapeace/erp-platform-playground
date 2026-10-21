"use client";
// Design Dashboard: แถบแบรนด์ (มือถือ = ชิป 2 แถว · จอคอม/แท็บเล็ต = การ์ดแบรนด์ 2 กลุ่ม งานลูกค้า/แบรนด์เรา + ดรอปดาวน์แบรนด์อื่นๆ) — แยกจาก index.tsx (Y1)
import { useRef, useState, type ReactNode } from "react";
import type { BrandTheme } from "@/lib/brand-theme";
import { BrandSlot } from "@/components/brand-theme/slots";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { BRAND_GROUPS, GROUP_KEY, GROUP_LABEL, type BrandGroup, type BrandGroupView, type BrandSummary } from "./dashboard-helpers";
import { useT } from "@/components/i18n";

export function BrandBar({ isPhone, isDesktop, loading, groups, selectedBrandKey, setSelectedBrandKey, brandMark, brandTheme, brandSummaries, setBrandSettingsOpen, setCreateOpen }: {
  isPhone: boolean;
  isDesktop: boolean;
  loading: boolean;
  groups: Record<BrandGroup, BrandGroupView>;
  selectedBrandKey: string;
  setSelectedBrandKey: (key: string) => void;
  brandMark: (brand: BrandSummary, cls: string) => ReactNode;
  brandTheme: BrandTheme;
  brandSummaries: BrandSummary[];
  setBrandSettingsOpen: (open: boolean) => void;
  setCreateOpen: (open: boolean) => void;
}) {
  const t = useT();
  const [othersOpen, setOthersOpen] = useState<BrandGroup | null>(null);      // ดรอปดาวน์ "แบรนด์อื่นๆ" ของกลุ่มไหน
  // จุดยึดของดรอปดาวน์ต่อกลุ่ม (ให้ของกลางลอยทับได้ ไม่โดนการ์ดข้างล่างบัง)
  const othersAnchorRefs = { customer: useRef<HTMLDivElement>(null), own: useRef<HTMLDivElement>(null) };
  return (
    <>{isPhone ? (
              /* ── มือถือ: แบรนด์เป็นชิป 2 แถว (งานลูกค้า / แบรนด์เรา) แต่ละแถวเลื่อนซ้าย-ขวา (ตั้งค่าแบรนด์อยู่ในเมนู ⋯) ── */
              <div className="mb-3 space-y-1.5">
                {BRAND_GROUPS.map((group) => {
                  const g = groups[group];
                  const allOn = selectedBrandKey === GROUP_KEY[group];
                  return (
                    <div key={group} className="-mx-3 flex items-center gap-1.5 overflow-x-auto px-3 pb-1">
                      <button type="button" onClick={() => setSelectedBrandKey(GROUP_KEY[group])}
                        className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium ${allOn ? "border-slate-900 bg-slate-900 text-white" : group === "own" ? "border-teal-200 bg-teal-50 text-teal-800" : "border-violet-200 bg-violet-50 text-violet-800"}`}>
                        {GROUP_LABEL[group].icon} {GROUP_LABEL[group].all} <span className="opacity-60">{g.active}</span>
                      </button>
                      {[...g.top, ...g.others].map((brand) => {
                        const selected = selectedBrandKey === brand.key;
                        return (
                          <button key={brand.key} type="button" onClick={() => setSelectedBrandKey(brand.key)}
                            className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border py-0 pl-1 pr-2.5 text-xs font-medium ${selected ? "bg-white text-slate-900" : "border-slate-200 bg-white text-slate-600"}`}
                            style={selected ? { borderColor: brand.color, boxShadow: `0 0 0 1.5px ${brand.color}` } : undefined}>
                            {brandMark(brand, "h-6 w-6")}
                            <span className="max-w-[110px] truncate">{brand.name}</span>
                            <span className="opacity-60">{brand.active}</span>
                            {brand.urgent > 0 && <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : (
            <aside data-gg-sidebar className="mb-4 rounded-lg border border-white/70 bg-white/90 p-3 shadow-sm backdrop-blur">
              <BrandSlot theme={brandTheme} id="sidebar_top" />
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800">{t("แบรนด์จากงานจริง", "Brands from live jobs")}</h2>
                  <p className="text-xs text-slate-400">{t("คลิกเพื่อกรองบอร์ด · แยกงานลูกค้า / แบรนด์เรา ตามช่อง 👤 งานลูกค้า ใน", "Click to filter the board · split into customer jobs / our brands by the 👤 Customer job box on the ")}<a href="/master/brands" className="text-blue-600 hover:underline">{t("หน้าแบรนด์", "Brands page")}</a></p>
                </div>
                <div className="flex items-center gap-2">
                  <span data-gg-brand-count className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{brandSummaries.length} {t("แบรนด์", "brands")}</span>
                  <button onClick={() => setBrandSettingsOpen(true)} title={t("ตั้งค่าแบรนด์ (เรียงลำดับ / ซ่อน-โชว์)", "Brand settings (order / show-hide)")}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">⚙️</button>
                </div>
              </div>

              {/* 2 กลุ่ม (งานลูกค้า / แบรนด์เรา) ไม่ปนกัน — แต่ละกลุ่มมีปุ่ม "ทั้งหมด" ของตัวเอง
                  จอคอม = ห่อบรรทัด · แท็บเล็ต = แถวละกลุ่ม เลื่อนซ้าย-ขวา (การ์ดแบรนด์ไม่กินพื้นที่แนวตั้ง) */}
              <div className="flex items-stretch gap-2">
                <button data-gg-action onClick={() => setCreateOpen(true)} title={t("สร้างงานใหม่ (เลือก/เพิ่มแบรนด์ในฟอร์มได้)", "Create a new job (pick or add a brand in the form)")}
                  className="flex shrink-0 flex-col justify-center rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-500 hover:border-blue-300 hover:text-blue-600">＋ {t("เพิ่มงาน", "Add job")}</button>

                <div className="min-w-0 flex-1 space-y-2">
                  {BRAND_GROUPS.map((group) => {
                    const g = groups[group];
                    const allOn = selectedBrandKey === GROUP_KEY[group];
                    const anchorRef = othersAnchorRefs[group];
                    return (
                      <div key={group} data-gg-brand-group={group}
                        className={isDesktop ? "flex flex-wrap items-stretch gap-2" : "flex items-stretch gap-2 overflow-x-auto pb-1 [&>*]:shrink-0"}>
                        <button data-gg-all-button onClick={() => setSelectedBrandKey(GROUP_KEY[group])}
                          title={group === "own" ? t("แบรนด์ของเราเอง — บอร์ดไม่มีขั้นส่งลูกค้า", "Our own brands — board has no customer-delivery steps") : t("งานที่ทำให้ลูกค้า — บอร์ดครบทุกขั้น", "Jobs for customers — board shows every step")}
                          className={`flex min-w-[150px] flex-col justify-center rounded-lg border px-3 py-2 text-left transition ${allOn ? "border-slate-900 bg-slate-900 text-white" : group === "own" ? "border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100" : "border-violet-200 bg-violet-50 text-violet-800 hover:bg-violet-100"}`}>
                          <span className="text-sm font-semibold">{GROUP_LABEL[group].icon} {GROUP_LABEL[group].all}</span>
                          <span className="text-[11px] opacity-70">{g.active} {t("งานเดินอยู่", "active")}</span>
                        </button>

                        {g.top.map((brand) => {
                          const selected = selectedBrandKey === brand.key;
                          return (
                            <button key={brand.key} data-gg-brand-card data-gg-selected={selected ? "true" : undefined}
                              onClick={() => setSelectedBrandKey(brand.key)}
                              className={`flex items-center rounded-xl border bg-white text-left transition hover:-translate-y-0.5 ${isPhone ? "gap-2 px-3 py-2" : "gap-3 px-4 py-3"}`}
                              style={{ borderColor: selected ? brand.color : "#e2e8f0", boxShadow: selected ? `0 0 0 1px ${brand.color}55` : undefined }}>
                              {brandMark(brand, isPhone ? "h-9 w-9" : "h-12 w-12")}
                              <div className="min-w-0">
                                <div className={`truncate font-semibold text-slate-800 ${isPhone ? "max-w-[120px] text-sm" : "max-w-[170px] text-base"}`}>{brand.name}</div>
                                <div className="text-xs text-slate-400">{brand.active} {t("เดิน", "active")}{brand.urgent > 0 ? <> · <span className="text-rose-500">{brand.urgent} {t("ใกล้ครบ", "due soon")}</span></> : null}</div>
                              </div>
                            </button>
                          );
                        })}

                        {g.others.length > 0 && (
                          // ⚠️ รายการ "แบรนด์อื่นๆ" ต้องใช้ FloatingDropdown ของกลาง (portal → body + fixed)
                          // ของเดิมเป็น absolute z-30 อยู่ในแถบแบรนด์ → โดนการ์ดสรุปข้างล่างทับ ("จม") มองไม่เห็นรายการ
                          <div className="relative" data-brands-others ref={anchorRef}>
                            <button onClick={() => setOthersOpen((o) => (o === group ? null : group))}
                              className={`flex h-full flex-col justify-center rounded-lg border px-3 py-2 text-left transition ${g.othersSelected ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                              <span className="max-w-[140px] truncate text-sm font-semibold">{g.othersSelected ? g.othersSelected.name : t("แบรนด์อื่นๆ", "Other brands")} ▾</span>
                              <span className="text-[11px] opacity-70">{g.othersSelected ? `${g.othersSelected.active} ${t("เดิน", "active")}` : t(`อีก ${g.others.length} แบรนด์`, `${g.others.length} more brands`)}</span>
                            </button>
                            <FloatingDropdown anchorRef={anchorRef} open={othersOpen === group} onClose={() => setOthersOpen(null)} minWidth={240} maxWidth={320}>
                              <div className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-2xl">
                                {g.others.map((brand) => (
                                  <button key={brand.key} onClick={() => { setSelectedBrandKey(brand.key); setOthersOpen(null); }}
                                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50 ${selectedBrandKey === brand.key ? "bg-blue-50" : ""}`}>
                                    {brandMark(brand, "h-6 w-6")}
                                    <span className="min-w-0 flex-1 truncate text-slate-700">{brand.name}</span>
                                    <span className="text-[11px] text-slate-400">{brand.active}</span>
                                  </button>
                                ))}
                              </div>
                            </FloatingDropdown>
                          </div>
                        )}

                        {!loading && g.count === 0 && (
                          <div className="flex items-center rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-400">{t("ยังไม่มีใบงานของ", "No jobs yet for ")}{GROUP_LABEL[group].title}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <BrandSlot theme={brandTheme} id="sidebar_bottom" />
            </aside>
            )}</>
  );
}
